import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readLastWorkId } from "./lastWorkId";

const KEY = "liubai:lastWorkId";

describe("readLastWorkId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("未设置时返回 null", () => {
    expect(readLastWorkId()).toBeNull();
  });

  it("返回已保存的作品 id", () => {
    localStorage.setItem(KEY, "work-abc");
    expect(readLastWorkId()).toBe("work-abc");
  });
});
