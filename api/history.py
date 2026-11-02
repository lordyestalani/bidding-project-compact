"""Revalue today's budget at published historical rates; never reconstruct facts."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from api import store
from api.valuation import metrics


def profit_history(conn, project_id, days: int):
    project = store.get_project(conn, project_id)
    totals = store.totals(conn, project_id)
    today = datetime.now(ZoneInfo("Asia/Manila")).date()
    start = today - timedelta(days=days - 1)
    rates = (
        conn.execute(
            "SELECT observation_date,rate FROM analytics.fx_rates WHERE observation_date BETWEEN %s AND %s ORDER BY observation_date",
            (start, today),
        ).fetchall()
        if totals["complete"]
        else []
    )
    return {
        "project_version": project["version"],
        "basis": "current_cash_flows",
        "complete": totals["complete"],
        "from_date": start,
        "to_date": today,
        "reference_rate": project["fx"]["rate"],
        "reference_date": project["fx"]["observation_date"],
        "points": [
            {
                "observation_date": row["observation_date"],
                "rate": format(row["rate"], ".8f"),
                "profit_php": metrics(**totals, rate=row["rate"])["profit_php"],
            }
            for row in rates
        ],
    }
