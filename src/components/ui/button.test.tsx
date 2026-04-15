import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  it("渲染子节点", () => {
    render(<Button type="button">保存</Button>);
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });
});
