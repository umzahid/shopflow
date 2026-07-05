import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { MultiSelect } from "./MultiSelect";

const OPTIONS = [
  { label: "Home & Kitchen", value: "home" },
  { label: "Apparel", value: "apparel" },
  { label: "Electronics", value: "electronics" },
  { label: "Outdoors", value: "outdoors" },
  { label: "Beauty", value: "beauty" },
];

const meta = {
  title: "UI/MultiSelect",
  component: MultiSelect,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof MultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { options: OPTIONS, value: [], onChange: () => {}, label: "Categories" },
  render: (args) => {
    const [value, setValue] = useState<string[]>(["home"]);
    return (
      <div className="w-72">
        <MultiSelect {...args} value={value} onChange={setValue} />
      </div>
    );
  },
};
