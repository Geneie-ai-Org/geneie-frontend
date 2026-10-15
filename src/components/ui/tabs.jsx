import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

function Tabs({ className, ...props }) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex min-h-0 flex-col", className)}
      {...props} />
  );
}

/** Underline tab strip. Scrolls horizontally instead of wrapping. */
function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative flex h-10 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border px-2",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props} />
  );
}

function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex shrink-0 items-center gap-1.5 px-2.5 text-[13px] font-medium text-muted-foreground",
        "outline-none transition-colors hover:text-foreground focus-visible:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/40 rounded-md",
        "data-[selected]:text-foreground data-[active]:text-foreground",
        "after:pointer-events-none after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent",
        "data-[selected]:after:bg-primary data-[active]:after:bg-primary",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props} />
  );
}

function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      keepMounted
      className={cn("min-h-0 flex-1 outline-none data-[hidden]:hidden", className)}
      {...props} />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
