"use client";

import React, { useState } from "react";
import { PaperItem, fetchResearchGaps } from "@/lib/api";

interface ResearchGapsProps {
  papers: PaperItem[];
}

function renderMarkdownReport(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      nodes.push(
        <h3 key={key++} className="text-lg font-bold text-amber-400 mt-8 mb-3 pb-2 border-b border-slate-700/60">
          {line.replace(/^## /, "")}
        </h3>
      );
    } else if (line.startsWith("### ")) {
      nodes.push(
        <h4 key={key++} className="text-base font-semibold text-slate-200 mt-5 mb-2">
          {line.replace(/^### /, "")}
        </h4>
      );
    } else if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const clean = line
        .trim()
        .replace(/^[-*]\s+/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1");
      nodes.push(
        <li key={key++} className="text-sm text-slate-300 leading-relaxed mb-2 ml-4 list-disc">
          {clean}
        </li>
      );
    } else if (/^\d+\.\s+/.test(line.trim())) {
      const clean = line
        .trim()
        .replace(/^\d+\.\s+/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1");
      nodes.push(
        <div key={key++} className="text-sm text-slate-300 leading-relaxed mb-2 pl-4 border-l-2 border-amber-500/40">
          <span className="font-semibold text-amber-300">{line.trim().match(/^\d+\./)?.[0]} </span>
          {clean}
        </div>
      );
    } else if (line.trim().length > 0) {
      const clean = line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
      nodes.push(
        <p key={key++} className="text-sm text-slate-300 leading-7 mb-3">{clean}</p>
      );
    } else {
      nodes.push(<div key={key++} className="h-1" />);
    }
  }

  return nodes;
}

export default function ResearchGaps({ papers }: ResearchGapsProps) {
  const completedPapers = papers.filter((p) => p.status === "done");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [paperCount, setPaperCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const selectAll = () => setSelectedIds(completedPapers.map((p) => p.id));
  const clearAll = () => setSelectedIds([]);

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    setReportMarkdown(null);
    try {
      const targetIds = selectedIds.length > 0 ? selectedIds : undefined;
      const res = await fetchResearchGaps(targetIds);
      setReportMarkdown(res.gaps_markdown);
      setPaperCount(res.paper_count);
    } catch (err: any) {
      setReportMarkdown(`⚠️ Error running gap analysis: ${err.message || err}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCopy = () => {
    if (!reportMarkdown) return;
    navigator.clipboard.writeText(reportMarkdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Research_Gaps_Analysis.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (completedPapers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
        <div className="text-6xl">⚡</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Research Gap Finder</h2>
          <p className="text-slate-400 max-w-md">
            No papers ready yet. Add papers in <span className="text-blue-400 font-semibold">Paper Discovery</span> and wait for indexing to complete, then return here to discover open research problems.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration & Selection Panel */}
      <div className="glass-panel rounded-2xl p-6 space-y-5 border border-amber-500/30 bg-slate-950/60 shadow-2xl relative overflow-hidden">
        {/* Ambient Amber Glow */}
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>⚡</span> Research Gap Finder & Innovation Agent
              </h2>
              <span className="text-[10px] font-mono text-amber-300 bg-amber-500/15 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                AI Synthesis Engine Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cross-references stated <span className="text-rose-400 font-semibold">limitations</span>, <span className="text-amber-400 font-semibold">future work</span>, benchmark metrics, and datasets across your ingested papers to synthesize unaddressed open problems and novel thesis/project ideas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={selectAll}
              className="px-3.5 py-1.5 text-xs rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-300 hover:bg-amber-600/30 font-medium transition-all"
            >
              Select All ({completedPapers.length})
            </button>
            <button
              onClick={clearAll}
              className="px-3.5 py-1.5 text-xs rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 font-medium transition-all"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Paper selector list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {completedPapers.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-amber-500/15 border-amber-500/50 shadow-sm shadow-amber-500/10"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-600"
                }`}
              >
                <div
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "bg-amber-500 border-amber-400" : "border-slate-600"
                  }`}
                >
                  {isSelected && <span className="text-slate-950 text-[10px] font-bold">✓</span>}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold line-clamp-2 ${isSelected ? "text-amber-300" : "text-slate-200"}`}>
                    {p.title}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">arXiv:{p.arxiv_id}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={handleRunAnalysis}
            disabled={analyzing}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                Cross-Examining Papers...
              </>
            ) : (
              <>⚡ Analyze Gaps & Propose Ideas</>
            )}
          </button>

          <p className="text-xs text-slate-400">
            {selectedIds.length > 0 ? (
              <span>Analyzing <span className="text-amber-300 font-semibold">{selectedIds.length}</span> selected papers</span>
            ) : (
              <span>Analyzing all <span className="text-amber-300 font-semibold">{completedPapers.length}</span> papers in library</span>
            )}
          </p>
        </div>
      </div>

      {/* Analysis Output Report */}
      {reportMarkdown && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-amber-500/20">
          <div className="px-8 pt-8 pb-4 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-bold text-amber-400">Research Gap & Innovation Report</h3>
              <p className="text-xs text-slate-500 mt-1">
                Synthesized across {paperCount} ingested research paper{paperCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white text-xs font-medium transition-all"
              >
                {copied ? "✓ Copied!" : "📋 Copy Report"}
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-amber-300 hover:bg-amber-600/30 text-xs font-medium transition-all"
              >
                📥 Download (.md)
              </button>
            </div>
          </div>

          <div className="px-8 py-6 max-w-4xl">
            {renderMarkdownReport(reportMarkdown)}
          </div>
        </div>
      )}
    </div>
  );
}
