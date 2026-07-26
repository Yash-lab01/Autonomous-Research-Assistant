"use client";

import React, { useState } from "react";
import { PaperItem, getExportComparisonCSVUrl } from "@/lib/api";

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
      {/* ── Paper Selector ── */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">📊 Select Papers to Compare</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose 2 or more papers from your knowledge base. The comparison matrix updates instantly.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={clearAll}
              className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
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
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-blue-600/15 border-blue-500/50 shadow-sm shadow-blue-500/10"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-600"
                }`}
              >
                {/* Checkbox */}
                <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "bg-blue-600 border-blue-500" : "border-slate-600"
                }`}>
                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold line-clamp-2 ${isSelected ? "text-blue-300" : "text-slate-200"}`}>
                    {p.title}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">arXiv:{p.arxiv_id}</p>
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

          {/* Detailed Comparison Table */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-100">Side-by-Side Comparison</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Technical taxonomy across {selectedPapers.length} selected papers
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-500 bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                  {selectedPapers.length} papers · {ATTR_ROWS.length} attributes
                </span>
                <a
                  href={getExportComparisonCSVUrl(selectedPapers.map(p => p.id))}
                  download="research_comparison_matrix.csv"
                  className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 text-xs font-medium transition-all flex items-center gap-1.5"
                >
                  📥 Export CSV
                </a>
              </div>
            </div>

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
    </div>
  );
}
