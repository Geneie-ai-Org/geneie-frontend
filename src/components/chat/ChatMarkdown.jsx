import { cn } from '@/lib/utils';
import { marked } from 'marked';
import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { CodeBlock } from './CodeBlock';

function parseMarkdownIntoBlocks(markdown) {
  if (!markdown || typeof markdown !== 'string') return [];
  const tokens = marked.lexer(markdown);
  return tokens.map((token) => token.raw);
}

function extractLanguage(className) {
  if (!className) return 'plaintext';
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : 'plaintext';
}

const NUMERIC = /^[+\-−]?\$?\d[\d,]*(\.\d+)?(e[+-]?\d+)?\s*%?$/i;

/** Marks columns whose body cells are all numbers, so CSS can right-align them (like a data table). */
function markNumericColumns(table) {
  const rows = [...table.querySelectorAll('tr')];
  const body = rows.filter((tr) => tr.querySelector('td'));
  if (!body.length) return;
  const cols = Math.max(...rows.map((tr) => tr.children.length));
  for (let c = 0; c < cols; c += 1) {
    const numeric = body.every((tr) => {
      const t = tr.children[c]?.textContent.trim();
      return !t || NUMERIC.test(t);
    }) && body.some((tr) => tr.children[c]?.textContent.trim());
    rows.forEach((tr) => {
      const cell = tr.children[c];
      if (!cell) return;
      if (numeric) cell.setAttribute('data-num', '');
      else cell.removeAttribute('data-num');
    });
  }
}

/**
 * Tables scroll inside their own box (both axes, header sticky) and carry a copy button that
 * puts the table on the clipboard as tab-separated text, ready for a spreadsheet.
 */
function ChatTable({ node, children, ...props }) {
  const tableRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useLayoutEffect(() => {
    if (tableRef.current) markNumericColumns(tableRef.current);
  });

  const copy = useCallback(() => {
    const rows = tableRef.current?.querySelectorAll('tr');
    if (!rows || !navigator.clipboard) return;
    const tsv = [...rows]
      .map((tr) => [...tr.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join('\t'))
      .join('\n');
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, []);

  return (
    <div className="chat-table-wrap">
      <button type="button" className="chat-table-copy" onClick={copy} aria-label={copied ? 'Copied' : 'Copy table'}>
        {copied ? <Check className="size-3.5" style={{ color: 'var(--success)' }} aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <div className="chat-table-scroll chat-focus-inset" tabIndex={0} role="region" aria-label="Table, scrollable">
        <table ref={tableRef} {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

const INITIAL_COMPONENTS = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <code className={cn('chat-inline-code', className)} {...props}>
          {children}
        </code>
      );
    }

    const language = extractLanguage(className);

    return <CodeBlock code={children} language={language} />;
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>;
  },
  table: ChatTable,
  // Links in an answer open in a new tab, so following a source never drops the conversation.
  a: function LinkComponent({ node, href, children, ...props }) {
    const external = typeof href === 'string' && /^https?:\/\//i.test(href);
    return (
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...props}>
        {children}
        {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
      </a>
    );
  },
};

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({ content, components = INITIAL_COMPONENTS }) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {content}
      </ReactMarkdown>
    );
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content;
  }
);

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock';

/**
 * `streaming` marks the answer as still arriving: a fixed-size caret is drawn after the last
 * rendered element in CSS (`.chat-prose[data-streaming]`), so it adds no layout of its own.
 */
function MarkdownComponent({ children, id, className, components, streaming = false }) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);

  const mergedComponents = useMemo(
    () => ({ ...INITIAL_COMPONENTS, ...components }),
    [components]
  );

  return (
    <div className={cn('chat-prose', className)} data-streaming={streaming ? 'true' : undefined}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={mergedComponents}
        />
      ))}
    </div>
  );
}

const Markdown = memo(MarkdownComponent);
Markdown.displayName = 'Markdown';

export { Markdown, INITIAL_COMPONENTS };
