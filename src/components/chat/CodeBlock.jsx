import React, { useEffect, useState, useCallback } from 'react';
import { codeToHtml } from 'shiki';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Code block: shiki highlighting on a light gray rounded card. A slim header carries the tiny
 * language label and an always-visible copy icon; the body scrolls horizontally and never wraps.
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
    <div className={cn('chat-code not-prose my-3 w-full overflow-hidden', className)}>
      <div className="flex h-8 items-center justify-between pl-4 pr-1.5 pt-1">
        <span className="font-mono text-[11px] leading-none text-[var(--text-tertiary)]">{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : `Copy ${language} code`}
          title={copied ? 'Copied' : 'Copy'}
          className="inline-flex size-6 items-center justify-center rounded-md text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] [@media(pointer:coarse)]:size-9"
        >
          {copied ? (
            <Check className="size-3.5" style={{ color: 'var(--success)' }} aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
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
