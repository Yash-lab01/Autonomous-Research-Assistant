"use client";

import React, { useState } from "react";

interface NavbarProps {
  activeTab: "discovery" | "chat" | "compare" | "review";
  setActiveTab: (tab: "discovery" | "chat" | "compare" | "review") => void;
  ingestedCount: number;
}

const TABS: {
  id: "discovery" | "chat" | "compare" | "review";
  icon: string;
  label: string;
  shortLabel: string;
  hint: string;
  step: number;
}[] = [
  {
    id: "discovery",
    icon: "🔍",
    label: "Paper Discovery",
    shortLabel: "Discover",
    hint: "Step 1 — Search arXiv & add papers to your library",
    step: 1,
  },
  {
    id: "chat",
    icon: "💬",
    label: "Chat & Ask",
    shortLabel: "Chat",
    hint: "Step 2 — Ask questions across your ingested papers",
    step: 2,
  },
  {
    id: "compare",
    icon: "📊",
    label: "Compare Papers",
    shortLabel: "Compare",
    hint: "Step 3 — Side-by-side methods & metrics matrix",
    step: 3,
  },
  {
    id: "review",
    icon: "📝",
    label: "Literature Review",
    shortLabel: "Review",
    hint: "Step 4 — Auto-generate a survey draft with citations",
    step: 4,
  },
];

export default function Navbar({ activeTab, setActiveTab, ingestedCount }: NavbarProps) {
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800 px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20 font-bold text-white text-sm">
            AI
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-blue-400 bg-clip-text text-transparent leading-tight">
              AI Research OS
            </h1>
            <p className="text-[10px] text-slate-500">Autonomous Research Assistant</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 relative">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const isHovered = hoveredTab === tab.id;
            return (
              <div key={tab.id} className="relative">
                <button
                  onClick={() => setActiveTab(tab.id)}
                  onMouseEnter={() => setHoveredTab(tab.id)}
                  onMouseLeave={() => setHoveredTab(null)}
                  className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                  {/* Step badge */}
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-0.5 ${
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-slate-700 text-slate-400"
                    }`}
                  >
                    {tab.step}
                  </span>
                </button>

                {/* Tooltip on hover */}
                {isHovered && !isActive && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-52 pointer-events-none">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 shadow-xl text-center">
                      <p className="text-xs text-slate-200 font-medium">{tab.hint}</p>
                      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-800 border-t border-l border-slate-700 rotate-45" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Status Badges */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Dual LLM Active</span>
          </div>
          <div
            className={`px-3 py-1.5 rounded-lg border font-mono transition-colors ${
              ingestedCount > 0
                ? "bg-blue-500/10 border-blue-500/20 text-blue-300"
                : "bg-slate-800/80 border-slate-700 text-slate-400"
            }`}
          >
            {ingestedCount > 0 ? `📚 ${ingestedCount} Paper${ingestedCount !== 1 ? "s" : ""} Ready` : "Library Empty"}
          </div>
        </div>
      </div>

      {/* Active Tab Context Bar */}
      <div className="mt-2 pt-2 border-t border-slate-800/60">
        <p className="text-[11px] text-slate-500 text-center">
          {TABS.find((t) => t.id === activeTab)?.hint}
          {activeTab !== "discovery" && ingestedCount === 0 && (
            <span className="ml-2 text-amber-400/80">
              ⚠️ Start at <button onClick={() => setActiveTab("discovery")} className="underline text-amber-400 hover:text-amber-300">Paper Discovery</button> first to add papers
            </span>
          )}
        </p>
      </div>
    </header>
  );
}
