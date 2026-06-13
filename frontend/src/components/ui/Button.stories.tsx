import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ShoppingCart, ArrowRight } from "lucide-react";

import { Button } from "./Button";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Primary = transaction green (Add to cart, Search submit). Secondary = brand purple outline. Ghost = chrome. Danger = destructive.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    children: "Add to cart",
    variant: "primary",
    size: "md",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = { args: { variant: "secondary", children: "Continue shopping" } };

export const Ghost: Story = { args: { variant: "ghost", children: "Cancel" } };

export const Danger: Story = { args: { variant: "danger", children: "Delete account" } };

export const Loading: Story = { args: { loading: true } };

export const Disabled: Story = { args: { disabled: true, children: "Sold out" } };

export const WithLeftIcon: Story = {
  args: {
    leftIcon: <ShoppingCart className="h-4 w-4" aria-hidden="true" strokeWidth={2} />,
  },
};

export const WithRightIcon: Story = {
  args: {
    children: "Apply to sell",
    rightIcon: <ArrowRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />,
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
    </div>
  ),
};
