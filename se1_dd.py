# -*- coding: utf-8 -*-
"""
@author MG
@description CRUD su amc.z_hk_att_ck_ddi (ELE SE1 DD — tariffe/check DDI)
@modified 07.10.2026 - MG | Search GET, create con progressivo TAR_AEEG_EE, update by id
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import psycopg2
from dotenv import load_dotenv

from update_request_dates import ChangeLogEntry, UpdateResult

load_dotenv()

_TABLE = "amc.z_hk_att_ck_ddi"
_DEFAULT_NOME_CAMPO_NUOVO = "TAR_AEEG_EE"


@dataclass
class Se1DdSearchResult:
    ok: bool
    rows: List[Dict[str, Any]] = field(default_factory=list)
    error: Optional[str] = None


def _row_to_dict(cols: List[str], row: tuple) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for i, name in enumerate(cols):
        val = row[i]
        if hasattr(val, "isoformat"):
            val = val.isoformat()
        out[name] = val
    return out


def run_se1_dd_search(
    processo_code: str,
    venditore_code: str,
    valore_richiesta: str,
) -> Se1DdSearchResult:
    proc = (processo_code or "").strip()
    vend = (venditore_code or "").strip()
    val = (valore_richiesta or "").strip()
    if not proc or not vend or not val:
        return Se1DdSearchResult(
            ok=False,
            error="processo_code, venditore_code e valore_richiesta sono obbligatori.",
        )

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return Se1DdSearchResult(ok=False, error="DATABASE_URL non configurata.")

    conn = None
    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT att_ck_ddi_id, venditore_code, processo_code, nome_campo,
                   progressivo, valore_richiesta, valore_dl
            FROM {_TABLE}
            WHERE processo_code = %s
              AND venditore_code = %s
              AND valore_richiesta = %s
            ORDER BY progressivo NULLS LAST, att_ck_ddi_id
            """,
            (proc, vend, val),
        )
        cols = [d[0] for d in cur.description]
        rows = [_row_to_dict(cols, r) for r in cur.fetchall()]
        return Se1DdSearchResult(ok=True, rows=rows)
    except psycopg2.Error as e:
        return Se1DdSearchResult(
            ok=False, error=e.pgerror or str(e)
        )
    finally:
        if conn:
            conn.close()


def _next_progressivo(
    cur,
    processo_code: str,
    venditore_code: str,
    valore_richiesta: str,
    nome_campo: str,
) -> int:
    cur.execute(
        f"""
        SELECT COALESCE(MAX(progressivo), 0) + 1
        FROM {_TABLE}
        WHERE processo_code = %s
          AND venditore_code = %s
          AND valore_richiesta = %s
          AND nome_campo = %s
        """,
        (processo_code, venditore_code, valore_richiesta, nome_campo),
    )
    row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else 1


def run_se1_dd_create(
    processo_code: str,
    venditore_code: str,
    valore_richiesta: str,
    valore_dl: str,
    nome_campo: Optional[str] = None,
    progressivo: Optional[int] = None,
) -> UpdateResult:
    proc = (processo_code or "").strip()
    vend = (venditore_code or "").strip()
    val = (valore_richiesta or "").strip()
    dl = (valore_dl or "").strip()
    nc = (nome_campo or _DEFAULT_NOME_CAMPO_NUOVO).strip()
    if not proc or not vend or not val:
        return UpdateResult(
            ok=False,
            request_code="",
            error="processo_code, venditore_code e valore_richiesta sono obbligatori.",
        )

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return UpdateResult(ok=False, request_code="", error="DATABASE_URL non configurata.")

    conn = None
    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cur = conn.cursor()
        prog = progressivo
        if prog is None:
            prog = _next_progressivo(cur, proc, vend, val, nc)
        cur.execute(
            f"""
            INSERT INTO {_TABLE}
              (venditore_code, processo_code, nome_campo, progressivo,
               valore_richiesta, valore_dl)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING att_ck_ddi_id
            """,
            (vend, proc, nc, prog, val, dl),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        changes = [
            ChangeLogEntry(
                tabella=_TABLE,
                campo="att_ck_ddi_id",
                vecchio="—",
                nuovo=str(new_id),
            ),
            ChangeLogEntry(
                tabella=_TABLE,
                campo="progressivo",
                vecchio="—",
                nuovo=str(prog),
            ),
        ]
        return UpdateResult(ok=True, request_code=str(new_id), changes=changes)
    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        return UpdateResult(
            ok=False, request_code="", error=e.pgerror or str(e)
        )
    finally:
        if conn:
            conn.close()


def run_se1_dd_update(record: Dict[str, Any]) -> UpdateResult:
    rid = record.get("att_ck_ddi_id")
    if rid is None:
        return UpdateResult(ok=False, request_code="", error="att_ck_ddi_id mancante.")
    try:
        id_row = int(rid)
    except (TypeError, ValueError):
        return UpdateResult(ok=False, request_code="", error="att_ck_ddi_id non valido.")

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return UpdateResult(ok=False, request_code="", error="DATABASE_URL non configurata.")

    fields = {
        "venditore_code": record.get("venditore_code"),
        "processo_code": record.get("processo_code"),
        "nome_campo": record.get("nome_campo"),
        "progressivo": record.get("progressivo"),
        "valore_richiesta": record.get("valore_richiesta"),
        "valore_dl": record.get("valore_dl"),
    }

    conn = None
    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT venditore_code, processo_code, nome_campo, progressivo,
                   valore_richiesta, valore_dl
            FROM {_TABLE}
            WHERE att_ck_ddi_id = %s
            """,
            (id_row,),
        )
        old = cur.fetchone()
        if not old:
            return UpdateResult(
                ok=False,
                request_code=str(id_row),
                error=f"Nessuna riga con att_ck_ddi_id={id_row}.",
            )

        old_map = dict(zip(fields.keys(), old))
        changes: List[ChangeLogEntry] = []
        sets = []
        params: List[Any] = []
        for key, new_val in fields.items():
            if new_val is None:
                continue
            new_s = str(new_val).strip() if key != "progressivo" else new_val
            if key == "progressivo":
                try:
                    new_s = int(new_val)
                except (TypeError, ValueError):
                    return UpdateResult(
                        ok=False,
                        request_code=str(id_row),
                        error="progressivo deve essere un intero.",
                    )
            old_v = old_map.get(key)
            if str(old_v) != str(new_s):
                changes.append(
                    ChangeLogEntry(
                        tabella=_TABLE,
                        campo=key,
                        vecchio=old_v,
                        nuovo=new_s,
                    )
                )
            sets.append(f"{key} = %s")
            params.append(new_s)

        if not sets:
            return UpdateResult(ok=True, request_code=str(id_row), changes=[])

        params.append(id_row)
        cur.execute(
            f"UPDATE {_TABLE} SET {', '.join(sets)} WHERE att_ck_ddi_id = %s",
            params,
        )
        conn.commit()
        return UpdateResult(ok=True, request_code=str(id_row), changes=changes)
    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        return UpdateResult(
            ok=False, request_code=str(id_row), error=e.pgerror or str(e)
        )
    finally:
        if conn:
            conn.close()
