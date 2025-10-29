import { describe, expect, it } from "vitest";

import { createServer } from "./server.js";

describe("createServer", () => {
  it("/healthz", async () => {
    const app = await createServer();
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("/api/symbol search fallback", async () => {
    const app = await createServer();
    const response = await app.inject({ method: "GET", url: "/api/symbol?q=app" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.symbols)).toBe(true);
    expect(body.symbols.length).toBeGreaterThan(0);
    expect(body.meta.source).toBe("stub");
  });

  it("/api/graph/symbol fallback", async () => {
    const app = await createServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/graph/symbol/" + encodeURIComponent("sym:App#main")
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.node.id).toBe("sym:App#main");
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(body.meta.source).toBe("stub");
  });

  it("/api/rulehits", async () => {
    const app = await createServer();
    const response = await app.inject({ method: "GET", url: "/api/rulehits" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.ruleHits)).toBe(true);
    expect(body.ruleHits.length).toBeGreaterThan(0);
  });

  it("respects shared secret", async () => {
    process.env.API_SHARED_SECRET = "secret";
    const app = await createServer();
    const unauthorized = await app.inject({ method: "GET", url: "/api/ping" });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await app.inject({
      method: "GET",
      url: "/api/ping",
      headers: { authorization: "Bearer secret" }
    });
    expect(authorized.statusCode).toBe(200);
    delete process.env.API_SHARED_SECRET;
  });
});
