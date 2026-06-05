import { cn } from "@/lib/utils"
import React, { useRef, useEffect, useCallback, useState, createContext, useContext } from "react"

const ScrollContext = createContext({ isAtBottom: true, scrollToBottom: () => {} })

function useStickToBottomContext() {
  return useContext(ScrollContext)
}

function ChatContainerRoot({ children, className, ...props }) {
  const scrollRef = useRef(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const userScrolledUp = useRef(false)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      userScrolledUp.current = false
      setIsAtBottom(true)
    }
  }, [])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setIsAtBottom(atBottom)
    if (!atBottom) userScrolledUp.current = true
    else userScrolledUp.current = false
  }, [])

  // Auto-scroll when content changes (if user hasn't scrolled up)
  useEffect(() => {
    if (!userScrolledUp.current && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
      })
    }
  })

  return (
    <ScrollContext.Provider value={{ isAtBottom, scrollToBottom }}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn("overflow-y-auto", className)}
        role="log"
        {...props}
      >
        {children}
      </div>
    </ScrollContext.Provider>
  )
}

function ChatContainerContent({ children, className, ...props }) {
  return (
    <div
      className={cn("flex w-full flex-col", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function ChatContainerScrollAnchor({ className, ...props }) {
  return (
    <div
      className={cn("h-px w-full shrink-0", className)}
      aria-hidden="true"
      {...props}
    />
  )
}

export { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor, useStickToBottomContext }
