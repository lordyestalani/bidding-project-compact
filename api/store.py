"""Small transactional persistence boundary; dbt owns reporting views."""

from uuid import uuid4

from fastapi import HTTPException


def fx(conn):
    rate = conn.execute(
        "SELECT observation_date,rate,source FROM analytics.fx_rates WHERE observation_date <= (now() AT TIME ZONE 'Asia/Manila')::date ORDER BY observation_date DESC LIMIT 1"
    ).fetchone()
    run = conn.execute(
        "SELECT id,status,started_at,finished_at,error FROM ops.runs ORDER BY started_at DESC,id DESC LIMIT 1"
    ).fetchone()
    return {
        "rate": format(rate["rate"], ".8f") if rate else None,
        "observation_date": rate["observation_date"] if rate else None,
        "source": rate["source"] if rate else "ECB via Frankfurter",
        "last_run": run,
    }


def totals(conn, project_id):
    return conn.execute(
        "SELECT complete,in_php,in_usd,out_php,out_usd FROM analytics.project_totals WHERE project_id=%s",
        (project_id,),
    ).fetchone()


def get_project(conn, project_id):
    project = conn.execute(
        "SELECT id,name,customer,notes,archived,version FROM app.projects WHERE id=%s",
        (project_id,),
    ).fetchone()
    if project is None:
        raise HTTPException(404, "Project not found.")
    lines = conn.execute(
        "SELECT label,direction,currency,amount,expected_date FROM app.cash_flows WHERE project_id=%s ORDER BY position",
        (project_id,),
    ).fetchall()
    for line in lines:
        if line["amount"] is not None:
            line["amount"] = format(line["amount"], ".4f")
    rate = fx(conn)
    value = conn.execute(
        "SELECT complete,incoming_php,outgoing_php,profit_php,net_usd FROM analytics.project_estimates WHERE project_id=%s",
        (project_id,),
    ).fetchone()
    for field in ("incoming_php", "outgoing_php", "profit_php", "net_usd"):
        if value[field] is not None:
            value[field] = format(value[field], ".4f")
    return project | {"lines": lines, "metrics": value, "fx": rate}


def create_project(conn, body):
    conn.execute(
        "INSERT INTO app.projects(id,request_id,original_name,name) VALUES(%s,%s,%s,%s) ON CONFLICT(request_id) DO NOTHING",
        (uuid4(), body.request_id, body.name, body.name),
    )
    row = conn.execute(
        "SELECT id,original_name FROM app.projects WHERE request_id=%s",
        (body.request_id,),
    ).fetchone()
    if row["original_name"] != body.name:
        raise HTTPException(
            409, "This create request was already used for a different project."
        )
    return get_project(conn, row["id"])


def save_project(conn, project_id, body):
    row = conn.execute(
        "SELECT version FROM app.projects WHERE id=%s FOR UPDATE", (project_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Project not found.")
    if row["version"] != body.version:
        raise HTTPException(
            409,
            "This project changed in another tab. Your entries are preserved; reload the saved project before trying again.",
        )
    conn.execute(
        "UPDATE app.projects SET name=%s,customer=%s,notes=%s,archived=%s,version=version+1 WHERE id=%s",
        (body.name, body.customer, body.notes, body.archived, project_id),
    )
    conn.execute("DELETE FROM app.cash_flows WHERE project_id=%s", (project_id,))
    with conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO app.cash_flows(project_id,position,label,direction,currency,amount,expected_date) VALUES(%s,%s,%s,%s,%s,%s,%s)",
            [
                (
                    project_id,
                    i,
                    line.label,
                    line.direction,
                    line.currency,
                    line.amount,
                    line.expected_date,
                )
                for i, line in enumerate(body.lines)
            ],
        )
    return get_project(conn, project_id)
