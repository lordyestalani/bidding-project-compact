FROM python:3.12.15-slim-bookworm
WORKDIR /app
COPY api/requirements.txt /app/api/requirements.txt
COPY requirements-dev.txt /app/requirements-dev.txt
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY api /app/api
COPY pipeline /app/pipeline
COPY db /app/db
COPY dbt /app/dbt
COPY tests /app/tests
COPY pyproject.toml /app/pyproject.toml
ENV DBT_SEND_ANONYMOUS_USAGE_STATS=false
CMD ["python", "-m", "pytest", "-q", "--tb=short"]
