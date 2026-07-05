import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RichTextEditor } from "./RichTextEditor";

describe("RichTextEditor", () => {
  it("renders a formatting toolbar and the textarea", () => {
    render(<RichTextEditor value="" onChange={() => {}} label="Body" />);
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
    expect(screen.getByLabelText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
  });

  it("inserts bold markdown around the sample when nothing is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} label="Body" />);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenCalledWith("**bold text**");
  });

  it("prefixes a bullet for the list action", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} label="Body" />);
    await user.click(screen.getByRole("button", { name: "Bullet list" }));
    expect(onChange).toHaveBeenCalledWith("- list item");
  });
});
