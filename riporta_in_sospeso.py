# -*- coding: utf-8 -*-
"""
@author Maurizio di Sabato <maurizio.disabato@xcconsulting.it>
@description Riporta in sospeso una richiesta su amc.sap_messages
@modified 23.09.2026 - MDS | Se più righe per request_code, aggiorna solo l'ultimo record
@modified 23.09.2026 - MDS | UPDATE message_state=SOSPESO, attiva_sap='' per request_code

Usabile da CLI e da API (estensione Chrome).
"""
import os
import sys

import psycopg2
from dotenv import load_dotenv

from update_request_dates import ChangeLogEntry, UpdateResult

load_dotenv()

# Tabella usata anche da update_request_dates (plurale)
_TABLE = "amc.sap_messages"


def run_riporta_in_sospeso(request_code: str) -> UpdateResult:
    """
    Imposta message_state = 'SOSPESO' e attiva_sap = '' su amc.sap_messages
    per il request_code indicato. Se esistono più righe, aggiorna solo
    l'ultima (create_timestamp DESC, poi id_sap_messages DESC).
    """
    code = (request_code or "").strip()
    if not code:
        return UpdateResult(
            ok=False, request_code="", error="Codice richiesta non inserito."
        )

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return UpdateResult(
            ok=False,
            request_code=code,
            error="DATABASE_URL non configurata. Imposta la variabile o usa il file .env.",
        )

    conn = None
    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cursor = conn.cursor()

        # Ultimo record per request_code (timestamp di creazione, poi id)
        cursor.execute(
            f"""
            SELECT id_sap_messages, message_state, attiva_sap, create_timestamp
            FROM {_TABLE}
            WHERE request_code = %s
            ORDER BY create_timestamp DESC NULLS LAST, id_sap_messages DESC
            LIMIT 1
            """,
            (code,),
        )
        row = cursor.fetchone()
        if not row:
            return UpdateResult(
                ok=False,
                request_code=code,
                error=f"Nessuna riga trovata in {_TABLE} per request_code = '{code}'",
            )

        id_row, message_state, attiva_sap, create_ts = row
        old_state = "" if message_state is None else str(message_state)
        old_attiva = "" if attiva_sap is None else str(attiva_sap)

        cursor.execute(
            f"""
            UPDATE {_TABLE}
            SET message_state = %s, attiva_sap = %s
            WHERE id_sap_messages = %s
            """,
            ("SOSPESO", "", id_row),
        )
        conn.commit()

        print(
            f"[OK] {_TABLE} id={id_row}: message_state=SOSPESO, attiva_sap='' "
            f"(request_code={code}, create_timestamp={create_ts})"
        )

        changes = [
            ChangeLogEntry(
                tabella=_TABLE,
                campo="id_sap_messages",
                vecchio="—",
                nuovo=str(id_row),
                skipped=False,
                note="Solo ultimo record per request_code",
            ),
            ChangeLogEntry(
                tabella=_TABLE,
                campo="message_state",
                vecchio=old_state or "(vuoto)",
                nuovo="SOSPESO",
                skipped=False,
            ),
            ChangeLogEntry(
                tabella=_TABLE,
                campo="attiva_sap",
                vecchio=old_attiva or "(vuoto)",
                nuovo="(vuoto)",
                skipped=False,
            ),
        ]
        return UpdateResult(ok=True, request_code=code, changes=changes)

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        msg = e.pgerror or str(e)
        return UpdateResult(
            ok=False, request_code=code, error=f"Errore database: {msg}"
        )

    except Exception as e:
        if conn:
            conn.rollback()
        return UpdateResult(
            ok=False, request_code=code, error=f"{type(e).__name__}: {e}"
        )

    finally:
        if conn:
            conn.close()


def main() -> int:
    """CLI: python riporta_in_sospeso.py <request_code>"""
    if len(sys.argv) < 2:
        print("Uso: python riporta_in_sospeso.py <request_code>")
        return 1
    result = run_riporta_in_sospeso(sys.argv[1])
    if not result.ok:
        print(f"[ERR] {result.error}")
        return 1
    for c in result.changes:
        print(f"  {c.tabella}.{c.campo}: {c.vecchio} → {c.nuovo}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
