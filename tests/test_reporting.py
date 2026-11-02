from datetime import date
from decimal import Decimal
from uuid import uuid4

import psycopg

from pipeline.run import dbt


def test_current_views_and_scenario_match_without_pipeline_rerun(database, client):
    dbt(["run", "--select", "project_totals", "project_estimates"], database)
    with psycopg.connect(database) as conn:
        run_id, response_id = uuid4(), uuid4()
        conn.execute(
            "INSERT INTO ops.runs(id,start_date,end_date,status) VALUES(%s,'2026-10-30','2026-10-30','success')",
            (run_id,),
        )
        conn.execute(
            "INSERT INTO raw.responses(id,run_id,url,fetched_at,status_code,checksum,body) VALUES(%s,%s,'recorded-test',now(),200,'test','test')",
            (response_id, run_id),
        )
        conn.execute(
            "INSERT INTO analytics.fx_rates(observation_date,rate,run_id,response_id,fetched_at) VALUES('2026-10-30',55,%s,%s,now())",
            (run_id, response_id),
        )
    project = client.post(
        "/api/projects",
        json={"name": "View reconciliation", "request_id": str(uuid4())},
    ).json()
    body = {
        "name": project["name"],
        "version": project["version"],
        "lines": [
            {
                "label": "Customer",
                "direction": "incoming",
                "currency": "USD",
                "amount": "100000",
            },
            {
                "label": "Supplier",
                "direction": "outgoing",
                "currency": "PHP",
                "amount": "5000000",
            },
        ],
    }
    saved = client.put(f"/api/projects/{project['id']}", json=body).json()
    assert saved["metrics"]["profit_php"] == "500000.0000"
    scenario = client.post(
        f"/api/projects/{project['id']}/scenario", json={"rate_php_per_usd": "55"}
    ).json()
    assert scenario["metrics"] == saved["metrics"]
    with psycopg.connect(database) as conn:
        assert conn.execute(
            "SELECT profit_php FROM analytics.project_estimates WHERE project_id=%s",
            (project["id"],),
        ).fetchone()[0] == Decimal("500000")
    body["version"] = saved["version"]
    body["lines"][1]["amount"] = "5100000"
    saved = client.put(f"/api/projects/{project['id']}", json=body).json()
    assert saved["metrics"]["profit_php"] == "400000.0000"
