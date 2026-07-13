# -*- coding: utf-8 -*-
"""
Endpoint interno POST /partners/leads — compatibile con il contratto partners/leads.

Pensato per chiamate server-to-server (es. Salesforce); non esposto al frontend.
"""
import json
import os
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

_FACILITIES_PATH = Path(__file__).with_name("partners_leads_facilities.json")


@dataclass
class LeadResult:
    ok: bool
    payload: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    status_code: int = 201


def _channel() -> str:
    return os.environ.get("PARTNERS_LEADS_CHANNEL", "Lepas").strip() or "Lepas"


def _list_total() -> int:
    raw = os.environ.get("PARTNERS_LEADS_TOTAL", "2316").strip()
    try:
        return max(1, int(raw))
    except ValueError:
        return 2316


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _new_id() -> str:
    if hasattr(uuid, "uuid7"):
        return str(uuid.uuid7())
    return str(uuid.uuid4())


def _load_facilities() -> Dict[str, Dict[str, Any]]:
    if not _FACILITIES_PATH.is_file():
        return {}
    with _FACILITIES_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def is_partners_leads_authorized(headers) -> bool:
    expected = os.environ.get("PARTNERS_LEADS_API_KEY", "").strip()
    if not expected:
        return False

    api_key = (headers.get("X-Internal-Api-Key") or "").strip()
    if api_key and api_key == expected:
        return True

    auth_header = (headers.get("Authorization") or "").strip()
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        if token == expected:
            return True

    return False


def _normalize_privacy(
    privacy_list: Optional[List[Any]], default_updated_at: str
) -> List[Dict[str, Any]]:
    privacy_out: List[Dict[str, Any]] = []
    for item in privacy_list or []:
        if not isinstance(item, dict):
            continue
        privacy_out.append(
            {
                "type": item.get("type") or "MARKETING",
                "accepted": bool(item.get("accepted", True)),
                "channel": item.get("channel"),
                "updated_at": item.get("updated_at") or default_updated_at,
            }
        )
    return privacy_out


def _normalize_emails(
    contact: Dict[str, Any], default_updated_at: str
) -> List[Dict[str, Any]]:
    communication = contact.get("communication") or {}
    emails_in = communication.get("emails") or []
    emails_out: List[Dict[str, Any]] = []

    for item in emails_in:
        if not isinstance(item, dict):
            continue
        email = (item.get("email") or "").strip()
        if not email:
            continue
        emails_out.append(
            {
                "email": email,
                "privacy": _normalize_privacy(item.get("privacy"), default_updated_at),
                "type": item.get("type") or "PRIVATE",
            }
        )

    return emails_out


def _normalize_phones(
    contact: Dict[str, Any], default_updated_at: str
) -> List[Dict[str, Any]]:
    communication = contact.get("communication") or {}
    phones_in = communication.get("phones") or []
    phones_out: List[Dict[str, Any]] = []

    for item in phones_in:
        if not isinstance(item, dict):
            continue
        phone_number = (item.get("phone_number") or item.get("number") or "").strip()
        if not phone_number:
            continue
        phones_out.append(
            {
                "phone_number": phone_number,
                "privacy": _normalize_privacy(item.get("privacy"), default_updated_at),
                "type": item.get("type") or "PRIVATE",
                "phone_type": item.get("phone_type") or "MOBILE",
            }
        )

    return phones_out


def _normalize_addresses(
    contact: Dict[str, Any], default_updated_at: str
) -> List[Dict[str, Any]]:
    communication = contact.get("communication") or {}
    addresses_in = communication.get("addresses") or []
    addresses_out: List[Dict[str, Any]] = []

    for item in addresses_in:
        if not isinstance(item, dict):
            continue
        addresses_out.append(
            {
                "city": item.get("city") or "",
                "region": item.get("region") or "",
                "postal_code": item.get("postal_code") or "",
                "street": item.get("street") or "",
                "street_2": item.get("street_2") or "",
                "country": item.get("country") or "",
                "type": item.get("type") or "UNKNOWN",
                "privacy": _normalize_privacy(item.get("privacy"), default_updated_at),
            }
        )

    return addresses_out


def _build_account(
    account_in: Dict[str, Any], first_name: str, last_name: str
) -> Dict[str, Any]:
    account_type = account_in.get("account_type") or "PRIVATE"
    company_name = (account_in.get("company_name") or "").strip()
    if not company_name and account_type == "PRIVATE":
        company_name = f"{first_name} {last_name}".strip()

    return {
        "account_type": account_type,
        "company_name": company_name,
        "vat_code": account_in.get("vat_code"),
        "fiscal_code": account_in.get("fiscal_code"),
        "description": account_in.get("description"),
    }


def _build_campaign(campaign_in: Any) -> Optional[Dict[str, str]]:
    if campaign_in is None:
        return None
    if isinstance(campaign_in, str):
        return {
            "url": "",
            "name": campaign_in,
            "reference": "",
            "description": "",
        }
    if not isinstance(campaign_in, dict):
        return None

    return {
        "url": campaign_in.get("url") or "",
        "name": campaign_in.get("name") or "",
        "reference": campaign_in.get("reference") or "",
        "description": campaign_in.get("description") or "",
    }


def _build_facility(location_id: str) -> Dict[str, Any]:
    facilities = _load_facilities()
    known = facilities.get(location_id) or {}

    return {
        "external_id": known.get("external_id"),
        "id": location_id,
        "name": known.get("name") or "",
        "address": deepcopy(
            known.get("address")
            or {
                "city": "",
                "region": "",
                "postal_code": "",
                "street": "",
                "street_2": "",
                "country": "",
                "type": "UNKNOWN",
                "privacy": [],
            }
        ),
        "fiscal_entity_id": known.get("fiscal_entity_id"),
        "fiscal_entity_name": known.get("fiscal_entity_name") or "",
    }


def _build_requested_vehicle(vehicle_in: Dict[str, Any]) -> Dict[str, Any]:
    vehicle_in = vehicle_in or {}
    return {
        "id": vehicle_in.get("id"),
        "class": vehicle_in.get("class") or "CAR",
        "vehicle_type": vehicle_in.get("vehicle_type") or "NEW",
        "vehicle_status": vehicle_in.get("vehicle_status"),
        "vin": vehicle_in.get("vin"),
        "plate_number": vehicle_in.get("plate_number"),
        "make": vehicle_in.get("make") or "",
        "model": vehicle_in.get("model") or "",
        "version": vehicle_in.get("version") or "",
        "registration_date": vehicle_in.get("registration_date"),
        "last_revision_date": vehicle_in.get("last_revision_date"),
        "description": vehicle_in.get("description") or "",
        "facility": vehicle_in.get("facility"),
        "specification": vehicle_in.get("specification"),
        "mileage": vehicle_in.get("mileage"),
        "warranty": vehicle_in.get("warranty"),
    }


def _wrap_paginated_response(lead: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "data": [lead],
        "page": 1,
        "size": 1,
        "total": _list_total(),
    }


def _has_valid_contact_channel(contact: Dict[str, Any]) -> bool:
    emails = _normalize_emails(contact, _utc_now_iso())
    phones = _normalize_phones(contact, _utc_now_iso())
    return bool(emails or phones)


def _validate_payload(data: Dict[str, Any]) -> Optional[str]:
    if not isinstance(data, dict):
        return "Payload JSON non valido."

    external_id = (data.get("external_id") or "").strip()
    if not external_id:
        return "Campo obbligatorio mancante: external_id."

    location_id = (data.get("location_id") or "").strip()
    if not location_id:
        return "Campo obbligatorio mancante: location_id."

    contact = data.get("contact")
    if not isinstance(contact, dict):
        return "Campo obbligatorio mancante: contact."

    if not _has_valid_contact_channel(contact):
        return (
            "Almeno un contatto valido è richiesto in "
            "contact.communication.emails o contact.communication.phones."
        )

    request_block = data.get("request")
    if not isinstance(request_block, dict):
        return "Campo obbligatorio mancante: request."

    if not (request_block.get("request_type") or "").strip():
        return "Campo obbligatorio mancante: request.request_type."

    details = data.get("details")
    if not isinstance(details, dict):
        return "Campo obbligatorio mancante: details."

    if not (details.get("type") or "").strip():
        return "Campo obbligatorio mancante: details.type."

    if not (details.get("status") or "").strip():
        return "Campo obbligatorio mancante: details.status."

    return None


def run_create_partner_lead(data: Dict[str, Any]) -> LeadResult:
    validation_error = _validate_payload(data)
    if validation_error:
        return LeadResult(ok=False, error=validation_error, status_code=400)

    created_at = _utc_now_iso()
    imported_at = _utc_now_iso()
    lead_id = _new_id()
    contact_id = _new_id()

    contact_in = data.get("contact") or {}
    account_in = contact_in.get("account") or {}
    request_in = data.get("request") or {}
    details_in = data.get("details") or {}
    source_in = details_in.get("source") or {}

    first_name = contact_in.get("first_name") or ""
    last_name = contact_in.get("last_name") or ""

    source_detail = source_in.get("source_detail")
    if source_detail is None or str(source_detail).strip() == "":
        source_detail = "unknown"

    lead = {
        "id": lead_id,
        "external_id": data.get("external_id"),
        "channel": data.get("channel") or _channel(),
        "contact": {
            "id": contact_id,
            "first_name": first_name,
            "last_name": last_name,
            "account": _build_account(account_in, first_name, last_name),
            "communication": {
                "emails": _normalize_emails(contact_in, created_at),
                "phones": _normalize_phones(contact_in, created_at),
                "addresses": _normalize_addresses(contact_in, created_at),
            },
            "title": contact_in.get("title") or "",
            "gender": contact_in.get("gender") or "",
            "birth_place": contact_in.get("birth_place") or "",
            "language": contact_in.get("language") or "it",
            "privacy": _normalize_privacy(contact_in.get("privacy"), created_at),
            "created_at": imported_at,
            "updated_at": imported_at,
        },
        "request": {
            "request_type": request_in.get("request_type"),
            "requested_vehicle": _build_requested_vehicle(request_in.get("requested_vehicle") or {}),
            "owned_vehicles": request_in.get("owned_vehicles") or [],
            "trade_in_vehicles": request_in.get("trade_in_vehicles") or [],
            "expected_purchase_date": request_in.get("expected_purchase_date"),
            "description": request_in.get("description") or "",
        },
        "details": {
            "type": details_in.get("type"),
            "status": details_in.get("status"),
            "closed_reason": details_in.get("closed_reason") or "",
            "closed_at": details_in.get("closed_at"),
            "source": {
                "source": source_in.get("source") or "Other",
                "source_detail": source_detail,
            },
            "campaign": _build_campaign(details_in.get("campaign")),
            "description": details_in.get("description") or "",
        },
        "facility": _build_facility(data.get("location_id")),
        "imported_at": imported_at,
        "created_at": created_at,
        "updated_at": created_at,
        "appointment": data.get("appointment"),
        "opportunity_id": data.get("opportunity_id"),
    }

    return LeadResult(ok=True, payload=_wrap_paginated_response(lead), status_code=201)
