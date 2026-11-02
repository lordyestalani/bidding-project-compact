import { useEffect, useState } from "react";
import { request, type Line, type Project } from "./api";

export function ProjectEditor({
  project,
  onSaved,
  onCancel,
  onDirty,
  onSaving,
}: {
  project: Project;
  onSaved: (p: Project) => void;
  onCancel: () => void;
  onDirty: (value: boolean) => void;
  onSaving: (value: boolean) => void;
}) {
  const [name, setName] = useState(project.name),
    [customer, setCustomer] = useState(project.customer),
    [notes, setNotes] = useState(project.notes);
  const [lines, setLines] = useState<Line[]>(
      project.lines.map((line) => ({ ...line })),
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const dirty =
    JSON.stringify({ name, customer, notes, lines }) !==
    JSON.stringify({
      name: project.name,
      customer: project.customer,
      notes: project.notes,
      lines: project.lines,
    });
  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(index: number, patch: Partial<Line>) {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onSaving(true);
    setError("");
    try {
      onSaved(
        await request<Project>(`/projects/${project.id}`, {
          method: "PUT",
          body: JSON.stringify({
            name,
            customer,
            notes,
            lines,
            version: project.version,
            archived: project.archived,
          }),
        }),
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
      onSaving(false);
    }
  }
  return (
    <form className="panel editor" onSubmit={save}>
      <div className="section-head">
        <h2>Edit project & cash flows</h2>
        <span className="pill">Unsaved draft</span>
      </div>
      <div className="field-grid">
        <label>
          Project name
          <input
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </label>
        <label>
          Customer <span className="optional">optional</span>
          <input
            maxLength={200}
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            disabled={saving}
          />
        </label>
      </div>
      <label>
        Notes <span className="optional">optional</span>
        <textarea
          maxLength={2000}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={saving}
        />
      </label>
      <p className="muted">
        Enter planned amounts. Leave an unknown amount blank.
      </p>
      {lines.map((line, i) => (
        <fieldset className="flow-editor" key={i} disabled={saving}>
          <legend>Cash flow {i + 1}</legend>
          <div className="flow-grid">
            <label>
              Description
              <input
                aria-label={`Description ${i + 1}`}
                required
                maxLength={200}
                value={line.label}
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </label>
            <label>
              Direction
              <select
                aria-label={`Direction ${i + 1}`}
                value={line.direction}
                onChange={(e) =>
                  update(i, { direction: e.target.value as Line["direction"] })
                }
              >
                <option value="incoming">Incoming</option>
                <option value="outgoing">Outgoing</option>
              </select>
            </label>
            <label>
              Currency
              <select
                aria-label={`Currency ${i + 1}`}
                value={line.currency}
                onChange={(e) =>
                  update(i, { currency: e.target.value as Line["currency"] })
                }
              >
                <option>PHP</option>
                <option>USD</option>
              </select>
            </label>
            <label>
              Amount
              <input
                aria-label={`Amount ${i + 1}`}
                inputMode="decimal"
                placeholder="Unknown"
                value={line.amount ?? ""}
                onChange={(e) => update(i, { amount: e.target.value || null })}
              />
            </label>
            <label>
              Expected date <span className="optional">optional</span>
              <input
                aria-label={`Expected date ${i + 1}`}
                type="date"
                value={line.expected_date ?? ""}
                onChange={(e) =>
                  update(i, { expected_date: e.target.value || null })
                }
              />
            </label>
            <button
              type="button"
              className="text-button remove"
              aria-label={`Remove cash flow ${i + 1}`}
              onClick={() => setLines(lines.filter((_, j) => i !== j))}
            >
              Remove
            </button>
          </div>
        </fieldset>
      ))}
      <button
        className="secondary"
        type="button"
        disabled={saving || lines.length >= 200}
        onClick={() =>
          setLines([
            ...lines,
            {
              label: "",
              direction: lines.length === 0 ? "incoming" : "outgoing",
              currency: "PHP",
              amount: null,
              expected_date: null,
            },
          ])
        }
      >
        + Add cash flow
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save project"}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={saving}
          onClick={() => {
            if (!dirty || window.confirm("Discard unsaved changes?"))
              onCancel();
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
