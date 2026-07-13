# -*- coding: utf-8 -*-
"""
Server HTTP locale per l'estensione Chrome: espone POST /update che esegue
la stessa logica di update_request_dates.run_update_request_dates.

Avvio (dalla cartella del progetto, con .env caricabile):
  pip install -r requirements.txt
  python update_dates_api_server.py

L'estensione chiama http://127.0.0.1:8765/update di default (configurabile).
"""
import os

from flask import Flask, jsonify, make_response, request
from flask_cors import CORS

from partners_leads import is_partners_leads_authorized, run_create_partner_lead
from update_request_dates import UpdateResult, run_update_request_dates

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
            "paths": ["/health", "/update", "/partners/leads"],
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


@app.post("/partners/leads")
def create_partner_lead():
    if not is_partners_leads_authorized(request.headers):
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    result = run_create_partner_lead(data)
    if not result.ok:
        return jsonify({"error": result.error}), result.status_code

    response = make_response(jsonify(result.payload), result.status_code)
    response.headers["Location"] = f"/partners/leads/{result.payload['id']}"
    return response


def main():
    # Render (e simili) impostano PORT; in locale si usa UPDATE_DATES_API_PORT o default.
    port = int(
        os.environ.get("PORT")
        or os.environ.get("UPDATE_DATES_API_PORT", DEFAULT_PORT)
    )
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    print(f"API aggiornamento date in ascolto su http://{host}:{port}")
    print("  POST /update         JSON: {\"request_code\": \"V00000030814\"}")
    print("  POST /partners/leads (solo server-to-server, richiede PARTNERS_LEADS_API_KEY)")
    print("  GET  /health")
    app.run(host=host, port=port, threaded=True)


if __name__ == "__main__":
    main()
