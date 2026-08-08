"use client";

import React, { useState } from "react";
import { PaperItem, getExportComparisonCSVUrl, fetchProseComparison, fetchPaperFigures, PaperFigure } from "@/lib/api";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface ComparisonTableProps {
  papers: PaperItem[];
}

const ATTR_ROWS = [
  { key: "primary_task", label: "Primary Task", type: "badge", color: "blue" },
  { key: "backbone_models", label: "Backbone Models", type: "tags", color: "purple" },
  { key: "datasets_used", label: "Datasets Evaluated", type: "tags", color: "indigo" },
  { key: "benchmark_metrics", label: "Benchmark Metrics", type: "metrics", color: "emerald" },
  { key: "methodology_summary", label: "Methodology", type: "text", color: "slate" },
  { key: "limitations", label: "Limitations", type: "list", color: "rose" },
  { key: "future_work", label: "Future Work", type: "list", color: "amber" },
];

function CellValue({ attrKey, paper }: { attrKey: string; paper: PaperItem }) {
  const sd = paper.structured_data;
  if (!sd) return <span className="text-slate-600 italic text-xs">No extraction data</span>;

  const val = (sd as any)[attrKey];

  if (attrKey === "primary_task") {
    return val ? (
      <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono text-xs">
        {val}
      </span>
    ) : <span className="text-slate-600 text-xs">N/A</span>;
  }

  if (attrKey === "backbone_models" || attrKey === "datasets_used") {
    const items: string[] = Array.isArray(val) ? val : [];
    const color = attrKey === "backbone_models" ? "purple" : "indigo";
    return items.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {items.map((item, idx) => (
          <span key={idx} className={`px-2 py-0.5 rounded bg-${color}-500/10 text-${color}-300 border border-${color}-500/20 text-xs`}>
            {item}
          </span>
        ))}
      </div>
    ) : <span className="text-slate-600 text-xs">Unspecified</span>;
  }

  if (attrKey === "benchmark_metrics") {
    const metrics = typeof val === "object" && val !== null ? val : {};
    const entries = Object.entries(metrics);
    return entries.length > 0 ? (
      <ul className="space-y-1 font-mono text-xs">
        {entries.map(([k, v], idx) => (
          <li key={idx}>
            <span className="text-slate-400">{k}:</span>{" "}
            <span className="text-emerald-400 font-bold">{String(v)}</span>
          </li>
        ))}
      </ul>
    ) : <span className="text-slate-600 text-xs">N/A</span>;
  }

  if (attrKey === "methodology_summary") {
    return val ? (
      <p className="text-xs text-slate-300 leading-relaxed">{val}</p>
    ) : <span className="text-slate-600 text-xs">Not extracted</span>;
  }

  if (attrKey === "limitations" || attrKey === "future_work") {
    const items: string[] = Array.isArray(val) ? val : [];
    const color = attrKey === "limitations" ? "rose" : "amber";
    return items.length > 0 ? (
      <ul className="space-y-1.5">
        {items.map((item, idx) => (
          <li key={idx} className={`text-xs text-${color}-200/80 flex gap-2`}>
            <span className={`text-${color}-400 mt-0.5 shrink-0`}>›</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    ) : <span className="text-slate-600 text-xs">None stated</span>;
  }

  return <span className="text-slate-600 text-xs">—</span>;
}

export default function ComparisonTable({ papers }: ComparisonTableProps) {
  const eligiblePapers = papers.filter((p) => p.status === "done" && p.structured_data);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "prose">("table");
  const [proseComparison, setProseComparison] = useState<string | null>(null);
  const [loadingProse, setLoadingProse] = useState(false);
  const [paperFiguresMap, setPaperFiguresMap] = useState<Record<string, PaperFigure[]>>({});
  const [loadingFiguresMap, setLoadingFiguresMap] = useState(false);
  const [activeLightboxFig, setActiveLightboxFig] = useState<{ url: string; caption: string; paperTitle: string; pageNumber: number } | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(eligiblePapers.map((p) => p.id));
  const clearAll = () => setSelectedIds([]);

  const selectedPapers = selectedIds.length > 0
    ? eligiblePapers.filter((p) => selectedIds.includes(p.id))
    : [];

  const loadFiguresForSelected = async (pids: string[]) => {
    if (pids.length === 0) return;
    setLoadingFiguresMap(true);
    const newMap: Record<string, PaperFigure[]> = { ...paperFiguresMap };
    await Promise.all(
      pids.map(async (pid) => {
        if (!newMap[pid]) {
          try {
            const res = await fetchPaperFigures(pid);
            if (res.figures) newMap[pid] = res.figures;
          } catch (e) {
            console.error(`Failed to fetch figures for paper ${pid}`, e);
          }
        }
      })
    );
    setPaperFiguresMap(newMap);
    setLoadingFiguresMap(false);
  };

  const handleSwitchViewMode = async (mode: "table" | "prose") => {
    setViewMode(mode);
    if (mode === "prose" && !proseComparison && selectedPapers.length >= 2) {
      setLoadingProse(true);
      try {
        const pids = selectedPapers.map((p) => p.id);
        const res = await fetchProseComparison(pids);
        setProseComparison(res.prose);
      } catch (err: any) {
        setProseComparison(`⚠️ Failed to generate prose comparison: ${err.message || err}`);
      } finally {
        setLoadingProse(false);
      }
    }
  };

  // Auto-fetch figures when papers selection changes and at least 2 are selected
  React.useEffect(() => {
    if (selectedPapers.length >= 2) {
      loadFiguresForSelected(selectedPapers.map(p => p.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds.join(",")]);

  // ── Empty state ──
  if (eligiblePapers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-5 text-center">
        <div className="text-6xl">📊</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Compare Papers</h2>
          <p className="text-slate-400 max-w-md">
            Add at least 2 papers via <span className="text-blue-400 font-semibold">Paper Discovery</span> and
            wait for them to finish indexing. Then select which ones to compare here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Paper Selection Header */}
      <div className="glass-panel rounded-2xl p-6 space-y-4 border border-slate-800/80 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>📊</span> Compare Papers Matrix
            </h2>
            <span className="text-xs font-mono text-purple-300 bg-purple-500/15 px-2.5 py-0.5 rounded-full border border-purple-500/30">
              {selectedIds.length === 0 ? "No Papers Selected" : `${selectedIds.length} Selected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-3.5 py-1.5 text-xs rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 font-medium transition-all"
            >
              Select All ({eligiblePapers.length})
            </button>
            <button
              onClick={clearAll}
              className="px-3.5 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 font-medium transition-all"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {eligiblePapers.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all relative group ${
                  isSelected
                    ? "bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border-blue-500/60 shadow-lg shadow-blue-500/10"
                    : "bg-slate-950/50 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                }`}
              >
                {/* Checkbox */}
                <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "bg-blue-600 border-blue-500 shadow-sm shadow-blue-500" : "border-slate-700 group-hover:border-slate-500"
                }`}>
                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 inline-block mb-1">
                    arXiv:{p.arxiv_id || p.id.slice(0, 10)}
                  </span>
                  <p className={`text-xs font-semibold line-clamp-2 leading-relaxed ${isSelected ? "text-blue-200" : "text-slate-200"}`}>
                    {p.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── No selection yet ── */}
      {selectedPapers.length === 0 && (
        <div className="glass-panel rounded-2xl p-10 text-center text-slate-500 space-y-2">
          <p className="text-3xl">☝️</p>
          <p className="text-sm font-semibold text-slate-400">Select 2 or more papers above to start comparing</p>
        </div>
      )}

      {/* ── One paper selected ── */}
      {selectedPapers.length === 1 && (
        <div className="glass-panel rounded-2xl p-10 text-center text-slate-500 space-y-2">
          <p className="text-3xl">➕</p>
          <p className="text-sm font-semibold text-slate-400">Select at least one more paper to compare</p>
        </div>
      )}

      {/* ── Comparison Matrix ── */}
      {selectedPapers.length >= 2 && (
        <div className="space-y-5">
          {/* Quick Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {selectedPapers.map((p) => (
              <div key={p.id} className="glass-panel rounded-xl p-4 space-y-2 border border-slate-700/60">
                <p className="text-xs font-bold text-blue-400 line-clamp-2">{p.title}</p>
                <p className="text-[10px] text-slate-500 font-mono">arXiv:{p.arxiv_id}</p>
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  {p.structured_data?.primary_task && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-500">Task:</span>
                      <span className="text-[10px] text-blue-300 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">
                        {p.structured_data.primary_task}
                      </span>
                    </div>
                  )}
                  {p.paragraph_count !== undefined && p.paragraph_count !== null && (
                    <p className="text-[10px] text-slate-500">
                      {p.paragraph_count} paragraphs indexed
                    </p>
                  )}
                  <p className="text-[10px] text-slate-600">{p.published_date || "2026"}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Figure Strip for Compared Papers */}
          <div className="glass-panel rounded-2xl p-5 space-y-3 border border-purple-500/20">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                🖼️ Key Architecture Diagrams & Figures Across Compared Papers
              </h4>
              {loadingFiguresMap && (
                <span className="text-[10px] text-purple-400 animate-pulse font-mono">Loading diagrams...</span>
              )}
            </div>

            <div className="flex items-stretch gap-4 overflow-x-auto custom-scrollbar pb-2">
              {selectedPapers.map((p) => {
                const figs = paperFiguresMap[p.id] || [];
                const topFig = figs[0]; // first/key figure
                return (
                  <div key={p.id} className="min-w-[240px] max-w-[280px] shrink-0 glass-panel rounded-xl p-3 border border-slate-800 flex flex-col justify-between space-y-2">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-200 line-clamp-1">{p.title}</p>
                      <p className="text-[10px] text-slate-500 font-mono">arXiv:{p.arxiv_id}</p>
                    </div>

                    {topFig ? (
                      <button
                        onClick={() => setActiveLightboxFig({
                          url: `${API_BASE}${topFig.url}`,
                          caption: topFig.caption,
                          paperTitle: p.title,
                          pageNumber: topFig.page_number
                        })}
                        className="group relative w-full aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-900 flex items-center justify-center hover:border-purple-500 transition-colors"
                      >
                        <img
                          src={`${API_BASE}${topFig.url}`}
                          alt={topFig.caption}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 p-1 text-[9px] font-mono text-purple-300">
                          p. {topFig.page_number} {topFig.ai_captioned && "· 🤖 AI"}
                        </div>
                      </button>
                    ) : (
                      <div className="w-full aspect-video rounded-lg border border-slate-800/60 bg-slate-950/40 flex items-center justify-center text-[10px] text-slate-600">
                        No diagram extracted
                      </div>
                    )}

                    {topFig && (
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-snug">
                        {topFig.caption}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Comparison Container (Table vs Prose) */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  {viewMode === "table" ? "Side-by-Side Table Comparison" : "Structured AI Prose Comparison"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comparative analysis across {selectedPapers.length} selected papers
                </p>
              </div>

              {/* View Mode Toggle Controls */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
                  <button
                    onClick={() => handleSwitchViewMode("table")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "table"
                        ? "bg-blue-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    📊 Table View
                  </button>
                  <button
                    onClick={() => handleSwitchViewMode("prose")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "prose"
                        ? "bg-purple-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    📝 Prose Analysis Mode
                  </button>
                </div>

                {viewMode === "table" && (
                  <a
                    href={getExportComparisonCSVUrl(selectedPapers.map(p => p.id))}
                    download="research_comparison_matrix.csv"
                    className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 text-xs font-medium transition-all flex items-center gap-1.5"
                  >
                    📥 Export CSV
                  </a>
                )}
              </div>
            </div>

            {/* Table View Mode */}
            {viewMode === "table" && (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/60">
                      <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-44 sticky left-0 bg-slate-900/95">
                        Attribute
                      </th>
                      {selectedPapers.map((p) => (
                        <th key={p.id} className="p-4 text-sm font-bold text-blue-400 min-w-[260px] border-l border-slate-800/80">
                          <div className="line-clamp-2">{p.title}</div>
                          <div className="text-xs font-mono text-slate-500 font-normal mt-1">arXiv:{p.arxiv_id || p.id}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {ATTR_ROWS.map((row) => (
                      <tr key={row.key} className="hover:bg-slate-800/20 transition-colors">
                        <td className="p-4 font-semibold text-slate-300 bg-slate-950/40 sticky left-0 align-top">
                          {row.label}
                        </td>
                        {selectedPapers.map((p) => (
                          <td key={p.id} className="p-4 border-l border-slate-800/80 align-top">
                            <CellValue attrKey={row.key} paper={p} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Prose View Mode */}
            {viewMode === "prose" && (
              <div className="p-8 max-w-4xl space-y-4">
                {loadingProse ? (
                  <div className="flex items-center gap-3 p-6 glass-panel rounded-xl max-w-md text-slate-300 text-xs font-mono">
                    <span className="w-3 h-3 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
                    Groq 70B generating structured prose comparison...
                  </div>
                ) : proseComparison ? (
                  <MarkdownRenderer content={proseComparison} />
                ) : (
                  <div className="text-xs text-slate-500">Click Prose Analysis Mode to generate comparative narrative.</div>
                )}
              </div>
            )}
          </div>

          {/* Research Gaps Section */}
          <div className="glass-panel rounded-2xl p-6 border border-amber-500/10">
            <h3 className="text-sm font-bold text-amber-400 mb-3">⚡ Key Differences at a Glance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Datasets overlap */}
              <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-300">Shared Datasets</p>
                {(() => {
                  const allDatasets = selectedPapers.map((p) =>
                    new Set(p.structured_data?.datasets_used || [])
                  );
                  const shared = [...(allDatasets[0] || [])].filter((d) =>
                    allDatasets.every((s) => s.has(d))
                  );
                  return shared.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {shared.map((d, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-xs">{d}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">No datasets shared across all selected papers</p>
                  );
                })()}
              </div>

              {/* Unique tasks */}
              <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-300">Primary Task Distribution</p>
                <div className="space-y-1.5">
                  {selectedPapers.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400 line-clamp-1 flex-1">{p.title.split(":")[0]}</span>
                      <span className="text-xs text-blue-300 font-mono bg-blue-500/10 px-2 py-0.5 rounded shrink-0">
                        {p.structured_data?.primary_task || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Figure Strip */}
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
