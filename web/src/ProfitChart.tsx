import { useEffect, useId, useRef, useState } from "react";
import { currency, request } from "./api";

type Point = { observation_date: string; rate: string; profit_php: string };
type Series = {
  project_version: number;
  complete: boolean;
  reference_rate: string | null;
  reference_date: string | null;
  points: Point[];
};

export function ProfitChart({
  projectId,
  version,
  scenarioProfit = null,
  referenceRate,
  referenceDate,
  onReferenceChange,
}: {
  projectId: string;
  version: number;
  scenarioProfit?: string | null;
  referenceRate?: string | null;
  referenceDate?: string | null;
  onReferenceChange?: () => void;
}) {
  const [stored, setStored] = useState<{ id: string; series: Series } | null>(
    null,
  );
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<number | null>(null);
  const refresh = useRef<() => void>(() => {}),
    referenceChange = useRef(onReferenceChange);
  referenceChange.current = onReferenceChange;
  const chartId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const data =
    stored?.id === projectId && stored.series.project_version === version
      ? stored.series
      : null;

  useEffect(() => {
    let active = true,
      pending = false;
    let controller: AbortController | undefined;
    setStored(null);
    setError("");
    setSelected(null);
    async function load() {
      if (pending) return;
      pending = true;
      setLoading(true);
      controller = new AbortController();
      try {
        const value = await request<Series>(
          `/projects/${projectId}/profit-history`,
          { signal: controller.signal },
        );
        if (!active) return;
        if (value.project_version !== version) {
          setStored(null);
          throw new Error(
            "Project changed. Refresh the project to chart its saved cash flows.",
          );
        }
        setStored({ id: projectId, series: value });
        setError("");
        if (
          referenceChange.current &&
          (value.reference_rate !== referenceRate ||
            value.reference_date !== referenceDate)
        )
          referenceChange.current();
      } catch (reason) {
        if (active) setError((reason as Error).message);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    refresh.current = () => void load();
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
    };
  }, [projectId, version, referenceRate, referenceDate]);

  const points = data?.points ?? [];
  const W = 720,
    H = 245,
    L = 100,
    R = 18,
    T = 18,
    B = 35;
  const profits = points.map((point) => Number(point.profit_php));
  const scenario = scenarioProfit === null ? null : Number(scenarioProfit);
  const values = scenario === null ? profits : [...profits, scenario];
  const lower = Math.min(0, ...values),
    upper = Math.max(0, ...values);
  const padding = Math.max((upper - lower) * 0.12, 1);
  const min = lower - padding,
    max = upper + padding;
  const y = (value: number) => T + ((max - value) / (max - min)) * (H - T - B);
  const first = points.length ? Date.parse(points[0].observation_date) : 0;
  const last = points.length
    ? Date.parse(points[points.length - 1].observation_date)
    : 0;
  const x = (point: Point) =>
    last === first
      ? (W + L - R) / 2
      : L +
        ((Date.parse(point.observation_date) - first) / (last - first)) *
          (W - L - R);
  const path = points
    .map(
      (point, i) =>
        `${i ? "L" : "M"}${x(point)},${y(Number(point.profit_php))}`,
    )
    .join(" ");
  const zero = y(0),
    latest = points[points.length - 1];
  const inspected =
    points[
      selected === null
        ? points.length - 1
        : Math.min(selected, points.length - 1)
    ];
  const compact = (value: number) =>
    new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const dateLabel = (value: string) =>
    new Date(value + "T00:00:00Z").toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  return (
    <section className="profit-history" aria-labelledby={`${chartId}-title`}>
      <div className="section-head">
        <div>
          <div className="eyebrow">FX OVER TIME</div>
          <h2 id={`${chartId}-title`}>Profit & loss across FX rates</h2>
        </div>
        <button
          className="text-button"
          disabled={loading}
          onClick={() => refresh.current()}
        >
          Refresh chart
        </button>
      </div>
      <p className="muted chart-description">
        Current saved cash flows valued at each published FX rate · last 90
        days.
      </p>
      {error && (
        <p role="status" className="notice">
          {data ? "Chart refresh failed. Last successful chart retained. " : ""}
          {error}
        </p>
      )}
      {loading && !data && (
        <p role="status" className="muted">
          Loading FX history…
        </p>
      )}
      {data && !data.complete && (
        <p className="notice">
          Complete the cash-flow amounts to chart estimated profit and loss.
        </p>
      )}
      {data?.complete && !points.length && (
        <p className="muted chart-empty">
          No published FX observations in the last 90 days. Historical rates
          will appear after a pipeline backfill.
        </p>
      )}
      {!!points.length && (
        <>
          <div className="chart-legend">
            <span>
              <i className="legend-profit" />
              Historical FX estimate
            </span>
            <span>
              <i className="legend-zero" />
              Break-even
            </span>
            {scenario !== null && (
              <span>
                <i className="legend-scenario" />
                Slider scenario
              </span>
            )}
            <small>PHP</small>
          </div>
          <div className="chart-scroll">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label="Estimated profit and loss over historical FX observations"
              onPointerLeave={() => setSelected(null)}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const position = ((event.clientX - rect.left) / rect.width) * W;
                let nearest = 0;
                points.forEach((point, i) => {
                  if (
                    Math.abs(x(point) - position) <
                    Math.abs(x(points[nearest]) - position)
                  )
                    nearest = i;
                });
                setSelected(nearest);
              }}
            >
              <title>
                Current cash-flow estimate at historical exchange rates
              </title>
              <desc>
                Green above zero is estimated profit; red below zero is
                estimated loss. The dashed amber line is hypothetical.
                Observation values are available in View observations, with
                profits displayed to cents.
              </desc>
              <defs>
                <clipPath id={`${chartId}-positive`}>
                  <rect
                    x={L}
                    y={T}
                    width={W - L - R}
                    height={Math.max(0, zero - T)}
                  />
                </clipPath>
                <clipPath id={`${chartId}-negative`}>
                  <rect
                    x={L}
                    y={zero}
                    width={W - L - R}
                    height={Math.max(0, H - B - zero)}
                  />
                </clipPath>
              </defs>
              <rect
                x={L}
                y={zero}
                width={W - L - R}
                height={Math.max(0, H - B - zero)}
                fill="#fcf2ee"
              />
              {[min, max].map((value) => (
                <g key={value}>
                  <line
                    className="chart-grid"
                    x1={L}
                    x2={W - R}
                    y1={y(value)}
                    y2={y(value)}
                  />
                  <text
                    className="chart-label"
                    x={L - 10}
                    y={y(value) + 4}
                    textAnchor="end"
                  >
                    {compact(value)}
                  </text>
                </g>
              ))}
              <line
                data-testid="profit-zero-line"
                className="chart-zero"
                x1={L}
                x2={W - R}
                y1={zero}
                y2={zero}
              />
              <text
                className="chart-label"
                x={L - 10}
                y={zero + 4}
                textAnchor="end"
              >
                0
              </text>
              {scenario !== null && (
                <line
                  data-testid="scenario-chart-line"
                  className="chart-scenario"
                  x1={L}
                  x2={W - R}
                  y1={y(scenario)}
                  y2={y(scenario)}
                />
              )}
              <path
                d={path}
                fill="none"
                stroke="#38724e"
                strokeWidth="2.5"
                clipPath={`url(#${chartId}-positive)`}
              />
              <path
                d={path}
                fill="none"
                stroke="#b84d3b"
                strokeWidth="2.5"
                clipPath={`url(#${chartId}-negative)`}
              />
              <circle
                cx={x(latest)}
                cy={y(Number(latest.profit_php))}
                r="4.5"
                fill="#f5d64b"
                stroke="#736528"
                strokeWidth="1.5"
              />
              {inspected && selected !== null && (
                <circle
                  cx={x(inspected)}
                  cy={y(Number(inspected.profit_php))}
                  r="4"
                  fill="white"
                  stroke="#334e3a"
                  strokeWidth="2"
                />
              )}
              <text className="chart-label" x={L} y={H - 8}>
                {dateLabel(points[0].observation_date)}
              </text>
              {points.length > 1 && (
                <text
                  className="chart-label"
                  x={W - R}
                  y={H - 8}
                  textAnchor="end"
                >
                  {dateLabel(latest.observation_date)}
                </text>
              )}
            </svg>
          </div>
          {inspected && (
            <div className="chart-detail" aria-live="polite">
              <span>
                {inspected.observation_date} · 1 USD ={" "}
                {inspected.rate.replace(/\.?0+$/, "")} PHP
              </span>
              <strong
                data-testid="chart-point-profit"
                className={
                  inspected.profit_php.startsWith("-") ? "negative" : ""
                }
              >
                {currency(inspected.profit_php)}
              </strong>
            </div>
          )}
          {points.length === 1 && (
            <p className="fine-print">
              One observation is available. More published rates will form a
              line.
            </p>
          )}
          <details className="chart-data">
            <summary>View observations</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Observation date</th>
                    <th>PHP per USD</th>
                    <th className="align-right">Estimated profit / loss</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((point) => (
                    <tr key={point.observation_date}>
                      <td>{point.observation_date}</td>
                      <td>{point.rate}</td>
                      <td className="align-right">
                        {currency(point.profit_php)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="fine-print">
        This shows the effect of FX on today's budget, not recorded past profit.
        Updates every minute while this page is visible; source rates update
        daily.
      </p>
    </section>
  );
}
