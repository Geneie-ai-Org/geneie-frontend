import React, { useEffect, useState, useCallback, useRef } from 'react';
import { codeToHtml } from 'shiki';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Code block: shiki highlighting on a light gray rounded card. A slim header carries the tiny
 * language label and an always-visible copy icon; the body scrolls horizontally and never wraps.
 *
 * The high-contrast pair is used because every token color then holds 4.5:1 on the card's gray
 * (the standard pair's comment gray does not). Highlighting is emitted for BOTH themes (`--shiki-light` / `--shiki-dark` custom properties)
 * and the active one is picked in CSS (`.chat-code`, App.css), so the block follows the app theme
 * without re-highlighting. Passing an explicit `theme` still pins a single shiki theme.
 */
export function CodeBlock({ code, language = 'plaintext', theme, className }) {
  const codeText = Array.isArray(code) ? code.join('') : String(code ?? '');
  const [highlightedHtml, setHighlightedHtml] = useState(null);
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  const [scrollable, setScrollable] = useState(false);
  const label = !language || language === 'plaintext' ? 'text' : language;

  useEffect(() => {
    let active = true;
    async function highlight() {
      if (!codeText) {
        if (active) setHighlightedHtml(null);
        return;
      }
      try {
        const html = await codeToHtml(
          codeText,
          theme
            ? { lang: language, theme }
            : { lang: language, themes: { light: 'github-light-high-contrast', dark: 'github-dark-high-contrast' }, defaultColor: false }
        );
        if (active) setHighlightedHtml(html);
      } catch {
        if (active) setHighlightedHtml(null);
      }
    }
    highlight();
    return () => {
      active = false;
    };
  }, [codeText, language, theme]);

  // A region that scrolls sideways must be reachable by keyboard; one that does not stays out of the tab order.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [highlightedHtml, codeText]);

  const handleCopy = useCallback(() => {
    if (navigator.clipboard && codeText) {
      navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [codeText]);

  const scrollProps = scrollable
    ? { tabIndex: 0, role: 'region', 'aria-label': `${label} code, scrollable` }
    : {};

  return (
    <div className={cn('chat-code not-prose my-3 w-full overflow-hidden', className)}>
      <div className="flex h-8 items-center justify-between pl-4 pr-1.5 pt-1">
        <span className="font-mono text-xs leading-none text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : label === 'text' ? 'Copy code' : `Copy ${label} code`}
          title={copied ? 'Copied' : 'Copy'}
          className="chat-focus inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] active:scale-[.98] motion-reduce:transition-none [@media(pointer:coarse)]:size-11"
        >
          {copied ? (
            <Check className="size-3.5" style={{ color: 'var(--success)' }} aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
        </button>
        <span role="status" className="sr-only">{copied ? 'Code copied' : ''}</span>
      </div>

      {highlightedHtml ? (
        <div ref={bodyRef} className="chat-code-body chat-focus-inset" {...scrollProps} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      ) : (
        <div ref={bodyRef} className="chat-code-body chat-focus-inset" {...scrollProps}>
          <pre>
            <code>{codeText}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
