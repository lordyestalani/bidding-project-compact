import { useCallback, useEffect, useRef, useState } from "react";
import {
  currency,
  request,
  type FX,
  type Project,
  type ProjectRow,
} from "./api";
import { ProjectEditor } from "./ProjectEditor";
import { Simulation } from "./Simulation";

export function App() {
  const [rows, setRows] = useState<ProjectRow[]>([]),
    [project, setProject] = useState<Project | null>(null),
    [fx, setFx] = useState<FX | null>(null);
  const [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [name, setName] = useState(""),
    [creating, setCreating] = useState(false),
    [editing, setEditing] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [listVersion, setListVersion] = useState(0);
  const dirty = useRef(false),
    ticket = useRef(0),
    createKey = useRef(crypto.randomUUID());
  const onDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);
  const canLeave = () =>
    !dirty.current || window.confirm("Discard unsaved project changes?");
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<ProjectRow[]>(`/projects?archived=${archived}`)
      .then((value) => {
        if (active) setRows(value);
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [archived, listVersion]);
  useEffect(() => {
    request<FX>("/fx")
      .then(setFx)
      .catch((reason) => setError(reason.message));
  }, []);
  async function open(id: string) {
    if (busy || !canLeave()) return;
    const current = ++ticket.current;
    setError("");
    setBusy(true);
    try {
      const value = await request<Project>(`/projects/${id}`);
      if (current === ticket.current) {
        setProject(value);
        setFx(value.fx);
        setEditing(false);
        dirty.current = false;
      }
    } catch (reason) {
      if (current === ticket.current) setError((reason as Error).message);
    } finally {
      if (current === ticket.current) setBusy(false);
    }
  }
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !canLeave()) return;
    setBusy(true);
    setError("");
    try {
      const value = await request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name, request_id: createKey.current }),
      });
      setProject(value);
      setFx(value.fx);
      setName("");
      setCreating(false);
      createKey.current = crypto.randomUUID();
      dirty.current = false;
      setEditing(true);
      setListVersion((value) => value + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saved(value: Project) {
    setProject(value);
    setFx(value.fx);
    setEditing(false);
    dirty.current = false;
    setListVersion((current) => current + 1);
  }
  async function archive() {
    if (!project || busy) return;
    setBusy(true);
    setError("");
    try {
      const { id, metrics, fx, ...body } = project;
      const value = await request<Project>(`/projects/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...body, archived: !project.archived }),
      });
      saved(value);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const filtered = rows.filter((row) =>
    `${row.name} ${row.customer}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Bidding and FX home">
          <span className="brand-icon">↗</span>
          <span>
            Bidding <span className="brand-light">&</span> FX
          </span>
        </a>
        <span className="workspace-tag">
          <span className="dot" /> Local workspace
        </span>
      </header>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="eyebrow">YOUR WORKSPACE</div>
          <div className="section-head">
            <h2>
              Projects <span className="count">{rows.length}</span>
            </h2>
            <button
              aria-label="Add project"
              className="add-icon"
              onClick={() => setCreating(!creating)}
            >
              +
            </button>
          </div>
          {creating && (
            <form className="create-form" onSubmit={create}>
              <label htmlFor="new-name">New project name</label>
              <input
                id="new-name"
                autoFocus
                required
                maxLength={200}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  createKey.current = crypto.randomUUID();
                }}
              />
              <button disabled={busy}>Create project</button>
            </form>
          )}
          <input
            className="search"
            aria-label="Search projects"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="archive-filter">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{" "}
            Show archived projects
          </label>
          {loading ? (
            <p className="muted" role="status">
              Loading projects…
            </p>
          ) : (
            <div className="project-list">
              {filtered.map((row) => (
                <button
                  className={`project-row ${project?.id === row.id ? "selected" : ""}`}
                  key={row.id}
                  disabled={busy}
                  onClick={() => void open(row.id)}
                >
                  <span className="project-symbol">
                    {row.name[0].toUpperCase()}
                  </span>
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.customer || "No customer added"}</small>
                  </span>
                  <span className="row-arrow">›</span>
                </button>
              ))}
              {!filtered.length && (
                <p className="muted sidebar-empty">
                  {search
                    ? "No matching projects."
                    : "Your projects will appear here."}
                </p>
              )}
            </div>
          )}
          <div className="sidebar-note">
            <span className="eyebrow">A CLEARER PICTURE</span>
            <p>
              Plan your cash flows.
              <br />
              Understand your FX exposure.
            </p>
          </div>
        </aside>
        <main id="main" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div className="eyebrow">PROJECT CASH FLOWS</div>
            <h1>Every bid. A clearer view.</h1>
            <p className="muted">
              Know what comes in, what goes out, and what the exchange rate
              changes.
            </p>
          </div>
          <div className="source-strip">
            <span className="source-icon">↔</span>
            <div>
              <strong>
                {fx?.rate
                  ? `1 USD = ${Number(fx.rate).toFixed(4)} PHP`
                  : "Reference rate not available yet"}
              </strong>
              <span>
                {fx?.observation_date
                  ? `Observed ${fx.observation_date} · ${fx.source}`
                  : "You can still add projects and try hypothetical rates."}
                {fx?.last_run?.status === "failed"
                  ? " · Latest update failed; last successful rate retained."
                  : ""}
              </span>
            </div>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setError("");
                if (project) void open(project.id);
                else
                  void request<FX>("/fx")
                    .then(setFx)
                    .catch((reason) => setError(reason.message));
              }}
            >
              Refresh
            </button>
          </div>
          {error && (
            <div className="error error-box" role="alert">
              {error}
            </div>
          )}
          {busy && (
            <p role="status" className="muted">
              Loading…
            </p>
          )}
          {!project ? (
            <section className="panel empty-state">
              <span className="empty-icon">↗</span>
              <h2>Start with a project</h2>
              <p>
                Add a project and its incoming and outgoing amounts.
                <br />
                Then explore what happens when the dollar moves.
              </p>
              <button onClick={() => setCreating(true)}>
                + Add your first project
              </button>
              <span className="fine-print">
                PHP & USD · Planned cash flows · Simple FX simulation
              </span>
            </section>
          ) : (
            <>
              <div className="project-heading">
                <div>
                  <div className="eyebrow">
                    {project.archived ? "ARCHIVED PROJECT" : "SELECTED PROJECT"}
                  </div>
                  <h2>{project.name}</h2>
                  {project.customer && (
                    <p className="muted">{project.customer}</p>
                  )}
                </div>
                <div className="heading-actions">
                  {!editing && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => setEditing(true)}
                    >
                      Edit project
                    </button>
                  )}
                  {!editing && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void archive()}
                    >
                      {project.archived ? "Restore project" : "Archive project"}
                    </button>
                  )}
                </div>
              </div>
              {editing ? (
                <ProjectEditor
                  key={project.id + ":" + project.version}
                  project={project}
                  onSaved={saved}
                  onCancel={() => setEditing(false)}
                  onDirty={onDirty}
                  onSaving={setBusy}
                />
              ) : (
                <>
                  <div className="metrics-grid">
                    {(
                      [
                        ["Incoming", project.metrics.incoming_php, "↙"],
                        ["Outgoing", project.metrics.outgoing_php, "↗"],
                        ["Estimated profit", project.metrics.profit_php, "="],
                      ] as const
                    ).map(([label, value, icon], i) => (
                      <div
                        className={`metric-card ${i === 2 ? "profit-card" : ""}`}
                        key={label}
                      >
                        <span className="metric-label">
                          {label}
                          <span>{icon}</span>
                        </span>
                        <strong
                          className={value?.startsWith("-") ? "negative" : ""}
                        >
                          {currency(value)}
                        </strong>
                        <small>
                          {i === 2
                            ? "Incoming minus outgoing"
                            : "At the reference exchange rate"}
                        </small>
                      </div>
                    ))}
                  </div>
                  {!project.metrics.complete && (
                    <p className="notice">
                      {project.lines.length
                        ? "Some amounts are unknown. Complete your cash flows to see the full estimate."
                        : "Add incoming and outgoing cash flows to estimate this project."}
                    </p>
                  )}
                  {project.metrics.complete &&
                    project.metrics.profit_php === null && (
                      <p className="notice">
                        This project needs a reference FX rate. You can use the
                        simulation below while it is unavailable.
                      </p>
                    )}
                  <Simulation
                    key={
                      project.id + ":" + project.version + ":" + project.fx.rate
                    }
                    projectId={project.id}
                    version={project.version}
                    referenceRate={project.fx.rate}
                    referenceDate={project.fx.observation_date}
                    onReferenceChange={() => void open(project.id)}
                  />
                  <section className="panel flows">
                    <div className="section-head">
                      <h2>Cash flows</h2>
                      <span className="pill">
                        {project.lines.length}{" "}
                        {project.lines.length === 1 ? "entry" : "entries"}
                      </span>
                    </div>
                    {project.notes && <p className="muted">{project.notes}</p>}
                    {project.lines.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Description</th>
                              <th>Direction</th>
                              <th>Expected date</th>
                              <th className="align-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {project.lines.map((line, i) => (
                              <tr key={i}>
                                <td>{line.label}</td>
                                <td>
                                  <span
                                    className={`direction ${line.direction}`}
                                  >
                                    {line.direction === "incoming"
                                      ? "↙ Incoming"
                                      : "↗ Outgoing"}
                                  </span>
                                </td>
                                <td className="muted">
                                  {line.expected_date ?? "—"}
                                </td>
                                <td className="align-right amount">
                                  {line.amount === null
                                    ? "Unknown"
                                    : currency(line.amount, line.currency)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="muted">
                        No cash flows yet. Edit this project to add them.
                      </p>
                    )}
                    <p className="fine-print">
                      Planned amounts, not recorded payments. All estimates are
                      reported in PHP.
                    </p>
                  </section>
                </>
              )}
            </>
          )}
          <footer>
            Built around one question: how does FX affect this project?
            <span>
              Reference rates are estimates, not bank execution rates.
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}
