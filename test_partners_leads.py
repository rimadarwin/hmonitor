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


def main():
    result = run_create_partner_lead(SAMPLE_PAYLOAD)
    assert result.ok, result.error
    assert result.status_code == 201

    body = result.payload
    assert body["external_id"] == SAMPLE_PAYLOAD["external_id"]
    assert body["channel"] == "omoda"
    assert body["contact"]["first_name"] == "nome lead"
    assert body["contact"]["communication"]["emails"][0]["email"] == "test@test.it"
    assert body["request"]["request_type"] == "GENERIC_SALES"
    assert body["request"]["requested_vehicle"]["make"] == "Omoda"
    assert body["details"]["source"]["source_detail"] == "unknown"
    assert body["facility"]["id"] == SAMPLE_PAYLOAD["location_id"]
    assert body["facility"]["name"] == "CARPOINT S.P.A. -Pomezia"
    assert "id" in body and body["id"]
    assert "created_at" in body

    print("OK: run_create_partner_lead")
    print(json.dumps(body, indent=2, ensure_ascii=False))

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
    assert auth.headers.get("Location", "").startswith("/partners/leads/")

    print("OK: endpoint HTTP con autenticazione")


if __name__ == "__main__":
    main()
