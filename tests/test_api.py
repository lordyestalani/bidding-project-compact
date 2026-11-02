from uuid import uuid4

import pytest


def project(client):
    response = client.post(
        "/api/projects", json={"name": "Office equipment", "request_id": str(uuid4())}
    )
    assert response.status_code == 201, response.text
    return response.json()


def budget(record):
    return {
        "name": record["name"],
        "customer": "",
        "notes": "",
        "archived": False,
        "version": record["version"],
        "lines": [
            {
                "label": "Customer",
                "direction": "incoming",
                "currency": "USD",
                "amount": "100000",
                "expected_date": None,
            },
            {
                "label": "Supplier",
                "direction": "outgoing",
                "currency": "PHP",
                "amount": "5000000",
                "expected_date": None,
            },
        ],
    }


def test_save_reload_scenario_and_conflict(client):
    record = project(client)
    body = budget(record)
    saved = client.put(f"/api/projects/{record['id']}", json=body)
    assert saved.status_code == 200, saved.text
    assert len(saved.json()["lines"]) == 2
    assert client.put(f"/api/projects/{record['id']}", json=body).status_code == 409
    before = client.get(f"/api/projects/{record['id']}").json()
    result = client.post(
        f"/api/projects/{record['id']}/scenario", json={"rate_php_per_usd": "58"}
    ).json()
    assert result["metrics"]["profit_php"] == "800000.0000"
    assert result["hypothetical"] is True
    assert result["difference_php"] is None
    assert client.get(f"/api/projects/{record['id']}").json() == before


def test_create_replay_and_changed_key_payload(client):
    body = {"name": "Same bid", "request_id": str(uuid4())}
    one = client.post("/api/projects", json=body)
    two = client.post("/api/projects", json=body)
    assert one.json()["id"] == two.json()["id"]
    assert len(client.get("/api/projects").json()) == 1
    assert (
        client.post("/api/projects", json=body | {"name": "Other"}).status_code == 409
    )


def test_archive_restore_and_unknown_budget(client):
    record = project(client)
    body = budget(record)
    body["lines"][1]["amount"] = None
    saved = client.put(f"/api/projects/{record['id']}", json=body).json()
    assert saved["metrics"]["profit_php"] is None
    assert saved["metrics"]["complete"] is False
    body.update(version=saved["version"], archived=True)
    saved = client.put(f"/api/projects/{record['id']}", json=body).json()
    assert client.get("/api/projects").json() == []
    assert len(client.get("/api/projects?archived=true").json()) == 1
    body.update(version=saved["version"], archived=False)
    assert client.put(f"/api/projects/{record['id']}", json=body).status_code == 200
    assert len(client.get("/api/projects").json()) == 1


@pytest.mark.parametrize("amount", ["-1", "NaN", "3.14159", 10])
def test_failed_save_preserves_prior_facts(client, amount):
    record = project(client)
    body = budget(record)
    body["lines"][0]["amount"] = amount
    assert client.put(f"/api/projects/{record['id']}", json=body).status_code == 422
    assert client.get(f"/api/projects/{record['id']}").json()["lines"] == []


def test_php_only_and_missing_project(client):
    record = project(client)
    assert record["metrics"]["complete"] is False
    body = budget(record)
    body["lines"] = [dict(body["lines"][0], currency="PHP", amount="100")]
    assert (
        client.put(f"/api/projects/{record['id']}", json=body).json()["metrics"][
            "profit_php"
        ]
        == "100.0000"
    )
    assert client.get(f"/api/projects/{uuid4()}").status_code == 404
    assert (
        client.post(
            f"/api/projects/{record['id']}/scenario", json={"rate_php_per_usd": "0"}
        ).status_code
        == 422
    )
