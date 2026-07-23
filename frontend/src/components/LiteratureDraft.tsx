"use client";

import React, { useState } from "react";
import { exportCitations, PaperItem } from "@/lib/api";

interface LiteratureDraftProps {
  papers: PaperItem[];
}

export default function LiteratureDraft({ papers }: LiteratureDraftProps) {
  const [topic, setTopic] = useState("Agentic RAG & Knowledge Synthesis");
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [bibtexOutput, setBibtexOutput] = useState<string | null>(null);

  const completedPapers = papers.filter(p => p.status === "done");

  const handleGenerateReview = async () => {
    if (!topic || completedPapers.length === 0) return;
    setGenerating(true);
    setReviewContent(null);

    try {
      const res = await fetch(`http://localhost:8000/api/chat?query=Generate+a+structured+literature+review+survey+draft+for:${encodeURIComponent(topic)}`, {
        method: "POST"
      });
      const data = await res.json();
      setReviewContent(data.response);

      // Also fetch BibTeX
      const bib = await exportCitations(completedPapers.map(p => p.id), "bibtex");
      setBibtexOutput(bib.content);
    } catch (e: any) {
      setReviewContent(`Error generating literature review: ${e.message || e}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Structured Literature Review Generator</h2>
          <p className="text-xs text-slate-400">Synthesizes Introduction, Background, Methods, Gaps & References across ingested papers</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Review topic (e.g. GraphRAG vs Agentic RAG)"
            className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60"
          />
          <button
            onClick={handleGenerateReview}
            disabled={generating || completedPapers.length === 0}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium text-xs shadow-lg shadow-blue-600/20 whitespace-nowrap disabled:opacity-50"
          >
            {generating ? "Drafting Survey..." : "⚡ Generate Review"}
          </button>
        </div>
      </div>

      {reviewContent && (
        <div className="glass-panel rounded-2xl p-8 space-y-6">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-blue-400">Survey Draft: {topic}</h3>
            <span className="text-xs font-mono text-slate-400">Compiled from {completedPapers.length} papers</span>
          </div>

          <div className="prose prose-invert max-w-none text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
            {reviewContent}
          </div>

          {bibtexOutput && (
            <div className="mt-8 pt-6 border-t border-slate-800">
              <h4 className="font-bold text-slate-300 text-sm mb-3">📚 Compiled BibTeX References:</h4>
              <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-blue-300 overflow-x-auto custom-scrollbar">
                {bibtexOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
