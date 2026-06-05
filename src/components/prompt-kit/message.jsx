import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Markdown } from "./markdown"

const Message = ({ children, className, ...props }) => (
  <div className={cn("flex gap-3", className)} {...props}>
    {children}
  </div>
)

const MessageContent = ({
  children,
  markdown = false,
  className,
  ...props
}) => {
  const classNames = cn(
    "rounded-lg p-2 break-words whitespace-normal",
    markdown && "chat-prose",
    className
  )
  return markdown ? (
    <Markdown className={classNames} {...props}>
      {children}
    </Markdown>
  ) : (
    <div className={classNames} {...props}>
      {children}
    </div>
  )
}

const MessageActions = ({ children, className, ...props }) => (
  <div
    className={cn("flex items-center gap-2", className)}
    style={{ color: "var(--text-secondary)" }}
    {...props}
  >
    {children}
  </div>
)

const MessageAction = ({
  tooltip,
  children,
  className,
  side = "top",
  ...props
}) => {
  return (
    <TooltipProvider>
      <Tooltip {...props}>
        <TooltipTrigger render={children} />
        <TooltipContent side={side} className={className}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export { Message, MessageContent, MessageActions, MessageAction }
