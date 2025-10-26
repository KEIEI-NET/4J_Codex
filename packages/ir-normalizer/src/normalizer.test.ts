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
});
