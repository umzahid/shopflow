import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StatusBadge } from "./StatusBadge";

const meta = {
  title: "UI/StatusBadge",
  component: StatusBadge,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { status: "confirmed" },
  argTypes: {
    status: {
      control: "select",
      options: ["pending", "pending_review", "confirmed", "shipped", "delivered", "cancelled"],
    },
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(["pending", "pending_review", "confirmed", "shipped", "delivered", "cancelled"] as const).map(
        (s) => (
          <StatusBadge key={s} status={s} />
        ),
      )}
    </div>
  ),
};
