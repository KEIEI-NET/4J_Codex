import { describe, it, expect } from "vitest";
import { normalizeEntity } from "./normalizer.js";

describe("normalizeEntity", () => {
  it("normalizes file ids and paths", () => {
    const entity = normalizeEntity({
      type: "File",
      id: "src/Main.java",
      path: "src\\Main.java",
      lang: "JAVA",
    });
    if (entity.type !== "File") {
      throw new Error("expected File entity");
    }
    expect(entity.id).toBe("file:src/Main.java");
    expect(entity.path).toBe("src/Main.java");
    expect(entity.lang).toBe("java");
  });

  it("uppercases DB operations", () => {
    const entity = normalizeEntity({
      type: "DBQuery",
      id: "dbq:sha256:abc",
      raw: "select * from ks.table",
      op: "select",
    });
    if (entity.type !== "DBQuery") {
      throw new Error("expected DBQuery entity");
    }
    expect(entity.op).toBe("SELECT");
  });

  it("throws on invalid entity", () => {
    expect(() => normalizeEntity({})).toThrowError();
  });

  it("transforms HttpCall into CALLS_HTTP relationship", () => {
    const entity = normalizeEntity({
      type: "HttpCall",
      file: "src/app.component.ts",
      className: "AppComponent",
      owner: "loadUsers",
      url: "/api/users",
      httpMethod: "get",
      startLine: 42
    });

    expect(entity.type).toBe("Rel");
    if (entity.type !== "Rel") {
      return;
    }
    expect(entity.rel).toBe("CALLS_HTTP");
    expect(entity.from).toBe("file:src/app.component.ts");
    expect(entity.httpMethod).toBe("GET");
    expect(typeof entity.to).toBe("string");
    expect((entity.to as string).startsWith("http:")).toBe(true);
  });

  it("generates DBQuery id when missing", () => {
    const entity = normalizeEntity({
      type: "DBQuery",
      raw: "select * from users",
      op: "select",
      file: "src\\repository.ts",
      method: "execute",
      startLine: 10
    });
    if (entity.type !== "DBQuery") {
      throw new Error("expected DBQuery entity");
    }
    expect(entity.id).toMatch(/^dbq:/);
    expect(entity.file).toBe("src/repository.ts");
    expect(entity.op).toBe("SELECT");
  });
});
