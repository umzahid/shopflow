import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Input } from "./Input";

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    label: "Email",
    placeholder: "you@example.com",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHelperText: Story = {
  args: { helperText: "We'll never share your email." },
};

export const WithError: Story = {
  args: { error: "Enter a valid email address" },
};

export const Disabled: Story = { args: { disabled: true } };

export const Large: Story = { args: { inputSize: "lg" } };

export const WithCharacterCount: Story = {
  render: (args) => {
    const [value, setValue] = useState("");
    return (
      <Input
        {...args}
        label="Review title"
        maxLength={60}
        showCount
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  },
};
