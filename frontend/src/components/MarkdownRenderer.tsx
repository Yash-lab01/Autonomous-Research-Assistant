"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Shared markdown + math renderer used across Chat, Literature Review, and Comparison.
 * - Tables: rendered as styled HTML tables
 * - Math: inline $...$ and block $$...$$ rendered via KaTeX
 * - Bold/italic/headers: standard markdown
 * - [TABLE] and [MATH] prefixes from the PDF parser are stripped before rendering
 */
export default function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  // Strip parser prefixes — the content itself is already valid markdown/LaTeX
  const cleaned = content
    .replace(/^\[TABLE\]\s*/gm, "")
    .replace(/^\[MATH\]\s*/gm, "");

  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Tables — styled to match the dark theme
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse text-slate-200" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-slate-800/80 text-slate-300 font-semibold" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-3 py-2 border border-slate-700 text-left whitespace-nowrap" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-3 py-2 border border-slate-800 align-top" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="even:bg-slate-900/40 hover:bg-slate-800/30 transition-colors" {...props} />
          ),
          // Code blocks
          code: ({ node, className: cls, children, ...props }: any) => {
            const isBlock = cls?.includes("language-");
            return isBlock ? (
              <pre className="my-3 p-3 rounded-lg bg-slate-950 border border-slate-800 overflow-x-auto text-xs font-mono text-slate-300">
                <code {...props}>{children}</code>
              </pre>
            ) : (
              <code className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 text-xs font-mono" {...props}>
                {children}
              </code>
            );
          },
          // Headings
          h1: ({ node, ...props }) => <h1 className="text-base font-bold text-slate-100 mt-4 mb-2" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-sm font-bold text-slate-200 mt-3 mb-1.5" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xs font-bold text-slate-300 mt-2 mb-1" {...props} />,
          // Lists
          ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 my-2 text-slate-300" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 my-2 text-slate-300" {...props} />,
          li: ({ node, ...props }) => <li className="text-xs leading-relaxed" {...props} />,
          // Paragraphs
          p: ({ node, ...props }) => <p className="my-1.5 leading-relaxed text-slate-200" {...props} />,
          // Bold / italic
          strong: ({ node, ...props }) => <strong className="font-semibold text-slate-100" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-slate-300" {...props} />,
          // Block quotes
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-2 border-blue-500/50 pl-3 my-2 text-slate-400 italic text-xs" {...props} />
          ),
          // Horizontal rules
          hr: ({ node, ...props }) => <hr className="border-slate-800 my-3" {...props} />,
        }}
      >
        {cleaned}
      </ReactMarkdown>
    </div>
  );
}
