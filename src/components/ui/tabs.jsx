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
        "relative flex h-10 shrink-0 items-center gap-1 overflow-x-auto px-2 py-1",
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
        "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground",
        "transition-colors duration-150 hover:bg-muted/60 hover:text-foreground motion-reduce:transition-none",
        // Full-alpha 2px ring: the global one is 45% alpha, under 3:1 on white.
        "focus-visible:outline-[hsl(var(--ring))] focus-visible:outline-offset-2",
        "data-[selected]:bg-muted data-[selected]:text-foreground data-[active]:bg-muted data-[active]:text-foreground",
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
