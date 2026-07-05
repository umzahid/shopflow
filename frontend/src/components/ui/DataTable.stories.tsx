import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DataTable, type Column } from "./DataTable";

interface Row {
  id: string;
  name: string;
  price: number;
  stock: number;
}

const ROWS: Row[] = Array.from({ length: 23 }, (_, i) => ({
  id: String(i + 1),
  name: `Product ${i + 1}`,
  price: Math.round((10 + i * 3.5) * 100) / 100,
  stock: (i * 7) % 40,
}));

const COLUMNS: Column<Row>[] = [
  { key: "name", header: "Product", render: (r) => r.name, sortValue: (r) => r.name },
  { key: "price", header: "Price", align: "right", render: (r) => `$${r.price.toFixed(2)}`, sortValue: (r) => r.price },
  { key: "stock", header: "Stock", align: "right", render: (r) => r.stock, sortValue: (r) => r.stock },
];

const meta: Meta<typeof DataTable<Row>> = {
  title: "UI/DataTable",
  component: DataTable,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof DataTable<Row>>;

export const Default: Story = {
  args: { columns: COLUMNS, rows: ROWS, rowKey: (r: Row) => r.id, pageSize: 8 },
};

export const SelectableExportable: Story = {
  args: {
    columns: COLUMNS,
    rows: ROWS,
    rowKey: (r: Row) => r.id,
    selectable: true,
    exportable: true,
    pageSize: 8,
  },
};

export const Empty: Story = {
  args: { columns: COLUMNS, rows: [], rowKey: (r: Row) => r.id },
};
