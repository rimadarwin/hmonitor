# -*- coding: utf-8 -*-
"""
Switch canale_com ATOA <-> FILE su amc.request.

Usabile da CLI e da API (estensione Chrome).
"""
import os
from typing import Optional

import psycopg2
from dotenv import load_dotenv

from update_request_dates import ChangeLogEntry, UpdateResult

load_dotenv()

# Valori ammessi e mappa di switch
_SWITCH_MAP = {
    "ATOA": "FILE",
    "FILE": "ATOA",
}


def _normalize_canale(raw: Optional[str]) -> str:
    return (raw or "").strip().upper()


def run_set_canale_com(request_code: str, target: str) -> UpdateResult:
    """Imposta canale_com al valore richiesto (ATOA o FILE), senza toggle."""
    code = (request_code or "").strip()
    if not code:
        return UpdateResult(ok=False, request_code="", error="Codice richiesta non inserito.")

    desired = _normalize_canale(target)
    if desired not in _SWITCH_MAP:
        return UpdateResult(
            ok=False,
            request_code=code,
            error=f"target canale_com non valido: '{target}' (attesi ATOA o FILE).",
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

        cursor.execute(
            "SELECT canale_com FROM amc.request WHERE request_code = %s",
            (code,),
        )
        row = cursor.fetchone()
        if not row:
            return UpdateResult(
                ok=False,
                request_code=code,
                error=f"Nessuna riga trovata in amc.request per request_code = '{code}'",
            )

        current_raw = row[0]
        current = _normalize_canale(current_raw if current_raw is None else str(current_raw))
        if current == desired:
            print(f"[OK] amc.request.canale_com già {desired} (nessun update)")
            return UpdateResult(
                ok=True,
                request_code=code,
                changes=[
                    ChangeLogEntry(
                        tabella="amc.request",
                        campo="canale_com",
                        vecchio=current or "(vuoto)",
                        nuovo=desired,
                        skipped=False,
                        note="Valore già impostato",
                    )
                ],
            )

        print(f"[OK] amc.request.canale_com: {current} -> {desired}")
        cursor.execute(
            "UPDATE amc.request SET canale_com = %s WHERE request_code = %s",
            (desired, code),
        )
        conn.commit()

        return UpdateResult(
            ok=True,
            request_code=code,
            changes=[
                ChangeLogEntry(
                    tabella="amc.request",
                    campo="canale_com",
                    vecchio=current or "(vuoto)",
                    nuovo=desired,
                    skipped=False,
                )
            ],
        )

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        msg = e.pgerror or str(e)
        return UpdateResult(ok=False, request_code=code, error=f"Errore database: {msg}")

    except Exception as e:
        if conn:
            conn.rollback()
        return UpdateResult(ok=False, request_code=code, error=f"{type(e).__name__}: {e}")

    finally:
        if conn:
            conn.close()


def run_switch_canale_com(request_code: str, target: Optional[str] = None) -> UpdateResult:
    """
    Se target è ATOA/FILE: imposta quel valore.
    Altrimenti legge canale_com e lo inverte ATOA <-> FILE.
    """
    if target is not None and str(target).strip():
        return run_set_canale_com(request_code, target)

    code = (request_code or "").strip()
    if not code:
        return UpdateResult(ok=False, request_code="", error="Codice richiesta non inserito.")

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

        cursor.execute(
            "SELECT canale_com FROM amc.request WHERE request_code = %s",
            (code,),
        )
        row = cursor.fetchone()
        if not row:
            return UpdateResult(
                ok=False,
                request_code=code,
                error=f"Nessuna riga trovata in amc.request per request_code = '{code}'",
            )

        current_raw = row[0]
        current = _normalize_canale(current_raw if current_raw is None else str(current_raw))
        if current not in _SWITCH_MAP:
            display = current_raw if current_raw is not None else "NULL"
            return UpdateResult(
                ok=False,
                request_code=code,
                error=(
                    f"canale_com='{display}' non switchabile: "
                    "attesi solo ATOA o FILE."
                ),
            )

        new_value = _SWITCH_MAP[current]
        print(f"[OK] amc.request.canale_com: {current} -> {new_value}")

        cursor.execute(
            "UPDATE amc.request SET canale_com = %s WHERE request_code = %s",
            (new_value, code),
        )
        conn.commit()

        return UpdateResult(
            ok=True,
            request_code=code,
            changes=[
                ChangeLogEntry(
                    tabella="amc.request",
                    campo="canale_com",
                    vecchio=current,
                    nuovo=new_value,
                    skipped=False,
                )
            ],
        )

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        msg = e.pgerror or str(e)
        return UpdateResult(ok=False, request_code=code, error=f"Errore database: {msg}")

    except Exception as e:
        if conn:
            conn.rollback()
        return UpdateResult(ok=False, request_code=code, error=f"{type(e).__name__}: {e}")

    finally:
        if conn:
            conn.close()


def main():
    print("=" * 60)
    print("SWITCH canale_com ATOA <-> FILE")
    print("=" * 60)

    request_code = input("\nInserisci il codice richiesta (es. V00000030814): ").strip()
    print(f"\nElaborazione richiesta: {request_code or '(vuoto)'}")
    print("-" * 60)

    result = run_switch_canale_com(request_code)

    if not result.ok:
        print("\n" + "=" * 60)
        print("OPERAZIONE NON COMPLETATA")
        print("=" * 60)
        print(result.error or "Errore sconosciuto.")
        print("=" * 60)
        return

    print("\n" + "=" * 60)
    print("OPERAZIONE COMPLETATA")
    print("=" * 60)
    print(f"\nRichiesta: {result.request_code}")
    for change in result.changes:
        print(f"\nTabella: {change.tabella}")
        print(f"  Campo:   {change.campo}")
        print(f"  Vecchio: {change.vecchio}")
        print(f"  Nuovo:   {change.nuovo}")
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
