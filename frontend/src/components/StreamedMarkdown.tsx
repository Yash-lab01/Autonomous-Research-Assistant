"use client";

import React, { useState, useEffect, useRef } from "react";
import MarkdownRenderer from "./MarkdownRenderer";

interface StreamedMarkdownProps {
  content: string;
  isGenerating?: boolean;
  className?: string;
  onComplete?: () => void;
  speedMs?: number; // interval between tick in ms
}

/**
 * Continuous typing / streaming Markdown renderer.
 * Automatically streams text token-by-token or char-by-char at a natural, fluid pace,
 * complete with an active typing caret while generating.
 */
export default function StreamedMarkdown({
  content,
  isGenerating = false,
  className = "",
  onComplete,
  speedMs = 12,
}: StreamedMarkdownProps) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const targetTextRef = useRef(content);
  targetTextRef.current = content;

  // Reset or adjust if content changes significantly
  useEffect(() => {
    if (!content) {
      setDisplayedLength(0);
      return;
    }

    // If starting fresh
    if (displayedLength === 0) {
      // Start streaming
      setDisplayedLength(1);
    }
  }, [content]);

  useEffect(() => {
    if (!content) return;

    // If already fully displayed, check if complete callback needed
    if (displayedLength >= content.length) {
      if (!isGenerating && onComplete) {
        onComplete();
      }
      return;
    }

    const interval = setInterval(() => {
      setDisplayedLength((current) => {
        if (current >= targetTextRef.current.length) {
          clearInterval(interval);
          return current;
        }

        // Dynamically scale step size so longer responses stream swiftly
        const remaining = targetTextRef.current.length - current;
        const step = remaining > 1500 ? 12 : remaining > 500 ? 6 : remaining > 100 ? 3 : 1;
        const next = Math.min(current + step, targetTextRef.current.length);

        if (next >= targetTextRef.current.length && onComplete) {
          onComplete();
        }

        return next;
      });
    }, speedMs);

    return () => clearInterval(interval);
  }, [content, displayedLength, isGenerating, onComplete, speedMs]);

  const displayedContent = content.slice(0, displayedLength);
  const isTyping = isGenerating || displayedLength < content.length;

  return (
    <div className={`relative ${className}`}>
      <MarkdownRenderer content={displayedContent} />
      {isTyping && (
        <span className="inline-block w-2 h-4 bg-emerald-400/90 ml-1 translate-y-0.5 animate-pulse rounded-sm" />
      )}
    </div>
  );
}
