# -*- coding: utf-8 -*-
"""
@author Maurizio di Sabato <maurizio.disabato@xcconsulting.it>
@description Mockup CP1: lettura/aggiornamento campi su amc.simulatore_risposta_campi
@modified 24.09.2026 - MDS | Load/update EXT_POT_DISP, EXT_POT_IMP, USO_FORNITURA, POD per id_risposta_testata

Usabile da CLI e da API (estensione Chrome).
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import psycopg2
from dotenv import load_dotenv

from update_request_dates import ChangeLogEntry, UpdateResult

load_dotenv()

_TABLE = "amc.simulatore_risposta_campi"
DEFAULT_ID_TESTATA = 802
FIELDNAMES = ("EXT_POT_DISP", "EXT_POT_IMP", "USO_FORNITURA", "POD")


@dataclass
class MockupCp1LoadResult:
    ok: bool
    id_risposta_testata: Optional[int] = None
    fields: Dict[str, str] = field(default_factory=dict)
    missing: List[str] = field(default_factory=list)
    error: Optional[str] = None


def _parse_id_testata(raw: Any) -> Optional[int]:
    """Normalizza l'id testata in intero positivo."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    try:
        n = int(s)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def run_mockup_cp1_load(id_risposta_testata: Any) -> MockupCp1LoadResult:
    """
    Legge i fieldname CP1 da amc.simulatore_risposta_campi
    per l'id_risposta_testata indicato.
    """
    id_testata = _parse_id_testata(id_risposta_testata)
    if id_testata is None:
        return MockupCp1LoadResult(
            ok=False, error="Id testata non valido (atteso intero positivo)."
        )

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return MockupCp1LoadResult(
            ok=False,
            id_risposta_testata=id_testata,
            error="DATABASE_URL non configurata. Imposta la variabile o usa il file .env.",
        )

    conn = None
    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT fieldname, valore
            FROM {_TABLE}
            WHERE id_risposta_testata = %s
              AND fieldname = ANY(%s)
            """,
            (id_testata, list(FIELDNAMES)),
        )
        found = {
            str(name).strip().upper(): ("" if val is None else str(val))
            for name, val in cursor.fetchall()
        }

        fields: Dict[str, str] = {}
        missing: List[str] = []
        for name in FIELDNAMES:
            if name in found:
                fields[name] = found[name]
            else:
                fields[name] = ""
                missing.append(name)

        if len(missing) == len(FIELDNAMES):
            return MockupCp1LoadResult(
                ok=False,
                id_risposta_testata=id_testata,
                fields=fields,
                missing=missing,
                error=(
                    f"Nessun campo CP1 trovato in {_TABLE} "
                    f"per id_risposta_testata = {id_testata}"
                ),
            )

        return MockupCp1LoadResult(
            ok=True,
            id_risposta_testata=id_testata,
            fields=fields,
            missing=missing,
        )

    except psycopg2.Error as e:
        msg = e.pgerror or str(e)
        return MockupCp1LoadResult(
            ok=False,
            id_risposta_testata=id_testata,
            error=f"Errore database: {msg}",
        )
    except Exception as e:
        return MockupCp1LoadResult(
            ok=False,
            id_risposta_testata=id_testata,
            error=f"{type(e).__name__}: {e}",
        )
    finally:
        if conn:
            conn.close()


def run_mockup_cp1_update(
    id_risposta_testata: Any, fields: Optional[Dict[str, Any]] = None
) -> UpdateResult:
    """
    Aggiorna il valore dei fieldname CP1 su amc.simulatore_risposta_campi
    per l'id_risposta_testata indicato.
    """
    id_testata = _parse_id_testata(id_risposta_testata)
    code = str(id_testata) if id_testata is not None else ""
    if id_testata is None:
        return UpdateResult(
            ok=False, request_code="", error="Id testata non valido (atteso intero positivo)."
        )

    incoming = fields or {}
    values: Dict[str, str] = {}
    for name in FIELDNAMES:
        raw = incoming.get(name)
        if raw is None:
            # accetta anche chiavi case-insensitive
            for k, v in incoming.items():
                if str(k).strip().upper() == name:
                    raw = v
                    break
        values[name] = "" if raw is None else str(raw)

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
        changes: List[ChangeLogEntry] = []

        for name in FIELDNAMES:
            new_val = values[name]
            cursor.execute(
                f"""
                SELECT id_campi_risposta_testata, valore
                FROM {_TABLE}
                WHERE id_risposta_testata = %s AND fieldname = %s
                """,
                (id_testata, name),
            )
            row = cursor.fetchone()
            if not row:
                changes.append(
                    ChangeLogEntry(
                        tabella=_TABLE,
                        campo=name,
                        vecchio="(assente)",
                        nuovo=new_val or "(vuoto)",
                        skipped=True,
                        note="Riga non trovata: nessun update",
                    )
                )
                continue

            row_id, old_raw = row
            old_val = "" if old_raw is None else str(old_raw)
            if old_val == new_val:
                changes.append(
                    ChangeLogEntry(
                        tabella=_TABLE,
                        campo=name,
                        vecchio=old_val or "(vuoto)",
                        nuovo=new_val or "(vuoto)",
                        skipped=False,
                        note="Valore già impostato",
                    )
                )
                continue

            cursor.execute(
                f"""
                UPDATE {_TABLE}
                SET valore = %s
                WHERE id_campi_risposta_testata = %s
                """,
                (new_val, row_id),
            )
            changes.append(
                ChangeLogEntry(
                    tabella=_TABLE,
                    campo=name,
                    vecchio=old_val or "(vuoto)",
                    nuovo=new_val or "(vuoto)",
                    skipped=False,
                    note=f"id_campi={row_id}",
                )
            )

        updated = sum(1 for c in changes if not c.skipped and c.note != "Valore già impostato")
        if updated == 0 and all(c.skipped for c in changes):
            conn.rollback()
            return UpdateResult(
                ok=False,
                request_code=code,
                changes=changes,
                error=(
                    f"Nessun campo aggiornabile in {_TABLE} "
                    f"per id_risposta_testata = {id_testata}"
                ),
            )

        conn.commit()
        print(
            f"[OK] {_TABLE}: id_risposta_testata={id_testata} "
            f"→ {updated} campo/i aggiornati"
        )
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
    """CLI: python mockup_cp1.py <id_testata> [load|show]"""
    id_arg = sys.argv[1] if len(sys.argv) > 1 else str(DEFAULT_ID_TESTATA)
    result = run_mockup_cp1_load(id_arg)
    if not result.ok:
        print(f"[ERR] {result.error}")
        return 1
    print(f"id_risposta_testata={result.id_risposta_testata}")
    for k, v in result.fields.items():
        print(f"  {k} = {v!r}")
    if result.missing:
        print(f"  mancanti: {', '.join(result.missing)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
