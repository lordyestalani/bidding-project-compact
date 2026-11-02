import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllGlobals());

test("failed saves keep entered cash flows available for correction", async () => {
  const project = {
    id: "one",
    name: "Example bid",
    customer: "",
    notes: "",
    archived: false,
    version: 1,
    lines: [],
    metrics: {
      complete: false,
      incoming_php: null,
      outgoing_php: null,
      profit_php: null,
      net_usd: null,
    },
    fx: { rate: null, observation_date: null, source: "ECB", last_run: null },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options?.method === "PUT")
        return {
          ok: false,
          json: async () => ({ detail: "Save failed. Try again." }),
        };
      if (String(url).includes("/projects/one"))
        return { ok: true, json: async () => project };
      return {
        ok: true,
        json: async () =>
          String(url).includes("/projects") ? [project] : project.fx,
      };
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Example bid/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit project" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Add cash flow" }));
  fireEvent.change(screen.getByLabelText("Description 1"), {
    target: { value: "Customer advance" },
  });
  fireEvent.change(screen.getByLabelText("Amount 1"), {
    target: { value: "12345.67" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Save failed. Try again.",
  );
  expect(screen.getByLabelText("Amount 1")).toHaveValue("12345.67");
  expect(screen.getByLabelText("Description 1")).toHaveValue(
    "Customer advance",
  );
});

test("project switching is disabled while a save is in flight", async () => {
  const first = {
    id: "one",
    name: "First bid",
    customer: "",
    notes: "",
    archived: false,
    version: 1,
    lines: [],
    metrics: {
      complete: false,
      incoming_php: null,
      outgoing_php: null,
      profit_php: null,
      net_usd: null,
    },
    fx: { rate: null, observation_date: null, source: "ECB", last_run: null },
  };
  const second = { ...first, id: "two", name: "Second bid" };
  let finishSave: (value: unknown) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options?.method === "PUT")
        return new Promise((resolve) => {
          finishSave = resolve;
        });
      if (String(url).includes("/projects/one"))
        return { ok: true, json: async () => first };
      if (String(url).includes("/projects/two"))
        return { ok: true, json: async () => second };
      return {
        ok: true,
        json: async () =>
          String(url).includes("/projects") ? [first, second] : first.fx,
      };
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /First bid/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit project" }));
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  expect(screen.getByRole("button", { name: /Second bid/ })).toBeDisabled();
  await act(async () => {
    finishSave({ ok: true, json: async () => ({ ...first, version: 2 }) });
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Second bid/ })).toBeEnabled(),
  );
});

test("a late refresh cannot overwrite the selected archive filter", async () => {
  const current = {
    id: "one",
    name: "Current bid",
    customer: "",
    notes: "",
    archived: false,
    version: 1,
    lines: [],
    metrics: {
      complete: false,
      incoming_php: null,
      outgoing_php: null,
      profit_php: null,
      net_usd: null,
    },
    fx: { rate: null, observation_date: null, source: "ECB", last_run: null },
  };
  const archived = {
    ...current,
    id: "archived",
    name: "Archived bid",
    archived: true,
  };
  let activeRequests = 0;
  let finishRefresh: (value: unknown) => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      if (options?.method === "PUT")
        return { ok: true, json: async () => ({ ...current, version: 2 }) };
      if (String(url).includes("/projects/one"))
        return { ok: true, json: async () => current };
      if (String(url).includes("archived=true"))
        return { ok: true, json: async () => [archived] };
      if (String(url).includes("archived=false")) {
        activeRequests++;
        if (activeRequests > 1)
          return new Promise((resolve) => {
            finishRefresh = resolve;
          });
        return { ok: true, json: async () => [current] };
      }
      return { ok: true, json: async () => current.fx };
    }),
  );
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /Current bid/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Edit project" }));
  fireEvent.click(screen.getByRole("button", { name: "Save project" }));
  await waitFor(() => expect(activeRequests).toBe(2));
  fireEvent.click(screen.getByLabelText("Show archived projects"));
  expect(
    await screen.findByRole("button", { name: /Archived bid/ }),
  ).toBeVisible();
  await act(async () => {
    finishRefresh({ ok: true, json: async () => [current] });
  });
  expect(screen.getByRole("button", { name: /Archived bid/ })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Current bid/ }),
  ).not.toBeInTheDocument();
});
