"use client";

import React from "react";
import { PaperSearchResult, PaperItem } from "@/lib/api";

interface PaperCardProps {
  paper: PaperSearchResult | PaperItem;
  onIngest?: (paper: PaperSearchResult) => void;
  isIngesting?: boolean;
}

export default function PaperCard({ paper, onIngest, isIngesting }: PaperCardProps) {
  const isIngestedItem = "status" in paper;
  const status = isIngestedItem ? (paper as PaperItem).status : null;
  const failureReason = isIngestedItem ? (paper as PaperItem).failure_reason : null;

  const getStatusBadge = () => {
    if (!status) return null;

    const styles: Record<string, string> = {
      queued: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      downloading: "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse",
      parsing: "bg-purple-500/10 text-purple-400 border-purple-500/30 animate-pulse",
      extracting: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 animate-pulse",
      embedding: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse",
      done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      failed: "bg-rose-500/10 text-rose-400 border-rose-500/30"
    };

    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-mono border capitalize ${styles[status] || "bg-slate-800 text-slate-400"}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="glass-panel rounded-xl p-5 hover:border-blue-500/40 transition-all flex flex-col justify-between gap-4 group">
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {paper.arxiv_id ? `arXiv:${paper.arxiv_id}` : "Local Document"}
          </span>
          {getStatusBadge()}
        </div>

        <h3 className="font-semibold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-2 mb-2">
          {paper.title}
        </h3>

        {paper.authors && paper.authors.length > 0 && (
          <p className="text-xs text-slate-400 mb-3 line-clamp-1">
            👨‍🔬 {paper.authors.join(", ")}
          </p>
        )}

        {paper.summary && (
          <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
            {paper.summary}
          </p>
        )}

        {failureReason && (
          <div className="mt-3 p-2 rounded bg-rose-950/40 border border-rose-800/40 text-xs text-rose-300 font-mono">
            ⚠️ Failure: {failureReason}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
        <span className="text-slate-500 font-mono">
          {paper.published_date || "2026"}
        </span>

        <div className="flex items-center gap-2">
          {paper.pdf_url && (
            <a
              href={paper.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              📄 PDF
            </a>
          )}

          {!isIngestedItem && onIngest && (
            <button
              onClick={() => onIngest(paper as PaperSearchResult)}
              disabled={isIngesting || (paper as PaperSearchResult).already_ingested}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                (paper as PaperSearchResult).already_ingested
                  ? "bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 cursor-default"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
              }`}
            >
              {(paper as PaperSearchResult).already_ingested ? "✓ Ingested" : isIngesting ? "Ingesting..." : "+ Add to OS"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
