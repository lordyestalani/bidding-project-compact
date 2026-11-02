from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg


def seed_rates(database):
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    with psycopg.connect(database) as conn:
        run_id, response_id = uuid4(), uuid4()
        conn.execute(
            "INSERT INTO ops.runs(id,start_date,end_date,status) VALUES(%s,%s,%s,'success')",
            (run_id, today - timedelta(days=100), today),
        )
        conn.execute(
            "INSERT INTO raw.responses(id,run_id,url,fetched_at,status_code,checksum,body) VALUES(%s,%s,'OFFLINE TEST',now(),200,'test','test')",
            (response_id, run_id),
        )
        for days, rate in [(100, "40"), (2, "45"), (1, "55"), (0, "58"), (-1, "100")]:
            conn.execute(
                "INSERT INTO analytics.fx_rates(observation_date,rate,run_id,response_id,fetched_at) VALUES(%s,%s,%s,%s,now())",
                (today - timedelta(days=days), rate, run_id, response_id),
            )
    return today


def create_budget(client, *, php_only=False, unknown=False):
    project = client.post(
        "/api/projects", json={"name": "Profit chart", "request_id": str(uuid4())}
    ).json()
    body = {
        "name": project["name"],
        "version": 1,
        "lines": [
            {
                "label": "Customer",
                "direction": "incoming",
                "currency": "PHP" if php_only else "USD",
                "amount": "5500000" if php_only else "100000",
            },
            {
                "label": "Supplier",
                "direction": "outgoing",
                "currency": "PHP",
                "amount": None if unknown else "5000000",
            },
        ],
    }
    return client.put(f"/api/projects/{project['id']}", json=body).json()


def test_history_uses_current_budget_and_published_rate_dates(client, database):
    today = seed_rates(database)
    project = create_budget(client)
    before = client.get(f"/api/projects/{project['id']}").json()
    response = client.get(f"/api/projects/{project['id']}/profit-history")
    assert response.status_code == 200
    data = response.json()
    assert data["project_version"] == project["version"]
    assert data["basis"] == "current_cash_flows"
    assert [point["observation_date"] for point in data["points"]] == [
        str(today - timedelta(days=2)),
        str(today - timedelta(days=1)),
        str(today),
    ]
    assert [point["profit_php"] for point in data["points"]] == [
        "-500000.0000",
        "500000.0000",
        "800000.0000",
    ]
    assert data["points"][-1]["profit_php"] == project["metrics"]["profit_php"]
    assert client.get(f"/api/projects/{project['id']}").json() == before


def test_history_handles_php_only_unknown_and_empty_rates(client, database):
    seed_rates(database)
    project = create_budget(client, php_only=True)
    points = client.get(f"/api/projects/{project['id']}/profit-history").json()[
        "points"
    ]
    assert {point["profit_php"] for point in points} == {"500000.0000"}
    missing = create_budget(client, unknown=True)
    result = client.get(f"/api/projects/{missing['id']}/profit-history").json()
    assert result["complete"] is False
    assert result["points"] == []
    with psycopg.connect(database) as conn:
        conn.execute("DELETE FROM analytics.fx_rates")
    result = client.get(f"/api/projects/{project['id']}/profit-history").json()
    assert result["complete"] is True and result["points"] == []


def test_history_bounds_and_missing_project(client):
    project = create_budget(client)
    assert (
        client.get(
            f"/api/projects/{project['id']}/profit-history?days=100000"
        ).status_code
        == 422
    )
    assert client.get(f"/api/projects/{uuid4()}/profit-history").status_code == 404
