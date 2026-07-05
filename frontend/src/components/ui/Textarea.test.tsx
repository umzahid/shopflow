import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("associates the label with the field", () => {
    render(<Textarea label="Notes" />);
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("shows helper text", () => {
    render(<Textarea label="Bio" helperText="Keep it short" />);
    expect(screen.getByText("Keep it short")).toBeInTheDocument();
  });

  it("shows an error with alert role and marks invalid", () => {
    render(<Textarea label="Bio" error="Required" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
    expect(screen.getByLabelText("Bio")).toHaveAttribute("aria-invalid", "true");
  });

  it("renders a character counter when showCount + maxLength are set", () => {
    render(<Textarea label="Bio" showCount maxLength={100} value="hello" onChange={() => {}} />);
    expect(screen.getByText("5/100")).toBeInTheDocument();
  });
});
