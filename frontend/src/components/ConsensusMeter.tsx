"use client";

import React, { useState } from "react";
import { PaperItem, PaperStance, ConsensusResult, streamConsensus, fetchConsensus } from "@/lib/api";

interface ConsensusMeterProps {
  papers: PaperItem[];
}

const SAMPLE_HYPOTHESES = [
  "Does test-time compute scaling outperform pre-training scaling for reasoning?",
  "Do multi-modal diffusion models achieve higher fidelity than autoregressive models?",
  "Does retrieval-augmented generation eliminate parametric hallucination?",
  "Is reinforcement learning with verifiable rewards robust against reward hacking?",
  "Do mixture-of-experts models achieve superior FLOPs efficiency over dense models?"
];

export default function ConsensusMeter({ papers }: ConsensusMeterProps) {
  const completedPapers = papers.filter((p) => p.status === "done");

  const [query, setQuery] = useState(SAMPLE_HYPOTHESES[0]);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ConsensusResult | null>(null);
  const [streamedStances, setStreamedStances] = useState<PaperStance[]>([]);
  const [filterStance, setFilterStance] = useState<"all" | "supports" | "contradicts" | "nuanced">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(completedPapers.map((p) => p.id))
  );

  const togglePaper = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAnalyze = async (overrideQuery?: string) => {
    const q = overrideQuery || query;
    if (!q.trim() || completedPapers.length === 0) return;

    setAnalyzing(true);
    setResult(null);
    setStreamedStances([]);

    const pids = Array.from(selectedIds);

    try {
      await streamConsensus(
        q,
        pids.length > 0 ? pids : undefined,
        (event) => {
          if (event.type === "paper_result" && event.stance) {
            setStreamedStances((prev) => [...prev, event.stance]);
          } else if (event.type === "done") {
            setResult(event);
            setStreamedStances(event.paper_stances || []);
            setAnalyzing(false);
          }
        },
        () => setAnalyzing(false),
        async (err) => {
          console.warn("SSE consensus failed, falling back to direct POST:", err);
          try {
            const fallback = await fetchConsensus(q, pids);
            setResult(fallback);
            setStreamedStances(fallback.paper_stances);
          } catch (e2: any) {
            alert(`Consensus analysis failed: ${e2.message || e2}`);
          } finally {
            setAnalyzing(false);
          }
        }
      );
    } catch (e: any) {
      console.error("Consensus run error:", e);
      setAnalyzing(false);
    }
  };

  const activeStances = result ? result.paper_stances : streamedStances;

  const filteredStances = activeStances.filter((s) => {
    if (filterStance === "all") return true;
    return s.stance === filterStance;
  });

  // Calculate live percentages during streaming
  const totalInformative = Math.max(
    1,
    activeStances.filter((s) => s.stance !== "neutral").length
  );
  const supportsCount = activeStances.filter((s) => s.stance === "supports").length;
  const contradictsCount = activeStances.filter((s) => s.stance === "contradicts").length;
  const nuancedCount = activeStances.filter((s) => s.stance === "nuanced").length;

  const supportsPct = result
    ? result.supports_pct
    : Math.round((supportsCount / totalInformative) * 100);
  const contradictsPct = result
    ? result.contradicts_pct
    : Math.round((contradictsCount / totalInformative) * 100);
  const nuancedPct = result
    ? result.nuanced_pct
    : Math.round((nuancedCount / totalInformative) * 100);

  return (
    <div className="space-y-6">
      {/* Search and Hypothesis Bar */}
      <div className="glass-panel rounded-2xl p-6 border border-emerald-500/20 space-y-4 shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚖️</span>
            <h3 className="text-base font-bold text-slate-100">Scientific Consensus Meter</h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              Consensus.app Parity
            </span>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Scanning {selectedIds.size} of {completedPapers.length} library papers
          </span>
        </div>

        <p className="text-xs text-slate-400">
          Enter an empirical hypothesis or scientific question. The engine will scan papers in your library,
          extract verbatim claims, and classify whether each paper <strong>Supports</strong>, <strong>Contradicts</strong>,
          or provides <strong>Nuanced</strong> context.
        </p>

        {/* Input Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAnalyze();
              }
            }}
            placeholder="e.g. Does RLHF cause mode collapse in language models?"
            className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
            disabled={analyzing}
          />
          <button
            onClick={() => handleAnalyze()}
            disabled={analyzing || !query.trim() || completedPapers.length === 0}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl text-xs transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            {analyzing ? (
              <>
                <span className="animate-spin text-sm">🌀</span>
                <span>Synthesizing ({activeStances.length}/{selectedIds.size})...</span>
              </>
            ) : (
              <>
                <span>Run Consensus Scan</span>
                <span>⚡</span>
              </>
            )}
          </button>
        </div>

        {/* Hypothesis Quick Chips */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Suggested Hypotheses:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_HYPOTHESES.map((chip, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(chip);
                  handleAnalyze(chip);
                }}
                disabled={analyzing}
                className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-700/60 hover:border-emerald-500/50 text-[11px] text-slate-300 transition-all text-left truncate max-w-md disabled:opacity-50 cursor-pointer"
              >
                ✨ {chip}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Consensus Meter & Verdict Card */}
      {(activeStances.length > 0 || analyzing) && (
        <div className="glass-panel rounded-2xl p-6 border border-slate-700/80 space-y-6 shadow-2xl">
          {/* High-Level Verdict */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Literature Verdict
              </span>
              <span className="text-xs font-mono text-emerald-400 font-semibold">
                {activeStances.length} of {selectedIds.size} Papers Analyzed
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-100 leading-snug">
              {result?.consensus_verdict || "Synthesizing consensus across peer-reviewed findings..."}
            </h4>
          </div>

          {/* Visual Stacked Consensus Meter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                Supports: {supportsPct}% ({supportsCount})
              </span>
              <span className="text-amber-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                Nuanced: {nuancedPct}% ({nuancedCount})
              </span>
              <span className="text-rose-400 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                Contradicts: {contradictsPct}% ({contradictsCount})
              </span>
            </div>

            {/* Stacked Percentage Bar */}
            <div className="w-full h-4 rounded-full bg-slate-900 border border-slate-800 overflow-hidden flex shadow-inner">
              <div
                style={{ width: `${supportsPct}%` }}
                className="bg-emerald-500 h-full transition-all duration-500 relative group"
                title={`Supports: ${supportsPct}%`}
              />
              <div
                style={{ width: `${nuancedPct}%` }}
                className="bg-amber-500 h-full transition-all duration-500 relative group"
                title={`Nuanced: ${nuancedPct}%`}
              />
              <div
                style={{ width: `${contradictsPct}%` }}
                className="bg-rose-500 h-full transition-all duration-500 relative group"
                title={`Contradicts: ${contradictsPct}%`}
              />
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">Filter Stance:</span>
              {(["all", "supports", "nuanced", "contradicts"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterStance(mode)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                    filterStance === mode
                      ? mode === "supports"
                        ? "bg-emerald-600 text-white"
                        : mode === "contradicts"
                        ? "bg-rose-600 text-white"
                        : mode === "nuanced"
                        ? "bg-amber-600 text-white"
                        : "bg-blue-600 text-white"
                      : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <span className="text-xs text-slate-500 font-mono">
              Showing {filteredStances.length} result{filteredStances.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Paper Stance Cards */}
          <div className="space-y-4">
            {filteredStances.map((item) => {
              const badgeStyle =
                item.stance === "supports"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : item.stance === "contradicts"
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30";

              const badgeIcon =
                item.stance === "supports" ? "✓ Supports" : item.stance === "contradicts" ? "✕ Contradicts" : "⚡ Nuanced";

              return (
                <div
                  key={item.paper_id}
                  className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider ${badgeStyle}`}>
                          {badgeIcon}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          Confidence: {Math.round(item.confidence * 100)}%
                        </span>
                        {item.page_number && (
                          <span className="text-xs text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                            Page {item.page_number}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-100 text-sm">{item.paper_title}</h4>
                    </div>

                    {item.arxiv_id && (
                      <a
                        href={`https://arxiv.org/abs/${item.arxiv_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-mono text-blue-400 hover:underline shrink-0 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20"
                      >
                        arXiv:{item.arxiv_id} ↗
                      </a>
                    )}
                  </div>

                  {/* Core Takeaway */}
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {item.takeaway}
                  </p>

                  {/* Verbatim Supporting Quote */}
                  {item.supporting_quote && (
                    <div className="p-3 rounded-lg bg-slate-950/80 border-l-2 border-emerald-500 text-xs text-slate-300 italic leading-relaxed">
                      "{item.supporting_quote}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
