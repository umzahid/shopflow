import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mutate = vi.fn();
vi.mock("@/lib/merchant", () => ({
  useGenerateDescription: () => ({ mutate, isPending: false }),
}));

import { DescriptionField } from "./DescriptionField";

describe("DescriptionField", () => {
  it("renders the textarea with the current value and forwards edits", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DescriptionField id="d1" title="Mug" value="Old text" onChange={onChange} />,
    );
    const box = screen.getByLabelText("Description");
    expect(box).toHaveValue("Old text");
    await user.type(box, "!");
    expect(onChange).toHaveBeenCalled();
  });

  it("generates variants for the given title and applies a clicked suggestion", async () => {
    mutate.mockImplementation((_vars, opts) =>
      opts.onSuccess({ variants: ["Variant A", "Variant B"] }),
    );
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DescriptionField id="d2" title="Mug" value="" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /generate with ai/i }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Mug" }),
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Variant B" }));
    expect(onChange).toHaveBeenCalledWith("Variant B");
  });

  it("does not call the API when the title is empty", async () => {
    mutate.mockClear();
    const user = userEvent.setup();
    render(<DescriptionField id="d3" title="  " value="" onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /generate with ai/i }));
    expect(mutate).not.toHaveBeenCalled();
  });
});
