import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("cytoscape", () => {
  const layoutMock = vi.fn(() => ({ run: vi.fn() }));
  const cyMock = vi.fn(() => ({
    json: vi.fn(),
    layout: layoutMock
  }));
  return { default: cyMock };
});
