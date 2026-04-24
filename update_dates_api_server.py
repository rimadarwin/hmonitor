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

from flask import Flask, jsonify, request
from flask_cors import CORS

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


def main():
    port = int(os.environ.get("UPDATE_DATES_API_PORT", DEFAULT_PORT))
    print(f"API aggiornamento date in ascolto su http://127.0.0.1:{port}")
    print("  POST /update  JSON: {\"request_code\": \"V00000030814\"}")
    print("  GET  /health")
    app.run(host="127.0.0.1", port=port, threaded=True)


if __name__ == "__main__":
    main()
