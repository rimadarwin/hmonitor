# -*- coding: utf-8 -*-
"""
@author Maurizio di Sabato <maurizio.disabato@xcconsulting.it>
@description Server Flask per estensione Chrome (date, switch canale, request-data)
@modified 24.09.2026 - MDS | Endpoint Mockup CP1 load/update (simulatore_risposta_campi)
@modified 23.09.2026 - MDS | Endpoint POST /riporta-sospeso (amc.sap_messages)
@modified 23.09.2026 - MDS | Endpoint POST /request-data (id_request + input da amc.request)

Server HTTP locale per l'estensione Chrome: espone POST /update che esegue
la stessa logica di update_request_dates.run_update_request_dates.

Avvio (dalla cartella del progetto, con .env caricabile):
  pip install -r requirements.txt
  python update_dates_api_server.py

L'estensione chiama http://127.0.0.1:8765/update di default (configurabile).
"""
import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from update_request_dates import UpdateResult, run_update_request_dates
from switch_canale_com import run_switch_canale_com
from fetch_request_data import run_fetch_request_data
from riporta_in_sospeso import run_riporta_in_sospeso
from mockup_cp1 import run_mockup_cp1_load, run_mockup_cp1_update

DEFAULT_PORT = 8765

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


def _serialize_result(result: UpdateResult):
    payload = {
        "ok": result.ok,
        "request_code": result.request_code,
        "error": result.error,
        "changes": [
            {
                "tabella": c.tabella,
                "campo": c.campo,
                "vecchio": c.vecchio,
                "nuovo": c.nuovo,
                "skipped": bool(c.skipped),
                "note": c.note,
            }
            for c in result.changes
        ],
    }
    return payload


@app.get("/")
def root():
    """Render e altri bilanciatori spesso provano GET /; evita 404 nei check."""
    return jsonify(
        {
            "status": "ok",
            "service": "update-request-dates",
            "paths": [
                "/health",
                "/update",
                "/switch-canale",
                "/request-data",
                "/riporta-sospeso",
                "/mockup-cp1/load",
                "/mockup-cp1/update",
            ],
        }
    )


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "update-request-dates"})


@app.post("/update")
def update():
    data = request.get_json(silent=True) or {}
    request_code = data.get("request_code", "")
    result = run_update_request_dates(request_code)
    status = 200 if result.ok else 400
    return jsonify(_serialize_result(result)), status


@app.post("/switch-canale")
def switch_canale():
    """
    Switch canale_com ATOA <-> FILE su amc.request.
    Opzionale: { "target": "FILE" | "ATOA" } per impostare un valore esplicito.
    """
    data = request.get_json(silent=True) or {}
    request_code = data.get("request_code", "")
    target = data.get("target") or data.get("canale_com")
    result = run_switch_canale_com(request_code, target=target)
    status = 200 if result.ok else 400
    return jsonify(_serialize_result(result)), status


@app.post("/request-data")
def request_data():
    """
    Recupera id_request e input JSON da amc.request per popolare i flussi.
    Body: { "request_code": "V000…" }
    """
    data = request.get_json(silent=True) or {}
    request_code = data.get("request_code", "")
    result = run_fetch_request_data(request_code)
    status = 200 if result.ok else 400
    return jsonify(
        {
            "ok": result.ok,
            "request_code": result.request_code,
            "id_request": result.id_request,
            "input": result.input,
            "error": result.error,
        }
    ), status


@app.post("/riporta-sospeso")
def riporta_sospeso():
    """
    Su amc.sap_messages: message_state='SOSPESO', attiva_sap=''.
    Body: { "request_code": "V000…" }
    """
    data = request.get_json(silent=True) or {}
    request_code = data.get("request_code", "")
    result = run_riporta_in_sospeso(request_code)
    status = 200 if result.ok else 400
    return jsonify(_serialize_result(result)), status


@app.post("/mockup-cp1/load")
def mockup_cp1_load():
    """
    Carica i campi CP1 da amc.simulatore_risposta_campi.
    Body: { "id_risposta_testata": 802 }
    """
    data = request.get_json(silent=True) or {}
    id_testata = data.get("id_risposta_testata", data.get("id_testata", 802))
    result = run_mockup_cp1_load(id_testata)
    status = 200 if result.ok else 400
    return jsonify(
        {
            "ok": result.ok,
            "id_risposta_testata": result.id_risposta_testata,
            "fields": result.fields,
            "missing": result.missing,
            "error": result.error,
        }
    ), status


@app.post("/mockup-cp1/update")
def mockup_cp1_update():
    """
    Aggiorna i campi CP1 su amc.simulatore_risposta_campi.
    Body: {
      "id_risposta_testata": 802,
      "fields": {
        "EXT_POT_DISP": "…",
        "EXT_POT_IMP": "…",
        "USO_FORNITURA": "…",
        "POD": "…"
      }
    }
    """
    data = request.get_json(silent=True) or {}
    id_testata = data.get("id_risposta_testata", data.get("id_testata"))
    fields = data.get("fields") or {}
    result = run_mockup_cp1_update(id_testata, fields)
    status = 200 if result.ok else 400
    return jsonify(_serialize_result(result)), status


def main():
    # Render (e simili) impostano PORT; in locale si usa UPDATE_DATES_API_PORT o default.
    port = int(
        os.environ.get("PORT")
        or os.environ.get("UPDATE_DATES_API_PORT", DEFAULT_PORT)
    )
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    print(f"API aggiornamento date in ascolto su http://{host}:{port}")
    print("  POST /update         JSON: {\"request_code\": \"V00000030814\"}")
    print("  POST /switch-canale  JSON: {\"request_code\": \"…\", \"target\": \"FILE\"?}")
    print("  POST /request-data   JSON: {\"request_code\": \"…\"}")
    print("  POST /riporta-sospeso JSON: {\"request_code\": \"…\"}")
    print("  POST /mockup-cp1/load   JSON: {\"id_risposta_testata\": 802}")
    print("  POST /mockup-cp1/update JSON: {\"id_risposta_testata\": 802, \"fields\": {…}}")
    print("  GET  /health")
    app.run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    main()
