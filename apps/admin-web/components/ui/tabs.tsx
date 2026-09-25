"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ReactNode } from "react";

export function Tabs({
  children,
  defaultValue,
  items,
}: {
  children: ReactNode;
  defaultValue: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue}>
      <TabsPrimitive.List className="tabs-list" aria-label="Page views">
        {items.map((item) => (
          <TabsPrimitive.Trigger className="tabs-trigger" key={item.value} value={item.value}>
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabsContent({ children, value }: { children: ReactNode; value: string }) {
  return <TabsPrimitive.Content className="tabs-content" value={value}>{children}</TabsPrimitive.Content>;
}
