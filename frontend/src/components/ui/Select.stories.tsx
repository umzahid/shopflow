import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Select } from "./Select";

const meta = {
  title: "UI/Select",
  component: Select,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    label: "Sort by",
    options: [
      { label: "Newest", value: "newest" },
      { label: "Price: Low to High", value: "price_asc" },
      { label: "Price: High to Low", value: "price_desc" },
      { label: "Most reviewed", value: "reviews" },
    ],
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithError: Story = {
  args: { error: "Please pick an option" },
};

export const Disabled: Story = { args: { disabled: true } };

export const WithoutLabel: Story = {
  args: { label: undefined, ariaLabel: "Sort products" },
};
