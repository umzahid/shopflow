import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { Input } from "./Input";

describe("Input", () => {
  it("associates the label with the field via htmlFor", () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows helper text when no error is present", () => {
    render(<Input label="Username" helperText="Must be unique" />);
    expect(screen.getByText("Must be unique")).toBeInTheDocument();
  });

  it("shows an error with alert role and marks field aria-invalid", () => {
    render(<Input label="Password" error="Too short" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Too short");
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("error takes precedence over helperText", () => {
    render(<Input label="Field" error="Required" helperText="Some hint" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(screen.queryByText("Some hint")).not.toBeInTheDocument();
  });

  it("shows character counter when showCount and maxLength are set", () => {
    render(
      <Input
        label="Bio"
        showCount
        maxLength={80}
        value="hello"
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("5/80")).toBeInTheDocument();
  });

  it("accepts user typing in an uncontrolled mode", async () => {
    const user = userEvent.setup();
    render(<Input label="Search" />);
    const input = screen.getByLabelText("Search");
    await user.type(input, "shoes");
    expect(input).toHaveValue("shoes");
  });
});
