import { useEffect, useState } from "react";
import { currency, request, type ScenarioResult } from "./api";
import { ProfitChart } from "./ProfitChart";

export function Simulation({
  projectId,
  version,
  referenceRate,
  referenceDate,
  onReferenceChange,
}: {
  projectId: string;
  version: number;
  referenceRate: string | null;
  referenceDate?: string | null;
  onReferenceChange?: () => void;
}) {
  const initial = referenceRate ?? "55";
  const [rate, setRate] = useState(initial);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const valid = /^[0-9]{1,12}(\.[0-9]{1,8})?$/.test(rate) && Number(rate) > 0;
  const anchor = Number(referenceRate ?? 55);
  const min = Math.max(
    0.00000001,
    Math.min(anchor * 0.7, Number(rate) || anchor),
  );
  const max = Math.max(anchor * 1.3, Number(rate) || anchor);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    setLoading(valid);
    if (!valid) return () => controller.abort();
    const timer = setTimeout(() => {
      request<ScenarioResult>(`/projects/${projectId}/scenario`, {
        method: "POST",
        body: JSON.stringify({ rate_php_per_usd: rate }),
        signal: controller.signal,
      })
        .then((value) => {
          if (!controller.signal.aborted) {
            if (value.project_version !== version)
              throw new Error(
                "Project changed. Reload it to simulate the saved cash flows.",
              );
            setResult(value);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(reason.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rate, projectId, version, valid]);

  return (
    <>
      <ProfitChart
        projectId={projectId}
        version={version}
        referenceRate={referenceRate}
        referenceDate={referenceDate}
        onReferenceChange={onReferenceChange}
        scenarioProfit={valid && result ? result.metrics.profit_php : null}
      />
      <section className="simulation" aria-labelledby="simulation-title">
        <div className="section-head">
          <div>
            <div className="eyebrow">WHAT IF?</div>
            <h2 id="simulation-title">Try a different exchange rate</h2>
          </div>
          <span className="pill">Simulation only</span>
        </div>
        <p className="muted">
          Move the slider to see how a stronger or weaker dollar changes this
          project.
        </p>
        <div className="rate-control">
          <div>
            <label htmlFor="scenario-rate">Scenario rate</label>
            <div className="rate-input">
              <input
                id="scenario-rate"
                inputMode="decimal"
                value={rate}
                aria-invalid={!valid}
                onChange={(e) => {
                  setRate(e.target.value);
                  setResult(null);
                }}
              />
              <span>PHP / USD</span>
            </div>
          </div>
          <button
            className="secondary"
            onClick={() => {
              if (rate !== initial) {
                setRate(initial);
                setResult(null);
              }
            }}
          >
            Reset
          </button>
        </div>
        <input
          className="slider"
          type="range"
          aria-label="Exchange rate slider"
          min={min}
          max={max}
          step="any"
          value={valid ? Number(rate) : anchor}
          onChange={(e) => {
            setRate(Number(e.target.value).toFixed(4));
            setResult(null);
          }}
        />
        <div className="slider-labels">
          <span>Weaker dollar · {min.toFixed(2)}</span>
          <span>Stronger dollar · {max.toFixed(2)}</span>
        </div>
        {!referenceRate && (
          <p className="notice">
            No reference rate is available yet. This is a hypothetical rate you
            can change.
          </p>
        )}
        {!valid && (
          <p className="error" role="alert">
            Enter a positive rate with up to 8 decimal places.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {valid && loading && (
          <p className="muted" role="status">
            Calculating scenario…
          </p>
        )}
        {valid && result && (
          <div className="scenario-results" aria-live="polite">
            <div>
              <span>Incoming at this rate</span>
              <strong>{currency(result.metrics.incoming_php)}</strong>
            </div>
            <div>
              <span>Outgoing at this rate</span>
              <strong>{currency(result.metrics.outgoing_php)}</strong>
            </div>
            <div>
              <span>Estimated profit</span>
              <strong
                data-testid="scenario-profit"
                className={
                  result.metrics.profit_php?.startsWith("-") ? "negative" : ""
                }
              >
                {currency(result.metrics.profit_php)}
              </strong>
            </div>
            <p className="scenario-difference">
              {result.difference_php === null
                ? "Reference comparison unavailable"
                : `${currency(result.difference_php)} change from the reference rate`}
              {!result.metrics.complete
                ? " · Add the missing amounts to complete this estimate."
                : ""}
            </p>
          </div>
        )}
        <p className="fine-print">
          Saved cash flows stay the same. Only the hypothetical exchange rate
          changes.
        </p>
      </section>
    </>
  );
}
