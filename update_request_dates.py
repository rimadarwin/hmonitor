import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
import os
import json
from datetime import datetime
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple

load_dotenv()


@dataclass
class ChangeLogEntry:
    tabella: str
    campo: str
    vecchio: Any
    nuovo: Any
    # True = campo/riga non trovato: nessuna modifica applicata, flusso prosegue
    skipped: bool = False
    note: Optional[str] = None


@dataclass
class UpdateResult:
    ok: bool
    request_code: str
    changes: List[ChangeLogEntry] = field(default_factory=list)
    error: Optional[str] = None


def get_today_formats():
    """Restituisce la data odierna nei formati richiesti."""
    today = datetime.now()
    return {
        "compact": today.strftime("%Y%m%d"),  # 20260326
        "datetime": today.strftime("%Y-%m-%d 00:00:00.000"),  # 2026-03-26 00:00:00.000
    }


def find_and_update_in_list(items, key_name, key_field, value_field, new_value):
    """Cerca e aggiorna un valore in una lista di oggetti."""
    for item in items:
        if isinstance(item, dict) and item.get(key_field) == key_name:
            old_value = item.get(value_field)
            item[value_field] = new_value
            return True, old_value
    return False, None


def update_json_key_value(json_data, key_name, key_field, value_field, new_value):
    """
    Aggiorna il valore di una chiave specifica in un oggetto JSON.
    Gestisce sia oggetti Python (dict/list) che stringhe JSON.
    Supporta strutture annidate come {"Request":{"Fields":[...]}}

    Returns:
        tuple: (oggetto_modificato, valore_vecchio, found)
        Se non trovato: (json_data originale / copia non usata, None, False)
    """
    is_string = isinstance(json_data, str)

    if is_string:
        data = json.loads(json_data)
    else:
        data = deepcopy(json_data)

    old_value = None
    found = False

    if isinstance(data, list):
        found, old_value = find_and_update_in_list(
            data, key_name, key_field, value_field, new_value
        )
    elif isinstance(data, dict):
        if data.get(key_field) == key_name:
            old_value = data.get(value_field)
            data[value_field] = new_value
            found = True
        elif "Request" in data and "Fields" in data["Request"]:
            found, old_value = find_and_update_in_list(
                data["Request"]["Fields"], key_name, key_field, value_field, new_value
            )
        elif "Fields" in data:
            found, old_value = find_and_update_in_list(
                data["Fields"], key_name, key_field, value_field, new_value
            )
        elif "datiAnagrafici" in data and isinstance(data["datiAnagrafici"], list):
            found, old_value = find_and_update_in_list(
                data["datiAnagrafici"], key_name, key_field, value_field, new_value
            )

    if not found:
        return json_data, None, False

    if is_string:
        return json.dumps(data, ensure_ascii=False), old_value, True
    return data, old_value, True


def _log_skip(
    changes_log: List[ChangeLogEntry],
    tabella: str,
    campo: str,
    note: str,
) -> None:
    # Debug: campo saltato, il flusso continua
    print(f"[SKIP] {tabella}.{campo}: {note}")
    changes_log.append(
        ChangeLogEntry(
            tabella=tabella,
            campo=campo,
            vecchio="(non trovato)",
            nuovo="(non aggiornato)",
            skipped=True,
            note=note,
        )
    )


def _log_change(
    changes_log: List[ChangeLogEntry],
    tabella: str,
    campo: str,
    vecchio: Any,
    nuovo: Any,
) -> None:
    print(f"[OK] {tabella}.{campo}: {vecchio} -> {nuovo}")
    changes_log.append(
        ChangeLogEntry(
            tabella=tabella,
            campo=campo,
            vecchio=vecchio,
            nuovo=nuovo,
            skipped=False,
        )
    )


def _as_json_param(value: Any):
    return Json(value) if isinstance(value, (dict, list)) else value


def _update_dati_sap_campo(
    cursor,
    code: str,
    nome_campo: str,
    new_value: str,
    changes_log: List[ChangeLogEntry],
) -> None:
    """Aggiorna un nome_campo in amc.dati_sap_per_richiesta; se assente, logga e prosegue."""
    cursor.execute(
        "SELECT valore FROM amc.dati_sap_per_richiesta "
        "WHERE numero_richiesta = %s AND nome_campo = %s",
        (code, nome_campo),
    )
    row = cursor.fetchone()
    if not row:
        _log_skip(
            changes_log,
            "amc.dati_sap_per_richiesta",
            f"valore ({nome_campo})",
            f"Nessuna riga per numero_richiesta='{code}' e nome_campo='{nome_campo}'",
        )
        return

    valore_old = row[0]
    cursor.execute(
        "UPDATE amc.dati_sap_per_richiesta SET valore = %s "
        "WHERE numero_richiesta = %s AND nome_campo = %s",
        (new_value, code, nome_campo),
    )
    _log_change(
        changes_log,
        "amc.dati_sap_per_richiesta",
        f"valore ({nome_campo})",
        valore_old,
        new_value,
    )


def run_update_request_dates(request_code: str) -> UpdateResult:
    """
    Esegue gli aggiornamenti sul database per il codice richiesta indicato.
    Usabile da CLI e da API locale (estensione Chrome).

    Se un singolo campo JSON/riga dati_sap non è presente, non interrompe:
    registra lo skip nel log e prosegue con gli altri aggiornamenti.
    """
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

    dates = get_today_formats()
    changes_log: List[ChangeLogEntry] = []
    conn = None

    try:
        conn = psycopg2.connect(database_url, sslmode="require")
        cursor = conn.cursor()

        # --- amc.request ---
        cursor.execute(
            "SELECT input, data_decorrenza FROM amc.request WHERE request_code = %s",
            (code,),
        )
        row = cursor.fetchone()

        if not row:
            return UpdateResult(
                ok=False,
                request_code=code,
                error=f"Nessuna riga trovata in amc.request per request_code = '{code}'",
            )

        input_json, data_decorrenza_old = row
        data_decorrenza_old_str = str(data_decorrenza_old) if data_decorrenza_old else "NULL"

        new_input_json, dt_decrichiesta_old, found_dt = update_json_key_value(
            input_json, "DT_DECRICHIESTA", "Key", "Value", dates["compact"]
        )

        if found_dt:
            cursor.execute(
                "UPDATE amc.request SET input = %s, data_decorrenza = %s WHERE request_code = %s",
                (_as_json_param(new_input_json), dates["datetime"], code),
            )
            _log_change(
                changes_log,
                "amc.request",
                "input (DT_DECRICHIESTA)",
                dt_decrichiesta_old,
                dates["compact"],
            )
        else:
            # Aggiorna comunque data_decorrenza colonna; JSON input invariato
            cursor.execute(
                "UPDATE amc.request SET data_decorrenza = %s WHERE request_code = %s",
                (dates["datetime"], code),
            )
            _log_skip(
                changes_log,
                "amc.request",
                "input (DT_DECRICHIESTA)",
                "Chiave DT_DECRICHIESTA non trovata nel campo input",
            )

        _log_change(
            changes_log,
            "amc.request",
            "data_decorrenza",
            data_decorrenza_old_str,
            dates["datetime"],
        )

        # --- amc.sap_messages: DATA_DECORRENZA + DATA_ESECUZIONE ---
        cursor.execute(
            "SELECT json_message FROM amc.sap_messages WHERE request_code = %s",
            (code,),
        )
        row = cursor.fetchone()

        if not row:
            _log_skip(
                changes_log,
                "amc.sap_messages",
                "json_message (DATA_DECORRENZA)",
                f"Nessuna riga per request_code='{code}'",
            )
            _log_skip(
                changes_log,
                "amc.sap_messages",
                "json_message (DATA_ESECUZIONE)",
                f"Nessuna riga per request_code='{code}'",
            )
        else:
            json_message = row[0]
            current_msg = json_message
            any_sap_field_updated = False

            current_msg, decor_old, found_decor = update_json_key_value(
                current_msg, "DATA_DECORRENZA", "field", "value", dates["compact"]
            )
            if found_decor:
                any_sap_field_updated = True
                _log_change(
                    changes_log,
                    "amc.sap_messages",
                    "json_message (DATA_DECORRENZA)",
                    decor_old,
                    dates["compact"],
                )
            else:
                _log_skip(
                    changes_log,
                    "amc.sap_messages",
                    "json_message (DATA_DECORRENZA)",
                    "Chiave DATA_DECORRENZA non trovata in json_message",
                )

            current_msg, esec_old, found_esec = update_json_key_value(
                current_msg, "DATA_ESECUZIONE", "field", "value", dates["compact"]
            )
            if found_esec:
                any_sap_field_updated = True
                _log_change(
                    changes_log,
                    "amc.sap_messages",
                    "json_message (DATA_ESECUZIONE)",
                    esec_old,
                    dates["compact"],
                )
            else:
                _log_skip(
                    changes_log,
                    "amc.sap_messages",
                    "json_message (DATA_ESECUZIONE)",
                    "Chiave DATA_ESECUZIONE non trovata in json_message",
                )

            if any_sap_field_updated:
                cursor.execute(
                    "UPDATE amc.sap_messages SET json_message = %s WHERE request_code = %s",
                    (_as_json_param(current_msg), code),
                )

        # --- amc.dati_sap_per_richiesta: DATA_DECORRENZA + DATA_ESECUZIONE ---
        _update_dati_sap_campo(
            cursor, code, "DATA_DECORRENZA", dates["compact"], changes_log
        )
        _update_dati_sap_campo(
            cursor, code, "DATA_ESECUZIONE", dates["compact"], changes_log
        )

        conn.commit()
        return UpdateResult(ok=True, request_code=code, changes=changes_log)

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
    print("AGGIORNAMENTO DATE RICHIESTA - Heroku PostgreSQL")
    print("=" * 60)

    request_code = input("\nInserisci il codice richiesta (es. V00000030814): ").strip()

    dates = get_today_formats()
    print(f"\nElaborazione richiesta: {request_code or '(vuoto)'}")
    print("-" * 60)
    print(f"Data odierna (compatta): {dates['compact']}")
    print(f"Data odierna (datetime): {dates['datetime']}")
    print("-" * 60)

    result = run_update_request_dates(request_code)

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
    print("\nRiepilogo modifiche / skip:")
    print("-" * 60)

    for change in result.changes:
        stato = "SALTATO" if change.skipped else "AGGIORNATO"
        print(f"\n[{stato}] Tabella: {change.tabella}")
        print(f"  Campo:   {change.campo}")
        print(f"  Vecchio: {change.vecchio}")
        print(f"  Nuovo:   {change.nuovo}")
        if change.note:
            print(f"  Nota:    {change.note}")

    print("\n" + "=" * 60)
    print("\nConnessione al database chiusa.")


if __name__ == "__main__":
    main()
