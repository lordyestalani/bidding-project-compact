import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ProfitChart } from "./ProfitChart";

const history = {
  project_version: 1,
  basis: "current_cash_flows",
  complete: true,
  reference_rate: "58.00000000",
  reference_date: "2026-11-02",
  points: [
    {
      observation_date: "2026-10-29",
      rate: "45.00000000",
      profit_php: "-500000.0000",
    },
    {
      observation_date: "2026-10-30",
      rate: "55.00000000",
      profit_php: "500000.0000",
    },
    {
      observation_date: "2026-11-02",
      rate: "58.00000000",
      profit_php: "800000.0000",
    },
  ],
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function mock(value = history) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => value })),
  );
}

test("shows dated profit/loss with zero baseline and exact accessible observations", async () => {
  mock();
  render(
    <ProfitChart
      projectId="one"
      version={1}
      referenceRate="58.00000000"
      referenceDate="2026-11-02"
      scenarioProfit="1000000.0000"
    />,
  );
  expect(
    await screen.findByRole("img", { name: /profit and loss/i }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("profit-zero-line")).toBeInTheDocument();
  expect(screen.getByTestId("scenario-chart-line")).toBeInTheDocument();
  expect(screen.getByText(/current saved cash flows/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText("View observations"));
  expect(
    screen.getByRole("cell", { name: "PHP -500,000.00" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("cell", { name: "PHP 800,000.00" }),
  ).toBeInTheDocument();
});

test("handles one point, empty data, and incomplete inputs explicitly", async () => {
  mock({ ...history, points: [history.points[0]] });
  const view = render(<ProfitChart projectId="one" version={1} />);
  expect(await screen.findByText(/one observation/i)).toBeInTheDocument();
  mock({ ...history, points: [] });
  view.rerender(<ProfitChart projectId="two" version={1} />);
  expect(
    await screen.findByText(/no published fx observations/i),
  ).toBeInTheDocument();
  mock({ ...history, complete: false, points: [] });
  view.rerender(<ProfitChart projectId="three" version={1} />);
  expect(
    await screen.findByText(/complete the cash-flow amounts/i),
  ).toBeInTheDocument();
});

test("keeps the last chart with a stale label when a live refresh fails", async () => {
  mock();
  render(<ProfitChart projectId="one" version={1} />);
  await screen.findByRole("img", { name: /profit and loss/i });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Offline");
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Refresh chart" }));
  expect(await screen.findByText(/refresh failed/i)).toBeInTheDocument();
  expect(
    screen.getByRole("img", { name: /profit and loss/i }),
  ).toBeInTheDocument();
});

test("stale budget version is not charted as the selected saved project", async () => {
  mock({ ...history, project_version: 2 });
  render(<ProfitChart projectId="one" version={1} />);
  expect(await screen.findByText(/project changed/i)).toBeInTheDocument();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});

test("live polling updates the displayed point and pauses in a hidden page", async () => {
  vi.useFakeTimers();
  let profit = "800000.0000";
  const visibility = vi
    .spyOn(document, "visibilityState", "get")
    .mockReturnValue("visible");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ...history,
        points: [{ ...history.points[2], profit_php: profit }],
      }),
    })),
  );
  render(<ProfitChart projectId="one" version={1} />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByTestId("chart-point-profit")).toHaveTextContent(
    "800,000.00",
  );
  profit = "900000.0000";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByTestId("chart-point-profit")).toHaveTextContent(
    "900,000.00",
  );
  visibility.mockReturnValue("hidden");
  profit = "1000000.0000";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(screen.getByTestId("chart-point-profit")).toHaveTextContent(
    "900,000.00",
  );
});
