import { beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
