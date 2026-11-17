import {Check, Copy} from 'lucide-react';
import React, {memo, useMemo, useState} from 'react';
import {cn} from '../lib/utils';

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock = memo(function CodeBlock({language, code}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
        <span className="font-mono">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
});

function renderInline(text: string): React.ReactNode[] {
  // Handle **bold** and `inline code` safely without innerHTML
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={i}
          className="rounded bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 text-[13px] font-mono text-[#4f6bff] dark:text-[#06b6d4]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

export const MarkdownView = memo(function MarkdownView({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const segments = useMemo(() => {
    const parsed: Array<{type: 'text' | 'code'; content: string; lang?: string}> =
      [];
    const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = fenceRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parsed.push({
          type: 'text',
          content: content.slice(lastIndex, match.index),
        });
      }
      parsed.push({
        type: 'code',
        lang: match[1] || 'text',
        content: match[2].replace(/\n$/, ''),
      });
      lastIndex = fenceRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parsed.push({type: 'text', content: content.slice(lastIndex)});
    }
    return parsed;
  }, [content]);

  return (
    <div className={cn('space-y-2.5 text-[15px] leading-relaxed', className)}>
      {segments.map((seg, idx) => {
        if (seg.type === 'code') {
          return (
            <CodeBlock
              key={idx}
              language={seg.lang || 'text'}
              code={seg.content}
            />
          );
        }

        const lines = seg.content.split('\n');
        return (
          <div key={idx} className="space-y-1.5">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1" />;

              if (trimmed.startsWith('### ')) {
                return (
                  <h3
                    key={lIdx}
                    className="font-display text-base font-semibold text-slate-900 dark:text-white pt-2"
                  >
                    {renderInline(trimmed.slice(4))}
                  </h3>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h2
                    key={lIdx}
                    className="font-display text-lg font-semibold text-slate-900 dark:text-white pt-2"
                  >
                    {renderInline(trimmed.slice(3))}
                  </h2>
                );
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h1
                    key={lIdx}
                    className="font-display text-xl font-bold text-slate-900 dark:text-white pt-2"
                  >
                    {renderInline(trimmed.slice(2))}
                  </h1>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#4f6bff] shrink-0" />
                    <span className="flex-1">{renderInline(trimmed.slice(2))}</span>
                  </div>
                );
              }
              if (/^\d+\.\s/.test(trimmed)) {
                const dotIdx = trimmed.indexOf('.');
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-1">
                    <span className="font-mono text-xs text-[#4f6bff] mt-1 shrink-0">
                      {trimmed.slice(0, dotIdx + 1)}
                    </span>
                    <span className="flex-1">
                      {renderInline(trimmed.slice(dotIdx + 2))}
                    </span>
                  </div>
                );
              }

              return <p key={lIdx}>{renderInline(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
});
