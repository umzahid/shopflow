import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Textarea } from "./Textarea";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { label: "Description", placeholder: "Tell us about your product…" },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHelper: Story = {
  args: { helperText: "Markdown is supported." },
};

export const WithError: Story = {
  args: { error: "Description is required." },
};

export const WithCounter: Story = {
  args: { showCount: true, maxLength: 200, value: "A hand-thrown ceramic mug.", onChange: () => {} },
};
