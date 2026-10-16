import * as React from "react"

/**
 * A single highlight pill that glides between the items of a menu / select as the pointer or the
 * keyboard moves. Drop it as the FIRST child of a popup (the popup must be `position: relative`, see
 * `.ov-popup` in workbench.css). It follows Base UI's own `data-highlighted` attribute (plus focus),
 * so it needs no per-item wiring and works for hover, arrow keys and typeahead alike.
 *
 * Items stay transparent and only change text colour; the pill is the fill. Positions come from
 * offsetTop/offsetLeft (layout space) so the enter scale animation of the popup does not skew it.
 * Reduced motion: workbench.css removes the transition, the pill simply jumps.
 */
const ITEM = "[role='menuitem'],[role='menuitemradio'],[role='menuitemcheckbox'],[role='option']"

function layoutPos(el, root) {
  let x = 0
  let y = 0
  let n = el
  while (n && n !== root) {
    x += n.offsetLeft
    y += n.offsetTop
    n = n.offsetParent
  }
  return { x, y }
}

export function HighlightPill() {
  const ref = React.useRef(null)

  React.useEffect(() => {
    const pill = ref.current
    const root = pill?.parentElement
    if (!pill || !root) return undefined
    let raf = 0

    const hide = () => {
      pill.dataset.show = "false"
    }
    const place = (item) => {
      if (!item || (item.hasAttribute("data-disabled") && item.getAttribute("data-disabled") !== "false") || item.getAttribute("aria-disabled") === "true") {
        hide()
        return
      }
      const { x, y } = layoutPos(item, root)
      const first = pill.dataset.show !== "true"
      if (first) pill.style.transition = "none"
      pill.style.width = `${item.offsetWidth}px`
      pill.style.height = `${item.offsetHeight}px`
      pill.style.transform = `translate(${x}px, ${y}px)`
      pill.dataset.tone = item.getAttribute("data-variant") === "destructive" ? "destructive" : ""
      if (first) {
        void pill.offsetWidth // commit the jump before transitions come back on
        pill.style.transition = ""
      }
      pill.dataset.show = "true"
    }
    const sync = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const active = document.activeElement
        const item =
          root.querySelector("[data-highlighted]") ||
          (active && root.contains(active) ? active.closest(ITEM) : null)
        place(item)
      })
    }

    const mo = new MutationObserver(sync)
    mo.observe(root, { attributes: true, attributeFilter: ["data-highlighted"], subtree: true })
    root.addEventListener("focusin", sync)
    root.addEventListener("focusout", sync)
    root.addEventListener("pointerleave", sync)
    sync()
    return () => {
      cancelAnimationFrame(raf)
      mo.disconnect()
      root.removeEventListener("focusin", sync)
      root.removeEventListener("focusout", sync)
      root.removeEventListener("pointerleave", sync)
    }
  }, [])

  return <span ref={ref} aria-hidden="true" data-slot="highlight-pill" data-show="false" className="ov-pill" />
}
