"use client";

import React, { useState } from "react";
import {
  PaperItem,
  getExportComparisonCSVUrl,
  fetchProseComparison,
  streamProseComparison,
  fetchPaperFigures,
  PaperFigure,
  fetchPaperTables,
  ExtractedTable,
  extractCustomColumn,
  CustomColumnExtraction
} from "@/lib/api";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import StreamedMarkdown from "@/components/StreamedMarkdown";

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
  const [viewMode, setViewMode] = useState<"table" | "prose" | "extracted_tables">("table");
  const [proseComparison, setProseComparison] = useState<string | null>(null);
  const [loadingProse, setLoadingProse] = useState(false);
  const [paperFiguresMap, setPaperFiguresMap] = useState<Record<string, PaperFigure[]>>({});
  const [loadingFiguresMap, setLoadingFiguresMap] = useState(false);
  const [activeLightboxFig, setActiveLightboxFig] = useState<{ url: string; caption: string; paperTitle: string; pageNumber: number } | null>(null);

  // Extracted Tables state
  const [extractedTablesMap, setExtractedTablesMap] = useState<Record<string, ExtractedTable[]>>({});
  const [loadingTables, setLoadingTables] = useState(false);
  const [activeTablePaperId, setActiveTablePaperId] = useState<string | null>(null);
  const [activeTableIndex, setActiveTableIndex] = useState<number>(0);
  const [tableSearchQuery, setTableSearchQuery] = useState<string>("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Dynamic Custom Columns State (Elicit.org parity)
  const [customColumns, setCustomColumns] = useState<{
    id: string;
    name: string;
    prompt?: string;
    extractions: Record<string, { value: string; confidence?: number; page_number?: number; loading?: boolean }>;
  }[]>([]);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColPrompt, setNewColPrompt] = useState("");
  const [extractingCol, setExtractingCol] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const handleAddCustomColumn = async (colName: string, promptText?: string) => {
    const name = colName.trim();
    if (!name || selectedPapers.length === 0) return;

    const colId = `custom_${Date.now()}`;
    const initialExtractions: Record<string, any> = {};
    selectedPapers.forEach((p) => {
      initialExtractions[p.id] = { value: "Extracting...", loading: true };
    });

    const newCol = {
      id: colId,
      name: name,
      prompt: promptText,
      extractions: initialExtractions
    };

    setCustomColumns((prev) => [...prev, newCol]);
    setShowAddColumnModal(false);
    setNewColName("");
    setNewColPrompt("");
    setExtractingCol(true);

    try {
      const res = await extractCustomColumn(
        selectedPapers.map((p) => p.id),
        name,
        promptText
      );
      setCustomColumns((prev) =>
        prev.map((c) => (c.id === colId ? { ...c, extractions: res.extractions } : c))
      );
    } catch (err) {
      console.error("Custom column extraction error:", err);
    } finally {
      setExtractingCol(false);
    }
  };

  const handleRemoveCustomColumn = (colId: string) => {
    setCustomColumns((prev) => prev.filter((c) => c.id !== colId));
  };

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

  const loadTablesForSelected = async (pids: string[]) => {
    if (pids.length === 0) return;
    setLoadingTables(true);
    const newMap: Record<string, ExtractedTable[]> = { ...extractedTablesMap };
    await Promise.all(
      pids.map(async (pid) => {
        if (!newMap[pid]) {
          try {
            const res = await fetchPaperTables(pid);
            if (res.tables) newMap[pid] = res.tables;
          } catch (e) {
            console.error(`Failed to fetch tables for paper ${pid}`, e);
          }
        }
      })
    );
    setExtractedTablesMap(newMap);
    setLoadingTables(false);
  };

  const exportTableToCSV = (table: ExtractedTable, paperTitle: string) => {
    const cleanCell = (c: string) => `"${(c || "").replace(/"/g, '""')}"`;
    const headerRow = table.headers.map(cleanCell).join(",");
    const dataRows = table.rows.map(row => row.map(cleanCell).join(",")).join("\n");
    const csvContent = `${headerRow}\n${dataRows}`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeTitle = (paperTitle || "table").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 25);
    link.setAttribute("href", url);
    link.setAttribute("download", `${safeTitle}_p${table.page_number}_table.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSwitchViewMode = async (mode: "table" | "prose" | "extracted_tables") => {
    setViewMode(mode);
    if (mode === "extracted_tables") {
      const pids = selectedPapers.map((p) => p.id);
      if (!activeTablePaperId && pids.length > 0) {
        setActiveTablePaperId(pids[0]);
      }
      await loadTablesForSelected(pids);
    } else if (mode === "prose" && selectedPapers.length >= 2) {
      setLoadingProse(true);
      setProseComparison("");
      try {
        const pids = selectedPapers.map((p) => p.id);
        await streamProseComparison(
          pids,
          (token) => {
            setProseComparison((prev) => (prev || "") + token);
          },
          () => setLoadingProse(false),
          (err) => {
            setProseComparison((prev) =>
              prev ? prev + `\n\n⚠️ Stream error: ${err.message}` : `⚠️ Failed to generate prose comparison: ${err.message}`
            );
            setLoadingProse(false);
          }
        );
      } catch (err: any) {
        setProseComparison(`⚠️ Failed to generate prose comparison: ${err.message || err}`);
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



          {/* Detailed Comparison Container (Table vs Prose) */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  {viewMode === "table"
                    ? "Side-by-Side Table Comparison"
                    : viewMode === "prose"
                    ? "Structured AI Prose Comparison"
                    : "Extracted Tables & Benchmark DataFrames"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {viewMode === "extracted_tables"
                    ? "Interactive sortable DataFrames and benchmarks extracted from paper PDFs"
                    : `Comparative analysis across ${selectedPapers.length} selected papers`}
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
                  <button
                    onClick={() => handleSwitchViewMode("extracted_tables")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewMode === "extracted_tables"
                        ? "bg-emerald-600 text-white shadow"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    📈 Extracted Tables
                  </button>
                </div>

                {viewMode === "table" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAddColumnModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Add a custom question or attribute to compare across all papers (Elicit.org Parity)"
                    >
                      <span>✨</span> + Add Custom Column
                    </button>
                    <a
                      href={getExportComparisonCSVUrl(selectedPapers.map(p => p.id))}
                      download="research_comparison_matrix.csv"
                      className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 text-xs font-medium transition-all flex items-center gap-1.5"
                    >
                      📥 Export CSV
                    </a>
                  </div>
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

                    {/* Dynamic Custom Columns (Elicit.org Parity) */}
                    {customColumns.map((col) => (
                      <tr key={col.id} className="border-b border-emerald-950/50 bg-emerald-950/10 hover:bg-emerald-950/20 transition-colors">
                        <td className="p-4 font-semibold text-emerald-300 bg-slate-950/90 border-r border-slate-800/80 sticky left-0 align-top z-10">
                          <div className="flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1 truncate" title={col.prompt || col.name}>
                              <span className="text-[10px]">✨</span>
                              <span className="truncate">{col.name}</span>
                            </span>
                            <button
                              onClick={() => handleRemoveCustomColumn(col.id)}
                              className="text-slate-500 hover:text-rose-400 p-0.5 rounded text-[10px] cursor-pointer"
                              title="Remove custom column"
                            >
                              ✕
                            </button>
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono block mt-0.5">AI Micro-Extraction</span>
                        </td>
                        {selectedPapers.map((p) => {
                          const ext = col.extractions[p.id];
                          return (
                            <td key={p.id} className="p-4 align-top border-l border-slate-800/80">
                              {!ext || ext.loading ? (
                                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono animate-pulse">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                  <span>Extracting...</span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <p className="text-xs font-semibold text-slate-200 leading-relaxed">
                                    {ext.value}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
                                    {ext.confidence !== undefined && (
                                      <span className="text-emerald-400">
                                        {Math.round(ext.confidence * 100)}% conf
                                      </span>
                                    )}
                                    {ext.page_number && (
                                      <span className="text-purple-400 bg-purple-500/10 px-1.5 py-0.2 rounded border border-purple-500/20">
                                        p.{ext.page_number}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Prose View Mode */}
            {viewMode === "prose" && (
              <div className="p-6 space-y-6">
                {/* Per-Paper Figure Strip */}
                {selectedPapers.some(p => (paperFiguresMap[p.id] || []).length > 0) && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                      🖼️ Key Architecture Diagrams & Figures
                      {loadingFiguresMap && <span className="text-[10px] text-purple-400 animate-pulse font-mono">Loading...</span>}
                    </h4>
                    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selectedPapers.length}, minmax(0, 1fr))` }}>
                      {selectedPapers.map((p) => {
                        const figs = paperFiguresMap[p.id] || [];
                        return (
                          <div key={p.id} className="space-y-2">
                            <p className="text-[10px] font-bold text-blue-300 line-clamp-1 font-mono">{p.title.split(":")[0]}</p>
                            {figs.length > 0 ? (
                              <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                                {figs.slice(0, 3).map((fig, i) => (
                                  <button
                                    key={i}
                                    onClick={() => setActiveLightboxFig({
                                      url: `${API_BASE}${fig.url}`,
                                      caption: fig.caption,
                                      paperTitle: p.title,
                                      pageNumber: fig.page_number
                                    })}
                                    className="group relative shrink-0 w-36 aspect-video rounded-lg overflow-hidden border border-slate-800 bg-slate-900 hover:border-purple-500/60 transition-colors"
                                  >
                                    <img
                                      src={`${API_BASE}${fig.url}`}
                                      alt={fig.caption}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 p-0.5 text-[8px] font-mono text-purple-300">
                                      p.{fig.page_number}{fig.ai_captioned && " 🤖"}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="w-full h-20 rounded-lg border border-slate-800/40 bg-slate-950/40 flex items-center justify-center text-[10px] text-slate-600">
                                No figures extracted
                              </div>
                            )}
                            {figs[0] && (
                              <p className="text-[9px] text-slate-500 line-clamp-2 leading-snug italic">{figs[0].caption}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="border-t border-slate-800/60 pt-4" />
                  </div>
                )}

                {/* Point-Based Analysis */}
                {proseComparison ? (
                  <StreamedMarkdown content={proseComparison} isGenerating={loadingProse} />
                ) : loadingProse ? (
                  <div className="flex items-center gap-3 p-6 glass-panel rounded-xl max-w-md text-slate-300 text-xs font-mono">
                    <span className="w-3 h-3 border-2 border-purple-400/40 border-t-purple-400 rounded-full animate-spin" />
                    Connecting to real-time synthesis stream...
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Click 📝 Prose Analysis Mode to generate the structured comparison.</div>
                )}
              </div>
            )}

            {/* Extracted Tables & DataFrames Mode */}
            {viewMode === "extracted_tables" && (
              <div className="p-6 space-y-6">
                {/* Paper selector buttons */}
                <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">
                  <span className="text-xs font-semibold text-slate-400 shrink-0">Select Paper:</span>
                  {selectedPapers.map((p) => {
                    const isCurrent = (activeTablePaperId || selectedPapers[0]?.id) === p.id;
                    const tablesForP = extractedTablesMap[p.id] || [];
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setActiveTablePaperId(p.id);
                          setActiveTableIndex(0);
                        }}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-all shrink-0 flex items-center gap-2 ${
                          isCurrent
                            ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <span className="truncate max-w-[160px]">{p.title}</span>
                        <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-emerald-400">
                          {tablesForP.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Active paper's tables */}
                {(() => {
                  const currentPid = activeTablePaperId || selectedPapers[0]?.id;
                  const currentPaper = selectedPapers.find(p => p.id === currentPid);
                  const tables = currentPid ? (extractedTablesMap[currentPid] || []) : [];

                  if (loadingTables) {
                    return (
                      <div className="p-10 text-center text-slate-400 space-y-3">
                        <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-mono">Extracting structured DataFrames from PDF pages...</p>
                      </div>
                    );
                  }

                  if (tables.length === 0) {
                    return (
                      <div className="p-10 text-center text-slate-500 space-y-2 bg-slate-950/40 rounded-xl border border-slate-850">
                        <p className="text-2xl">📋</p>
                        <p className="text-sm font-semibold text-slate-400">No structured tables detected in this paper</p>
                        <p className="text-xs text-slate-500">The PDF may contain rasterized image tables or unstructured text layouts.</p>
                      </div>
                    );
                  }

                  const activeTable = tables[activeTableIndex] || tables[0];

                  // Filter rows by tableSearchQuery
                  const filteredRows = activeTable.rows.filter(row =>
                    !tableSearchQuery.trim() ||
                    row.some(cell => cell.toLowerCase().includes(tableSearchQuery.toLowerCase()))
                  );

                  // Sort rows if sortCol is set
                  const sortedRows = [...filteredRows].sort((a, b) => {
                    if (sortCol === null) return 0;
                    const valA = (a[sortCol] || "").trim();
                    const valB = (b[sortCol] || "").trim();

                    const numA = parseFloat(valA.replace(/[^0-9.-]/g, ""));
                    const numB = parseFloat(valB.replace(/[^0-9.-]/g, ""));
                    if (!isNaN(numA) && !isNaN(numB)) {
                      return sortAsc ? numA - numB : numB - numA;
                    }
                    return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                  });

                  return (
                    <div className="space-y-4">
                      {/* Table Header Bar: Tabs, Search, Export */}
                      <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar">
                          {tables.map((tbl, tIdx) => (
                            <button
                              key={tbl.table_id}
                              onClick={() => {
                                setActiveTableIndex(tIdx);
                                setSortCol(null);
                              }}
                              className={`px-3 py-1 rounded-lg text-xs font-mono transition-all shrink-0 ${
                                activeTableIndex === tIdx
                                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold"
                                  : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                              }`}
                            >
                              Table {tIdx + 1} (p.{tbl.page_number})
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                          <input
                            type="text"
                            value={tableSearchQuery}
                            onChange={e => setTableSearchQuery(e.target.value)}
                            placeholder="Filter table rows..."
                            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 w-44"
                          />
                          <button
                            onClick={() => exportTableToCSV(activeTable, currentPaper?.title || "paper")}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0"
                            title="Download this table as a CSV spreadsheet"
                          >
                            <span>⬇️</span> Export CSV
                          </button>
                        </div>
                      </div>

                      {/* Interactive DataFrame Table */}
                      <div className="overflow-x-auto custom-scrollbar rounded-xl border border-slate-800 bg-slate-950/60 shadow-xl">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-900/90">
                              <th className="p-3 text-slate-500 font-mono w-12 text-center">#</th>
                              {activeTable.headers.map((h, colIdx) => (
                                <th
                                  key={colIdx}
                                  onClick={() => {
                                    if (sortCol === colIdx) {
                                      setSortAsc(!sortAsc);
                                    } else {
                                      setSortCol(colIdx);
                                      setSortAsc(true);
                                    }
                                  }}
                                  className="p-3 text-slate-300 font-semibold cursor-pointer hover:bg-slate-800/80 transition-colors select-none group"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>{h}</span>
                                    <span className="text-[10px] text-slate-500 group-hover:text-emerald-400">
                                      {sortCol === colIdx ? (sortAsc ? "▲" : "▼") : "↕"}
                                    </span>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850 font-mono">
                            {sortedRows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-900/50 transition-colors">
                                <td className="p-3 text-slate-600 text-center font-mono text-[10px]">{rIdx + 1}</td>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-3 text-slate-300 whitespace-nowrap">
                                    {cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono px-1">
                        <span>Showing {sortedRows.length} of {activeTable.rows.length} rows · {activeTable.headers.length} columns</span>
                        <span>Click column headers to sort ascending / descending</span>
                      </div>
                    </div>
                  );
                })()}
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

      {/* Add Custom Column Modal (Elicit.org Parity) */}
      {showAddColumnModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="glass-panel max-w-lg w-full rounded-2xl p-6 space-y-4 border border-emerald-500/40 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <h4 className="font-bold text-slate-100">Add Custom Extraction Column</h4>
              </div>
              <button
                onClick={() => setShowAddColumnModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Define any custom question or attribute (e.g. <em>Hardware</em>, <em>Learning Rate</em>, <em>Loss Function</em>).
              The AI agent will perform targeted vector retrieval across each paper to extract the exact answer.
            </p>

            {/* Quick Suggestion Chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Quick Suggestions:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: "Hardware & GPUs", prompt: "Extract GPU model, count, cluster setup, and VRAM" },
                  { name: "Learning Rate & Optimizer", prompt: "Extract optimizer name, peak learning rate, and schedule" },
                  { name: "Dataset Sample Size", prompt: "Extract training dataset token count or number of samples" },
                  { name: "Context Window Size", prompt: "Extract maximum input context length / token window" },
                  { name: "Evaluation Metric & Baseline", prompt: "Extract primary evaluation metric and compared baseline model" }
                ].map((sug, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setNewColName(sug.name);
                      setNewColPrompt(sug.prompt);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-[11px] text-emerald-300 transition-all cursor-pointer"
                  >
                    + {sug.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Column Name / Attribute
                </label>
                <input
                  type="text"
                  placeholder="e.g. Training Compute (FLOPs)"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Clarifying Prompt <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Extract total floating point operations or GPU hours"
                  value={newColPrompt}
                  onChange={(e) => setNewColPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddColumnModal(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAddCustomColumn(newColName, newColPrompt)}
                disabled={!newColName.trim() || extractingCol}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-950/40 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {extractingCol ? "Extracting..." : "Extract & Add Column ✨"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

