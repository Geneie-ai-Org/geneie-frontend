import { cn } from "@/lib/utils"

const sizeMap = {
  sm: { circle: "h-4 w-4", bars: "h-3", dot: "h-1 w-1", text: "text-xs" },
  md: { circle: "h-6 w-6", bars: "h-4", dot: "h-1.5 w-1.5", text: "text-sm" },
  lg: { circle: "h-8 w-8", bars: "h-6", dot: "h-2 w-2", text: "text-base" },
}

function Loader({ variant = "circular", size = "md", text = "Thinking", className }) {
  const s = sizeMap[size] || sizeMap.md

  if (variant === "circular") {
    return (
      <output className={cn("inline-block relative", s.circle, className)} aria-label="Loading">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-0 h-full"
            style={{ transform: `rotate(${i * 45}deg)`, transformOrigin: "center center" }}
          >
            <div
              className="mx-auto h-[25%] w-[2px] rounded-full bg-current animate-spinner-fade"
              style={{ animationDelay: `${-1.2 + i * 0.15}s` }}
            />
          </div>
        ))}
      </output>
    )
  }

  if (variant === "classic") {
    return (
      <output
        className={cn(
          "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
          s.circle,
          className
        )}
        aria-label="Loading"
      />
    )
  }

  if (variant === "pulse") {
    return (
      <output className={cn("flex items-center gap-1", className)} aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn("rounded-full bg-current", s.dot)}
            style={{
              animation: "thin-pulse 0.9s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </output>
    )
  }

  if (variant === "pulse-dot") {
    return (
      <output
        className={cn("block rounded-full bg-current", s.dot, className)}
        style={{ animation: "pulse-dot 0.9s ease-in-out infinite" }}
        aria-label="Loading"
      />
    )
  }

  if (variant === "dots") {
    return (
      <output className={cn("flex items-center gap-1", className)} aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn("rounded-full bg-current", s.dot)}
            style={{
              animation: "bounce-dots 0.9s infinite ease-in-out both",
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </output>
    )
  }

  if (variant === "typing") {
    return (
      <output className={cn("flex items-center gap-1", className)} aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn("rounded-full bg-current", s.dot)}
            style={{
              animation: "typing 0.9s infinite",
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </output>
    )
  }

  if (variant === "wave") {
    return (
      <output className={cn("flex items-end gap-0.5", className)} aria-label="Loading">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn("w-0.5 rounded-full bg-current", s.bars)}
            style={{
              animation: "wave 0.9s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </output>
    )
  }

  if (variant === "bars") {
    return (
      <output className={cn("flex items-end gap-0.5", className)} aria-label="Loading">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn("w-0.5 rounded-full bg-current", s.bars)}
            style={{
              animation: "wave-bars 1s ease-in-out infinite",
              animationDelay: `${i * 0.1}s`,
            }}
          />
        ))}
      </output>
    )
  }

  if (variant === "terminal") {
    return (
      <output
        className={cn("inline-block h-[1em] w-[0.5em] bg-current", s.text, className)}
        style={{ animation: "text-blink 1s step-end infinite" }}
        aria-label="Loading"
      />
    )
  }

  if (variant === "text-blink") {
    return (
      <output
        className={cn(s.text, className)}
        style={{ animation: "text-blink 0.9s ease-in-out infinite" }}
        aria-label="Loading"
      >
        {text}
      </output>
    )
  }

  if (variant === "text-shimmer") {
    return (
      <output
        className={cn("bg-clip-text text-transparent", s.text, className)}
        style={{
          backgroundImage: "linear-gradient(90deg, currentColor 0%, currentColor 40%, transparent 50%, currentColor 60%, currentColor 100%)",
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
          animation: "shimmer 0.9s linear infinite",
          color: "currentColor",
        }}
        aria-label="Loading"
      >
        {text}
      </output>
    )
  }

  if (variant === "loading-dots") {
    return (
      <output className={cn(s.text, className)} aria-label="Loading">
        {text}
        <span className="inline-flex ml-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                animation: "loading-dots 0.9s infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            >
              .
            </span>
          ))}
        </span>
      </output>
    )
  }

  return null
}

export { Loader }
