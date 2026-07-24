"use client";

import React, { useState, useCallback } from "react";
import { exportCitations, PaperItem } from "@/lib/api";

interface LiteratureDraftProps {
  papers: PaperItem[];
}

// Render the LLM output: convert ## headers → styled sections, clean up asterisks
function renderMarkdownReview(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ## Section header
    if (line.startsWith("## ")) {
      nodes.push(
        <h3
          key={key++}
          className="text-lg font-bold text-blue-400 mt-8 mb-3 pb-2 border-b border-slate-700/60"
        >
          {line.replace(/^## /, "")}
        </h3>
      );
    }
    // ### Sub-header
    else if (line.startsWith("### ")) {
      nodes.push(
        <h4 key={key++} className="text-base font-semibold text-slate-200 mt-5 mb-2">
          {line.replace(/^### /, "")}
        </h4>
      );
    }
    // Numbered reference line e.g. [1] Authors...
    else if (/^\[\d+\]/.test(line.trim()) && line.trim().length > 0) {
      nodes.push(
        <p key={key++} className="text-sm text-slate-400 font-mono leading-relaxed pl-4 border-l-2 border-slate-700 my-1">
          {line.trim()}
        </p>
      );
    }
    // Non-empty text line → paragraph
    else if (line.trim().length > 0) {
      // Strip any leftover asterisk formatting (* or **)
      const clean = line
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1");
      nodes.push(
        <p key={key++} className="text-sm text-slate-300 leading-7 mb-3">
          {clean}
        </p>
      );
    }
    // Empty line → spacer (only if not after a header)
    else {
      nodes.push(<div key={key++} className="h-1" />);
    }
  }

  return nodes;
}

const FORMAT_OPTIONS = [
  { value: "bibtex", label: "BibTeX", icon: "📚" },
  { value: "apa", label: "APA", icon: "📄" },
  { value: "ieee", label: "IEEE", icon: "🔬" },
  { value: "mla", label: "MLA", icon: "📝" },
];

export default function LiteratureDraft({ papers }: LiteratureDraftProps) {
  const [topic, setTopic] = useState("Agentic RAG & Knowledge Synthesis");
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [citationOutput, setCitationOutput] = useState<string | null>(null);
  const [citationFormat, setCitationFormat] = useState("bibtex");
  const [copied, setCopied] = useState(false);

  const completedPapers = papers.filter((p) => p.status === "done");

  const handleGenerateReview = async () => {
    if (!topic.trim() || completedPapers.length === 0) return;
    setGenerating(true);
    setReviewContent(null);
    setCitationOutput(null);

    try {
      const res = await fetch(
        `http://localhost:8000/api/chat?query=${encodeURIComponent(
          `Generate a structured literature review survey draft on the topic: ${topic}`
        )}`,
        { method: "POST" }
      );
      const data = await res.json();
      setReviewContent(data.response);

      // Fetch citations in selected format
      const bib = await exportCitations(
        completedPapers.map((p) => p.id),
        citationFormat
      );
      setCitationOutput(bib.content);
    } catch (e: any) {
      setReviewContent(`Error generating literature review: ${e.message || e}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = useCallback(() => {
    if (!citationOutput) return;
    navigator.clipboard.writeText(citationOutput).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [citationOutput]);

  // Empty state
  if (completedPapers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
        <div className="text-6xl">📝</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Literature Review Generator</h2>
          <p className="text-slate-400 max-w-md">
            No papers ready yet. First go to <span className="text-blue-400 font-semibold">Paper Discovery</span>,
            search for a topic, and click <span className="text-emerald-400 font-semibold">+ Add to OS</span> on papers
            you want to include. Once they finish processing, come back here to generate your review.
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-5 max-w-sm text-left space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">How it works</p>
          <div className="space-y-2 text-sm text-slate-300">
            <div className="flex gap-3"><span className="text-blue-400 font-bold">1.</span><span>Search arXiv for papers on your topic</span></div>
            <div className="flex gap-3"><span className="text-blue-400 font-bold">2.</span><span>Add papers to your OS library</span></div>
            <div className="flex gap-3"><span className="text-blue-400 font-bold">3.</span><span>Wait for them to finish indexing (status: done)</span></div>
            <div className="flex gap-3"><span className="text-blue-400 font-bold">4.</span><span>Enter a topic and click Generate Review</span></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100">📝 Structured Literature Review Generator</h2>
          <p className="text-xs text-slate-400 mt-1">
            Generates a full academic-style survey — Introduction, Background, Methods, Gaps & Future Directions —
            synthesized across your {completedPapers.length} ingested paper{completedPapers.length !== 1 ? "s" : ""}.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Review topic (e.g. GraphRAG vs Agentic RAG)"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60"
          />

          {/* Citation Format Picker */}
          <div className="flex gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
            {FORMAT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setCitationFormat(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  citationFormat === f.value
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleGenerateReview}
            disabled={generating || !topic.trim()}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium text-sm shadow-lg shadow-blue-600/20 whitespace-nowrap disabled:opacity-50 transition-all"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Drafting Survey...
              </span>
            ) : (
              "⚡ Generate Review"
            )}
          </button>
        </div>
      </div>

      {/* Review Output */}
      {reviewContent && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          {/* Draft Header */}
          <div className="px-8 pt-8 pb-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-blue-400">Survey Draft: {topic}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Synthesized from {completedPapers.length} paper{completedPapers.length !== 1 ? "s" : ""} ·
                AI-generated academic draft — always verify claims
              </p>
            </div>
            <span className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              ✓ Draft Ready
            </span>
          </div>

          {/* Rendered Review Body */}
          <div className="px-8 py-6 max-w-4xl">
            {renderMarkdownReview(reviewContent)}
          </div>

          {/* Citation Export Block */}
          {citationOutput && (
            <div className="mx-8 mb-8 rounded-2xl border border-slate-700/60 overflow-hidden">
              <div className="flex items-center justify-between bg-slate-900/80 px-5 py-3 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-300">
                    📚 References — {FORMAT_OPTIONS.find(f => f.value === citationFormat)?.label} Format
                  </span>
                  <span className="text-xs text-slate-500">
                    ({completedPapers.length} paper{completedPapers.length !== 1 ? "s" : ""})
                  </span>
                </div>
                <button
                  onClick={handleCopy}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    copied
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {copied ? "✓ Copied!" : "Copy All"}
                </button>
              </div>
              <pre className="p-5 text-xs font-mono text-slate-300 overflow-x-auto bg-slate-950/60 leading-relaxed custom-scrollbar whitespace-pre-wrap">
                {citationOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
