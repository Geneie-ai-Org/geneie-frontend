import { cn } from '@/lib/utils';
import { marked } from 'marked';
import { memo, useId, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
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

// SECURITY (S-021, 17 Oct 2026 fix): model answers render text we don't control (literature
// chunks, file headers, INFO values, URL-imported files); react-markdown's default URL transform
// allows https:, so an image URL in that text used to render a live <img> AND emit a
// <link rel="preload" as="image"> hint that fetches the URL even if the <img> itself never paints.
// Blocked entirely -- no CSP exists yet to rely on instead (S-071). Build-time kill switch
// VITE_SECURITY_ALLOW_MARKDOWN_IMAGES (unset = blocked, matching the spec's convention of
// defaulting to the fixed/safe behaviour). The key is omitted entirely rather than set to
// `undefined` when images are allowed -- react-markdown throws if a components key is explicitly
// undefined instead of simply absent.
const MARKDOWN_IMAGES_ALLOWED = import.meta.env.VITE_SECURITY_ALLOW_MARKDOWN_IMAGES === 'true';

const INITIAL_COMPONENTS = {
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line;

    if (isInline) {
      return (
        <span
          className={cn('rounded-sm px-1 font-mono text-sm', className)}
          style={{ backgroundColor: 'var(--code-inline-bg)', color: 'var(--code-inline)' }}
          {...props}
        >
          {children}
        </span>
      );
    }

    const language = extractLanguage(className);

    return <CodeBlock code={children} language={language} />;
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>;
  },
  ...(MARKDOWN_IMAGES_ALLOWED ? {} : { img: () => null }),
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

function MarkdownComponent({ children, id, className, components }) {
  const generatedId = useId();
  const blockId = id ?? generatedId;
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children]);

  const mergedComponents = useMemo(
    () => ({ ...INITIAL_COMPONENTS, ...components }),
    [components]
  );

  return (
    <div className={cn('chat-prose', className)}>
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
