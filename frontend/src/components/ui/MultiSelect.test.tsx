import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MultiSelect, type MultiSelectOption } from "./MultiSelect";

const OPTIONS: MultiSelectOption[] = [
  { label: "Home", value: "home" },
  { label: "Apparel", value: "apparel" },
  { label: "Electronics", value: "electronics" },
];

describe("MultiSelect", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} ariaLabel="Cats" placeholder="Pick some" />);
    expect(screen.getByText("Pick some")).toBeInTheDocument();
  });

  it("opens the menu and selects an option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiSelect options={OPTIONS} value={[]} onChange={onChange} ariaLabel="Cats" />);
    await user.click(screen.getByRole("button", { name: "Cats" }));
    await user.click(screen.getByRole("button", { name: /Apparel/ }));
    expect(onChange).toHaveBeenCalledWith(["apparel"]);
  });

  it("renders selected values as chips", () => {
    render(<MultiSelect options={OPTIONS} value={["home"]} onChange={() => {}} ariaLabel="Cats" />);
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("filters options by the search box", async () => {
    const user = userEvent.setup();
    render(<MultiSelect options={OPTIONS} value={[]} onChange={() => {}} ariaLabel="Cats" />);
    await user.click(screen.getByRole("button", { name: "Cats" }));
    await user.type(screen.getByLabelText("Filter options"), "elec");
    expect(screen.getByRole("option", { name: /Electronics/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Apparel/ })).not.toBeInTheDocument();
  });
});
