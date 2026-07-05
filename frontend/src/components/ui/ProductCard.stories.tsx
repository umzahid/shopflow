import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import type { Product } from "@/types/api";
import { ProductCard } from "./ProductCard";

const baseProduct: Product = {
  id: "00000000-0000-0000-0000-000000000001",
  merchant_id: "00000000-0000-0000-0000-000000000099",
  category_id: null,
  title: "Premium Coffee Beans (Single-Origin Ethiopia)",
  description: "Bright, fruity, hand-picked.",
  price: "24.99",
  stock_qty: 42,
  images: [],
  status: "active",
  created_at: new Date(2026, 5, 14).toISOString(),
  updated_at: new Date(2026, 5, 14).toISOString(),
};

const meta = {
  title: "UI/ProductCard",
  component: ProductCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { product: baseProduct },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InStock: Story = {};

export const LowStock: Story = {
  args: { product: { ...baseProduct, stock_qty: 3 } },
};

export const SoldOut: Story = {
  args: { product: { ...baseProduct, stock_qty: 0 } },
};

export const LongTitle: Story = {
  args: {
    product: {
      ...baseProduct,
      title:
        "Hand-Thrown Ceramic Pour-Over Coffee Dripper with Heat-Resistant Glass Carafe",
    },
  },
};
