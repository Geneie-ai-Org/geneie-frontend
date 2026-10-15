import React, { useEffect, useState, useCallback } from 'react';
import { codeToHtml } from 'shiki';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Code block: shiki highlighting in a flat hairline surface. A slim header carries the language
 * and an always-visible copy button; the body scrolls horizontally and never wraps.
 *
 * Highlighting is emitted for BOTH themes (`--shiki-light` / `--shiki-dark` custom properties)
 * and the active one is picked in CSS (`.chat-code`, App.css), so the block follows the app theme
 * without re-highlighting. Passing an explicit `theme` still pins a single shiki theme.
 */
export function CodeBlock({ code, language = 'plaintext', theme, className }) {
  const codeText = Array.isArray(code) ? code.join('') : String(code ?? '');
  const [highlightedHtml, setHighlightedHtml] = useState(null);
  const [copied, setCopied] = useState(false);

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
            : { lang: language, themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false }
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

  const handleCopy = useCallback(() => {
    if (navigator.clipboard && codeText) {
      navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [codeText]);

  return (
    <div
      className={cn(
        'chat-code not-prose my-3 w-full overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface-sunken)]',
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pl-3 pr-1 h-8">
        <span className="font-mono text-[11px] leading-none text-[var(--text-tertiary)]">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : `Copy ${language} code`}
          className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:px-3"
        >
          {copied ? (
            <Check className="size-3.5" style={{ color: 'var(--success)' }} aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {highlightedHtml ? (
        <div className="chat-code-body" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      ) : (
        <div className="chat-code-body">
          <pre>
            <code>{codeText}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
