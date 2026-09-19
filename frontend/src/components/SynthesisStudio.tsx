"use client";

import React, { useState } from "react";
import { PaperItem } from "@/lib/api";
import ComparisonTable from "@/components/ComparisonTable";
import PaperSummary from "@/components/PaperSummary";
import LiteratureDraft from "@/components/LiteratureDraft";
import ResearchGaps from "@/components/ResearchGaps";
import ConsensusMeter from "@/components/ConsensusMeter";
import CitationGraph from "@/components/CitationGraph";

interface SynthesisStudioProps {
  papers: PaperItem[];
}

type StudioMode = "compare" | "summary" | "review" | "gaps" | "consensus" | "graph";

const STUDIO_MODES: {
  id: StudioMode;
  icon: string;
  label: string;
  desc: string;
}[] = [
  {
    id: "compare",
    icon: "📊",
    label: "Comparison Matrix",
    desc: "Side-by-side taxonomy matrix & custom dynamic extraction columns",
  },
  {
    id: "consensus",
    icon: "⚖️",
    label: "Consensus Meter",
    desc: "Hypothesis polarity analysis & evidence agreement breakdown (Consensus.app Parity)",
  },
  {
    id: "graph",
    icon: "🕸️",
    label: "Citation Graph",
    desc: "2D force-directed citation lineage & co-citation network (Connected Papers Parity)",
  },
  {
    id: "summary",
    icon: "📑",
    label: "Deep Summary",
    desc: "Single-paper breakdown or multi-paper synthesis with diagrams",
  },
  {
    id: "review",
    icon: "📝",
    label: "Literature Review",
    desc: "Academic survey draft with Overleaf & LaTeX .zip export",
  },
  {
    id: "gaps",
    icon: "⚡",
    label: "Research Gaps",
    desc: "Limitation synthesis & thesis problem discovery",
  },
];

export default function SynthesisStudio({ papers }: SynthesisStudioProps) {
  const [activeMode, setActiveMode] = useState<StudioMode>("compare");
  const completedPapers = papers.filter((p) => p.status === "done");

  const currentModeMeta = STUDIO_MODES.find((m) => m.id === activeMode);

  return (
    <div className="space-y-6">
      {/* Studio Header & Mode Switcher */}
      <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                PILLAR 02
              </span>
              <h2 className="text-xl font-bold text-slate-100">Synthesis Studio</h2>
              <span className="text-xs font-mono text-slate-400">
                ({completedPapers.length} indexed paper{completedPapers.length !== 1 ? "s" : ""})
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{currentModeMeta?.desc}</p>
          </div>

          {/* Segmented Mode Selector */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/90 overflow-x-auto custom-scrollbar">
            {STUDIO_MODES.map((mode) => {
              const isSelected = activeMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Mode Render */}
      <div className="min-h-[500px]">
        {activeMode === "compare" && <ComparisonTable papers={papers} />}
        {activeMode === "consensus" && <ConsensusMeter papers={papers} />}
        {activeMode === "graph" && <CitationGraph papers={papers} />}
        {activeMode === "summary" && <PaperSummary papers={papers} />}
        {activeMode === "review" && <LiteratureDraft papers={papers} />}
        {activeMode === "gaps" && <ResearchGaps papers={papers} />}
      </div>
    </div>
  );
}
