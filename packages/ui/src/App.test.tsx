import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockImplementation((input: RequestInfo) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/symbol")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          symbols: [{ id: "sym:App#main", name: "App.main" }],
          meta: { source: "stub" }
        })
      }) as unknown as Promise<Response>;
    }
    if (url.startsWith("/api/graph/symbol")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          node: { id: "sym:App#main", labels: ["Entity"], properties: { name: "App.main" } },
          nodes: [
            { id: "sym:App#main", labels: ["Entity"], properties: { name: "App.main" } }
          ],
          edges: [],
          meta: { source: "stub" }
        })
      }) as unknown as Promise<Response>;
    }
    return Promise.resolve({ ok: false, status: 404 }) as unknown as Promise<Response>;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("App", () => {
  it("renders heading and loads search results", async () => {
    render(<App />);
    expect(screen.getByText(/Codex Explorer/)).toBeInTheDocument();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const matches = await screen.findAllByText(/App\.main/);
    expect(matches.length).toBeGreaterThan(0);
  });
});
