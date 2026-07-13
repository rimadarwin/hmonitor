# -*- coding: utf-8 -*-
"""Test locale per POST /partners/leads (senza avviare il server HTTP)."""
import json
import os

from partners_leads import run_create_partner_lead

SAMPLE_PAYLOAD = {
    "request": {
        "description": None,
        "expected_purchase_date": None,
        "requested_vehicle": {
            "vehicle_type": "NEW",
            "version": "versione test",
            "model": "Omoda",
            "make": "Omoda",
        },
        "request_type": "GENERIC_SALES",
    },
    "contact": {
        "communication": {
            "emails": [{"type": "BUSINESS", "email": "test@test.it"}]
        },
        "account": {"account_type": "BUSINESS"},
        "last_name": None,
        "first_name": "nome lead",
    },
    "details": {
        "source": {"source_detail": None, "source": "Other"},
        "status": "VALID",
        "type": "SALES",
    },
    "location_id": "5fb4c022-8c7d-43dc-bf6d-3f1d4b19a26f",
    "owner_user_email": "francesca.sileo@xcconsulting.it",
    "external_id": "00QUA00000I2qMj2AJ",
}

RICH_PAYLOAD = {
    "external_id": "ad8d2551-fdab-4936-89d5-5bf6b79898bc",
    "location_id": "5fb4c022-8c7d-43dc-bf6d-3f1d4b19a26f",
    "channel": "Lepas",
    "contact": {
        "first_name": "stefano",
        "last_name": "sampietro",
        "account": {"account_type": "PRIVATE"},
        "communication": {
            "emails": [
                {
                    "type": "PRIVATE",
                    "email": "s.sampietro@gmail.com",
                    "privacy": [
                        {
                            "type": "MARKETING",
                            "accepted": True,
                            "channel": "EMAIL",
                            "updated_at": "2025-05-05T15:20:24+00:00",
                        }
                    ],
                }
            ],
            "phones": [
                {
                    "phone_number": "+393356894033",
                    "type": "PRIVATE",
                    "phone_type": "MOBILE",
                    "privacy": [
                        {
                            "type": "MARKETING",
                            "accepted": True,
                            "channel": "CALL",
                            "updated_at": "2025-05-05T15:20:24+00:00",
                        }
                    ],
                }
            ],
            "addresses": [
                {
                    "city": "Roma",
                    "region": "Roma",
                    "postal_code": "149",
                    "country": "IT",
                    "type": "UNKNOWN",
                    "privacy": [
                        {
                            "type": "MARKETING",
                            "accepted": True,
                            "channel": "POSTAL",
                            "updated_at": "2025-05-05T15:20:24+00:00",
                        }
                    ],
                }
            ],
        },
        "privacy": [
            {
                "type": "DATA_PROCESSING",
                "accepted": True,
                "channel": None,
                "updated_at": "2025-05-05T15:20:24+00:00",
            }
        ],
    },
    "request": {
        "request_type": "GENERIC_SALES",
        "requested_vehicle": {
            "vehicle_type": "NEW",
            "make": "Omoda",
            "model": "OMODA 5",
            "version": "",
        },
    },
    "details": {
        "type": "SALES",
        "status": "VALID",
        "source": {
            "source": "Third Party",
            "source_detail": "Official Website Access",
        },
        "campaign": {
            "url": "",
            "name": "nome campagna test",
            "reference": "",
            "description": "",
        },
    },
}


def _assert_paginated(body):
    assert isinstance(body.get("data"), list) and len(body["data"]) == 1
    assert body.get("page") == 1
    assert body.get("size") == 1
    assert isinstance(body.get("total"), int) and body["total"] >= 1
    return body["data"][0]


def main():
    result = run_create_partner_lead(SAMPLE_PAYLOAD)
    assert result.ok, result.error
    assert result.status_code == 201

    lead = _assert_paginated(result.payload)
    assert lead["external_id"] == SAMPLE_PAYLOAD["external_id"]
    assert lead["channel"] == "Lepas"
    assert lead["contact"]["first_name"] == "nome lead"
    assert lead["contact"]["communication"]["emails"][0]["email"] == "test@test.it"
    assert lead["request"]["request_type"] == "GENERIC_SALES"
    assert lead["request"]["requested_vehicle"]["make"] == "Omoda"
    assert lead["request"]["description"] == ""
    assert lead["details"]["source"]["source_detail"] == "unknown"
    assert lead["facility"]["id"] == SAMPLE_PAYLOAD["location_id"]
    assert lead["facility"]["name"] == "CARPOINT S.P.A. -Pomezia"
    assert lead["facility"]["address"]["country"] == ""
    assert "id" in lead and lead["id"]

    rich = run_create_partner_lead(RICH_PAYLOAD)
    assert rich.ok, rich.error
    rich_lead = _assert_paginated(rich.payload)
    assert rich_lead["channel"] == "Lepas"
    assert rich_lead["contact"]["account"]["company_name"] == "stefano sampietro"
    assert rich_lead["contact"]["communication"]["phones"][0]["phone_number"] == "+393356894033"
    assert rich_lead["contact"]["privacy"][0]["type"] == "DATA_PROCESSING"
    assert rich_lead["details"]["campaign"]["name"] == "nome campagna test"
    assert rich_lead["details"]["source"]["source_detail"] == "Official Website Access"

    print("OK: run_create_partner_lead")
    print(json.dumps(result.payload, indent=2, ensure_ascii=False))

    os.environ["PARTNERS_LEADS_API_KEY"] = "test-secret-key"
    from update_dates_api_server import app

    client = app.test_client()
    unauth = client.post("/partners/leads", json=SAMPLE_PAYLOAD)
    assert unauth.status_code == 401, unauth.status_code

    auth = client.post(
        "/partners/leads",
        json=SAMPLE_PAYLOAD,
        headers={"X-Internal-Api-Key": "test-secret-key"},
    )
    assert auth.status_code == 201, auth.get_data(as_text=True)
    auth_body = auth.get_json()
    assert auth_body["data"][0]["id"]
    assert auth.headers.get("Location", "").startswith("/partners/leads/")

    print("OK: endpoint HTTP con autenticazione")


if __name__ == "__main__":
    main()
