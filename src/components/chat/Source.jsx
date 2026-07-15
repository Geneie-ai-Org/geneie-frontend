import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"
import { createContext, useContext } from "react"

const SourceContext = createContext(null)

function useSourceContext() {
  const ctx = useContext(SourceContext)
  if (!ctx) throw new Error("Source.* must be used inside <Source>")
  return ctx
}

function Source({ href, children }) {
  let domain = ""
  try {
    domain = new URL(href).hostname
  } catch {
    domain = href?.split("/").pop() || href || ""
  }
  return (
    <SourceContext.Provider value={{ href, domain }}>
      <HoverCard>
        {children}
      </HoverCard>
    </SourceContext.Provider>
  )
}

function SourceTrigger({
  label,
  showFavicon = false,
  className,
  ...props
}) {
  const { href, domain } = useSourceContext()
  const labelToShow = label ?? domain.replace("www.", "")

  return (
    <HoverCardTrigger
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-6 max-w-40 items-center gap-1 overflow-hidden rounded-full py-0 text-xs no-underline transition-colors duration-150 border",
        showFavicon ? "pr-2 pl-1" : "px-2",
        className
      )}
      style={{
        borderColor: "var(--border-default)",
        color: "var(--text-secondary)",
        backgroundColor: "var(--bg-surface)",
      }}
      {...props}
    >
      {showFavicon && (
        <img
          src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(href)}`}
          alt="favicon"
          width={14}
          height={14}
          className="size-3.5 rounded-full"
        />
      )}
      <span className="truncate tabular-nums text-center font-normal">
        {labelToShow}
      </span>
    </HoverCardTrigger>
  )
}

function SourceContent({ title, description, className }) {
  const { href, domain } = useSourceContext()

  return (
    <HoverCardContent
      className={cn(
        "w-80 p-0 ring-0 border shadow-lg",
        className
      )}
      style={{
        backgroundColor: "var(--bg-surface-raised)",
        borderColor: "var(--border-strong)",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col gap-2 p-3 no-underline"
      >
        <div className="flex items-center gap-1.5">
          <img
            src={`https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(href)}`}
            alt="favicon"
            className="size-4 rounded-full"
            width={16}
            height={16}
          />
          <div className="truncate text-sm" style={{ color: "var(--text-secondary)" }}>
            {domain.replace("www.", "")}
          </div>
        </div>
        <div className="line-clamp-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {title}
        </div>
        {description && (
          <div className="line-clamp-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
            {description}
          </div>
        )}
      </a>
    </HoverCardContent>
  )
}

export { Source, SourceTrigger, SourceContent }
