import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ProductCardSkeletonGrid, Skeleton } from "./SkeletonLoader";

const meta = {
  title: "UI/SkeletonLoader",
  component: Skeleton,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = { args: { variant: "text" } };
export const Row: Story = { args: { variant: "row" } };
export const Thumb: Story = { args: { variant: "thumb" } };
export const Card: Story = { args: { variant: "card" } };

export const ProductGrid: StoryObj = {
  render: () => <ProductCardSkeletonGrid count={4} />,
};
