import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Button } from "./Button";
import { ToastProvider, useToast } from "./Toast";

const meta = {
  title: "UI/Toast",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Queue of up to 3 toasts. Auto-dismiss in 4s by default. aria-live=polite so screen readers announce without stealing focus.",
      },
    },
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo() {
  const { toast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => toast({ title: "Added to cart", description: "Premium Coffee Beans", variant: "success" })}>
        Trigger success
      </Button>
      <Button variant="danger" onClick={() => toast({ title: "Stock changed", description: "Only 2 available", variant: "error" })}>
        Trigger error
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: "Heads up", description: "Approaching low stock", variant: "warning" })}>
        Trigger warning
      </Button>
      <Button variant="ghost" onClick={() => toast({ title: "Saved", description: "Promo code applied at checkout", variant: "info" })}>
        Trigger info
      </Button>
    </div>
  );
}

export const Playground: Story = { render: () => <Demo /> };
