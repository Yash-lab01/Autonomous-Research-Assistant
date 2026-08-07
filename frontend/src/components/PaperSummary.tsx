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
  const [mode, setMode] = useState<"single" | "combined" | null>(null);

  const [allFigures, setAllFigures] = useState<{ paperTitle: string; figure: PaperFigure }[]>([]);
  const [selectedFigureIds, setSelectedFigureIds] = useState<Set<string>>(new Set());
  const [activeLightboxFig, setActiveLightboxFig] = useState<{ url: string; caption: string; paperTitle: string; pageNumber: number } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

      // Fetch figures for this paper
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

      // Fetch figures for all selected papers
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
        <div className="text-6xl">📑</div>
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
      {/* Paper Selection Header */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-100">📑 Select Papers for Deep Summary</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Select 1 paper for a detailed per-paper technical breakdown, or 2+ papers for a combined synthesis summary.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-colors">
              Select All
            </button>
            <button onClick={clearAll} className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {completedPapers.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-blue-600/15 border-blue-500/50 shadow-sm shadow-blue-500/10"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-600"
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-blue-600 border-blue-500" : "border-slate-600"}`}>
                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold line-clamp-2 ${isSelected ? "text-blue-300" : "text-slate-200"}`}>{p.title}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">arXiv:{p.arxiv_id}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom topic input for combined mode */}
        {selectedPapers.length >= 2 && (
          <div className="pt-2">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Optional focus topic for combined summary (e.g. Fine-tuning efficiency, RAG architectures)..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500/60"
            />
          </div>
        )}

        {/* Generation Action Buttons */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          {selectedPapers.length === 1 && (
            <button
              onClick={() => handleGenerateSingle(selectedPapers[0].id)}
              disabled={generating}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {generating ? "Generating Deep Summary..." : "📄 Summarise Selected Paper"}
            </button>
          )}

          {selectedPapers.length >= 2 && (
            <>
              <button
                onClick={() => handleGenerateSingle(selectedPapers[0].id)}
                disabled={generating}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 disabled:opacity-50 transition-all"
              >
                📄 Summarise 1st Selected Paper
              </button>
              <button
                onClick={handleGenerateCombined}
                disabled={generating}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-purple-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
              >
                {generating ? "Synthesizing Combined Summary..." : `📋 Generate Combined Summary (${selectedPapers.length} Papers)`}
              </button>
            </>
          )}

          {selectedPapers.length === 0 && (
            <p className="text-xs text-amber-400">Select at least 1 paper above to generate a summary</p>
          )}
        </div>
      </div>

      {/* Summary Output */}
      {summaryContent && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          <div className="px-8 pt-8 pb-4 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-bold text-purple-400">
                {mode === "single" ? "Deep Paper Technical Summary" : "Combined Multi-Paper Synthesis Summary"}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Generated via Groq llama-3.3-70b · Includes technical architecture, benchmark metrics & limitations
              </p>
            </div>
            <button
              onClick={handleDownloadMarkdown}
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 hover:bg-purple-600/30 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              📥 Download (.md)
            </button>
          </div>

          <div className="px-8 py-6 max-w-4xl">
            <MarkdownRenderer content={summaryContent} />
          </div>

          {/* Extracted Diagrams & Figures Panel */}
          {allFigures.length > 0 && (
            <div className="mx-8 mb-8 p-5 rounded-2xl border border-purple-500/30 bg-slate-950/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                  🖼️ Extracted Architecture Diagrams & Figures ({allFigures.length})
                </span>
                <span className="text-[10px] text-slate-500">Checked items embed into Markdown download</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {allFigures.map((item, idx) => {
                  const isChecked = selectedFigureIds.has(item.figure.figure_id);
                  return (
                    <div key={idx} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 truncate cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleFigureSelection(item.figure.figure_id)}
                            className="rounded border-slate-700 bg-slate-900 text-purple-600"
                          />
                          <span className="truncate">{item.paperTitle}</span>
                        </label>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                          p.{item.figure.page_number}
                        </span>
                      </div>

                      <button
                        onClick={() => setActiveLightboxFig({
                          url: `${API_BASE}${item.figure.url}`,
                          caption: item.figure.caption,
                          paperTitle: item.paperTitle,
                          pageNumber: item.figure.page_number
                        })}
                        className="w-full aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center hover:border-purple-500 transition-colors"
                      >
                        <img
                          src={`${API_BASE}${item.figure.url}`}
                          alt={item.figure.caption}
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{item.figure.caption}</p>
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="glass-panel-glow max-w-4xl w-full rounded-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-slate-100">{activeLightboxFig.paperTitle}</h4>
                <p className="text-xs text-slate-400 font-mono">Page {activeLightboxFig.pageNumber}</p>
              </div>
              <button
                onClick={() => setActiveLightboxFig(null)}
                className="text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-800 text-xs font-medium"
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
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-purple-400 block mb-1">Figure Caption / AI Analysis</span>
              {activeLightboxFig.caption}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
