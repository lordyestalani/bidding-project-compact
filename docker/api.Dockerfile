FROM python:3.12.15-slim-bookworm
WORKDIR /app
COPY api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && useradd --create-home app
COPY api /app/api
USER app
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
