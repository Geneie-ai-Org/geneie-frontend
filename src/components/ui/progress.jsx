import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

/**
 * Thin determinate bar (role=progressbar with value, min and max). Pass `valueText` to give assistive
 * tech the sentence that goes with the number ("949 of 949 variants in scope"); the host should show
 * the same text next to the bar, since a bar alone is not a text equivalent. A null `value` renders
 * an indeterminate bar. `className` still lands on the root, so existing callers are unaffected.
 */
function Progress({
  className,
  children,
  value,
  valueText,
  ...props
}) {
  return (
    <ProgressPrimitive.Root
      value={value}
      getAriaValueText={valueText != null ? () => valueText : undefined}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}>
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  );
}

function ProgressTrack({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Track
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-full bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props} />
  );
}

function ProgressIndicator({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Indicator
      data-slot="progress-indicator"
      // Width only: `all` also animated the colour, so a bar that changes state mid-fill
      // had its colour chase the fill instead of switching with it. Progress is one of the few
      // places the accent (--signal) is used, so the fill carries it.
      className={cn("h-full bg-[hsl(var(--signal))] transition-[width] duration-300 ease-out motion-reduce:transition-none", className)}
      {...props} />
  );
}

function ProgressLabel({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Label
      className={cn("text-[13px] font-medium", className)}
      data-slot="progress-label"
      {...props} />
  );
}

function ProgressValue({
  className,
  ...props
}) {
  return (
    <ProgressPrimitive.Value
      className={cn("ml-auto text-[13px] text-muted-foreground tabular-nums", className)}
      data-slot="progress-value"
      {...props} />
  );
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
