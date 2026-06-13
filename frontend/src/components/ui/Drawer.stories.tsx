import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { Button } from "./Button";
import { Drawer } from "./Drawer";

const meta = {
  title: "UI/Drawer",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Side panel with focus trap, ESC-to-close, backdrop click, body-scroll lock. Slide-in animation respects prefers-reduced-motion.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ side = "right" as const }: { side?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open {side} drawer</Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={`${side === "left" ? "Filters" : "Your cart"}`}
        side={side}
        footer={
          <Button variant="primary" className="w-full">
            Apply
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Drawer body content goes here. Tab to cycle focus — it stays inside.
        </p>
      </Drawer>
    </>
  );
}

export const RightSide: Story = { render: () => <Demo side="right" /> };
export const LeftSide: Story = { render: () => <Demo side="left" /> };
