"use client";

import React, { useState } from "react";
import { PaperSearchResult, PaperItem, updatePaperNotes } from "@/lib/api";

interface PaperCardProps {
  paper: PaperSearchResult | PaperItem;
  onIngest?: (paper: PaperSearchResult) => void;
  onRemove?: (paperId: string) => void;
  isIngesting?: boolean;
}

export default function PaperCard({ paper, onIngest, onRemove, isIngesting }: PaperCardProps) {
  const isIngestedItem = "status" in paper;
  const status = isIngestedItem ? (paper as PaperItem).status : null;
  const failureReason = isIngestedItem ? (paper as PaperItem).failure_reason : null;
  const paperId = isIngestedItem ? (paper as PaperItem).id : null;
  const initialNotes = isIngestedItem ? (paper as PaperItem).notes || "" : "";
  const initialTags = isIngestedItem ? (paper as PaperItem).tags || [] : [];

  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notesText, setNotesText] = useState(initialNotes);
  const [tagInput, setTagInput] = useState(initialTags.join(", "));
  const [tagsList, setTagsList] = useState<string[]>(initialTags);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const getStatusBadge = () => {
    if (!status) return null;
    const styles: Record<string, string> = {
      queued: "bg-amber-500/10 text-amber-400 border-amber-500/30",
      downloading: "bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse",
      parsing: "bg-purple-500/10 text-purple-400 border-purple-500/30 animate-pulse",
      extracting: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 animate-pulse",
      embedding: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse",
      done: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      failed: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    };
    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-mono border capitalize ${styles[status] || "bg-slate-800 text-slate-400"}`}>
        {status}
      </span>
    );
  };

  const handleRemoveClick = () => {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      setTimeout(() => setConfirmingRemove(false), 3000);
      return;
    }
    if (!paperId || !onRemove) return;
    setRemoving(true);
    onRemove(paperId);
  };

  const handleSaveNotes = async () => {
    if (!paperId) return;
    setSavingNotes(true);
    const parsedTags = tagInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    try {
      await updatePaperNotes(paperId, notesText, parsedTags);
      setTagsList(parsedTags);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
    } catch (err: any) {
      alert(`Error saving notes: ${err.message || err}`);
    } finally {
      setSavingNotes(false);
    }
  };

  return (
    <div className={`glass-panel rounded-xl p-5 hover:border-blue-500/40 transition-all flex flex-col justify-between gap-4 group relative ${removing ? "opacity-40 pointer-events-none" : ""}`}>
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

        {/* Existing Tags Chips */}
        {tagsList.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tagsList.map((tag, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-medium"
              >
                #{tag}
              </span>
            ))}
          </div>
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

        {/* Collapsible Personal Notes & Tags Section */}
        {isIngestedItem && (
          <div className="mt-3 pt-3 border-t border-slate-800/80">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs font-medium text-slate-400 hover:text-blue-400 flex items-center gap-1.5 transition-colors"
            >
              <span>{showNotes ? "▲ Hide Notes & Tags" : "📝 Notes & Tags"}</span>
              {notesText && !showNotes && (
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              )}
            </button>

            {showNotes && (
              <div className="mt-3 space-y-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Personal Researcher Notes
                  </label>
                  <textarea
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    placeholder="Add personal thoughts, key formulas, or takeaways..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/60 resize-none h-16"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="e.g. GraphRAG, Priority, Survey..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500/60"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  {savedSuccess ? (
                    <span className="text-[10px] text-emerald-400 font-semibold">✓ Notes saved!</span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Saved to local DB</span>
                  )}
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all shadow"
                  >
                    {savingNotes ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              </div>
            )}
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

          {isIngestedItem && onRemove && (
            <button
              onClick={handleRemoveClick}
              className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all border ${
                confirmingRemove
                  ? "bg-rose-600 border-rose-500 text-white shadow-lg shadow-rose-600/20"
                  : "bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-rose-950/40 hover:border-rose-800/60 hover:text-rose-400"
              }`}
              title={confirmingRemove ? "Click again to confirm removal" : "Remove from knowledge base"}
            >
              {confirmingRemove ? "⚠️ Confirm Remove" : "🗑 Remove"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
