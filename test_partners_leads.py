# -*- coding: utf-8 -*-
"""Test locale per GET /partners/leads (senza avviare il server HTTP)."""
import json
import os

from partners_leads import _build_lead_from_payload, run_get_partner_leads

POSTMAN_QUERY = {
    "page": "1",
    "limit": "1",
    "status": "VALID",
    "type": "SALES",
}

SAMPLE_QUERY = {
    "external_id": "00QUA00000I2qMj2AJ",
    "location_id": "5fb4c022-8c7d-43dc-bf6d-3f1d4b19a26f",
    "first_name": "nome lead",
    "email": "test@test.it",
    "email_type": "BUSINESS",
    "account_type": "BUSINESS",
    "request_type": "GENERIC_SALES",
    "vehicle_make": "Omoda",
    "vehicle_model": "Omoda",
    "vehicle_version": "versione test",
    "vehicle_type": "NEW",
    "source": "Other",
    "owner_user_email": "francesca.sileo@xcconsulting.it",
    "page": "1",
    "limit": "1",
    "status": "VALID",
    "type": "SALES",
}

RICH_PAYLOAD = {
    "external_id": "ad8d2551-fdab-4936-89d5-5bf6b79898bc",
    "location_id": "5fb4c022-8c7d-43dc-bf6d-3f1d4b19a26f",
    "channel": "Lepas",
    "_page": 1,
    "_size": 1,
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
                        },
                        {
                            "type": "MARKETING",
                            "accepted": True,
                            "channel": "SMS",
                            "updated_at": "2025-05-05T15:20:24+00:00",
                        },
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
            "make": "Lepas",
            "model": "Lepas 1",
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


def _assert_paginated(body, *, page=1, size=1):
    assert isinstance(body.get("data"), list) and len(body["data"]) == 1
    assert body.get("page") == page
    assert body.get("size") == size
    assert isinstance(body.get("total"), int) and body["total"] >= 1
    return body["data"][0]


def _assert_lepas_privacy_shape(lead):
    email_privacy = lead["contact"]["communication"]["emails"][0]["privacy"]
    assert email_privacy[0]["type"] == "MARKETING"
    assert email_privacy[0]["channel"] == "EMAIL"
    assert email_privacy[0]["accepted"] is True

    phone_privacy = lead["contact"]["communication"]["phones"][0]["privacy"]
    assert len(phone_privacy) == 2
    assert {item["channel"] for item in phone_privacy} == {"CALL", "SMS"}

    address_privacy = lead["contact"]["communication"]["addresses"][0]["privacy"]
    assert address_privacy[0]["channel"] == "POSTAL"

    contact_privacy = lead["contact"]["privacy"]
    assert contact_privacy[0]["type"] == "DATA_PROCESSING"
    assert contact_privacy[0]["channel"] is None

    campaign = lead["details"]["campaign"]
    assert campaign["name"] == "nome campagna test"
    assert campaign["url"] == ""
    assert campaign["reference"] == ""
    assert campaign["description"] == ""


def main():
    postman = run_get_partner_leads(POSTMAN_QUERY)
    assert postman.ok, postman.error
    assert postman.status_code == 200
    postman_lead = _assert_paginated(postman.payload)
    assert postman_lead["details"]["type"] == "SALES"
    assert postman_lead["details"]["status"] == "VALID"
    assert postman_lead["facility"]["id"] == "5fb4c022-8c7d-43dc-bf6d-3f1d4b19a26f"
    assert postman_lead["contact"]["first_name"] == "stefano"
    assert postman_lead["contact"]["last_name"] == "sampietro"
    assert postman_lead["contact"]["account"]["company_name"] == "stefano sampietro"
    assert postman_lead["contact"]["communication"]["emails"][0]["email"] == "s.sampietro@gmail.com"
    assert postman_lead["contact"]["communication"]["phones"][0]["phone_number"] == "+393356894033"
    assert postman_lead["request"]["requested_vehicle"]["make"] == "Lepas"
    assert postman_lead["request"]["requested_vehicle"]["model"] == "Lepas 1"
    assert postman_lead["details"]["source"]["source"] == "Third Party"
    assert postman_lead["details"]["source"]["source_detail"] == "Official Website Access"
    _assert_lepas_privacy_shape(postman_lead)

    result = run_get_partner_leads(SAMPLE_QUERY)
    assert result.ok, result.error
    assert result.status_code == 200

    lead = _assert_paginated(result.payload)
    assert lead["external_id"] == SAMPLE_QUERY["external_id"]
    assert lead["channel"] == "Lepas"
    assert lead["contact"]["first_name"] == "nome lead"
    assert lead["contact"]["communication"]["emails"][0]["email"] == "test@test.it"
    assert lead["request"]["request_type"] == "GENERIC_SALES"
    assert lead["request"]["requested_vehicle"]["make"] == "Omoda"
    assert lead["details"]["source"]["source"] == "Other"
    assert lead["details"]["campaign"]["name"] == "nome campagna test"
    assert lead["facility"]["id"] == SAMPLE_QUERY["location_id"]
    assert "id" in lead and lead["id"]

    rich = _build_lead_from_payload(RICH_PAYLOAD)
    assert rich.ok, rich.error
    rich_lead = _assert_paginated(rich.payload)
    assert rich_lead["channel"] == "Lepas"
    _assert_lepas_privacy_shape(rich_lead)

    print("OK: run_get_partner_leads (Postman params)")
    print(json.dumps(postman.payload, indent=2, ensure_ascii=False))

    os.environ["PARTNERS_LEADS_API_KEY"] = "test-secret-key"
    from update_dates_api_server import app

    client = app.test_client()
    unauth = client.get("/partners/leads", query_string=POSTMAN_QUERY)
    assert unauth.status_code == 401, unauth.status_code

    auth = client.get(
        "/partners/leads",
        query_string=POSTMAN_QUERY,
        headers={"x-oj-api-key": "test-secret-key"},
    )
    assert auth.status_code == 200, auth.get_data(as_text=True)
    auth_body = auth.get_json()
    assert auth_body["data"][0]["details"]["campaign"]["name"] == "nome campagna test"
    assert auth_body["data"][0]["contact"]["privacy"][0]["type"] == "DATA_PROCESSING"

    print("OK: endpoint HTTP GET con autenticazione")


if __name__ == "__main__":
    main()
