import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { RichTextEditor } from "./RichTextEditor";

const meta = {
  title: "UI/RichTextEditor",
  component: RichTextEditor,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof RichTextEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { value: "", onChange: () => {}, label: "Product description" },
  render: (args) => {
    const [value, setValue] = useState("**Hand-thrown** ceramic mug.\n\n- Dishwasher safe\n- 350ml");
    return (
      <div className="w-96">
        <RichTextEditor {...args} value={value} onChange={setValue} />
      </div>
    );
  },
};
