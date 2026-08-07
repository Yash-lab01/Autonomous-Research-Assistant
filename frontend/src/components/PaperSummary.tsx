"use client";

import React, { useState } from "react";
import { PaperItem, fetchSinglePaperSummary, fetchCombinedSummary, fetchPaperFigures, PaperFigure } from "@/lib/api";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface PaperSummaryProps {
  papers: PaperItem[];
}

export default function PaperSummary({ papers }: PaperSummaryProps) {
  const completedPapers = papers.filter((p) => p.status === "done");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [summaryContent, setSummaryContent] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mode, setMode] = useState<"single" | "combined" | null>(null);

  const [allFigures, setAllFigures] = useState<{ paperTitle: string; figure: PaperFigure }[]>([]);
  const [selectedFigureIds, setSelectedFigureIds] = useState<Set<string>>(new Set());
  const [activeLightboxFig, setActiveLightboxFig] = useState<{ url: string; caption: string; paperTitle: string; pageNumber: number } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Live timer during summary generation
  React.useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (generating) {
      setElapsedSeconds(0);
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [generating]);

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(completedPapers.map((p) => p.id));
  const clearAll = () => setSelectedIds([]);

  const selectedPapers = selectedIds.length > 0
    ? completedPapers.filter((p) => selectedIds.includes(p.id))
    : [];

  const handleGenerateSingle = async (paperId: string) => {
    setGenerating(true);
    setMode("single");
    setSummaryContent(null);
    setAllFigures([]);

    try {
      const res = await fetchSinglePaperSummary(paperId);
      setSummaryContent(res.summary);

      const paper = completedPapers.find(p => p.id === paperId);
      const figRes = await fetchPaperFigures(paperId);
      if (figRes.figures) {
        const figs = figRes.figures.map(f => ({ paperTitle: paper?.title || "Paper", figure: f }));
        setAllFigures(figs);
        setSelectedFigureIds(new Set(figRes.figures.map(f => f.figure_id)));
      }
    } catch (e: any) {
      setSummaryContent(`⚠️ Error generating summary: ${e.message || e}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateCombined = async () => {
    if (selectedPapers.length < 2) return;
    setGenerating(true);
    setMode("combined");
    setSummaryContent(null);
    setAllFigures([]);

    try {
      const pids = selectedPapers.map(p => p.id);
      const res = await fetchCombinedSummary(pids, customTopic || undefined);
      setSummaryContent(res.summary);

      const figsList: { paperTitle: string; figure: PaperFigure }[] = [];
      const defaultSelected = new Set<string>();

      await Promise.all(
        selectedPapers.map(async (paper) => {
          try {
            const figRes = await fetchPaperFigures(paper.id);
            if (figRes.figures) {
              figRes.figures.forEach((fig) => {
                figsList.push({ paperTitle: paper.title, figure: fig });
                defaultSelected.add(fig.figure_id);
              });
            }
          } catch (err) {}
        })
      );
      setAllFigures(figsList);
      setSelectedFigureIds(defaultSelected);
    } catch (e: any) {
      setSummaryContent(`⚠️ Error generating combined summary: ${e.message || e}`);
    } finally {
      setGenerating(false);
    }
  };

  const toggleFigureSelection = (figId: string) => {
    setSelectedFigureIds((prev) => {
      const next = new Set(prev);
      if (next.has(figId)) next.delete(figId);
      else next.add(figId);
      return next;
    });
  };

  const handleDownloadMarkdown = () => {
    if (!summaryContent) return;

    const chosenFigs = allFigures.filter((item) => selectedFigureIds.has(item.figure.figure_id));
    let figuresMd = "";
    if (chosenFigs.length > 0) {
      figuresMd = `\n\n## Extracted Diagrams & Figures\n\n` +
        chosenFigs.map((item) => {
          const imgUrl = item.figure.url.startsWith("http") ? item.figure.url : `${API_BASE}${item.figure.url}`;
          return `![${item.figure.caption || `Figure from ${item.paperTitle}`}](${imgUrl})\n*Figure (p. ${item.figure.page_number}) from ${item.paperTitle}: ${item.figure.caption}*\n`;
        }).join("\n");
    }

    const fullMd = `${summaryContent}${figuresMd}`;
    const blob = new Blob([fullMd], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Paper_Summary_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (completedPapers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-5 text-center">
        <div className="text-6xl animate-bounce">📑</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Deep Paper Summary</h2>
          <p className="text-slate-400 max-w-md">
            Add papers via <span className="text-blue-400 font-semibold">Paper Discovery</span> and wait for indexing to complete. Then come back here for deep technical summaries.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Paper Selection Header & Queue */}
      <div className="glass-panel rounded-2xl p-6 space-y-4 border border-slate-800/80 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow Pill */}
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>📑</span> Select Papers for Deep Summary
            </h2>
            <div className="hidden sm:flex items-center gap-2 bg-slate-900/80 px-3 py-1 rounded-full border border-purple-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400" />
              <span className="text-[10px] font-mono text-purple-300">Powered by Groq 70B & Qwen2.5 Vision</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-3 py-1.5 text-xs rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 font-medium transition-all"
            >
              Select All ({completedPapers.length})
            </button>
            <button
              onClick={clearAll}
              className="px-3 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 font-medium transition-all"
            >
              Clear Selection
            </button>
          </div>
        </div>

        {/* Multi-Paper Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {completedPapers.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all relative overflow-hidden group ${
                  isSelected
                    ? "bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border-blue-500/60 shadow-lg shadow-blue-500/10"
                    : "bg-slate-950/50 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-blue-600 border-blue-500 shadow-sm shadow-blue-500" : "border-slate-700 group-hover:border-slate-500"}`}>
                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                      arXiv:{p.arxiv_id || p.id.slice(0, 10)}
                    </span>
                  </div>
                  <p className={`text-xs font-semibold line-clamp-2 leading-relaxed ${isSelected ? "text-blue-200" : "text-slate-200"}`}>{p.title}</p>
                  <p className="text-[10px] text-slate-500 truncate mt-1">{p.authors?.slice(0, 2).join(", ") || "Unknown Authors"}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom topic input for combined mode */}
        {selectedPapers.length >= 2 && (
          <div className="pt-1">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Filter or focus topic for combined synthesis (e.g. Fine-tuning efficiency, RAG benchmarks)..."
              className="w-full bg-slate-950 border border-purple-500/30 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-400 shadow-inner"
            />
          </div>
        )}

        {/* Generation Action Bar */}
        <div className="flex items-center gap-3 pt-2 flex-wrap justify-between border-t border-slate-800/80">
          <div className="flex items-center gap-3 flex-wrap">
            {selectedPapers.length === 1 && (
              <button
                onClick={() => handleGenerateSingle(selectedPapers[0].id)}
                disabled={generating}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                <span>📄</span> {generating ? `Generating Breakdown... (${formatTime(elapsedSeconds)})` : "Summarise Selected Paper"}
              </button>
            )}

            {selectedPapers.length >= 2 && (
              <>
                <button
                  onClick={() => handleGenerateSingle(selectedPapers[0].id)}
                  disabled={generating}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium text-xs border border-slate-700 disabled:opacity-50 transition-all"
                >
                  📄 Summarise 1st Selected
                </button>
                <button
                  onClick={handleGenerateCombined}
                  disabled={generating}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold text-xs shadow-lg shadow-purple-600/25 disabled:opacity-50 transition-all flex items-center gap-2"
                >
                  <span>📋</span> {generating ? `Synthesizing Multi-Paper Summary... (${formatTime(elapsedSeconds)})` : `Generate Synthesis (${selectedPapers.length} Papers)`}
                </button>
              </>
            )}

            {selectedPapers.length === 0 && (
              <p className="text-xs text-amber-400 flex items-center gap-1.5 font-medium">
                <span>⚠️</span> Select at least 1 paper from the queue above to generate a summary
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Live Generating Progress Card with Timer */}
      {generating && (
        <div className="glass-panel rounded-2xl p-6 border border-purple-500/40 bg-gradient-to-r from-slate-950 via-purple-950/20 to-slate-950 flex items-center justify-between gap-4 shadow-2xl relative overflow-hidden animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0">
              <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>{mode === "single" ? "📄 Deep Per-Paper Technical Breakdown" : "📋 Multi-Paper Synthesis Summary"}</span>
                <span className="text-[10px] font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded border border-purple-500/30">
                  Groq 70B
                </span>
              </p>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Analyzing architecture, benchmark metrics, limitations & extracting visual diagrams...
              </p>
            </div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-purple-950/80 border border-purple-500/50 text-purple-300 font-mono text-sm font-bold flex items-center gap-2 shadow-lg shadow-purple-500/10 shrink-0">
            <span>⏱️</span>
            <span>{formatTime(elapsedSeconds)}</span>
          </div>
        </div>
      )}

      {/* Summary Output View */}
      {summaryContent && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-purple-500/30 shadow-2xl relative">
          {/* AI Border Sweep */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none p-[1px] bg-gradient-to-r from-purple-500/30 via-transparent to-blue-500/30" />

          <div className="px-8 pt-6 pb-4 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-purple-300 uppercase tracking-wider bg-purple-500/10 px-2.5 py-0.5 rounded border border-purple-500/20">
                  {mode === "single" ? "Single-Paper Deep Dive" : "Multi-Paper Synthesis"}
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-100">
                {mode === "single" ? "Technical Architecture & Method Breakdown" : "Cross-Paper Research Synthesis"}
              </h3>
            </div>
            <button
              onClick={handleDownloadMarkdown}
              className="px-4 py-2 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 hover:bg-purple-600/30 text-xs font-semibold transition-all flex items-center gap-2 shadow-sm"
            >
              <span>📥</span> Download Markdown (.md)
            </button>
          </div>

          <div className="px-8 py-6 max-w-4xl">
            <MarkdownRenderer content={summaryContent} />
          </div>

          {/* Visual Evidence & Extracted Diagram Gallery */}
          {allFigures.length > 0 && (
            <div className="mx-8 mb-8 p-5 rounded-2xl border border-purple-500/30 bg-slate-950/60 space-y-4 shadow-inner">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">🖼️</span>
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Visual Evidence & Diagrams ({allFigures.length})
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Checked diagrams embed into exported Markdown</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {allFigures.map((item, idx) => {
                  const isChecked = selectedFigureIds.has(item.figure.figure_id);
                  return (
                    <div key={idx} className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-2 group hover:border-purple-500/50 transition-all shadow-md">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 truncate cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleFigureSelection(item.figure.figure_id)}
                            className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500"
                          />
                          <span className="truncate">{item.paperTitle}</span>
                        </label>
                        <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                          p.{item.figure.page_number} · 🤖 AI Captioned
                        </span>
                      </div>

                      <button
                        onClick={() => setActiveLightboxFig({
                          url: `${API_BASE}${item.figure.url}`,
                          caption: item.figure.caption,
                          paperTitle: item.paperTitle,
                          pageNumber: item.figure.page_number
                        })}
                        className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center group-hover:border-purple-500/60 transition-all relative"
                      >
                        <img
                          src={`${API_BASE}${item.figure.url}`}
                          alt={item.figure.caption}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
                          🔍 Click for Lightbox
                        </div>
                      </button>
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{item.figure.caption}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxFig && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="glass-panel max-w-4xl w-full rounded-2xl p-6 space-y-4 max-h-[90vh] flex flex-col border border-purple-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-slate-100">{activeLightboxFig.paperTitle}</h4>
                <p className="text-xs text-purple-400 font-mono">Page {activeLightboxFig.pageNumber} · Diagram Preview</p>
              </div>
              <button
                onClick={() => setActiveLightboxFig(null)}
                className="text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-800 text-xs font-semibold border border-slate-700"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-950 rounded-xl p-4 border border-slate-800">
              <img
                src={activeLightboxFig.url}
                alt={activeLightboxFig.caption}
                className="max-h-[60vh] object-contain rounded-lg"
              />
            </div>
            <div className="bg-slate-900/90 p-4 rounded-xl border border-purple-500/30 text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-purple-300 block mb-1">🤖 AI Vision Caption Analysis</span>
              {activeLightboxFig.caption}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
