import os
from decimal import Decimal, localcontext
from uuid import UUID

import psycopg
from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse
from psycopg.rows import dict_row

from api import store
from api.models import ProjectCreate, ProjectSave, Scenario
from api.valuation import metrics, money
from api.history import profit_history


def create_app(database_url: str | None = None) -> FastAPI:
    app = FastAPI(title="Bidding & FX", version="1.0.0")
    url = database_url or os.environ.get("DATABASE_URL", "")

    def connection():
        conn = psycopg.connect(url, row_factory=dict_row, connect_timeout=5)
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
        return conn

    @app.middleware("http")
    async def no_cache(request: Request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(psycopg.Error)
    async def database_error(request: Request, error):
        if isinstance(error, psycopg.errors.SerializationFailure):
            return JSONResponse(
                status_code=409,
                content={
                    "detail": "Project changed during this request. Reload before saving again."
                },
            )
        return JSONResponse(
            status_code=503,
            content={"detail": "Database is unavailable. Try again shortly."},
        )

    @app.get("/api/health")
    def health():
        with connection() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"status": "ready"}

    @app.get("/api/fx")
    def fx():
        with connection() as conn:
            return store.fx(conn)

    @app.get("/api/projects")
    def projects(archived: bool = False):
        with connection() as conn:
            return conn.execute(
                "SELECT id,name,customer,notes,archived,version FROM app.projects WHERE archived=%s ORDER BY created_at DESC,id",
                (archived,),
            ).fetchall()

    @app.post("/api/projects", status_code=201)
    def create(body: ProjectCreate):
        with connection() as conn:
            return store.create_project(conn, body)

    @app.get("/api/projects/{project_id}")
    def get(project_id: UUID):
        with connection() as conn:
            return store.get_project(conn, project_id)

    @app.put("/api/projects/{project_id}")
    def save(project_id: UUID, body: ProjectSave):
        with connection() as conn:
            return store.save_project(conn, project_id, body)

    @app.get("/api/projects/{project_id}/profit-history")
    def history(project_id: UUID, days: int = Query(default=90, ge=1, le=365)):
        with connection() as conn:
            return profit_history(conn, project_id, days)

    @app.post("/api/projects/{project_id}/scenario")
    def scenario(project_id: UUID, body: Scenario):
        with connection() as conn, localcontext() as context:
            context.prec = 50
            project = store.get_project(conn, project_id)
            values = store.totals(conn, project_id)
            result = metrics(**values, rate=Decimal(body.rate_php_per_usd))
            reference_rate = project["fx"]["rate"]
            difference = None
            if result["profit_php"] is not None and reference_rate is not None:
                difference = money(
                    (values["in_usd"] - values["out_usd"])
                    * (Decimal(body.rate_php_per_usd) - Decimal(reference_rate))
                )
            elif (
                result["profit_php"] is not None
                and values["in_usd"] == values["out_usd"] == 0
            ):
                difference = "0.0000"
            return {
                "metrics": result,
                "rate_php_per_usd": body.rate_php_per_usd,
                "hypothetical": True,
                "project_version": project["version"],
                "difference_php": difference,
            }

    return app


app = create_app()
