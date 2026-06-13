import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, Copy, RotateCw } from 'lucide-react';
import { MessageContent } from '../prompt-kit/message';
import { Markdown } from '../prompt-kit/markdown';
import { Source, SourceTrigger, SourceContent } from '../prompt-kit/source';

export const GlobalTypingStyles = () => (
  <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .animate-blink { animation: blink 0.7s step-end infinite; }
    `}</style>
);

const TypingText = React.memo(({ text, speed = 30, className, startDelay = 0 }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      if (index < text.length) {
        const charTimeout = setTimeout(() => {
          setDisplayedText((prev) => prev + text[index]);
          setIndex((prev) => prev + 1);
        }, speed);
        return () => clearTimeout(charTimeout);
      } else {
        setIsTyping(false);
      }
    }, index === text.length ? startDelay : speed);

    return () => clearTimeout(startTimeout);
  }, [text, speed, index, startDelay]);

  const isCursorVisible = isTyping || index === text.length;

  return (
    <span className={className}>
      {displayedText}
      {isCursorVisible && <span className="animate-blink" style={{ color: 'var(--text-tertiary)' }}>.</span>}
    </span>
  );
});

const MarkdownWithReferences = React.memo(({ content, placeholders, scrollToSource }) => {
  const containerRef = useRef(null);

  const processTextNode = (text) => {
    if (typeof text !== 'string') return text;

    if (!text.includes('{{REF_')) return text;

    const parts = [];
    let lastIndex = 0;
    const placeholderPattern = /\{\{REF_(\d+)\}\}/g;
    let match;

    while ((match = placeholderPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }
      const placeholderKey = match[0];
      const refInfo = placeholders.get(placeholderKey);
      if (refInfo) {
        parts.push(
          <button
            key={`ref-btn-${match.index}-${refInfo.number}`}
            onClick={(e) => {
              e.preventDefault();
              scrollToSource(refInfo.index);
            }}
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 mx-0.5 text-xs font-semibold border rounded hover:bg-white/10 transition-colors cursor-pointer align-middle"
            style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--accent-teal)', borderColor: 'var(--border-default)' }}
            onMouseEnter={(e) => { e.target.style.color = 'var(--accent-teal-hover)'; }}
            onMouseLeave={(e) => { e.target.style.color = 'var(--accent-teal)'; }}
            title={`Click to view source ${refInfo.number}`}
          >
            {refInfo.number}
          </button>
        );
      } else {
        console.warn('Placeholder not found in map:', placeholderKey);
        parts.push(match[0]);
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 1 ? <>{parts}</> : text;
  };

  const processNode = (node) => {
    if (typeof node === 'string') {
      return processTextNode(node);
    }
    if (Array.isArray(node)) {
      return node.map((child, idx) => (
        <React.Fragment key={idx}>{processNode(child)}</React.Fragment>
      ));
    }
    if (React.isValidElement(node)) {
      if (node.props && node.props.children) {
        return React.cloneElement(node, {
          ...node.props,
          children: processNode(node.props.children),
        });
      }
      return node;
    }
    return node;
  };

  const createProcessedComponent = (Tag, className = '') => {
    return ({ node, children, ...props }) => {
      const processedChildren = processNode(children);
      return <Tag className={className} {...props}>{processedChildren}</Tag>;
    };
  };

  useEffect(() => {
    if (containerRef.current && placeholders.size > 0) {
      const walker = document.createTreeWalker(
        containerRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes = [];
      let node = walker.nextNode();
      while (node) {
        if (node.textContent && node.textContent.includes('{{REF_')) {
          textNodes.push(node);
        }
        node = walker.nextNode();
      }

      textNodes.forEach((textNode) => {
        const text = textNode.textContent;
        const placeholderPattern = /\{\{REF_(\d+)\}\}/g;
        let match;
        const fragments = [];
        let lastIndex = 0;

        while ((match = placeholderPattern.exec(text)) !== null) {
          if (match.index > lastIndex) {
            fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
          }

          const placeholderKey = match[0];
          const refInfo = placeholders.get(placeholderKey);
          if (refInfo) {
            const button = document.createElement('button');
            button.textContent = refInfo.number;
            button.className = 'inline-flex items-center justify-center min-w-[20px] h-5 px-1 mx-0.5 text-xs font-semibold border rounded hover:bg-white/10 transition-colors cursor-pointer align-middle';
            button.style.backgroundColor = 'var(--bg-surface)';
            button.style.color = 'var(--accent-teal)';
            button.style.borderColor = 'var(--border-default)';
            button.addEventListener('mouseenter', () => { button.style.color = 'var(--accent-teal-hover)'; });
            button.addEventListener('mouseleave', () => { button.style.color = 'var(--accent-teal)'; });
            button.title = `Click to view source ${refInfo.number}`;
            button.onclick = (e) => {
              e.preventDefault();
              scrollToSource(refInfo.index);
            };
            fragments.push(button);
          }
          lastIndex = match.index + match[0].length;
        }

        if (fragments.length > 0) {
          if (lastIndex < text.length) {
            fragments.push(document.createTextNode(text.substring(lastIndex)));
          }
          const parent = textNode.parentNode;
          fragments.forEach((fragment) => parent.insertBefore(fragment, textNode));
          parent.removeChild(textNode);
        }
      });
    }
  }, [content, placeholders, scrollToSource]);

  return (
    <div ref={containerRef}>
      <Markdown
        components={{
          p: createProcessedComponent('p', 'break-words overflow-wrap-anywhere'),
          strong: createProcessedComponent('strong', 'font-bold'),
          em: createProcessedComponent('em'),
          li: createProcessedComponent('li'),
          span: createProcessedComponent('span'),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border text-sm" style={{ borderColor: 'var(--border-default)' }} {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead style={{ backgroundColor: 'var(--bg-app)' }} {...props} />,
          tbody: ({ node, ...props }) => <tbody {...props} />,
          tr: ({ node, ...props }) => <tr className="border-b hover:bg-white/5" style={{ borderColor: 'var(--border-subtle)' }} {...props} />,
          th: ({ node, ...props }) => <th className="border px-3 py-2 text-left font-semibold" style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} {...props} />,
          td: ({ node, ...props }) => <td className="border px-3 py-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} {...props} />,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
});

const ChatMessage = React.memo(({ role, text, sources, showRegenerate, onRegenerate, regenerateDisabled }) => {
  const isUser = role === 'user';
  const messageRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const scrollToSource = (index) => {
    if (messageRef.current) {
      const sourceElement = messageRef.current.querySelector(`[data-source-index="${index}"]`);
      if (sourceElement) {
        sourceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sourceElement.classList.add('bg-white/5', 'border-white/20');
        setTimeout(() => {
          sourceElement.classList.remove('bg-white/5', 'border-white/20');
        }, 2000);
      }
    }
  };

  const handleCopy = () => {
    if (navigator.clipboard && text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const processedText = React.useMemo(() => {
    if (!text || !sources || sources.length === 0) return { type: 'markdown', content: text };
    const referencePattern = /\[(\d+)\]/g;
    let processedContent = text;
    const placeholderMap = new Map();
    let placeholderIndex = 0;
    let match;
    while ((match = referencePattern.exec(text)) !== null) {
      const refIndex = parseInt(match[1], 10);
      if (refIndex > 0 && refIndex <= sources.length) {
        const placeholder = `{{REF_${placeholderIndex}}}`;
        placeholderMap.set(placeholder, { index: refIndex - 1, number: refIndex });
        processedContent = processedContent.replace(match[0], placeholder);
        placeholderIndex++;
      }
    }
    if (placeholderMap.size === 0) return { type: 'markdown', content: text };
    return { type: 'withRefs', content: processedContent, placeholders: placeholderMap };
  }, [text, sources]);

  const markdownComponents = {
    table: ({ node, ...props }) => (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse border text-sm" style={{ borderColor: 'var(--border-default)' }} {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => <thead style={{ backgroundColor: 'var(--bg-app)' }} {...props} />,
    tbody: ({ node, ...props }) => <tbody {...props} />,
    tr: ({ node, ...props }) => <tr className="border-b hover:bg-white/5" style={{ borderColor: 'var(--border-subtle)' }} {...props} />,
    th: ({ node, ...props }) => <th className="border px-3 py-2 text-left font-semibold" style={{ borderColor: 'var(--border-default)', color: 'var(--text-primary)' }} {...props} />,
    td: ({ node, ...props }) => <td className="border px-3 py-2" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }} {...props} />,
  };

  if (isUser) {
    return (
      <div className="flex w-full justify-end" ref={messageRef}>
        <div
          className="max-w-[75%] px-4 py-2.5 rounded-3xl text-sm"
          style={{
            backgroundColor: 'var(--bg-surface-raised)',
            color: 'var(--text-primary)',
            wordBreak: 'break-word',
            lineHeight: 1.6,
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex w-full gap-3" ref={messageRef}>
      <div className="flex-1 min-w-0">
        <MessageContent className="text-sm bg-transparent p-0 rounded-none break-words overflow-wrap-anywhere">
          {processedText.type === 'withRefs' ? (
            <MarkdownWithReferences
              content={processedText.content}
              placeholders={processedText.placeholders}
              scrollToSource={scrollToSource}
            />
          ) : (
            <Markdown className="break-words" components={markdownComponents}>
              {processedText.content}
            </Markdown>
          )}
        </MessageContent>

        {sources && sources.length > 0 && (
          <div className="mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((source, idx) => (
                <Source key={idx} href={source.url || '#'}>
                  <SourceTrigger
                    data-source-index={idx}
                    showFavicon
                    label={
                      <span className="flex items-center gap-1">
                        <span className="font-bold" style={{ color: 'var(--accent-teal)' }}>{idx + 1}</span>
                        <span className="truncate max-w-[120px]">{source.title || source.url || `Source ${idx + 1}`}</span>
                      </span>
                    }
                  />
                  <SourceContent
                    title={source.title || `Source ${idx + 1}`}
                    description={source.url || ''}
                  />
                </Source>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-0.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            type="button"
            onClick={handleCopy}
            className="chat-chrome-btn-sm"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? <CheckCircle2 style={{ color: 'var(--success)' }} /> : <Copy />}
          </button>
          {showRegenerate && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerateDisabled}
              className="chat-chrome-btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title="Regenerate"
            >
              <RotateCw />
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export default ChatMessage;
