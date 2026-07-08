import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Select } from "./Select";

const OPTIONS = [
  { label: "Apple", value: "apple" },
  { label: "Banana", value: "banana" },
  { label: "Cherry", value: "cherry" },
];

describe("Select", () => {
  it("renders all provided options", () => {
    render(<Select options={OPTIONS} ariaLabel="Fruit" />);
    expect(screen.getByRole("combobox", { name: "Fruit" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Cherry" })).toBeInTheDocument();
  });

  it("uses a visible label to name the combobox", () => {
    render(<Select label="Category" options={OPTIONS} />);
    expect(
      screen.getByRole("combobox", { name: "Category" }),
    ).toBeInTheDocument();
  });

  it("fires onChange with the selected value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Select label="Fruit" options={OPTIONS} onChange={onChange} />);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Fruit" }),
      "banana",
    );
    expect(onChange).toHaveBeenCalled();
    expect(
      (screen.getByRole("combobox", { name: "Fruit" }) as HTMLSelectElement)
        .value,
    ).toBe("banana");
  });

  it("shows an error with alert role and marks the field aria-invalid", () => {
    render(<Select label="Fruit" options={OPTIONS} error="Selection required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Selection required");
    expect(screen.getByRole("combobox", { name: "Fruit" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows helper text when no error is present", () => {
    render(<Select label="Fruit" options={OPTIONS} helperText="Pick one" />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is set", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Select label="Fruit" options={OPTIONS} disabled onChange={onChange} />,
    );
    const combobox = screen.getByRole("combobox", { name: "Fruit" });
    expect(combobox).toBeDisabled();
    await user.selectOptions(combobox, "cherry");
    expect(onChange).not.toHaveBeenCalled();
  });
});
