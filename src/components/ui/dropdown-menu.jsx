import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"
import { HighlightPill } from "@/components/ui/highlight-pill"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

function DropdownMenu({
  ...props
}) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({
  ...props
}) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({
  ...props
}) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 6,
  className,
  children,
  ...props
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}>
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "ov-popup ov-scroll z-50 min-w-[8rem] overflow-x-hidden text-popover-foreground outline-none",
            className
          )}
          {...props}>
          <HighlightPill />
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({
  ...props
}) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn("ov-label data-[inset]:pl-8", className)}
      {...props} />
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn("ov-item group/dropdown-menu-item data-[inset]:pl-8", className)}
      {...props} />
  );
}

function DropdownMenuSub({
  ...props
}) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn("ov-item data-[inset]:pl-8 data-[popup-open]:[&>svg:last-child]:translate-x-0.5", className)}
      {...props}>
      {children}
      <ChevronRightIcon className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -6,
  side = "right",
  sideOffset = 4,
  className,
  ...props
}) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto min-w-[9rem]", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props} />
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn("ov-item pr-9 data-[inset]:pl-8", className)}
      checked={checked}
      {...props}>
      {children}
      <span
        className="ov-check"
        data-slot="dropdown-menu-checkbox-item-indicator">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  ...props
}) {
  return (<MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />);
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn("ov-item pr-9 data-[inset]:pl-8", className)}
      {...props}>
      {children}
      <span
        className="ov-check"
        data-slot="dropdown-menu-radio-item-indicator">
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("ov-sep", className)}
      {...props} />
  );
}

/** Right-aligned shortcut hint, e.g. <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>. */
function DropdownMenuShortcut({
  className,
  ...props
}) {
  return (
    <kbd
      data-slot="dropdown-menu-shortcut"
      className={cn("ov-kbd", className)}
      {...props} />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
