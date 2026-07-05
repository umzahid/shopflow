import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { SLATimer } from "./SLATimer";

const meta = {
  title: "UI/SLATimer",
  component: SLATimer,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof SLATimer>;

export default meta;
type Story = StoryObj<typeof meta>;

// Stories pass relative offsets so the countdown is live in Storybook.
export const DaysRemaining: Story = {
  args: { deadline: new Date(Date.now() + 3 * 86400_000).toISOString(), prefix: "Delivery in" },
};

export const Warning: Story = {
  args: { deadline: new Date(Date.now() + 20 * 60_000).toISOString(), warnUnderMinutes: 60 },
};

export const Overdue: Story = {
  args: { deadline: new Date(Date.now() - 60_000).toISOString() },
};
