export type Line = {
  label: string;
  direction: "incoming" | "outgoing";
  currency: "PHP" | "USD";
  amount: string | null;
  expected_date: string | null;
};
export type Metrics = {
  incoming_php: string | null;
  outgoing_php: string | null;
  profit_php: string | null;
  net_usd: string | null;
  complete: boolean;
};
export type FX = {
  rate: string | null;
  observation_date: string | null;
  source: string;
  last_run: null | {
    id: string;
    status: string;
    error: string | null;
    started_at: string;
  };
};
export type Project = {
  id: string;
  name: string;
  customer: string;
  notes: string;
  archived: boolean;
  version: number;
  lines: Line[];
  metrics: Metrics;
  fx: FX;
};
export type ProjectRow = Pick<
  Project,
  "id" | "name" | "customer" | "archived" | "version"
>;
export type ScenarioResult = {
  metrics: Metrics;
  difference_php: string | null;
  project_version: number;
};

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const value = await response.json();
  if (!response.ok) {
    const detail = value.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .map(
                (item: { loc: string[]; msg: string }) =>
                  `${item.loc.slice(1).join(".")}: ${item.msg}`,
              )
              .join(" · ")
          : "Request failed. Please try again.",
    );
  }
  return value as T;
}

// Display rounding uses the server's decimal strings, never binary floats.
export function currency(value: string | null, unit = "PHP"): string {
  if (value === null) return "—";
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^[-+]/, "").split(".");
  let cents =
    BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2));
  if ((fraction[2] ?? "0") >= "5") cents += 1n;
  const amount = (cents / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${unit} ${negative && cents !== 0n ? "-" : ""}${amount}.${(cents % 100n).toString().padStart(2, "0")}`;
}
