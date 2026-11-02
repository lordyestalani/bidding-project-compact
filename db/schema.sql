CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS ops;
CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS app.projects (
    id uuid PRIMARY KEY,
    request_id uuid NOT NULL UNIQUE,
    original_name text NOT NULL,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    customer text NOT NULL DEFAULT '',
    notes text NOT NULL DEFAULT '',
    archived boolean NOT NULL DEFAULT false,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app.cash_flows (
    project_id uuid NOT NULL REFERENCES app.projects(id),
    position integer NOT NULL,
    label text NOT NULL,
    direction text NOT NULL CHECK (direction IN ('incoming','outgoing')),
    currency text NOT NULL CHECK (currency IN ('PHP','USD')),
    amount numeric(16,4) CHECK (amount >= 0),
    expected_date date,
    PRIMARY KEY (project_id, position)
);
CREATE TABLE IF NOT EXISTS ops.runs (
    id uuid PRIMARY KEY,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status text NOT NULL CHECK (status IN ('running','success','failed')),
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    error text,
    published_count integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS raw.responses (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES ops.runs(id),
    url text NOT NULL,
    fetched_at timestamptz NOT NULL,
    status_code integer NOT NULL,
    checksum text NOT NULL,
    body bytea NOT NULL
);
CREATE TABLE IF NOT EXISTS raw.observations (
    run_id uuid NOT NULL REFERENCES ops.runs(id),
    response_id uuid NOT NULL REFERENCES raw.responses(id),
    observation_date date NOT NULL,
    base text NOT NULL,
    quote text NOT NULL,
    rate numeric(20,8) NOT NULL,
    fetched_at timestamptz NOT NULL,
    PRIMARY KEY (run_id, observation_date)
);
CREATE TABLE IF NOT EXISTS analytics.fx_rates (
    observation_date date PRIMARY KEY,
    rate numeric(20,8) NOT NULL CHECK (rate > 0),
    run_id uuid NOT NULL REFERENCES ops.runs(id),
    response_id uuid NOT NULL REFERENCES raw.responses(id),
    fetched_at timestamptz NOT NULL,
    source text NOT NULL DEFAULT 'ECB via Frankfurter'
);
