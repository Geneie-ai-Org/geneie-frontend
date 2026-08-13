import React, { useEffect, useState, useCallback } from 'react';
import { codeToHtml } from 'shiki';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Code block product component (moved out of prompt-kit): shiki highlighting
 * inside a shadcn Card with a header row (language Badge + copy Button/Tooltip).
 */
export function CodeBlock({ code, language = 'plaintext', theme = 'github-dark', className }) {
  const codeText = Array.isArray(code) ? code.join('') : String(code ?? '');
  const [highlightedHtml, setHighlightedHtml] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function highlight() {
      if (!codeText) {
        if (active) setHighlightedHtml('<pre><code></code></pre>');
        return;
      }
      try {
        const html = await codeToHtml(codeText, { lang: language, theme });
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
    <Card
      className={cn(
        'not-prose w-full gap-0 py-0 overflow-hidden rounded-xl ring-0 border border-[var(--border-default)]',
        className
      )}
      style={{ backgroundColor: 'var(--bg-surface)' }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border-default)]">
        <Badge variant="secondary" className="font-mono text-2xs normal-case">
          {language}
        </Badge>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 rounded-md"
                  onClick={handleCopy}
                  aria-label={copied ? 'Copied!' : 'Copy code'}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                </Button>
              }
            />
            <TooltipContent>{copied ? 'Copied!' : 'Copy code'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {highlightedHtml ? (
        <div
          className="w-full overflow-x-auto text-xs [&>pre]:px-4 [&>pre]:py-4"
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <div className="w-full overflow-x-auto text-xs">
          <pre className="px-4 py-4">
            <code>{codeText}</code>
          </pre>
        </div>
      )}
    </Card>
  );
}
