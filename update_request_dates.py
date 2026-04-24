import psycopg2
from psycopg2.extras import Json
from dotenv import load_dotenv
import os
import json
from datetime import datetime
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, List, Optional

load_dotenv()


@dataclass
class ChangeLogEntry:
    tabella: str
    campo: str
    vecchio: Any
    nuovo: Any


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
        'compact': today.strftime('%Y%m%d'),  # 20260326
        'datetime': today.strftime('%Y-%m-%d 00:00:00.000')  # 2026-03-26 00:00:00.000
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
    
    Args:
        json_data: L'oggetto JSON (dict, list) o stringa JSON
        key_name: Il nome della chiave da cercare (es. "DT_DECRICHIESTA")
        key_field: Il nome del campo che contiene il nome della chiave (es. "Key" o "field")
        value_field: Il nome del campo che contiene il valore (es. "Value" o "value")
        new_value: Il nuovo valore da impostare
    
    Returns:
        tuple: (oggetto_modificato, valore_vecchio) o (None, None) se non trovato
    """
    is_string = isinstance(json_data, str)
    
    if is_string:
        data = json.loads(json_data)
    else:
        data = deepcopy(json_data)
    
    old_value = None
    found = False
    
    if isinstance(data, list):
        found, old_value = find_and_update_in_list(data, key_name, key_field, value_field, new_value)
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
        return None, None
    
    if is_string:
        return json.dumps(data, ensure_ascii=False), old_value
    else:
        return data, old_value


def run_update_request_dates(request_code: str) -> UpdateResult:
    """
    Esegue gli aggiornamenti sul database per il codice richiesta indicato.
    Usabile da CLI e da API locale (estensione Chrome).
    """
    code = (request_code or "").strip()
    if not code:
        return UpdateResult(ok=False, request_code="", error="Codice richiesta non inserito.")

    database_url = os.environ.get('DATABASE_URL')
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
        conn = psycopg2.connect(database_url, sslmode='require')
        cursor = conn.cursor()

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

        new_input_json, dt_decrichiesta_old = update_json_key_value(
            input_json, "DT_DECRICHIESTA", "Key", "Value", dates['compact']
        )

        if new_input_json is None:
            return UpdateResult(
                ok=False,
                request_code=code,
                error="Chiave DT_DECRICHIESTA non trovata nel campo input",
            )

        update_value = Json(new_input_json) if isinstance(new_input_json, (dict, list)) else new_input_json
        cursor.execute(
            "UPDATE amc.request SET input = %s, data_decorrenza = %s WHERE request_code = %s",
            (update_value, dates['datetime'], code),
        )

        changes_log.append(
            ChangeLogEntry(
                tabella='amc.request',
                campo='input (DT_DECRICHIESTA)',
                vecchio=dt_decrichiesta_old,
                nuovo=dates['compact'],
            )
        )
        changes_log.append(
            ChangeLogEntry(
                tabella='amc.request',
                campo='data_decorrenza',
                vecchio=data_decorrenza_old_str,
                nuovo=dates['datetime'],
            )
        )

        cursor.execute(
            "SELECT json_message FROM amc.sap_messages WHERE request_code = %s",
            (code,),
        )
        row = cursor.fetchone()

        if not row:
            conn.rollback()
            return UpdateResult(
                ok=False,
                request_code=code,
                error=f"Nessuna riga trovata in amc.sap_messages per request_code = '{code}'",
            )

        json_message = row[0]

        new_json_message, data_decorrenza_sap_old = update_json_key_value(
            json_message, "DATA_DECORRENZA", "field", "value", dates['compact']
        )

        if new_json_message is None:
            conn.rollback()
            return UpdateResult(
                ok=False,
                request_code=code,
                error="Chiave DATA_DECORRENZA non trovata nel campo json_message",
            )

        update_msg_value = (
            Json(new_json_message)
            if isinstance(new_json_message, (dict, list))
            else new_json_message
        )
        cursor.execute(
            "UPDATE amc.sap_messages SET json_message = %s WHERE request_code = %s",
            (update_msg_value, code),
        )

        changes_log.append(
            ChangeLogEntry(
                tabella='amc.sap_messages',
                campo='json_message (DATA_DECORRENZA)',
                vecchio=data_decorrenza_sap_old,
                nuovo=dates['compact'],
            )
        )

        cursor.execute(
            "SELECT valore FROM amc.dati_sap_per_richiesta WHERE numero_richiesta = %s AND nome_campo = 'DATA_DECORRENZA'",
            (code,),
        )
        row = cursor.fetchone()

        if not row:
            conn.rollback()
            return UpdateResult(
                ok=False,
                request_code=code,
                error=f"Nessuna riga trovata in amc.dati_sap_per_richiesta per numero_richiesta = '{code}'",
            )

        valore_old = row[0]

        cursor.execute(
            "UPDATE amc.dati_sap_per_richiesta SET valore = %s WHERE numero_richiesta = %s AND nome_campo = 'DATA_DECORRENZA'",
            (dates['compact'], code),
        )

        changes_log.append(
            ChangeLogEntry(
                tabella='amc.dati_sap_per_richiesta',
                campo='valore',
                vecchio=valore_old,
                nuovo=dates['compact'],
            )
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
    print("OPERAZIONE COMPLETATA CON SUCCESSO")
    print("=" * 60)
    print(f"\nRichiesta: {result.request_code}")
    print("\nRiepilogo modifiche:")
    print("-" * 60)

    for change in result.changes:
        print(f"\nTabella: {change.tabella}")
        print(f"  Campo:   {change.campo}")
        print(f"  Vecchio: {change.vecchio}")
        print(f"  Nuovo:   {change.nuovo}")

    print("\n" + "=" * 60)
    print("\nConnessione al database chiusa.")


if __name__ == "__main__":
    main()
