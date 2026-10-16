import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * `delay` is deliberately not 0: a tooltip that fires the instant the pointer crosses a
 * button pops open on every pass over the composer row. Base UI keeps subsequent tooltips
 * in the same provider instant, so only the first one in a group waits — and those
 * instant ones skip the animation too (see `data-instant` below).
 */
function TooltipProvider({
  delay = 300,
  ...props
}) {
  return (<TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />);
}

function Tooltip({
  ...props
}) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
  ...props
}) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs items-center gap-1.5 has-data-[slot=kbd]:pr-1.5",
            className
          )}
          {...props}>
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
