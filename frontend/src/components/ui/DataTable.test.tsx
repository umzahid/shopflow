import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable, type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
  price: number;
}

const ROWS: Row[] = [
  { id: "1", name: "Bravo", price: 30 },
  { id: "2", name: "Alpha", price: 10 },
  { id: "3", name: "Charlie", price: 20 },
];

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Product", render: (r) => r.name, sortValue: (r) => r.name },
  { key: "price", header: "Price", align: "right", render: (r) => `$${r.price}`, sortValue: (r) => r.price },
];

describe("DataTable", () => {
  it("renders all rows", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("shows the empty message when there are no rows", () => {
    render(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} emptyMessage="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("sorts ascending by a column when its header is clicked", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
    await user.click(screen.getByRole("button", { name: "Sort by Product" }));
    const cells = screen.getAllByRole("cell").filter((c) => /Alpha|Bravo|Charlie/.test(c.textContent || ""));
    expect(cells[0]).toHaveTextContent("Alpha");
  });

  it("paginates", () => {
    const many: Row[] = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `P${i}`, price: i }));
    render(<DataTable columns={COLUMNS} rows={many} rowKey={(r) => r.id} pageSize={5} />);
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
  });

  it("reports selection changes", async () => {
    const user = userEvent.setup();
    const onSel = vi.fn();
    render(
      <DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} selectable onSelectionChange={onSel} />,
    );
    const checkboxes = screen.getAllByRole("checkbox", { name: "Select row" });
    await user.click(checkboxes[0]);
    expect(onSel).toHaveBeenCalled();
  });

  it("offers a CSV export button when exportable", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} exportable />);
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeInTheDocument();
  });
});
