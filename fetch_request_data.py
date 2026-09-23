# -*- coding: utf-8 -*-
"""
@author Maurizio di Sabato <maurizio.disabato@xcconsulting.it>
@description Recupero id_request + input da amc.request per popolare i body dei flussi
@modified 23.09.2026 - MDS | Query amc.request per request_code (id_request, input JSON)
"""
import json
import os
from dataclasses import dataclass
from typing import Any, Optional

import psycopg2
from dotenv import load_dotenv

load_dotenv()


@dataclass
class RequestDataResult:
    ok: bool
    request_code: str
    id_request: Optional[Any] = None
    input: Optional[Any] = None
    error: Optional[str] = None


def _parse_input(raw: Any) -> Any:
    """Normalizza la colonna input (jsonb, stringa JSON o già dict/list)."""
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, (bytes, bytearray)):
        raw = raw.decode("utf-8", errors="replace")
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return None
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return {"_raw": s}
    return raw


def run_fetch_request_data(request_code: str) -> RequestDataResult:
    """
    Legge id_request e input da amc.request per il codice richiesta.
    """
    code = (request_code or "").strip()
    if not code:
        return RequestDataResult(
            ok=False, request_code="", error="Codice richiesta non inserito."
        )

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return RequestDataResult(
            ok=False,
            request_code=code,
            error="DATABASE_URL non configurata. Imposta la variabile o usa il file .env.",
        )

    conn = None
    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id_request, request_code, input "
            "FROM amc.request WHERE request_code = %s",
            (code,),
        )
        row = cursor.fetchone()
        if not row:
            return RequestDataResult(
                ok=False,
                request_code=code,
                error=f"Nessuna riga trovata in amc.request per request_code = '{code}'",
            )

        id_request, req_code, input_raw = row
        return RequestDataResult(
            ok=True,
            request_code=str(req_code or code),
            id_request=id_request,
            input=_parse_input(input_raw),
        )

    except psycopg2.Error as e:
        msg = e.pgerror or str(e)
        return RequestDataResult(
            ok=False, request_code=code, error=f"Errore database: {msg}"
        )
    except Exception as e:
        return RequestDataResult(
            ok=False, request_code=code, error=f"{type(e).__name__}: {e}"
        )
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    code = input("\nInserisci il codice richiesta: ").strip()
    result = run_fetch_request_data(code)
    if not result.ok:
        print(f"ERRORE: {result.error}")
    else:
        print(f"request_code={result.request_code}")
        print(f"id_request={result.id_request}")
        print(json.dumps(result.input, indent=2, ensure_ascii=False, default=str))
