# -*- coding: utf-8 -*-
"""
@author Maurizio di Sabato <maurizio.disabato@xcconsulting.it>
@description correlation_id da amc.dlsii_messages per recovery ES1 ACK (flusso 0050 INVIATO)
@modified 29.09.2026 - MDS | Query ultimo messaggio 0050 per request_code
"""
import os
from dataclasses import dataclass
from typing import Any, Optional

import psycopg2
from dotenv import load_dotenv

load_dotenv()


@dataclass
class DlsiiAckContextResult:
    ok: bool
    request_code: str
    row: Optional[dict] = None
    error: Optional[str] = None


def run_fetch_dlsii_ack_context(request_code: str) -> DlsiiAckContextResult:
    """
    Prima riga (send_timestamp DESC) del messaggio DLSII 0050 INVIATO
    con correlation_id valorizzato, per la pratica indicata.
    """
    code = (request_code or "").strip()
    if not code:
        return DlsiiAckContextResult(
            ok=False, request_code="", error="Codice richiesta non inserito."
        )

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return DlsiiAckContextResult(
            ok=False,
            request_code=code,
            error="DATABASE_URL non configurata.",
        )

    conn = None
    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
              dm.id_dlsii_messages,
              r.request_code,
              dm.correlation_id,
              dm.message_state,
              dm.send_timestamp,
              dm.nome_messaggio,
              dm.processo_code,
              dm.venditore_code,
              dm.distributore_code
            FROM amc.dlsii_messages dm
            JOIN amc.request r ON r.id_request = dm.request_code
            WHERE r.request_code = %s
              AND dm.correlation_id IS NOT NULL
              AND dm.message_state = 'INVIATO'
              AND dm.nome_messaggio LIKE '%%0050%%'
            ORDER BY dm.send_timestamp DESC NULLS LAST
            LIMIT 1
            """,
            (code,),
        )
        row = cursor.fetchone()
        if not row:
            return DlsiiAckContextResult(
                ok=False,
                request_code=code,
                error=(
                    f"Nessun messaggio DLSII 0050 INVIATO con correlation_id "
                    f"per request_code = '{code}'."
                ),
            )

        cols = [
            "id_dlsii_messages",
            "request_code",
            "correlation_id",
            "message_state",
            "send_timestamp",
            "nome_messaggio",
            "processo_code",
            "venditore_code",
            "distributore_code",
        ]
        data: dict[str, Any] = {}
        for i, name in enumerate(cols):
            val = row[i]
            if hasattr(val, "isoformat"):
                val = val.isoformat(sep=" ", timespec="milliseconds")
            data[name] = val

        return DlsiiAckContextResult(ok=True, request_code=code, row=data)

    except psycopg2.Error as e:
        msg = e.pgerror or str(e)
        return DlsiiAckContextResult(
            ok=False, request_code=code, error=f"Errore database: {msg}"
        )
    except Exception as e:
        return DlsiiAckContextResult(
            ok=False, request_code=code, error=f"{type(e).__name__}: {e}"
        )
    finally:
        if conn:
            conn.close()
