import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Simulation } from "./Simulation";

afterEach(() => vi.unstubAllGlobals());
function mount(rate: string | null = "55.00000000") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const value = JSON.parse(options.body).rate_php_per_usd;
      return {
        ok: true,
        json: async () => ({
          metrics: {
            incoming_php: value === "58" ? "5800000.0000" : "5500000.0000",
            outgoing_php: "5000000.0000",
            profit_php: value === "58" ? "800000.0000" : "500000.0000",
            net_usd: "100000.0000",
            complete: true,
          },
          difference_php: value === "58" ? "300000.0000" : "0.0000",
          project_version: 1,
        }),
      };
    }),
  );
  return render(
    <Simulation projectId="project-one" version={1} referenceRate={rate} />,
  );
}

test("numeric rate drives simulation and reset restores the reference rate", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("Scenario rate"), {
    target: { value: "58" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("scenario-profit")).toHaveTextContent(
      "800,000.00",
    ),
  );
  expect(screen.getByLabelText("Exchange rate slider")).toHaveValue("58");
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByLabelText("Scenario rate")).toHaveValue("55.00000000");
});

test("wide typed rates expand slider bounds rather than clamping", () => {
  mount();
  fireEvent.change(screen.getByLabelText("Scenario rate"), {
    target: { value: "150" },
  });
  expect(screen.getByLabelText("Scenario rate")).toHaveValue("150");
  expect(
    Number(screen.getByLabelText("Exchange rate slider").getAttribute("max")),
  ).toBeGreaterThanOrEqual(150);
});

test("invalid rate suppresses an older result and shows a useful error", async () => {
  mount();
  await waitFor(() =>
    expect(screen.getByTestId("scenario-profit")).toHaveTextContent(
      "500,000.00",
    ),
  );
  fireEvent.change(screen.getByLabelText("Scenario rate"), {
    target: { value: "0" },
  });
  expect(screen.getByText(/positive rate/i)).toBeInTheDocument();
  expect(screen.queryByTestId("scenario-profit")).not.toBeInTheDocument();
});

test("missing source rate keeps the scenario explicitly hypothetical", () => {
  mount(null);
  expect(screen.getByText(/no reference rate/i)).toBeInTheDocument();
});

test("reset at the reference rate keeps the result visible", async () => {
  mount();
  await waitFor(() =>
    expect(screen.getByTestId("scenario-profit")).toHaveTextContent(
      "500,000.00",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByTestId("scenario-profit")).toHaveTextContent("500,000.00");
});

test("an older project response cannot replace the current scenario", async () => {
  let resolveOld: (value: unknown) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      String(url).includes("old")
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve({
            ok: true,
            json: async () => ({
              metrics: {
                incoming_php: "200",
                outgoing_php: "100",
                profit_php: "100",
                net_usd: "0",
                complete: true,
              },
              difference_php: "0",
              project_version: 1,
            }),
          }),
    ),
  );
  const view = render(
    <Simulation projectId="old" version={1} referenceRate="55" />,
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  view.rerender(<Simulation projectId="new" version={1} referenceRate="55" />);
  await waitFor(() =>
    expect(screen.getByTestId("scenario-profit")).toHaveTextContent("100.00"),
  );
  resolveOld({
    ok: true,
    json: async () => ({
      metrics: { profit_php: "999999", complete: true },
      project_version: 1,
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(screen.getByTestId("scenario-profit")).toHaveTextContent("100.00");
});
