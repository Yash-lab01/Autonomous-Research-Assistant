"use client";

import React, { useState, useEffect } from "react";

export interface NavSection {
  id: string;
  icon: string;
  label: string;
  shortLabel: string;
  hint: string;
  step: number;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "discovery",
    icon: "🔍",
    label: "Paper Discovery",
    shortLabel: "Discovery",
    hint: "Search arXiv & ingest papers into vector memory",
    step: 1,
  },
  {
    id: "library",
    icon: "📚",
    label: "Knowledge Library",
    shortLabel: "Library",
    hint: "Explore indexed papers, figures & extracted schemas",
    step: 2,
  },
  {
    id: "chat",
    icon: "💬",
    label: "Agentic Chat",
    shortLabel: "Chat",
    hint: "Multimodal RAG with live reasoning steps & citations",
    step: 3,
  },
  {
    id: "compare",
    icon: "📊",
    label: "Compare Papers",
    shortLabel: "Compare",
    hint: "Side-by-side taxonomy matrix & point-based contrast",
    step: 4,
  },
  {
    id: "summary",
    icon: "📑",
    label: "Paper Summary",
    shortLabel: "Summary",
    hint: "Per-paper deep dives & cross-paper synthesis",
    step: 5,
  },
  {
    id: "review",
    icon: "📝",
    label: "Literature Review",
    shortLabel: "Review",
    hint: "Autonomous academic survey drafting & citation export",
    step: 6,
  },
  {
    id: "gaps",
    icon: "⚡",
    label: "Research Gaps",
    shortLabel: "Gaps",
    hint: "Cross-paper limitation analysis & novel hypothesis discovery",
    step: 7,
  },
  {
    id: "timeline",
    icon: "🗓️",
    label: "Field Evolution",
    shortLabel: "Timeline",
    hint: "Chronological evolution of methods, models & benchmarks",
    step: 8,
  },
];

interface NavbarProps {
  activeSection: string;
  onNavigate: (sectionId: string) => void;
  ingestedCount: number;
}

export default function Navbar({ activeSection, onNavigate, ingestedCount }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        scrolled
          ? "bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-lg shadow-black/20 py-2.5"
          : "bg-[#090d16]/95 backdrop-blur-sm border-b border-slate-800/60 py-3"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-4">
        {/* Logo & Brand Identity (Clean, architectural, no AI slop gradients) */}
        <button
          onClick={scrollToTop}
          className="flex items-center gap-3 shrink-0 text-left group focus:outline-none"
        >
          <div className="h-8 w-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center font-mono font-bold text-xs text-blue-400 group-hover:border-blue-500/60 group-hover:bg-slate-850 transition-all">
            OS
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-100 group-hover:text-blue-300 transition-colors">
                AI RESEARCH OS
              </span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                v2.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">Autonomous Literature Intelligence</p>
          </div>
        </button>

        {/* Scrollable Navigation Bar with Section Anchors */}
        <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800/90 overflow-x-auto custom-scrollbar max-w-2xl">
          {NAV_SECTIONS.map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => onNavigate(sec.id)}
                title={sec.hint}
                className={`relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/70"
                }`}
              >
                <span className="text-xs">{sec.icon}</span>
                <span>{sec.shortLabel}</span>
                <span
                  className={`text-[9px] font-mono px-1 rounded ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {sec.step}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Telemetry Status Right Side */}
        <div className="hidden lg:flex items-center gap-2.5 text-xs shrink-0 font-mono">
          <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Groq Qwen 27B</span>
          </div>
          <button
            onClick={() => onNavigate("library")}
            className={`px-2.5 py-1 rounded-lg border text-[11px] transition-all flex items-center gap-1.5 ${
              ingestedCount > 0
                ? "bg-blue-950/40 border-blue-500/30 text-blue-300 hover:border-blue-400"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span>📚</span>
            <span>{ingestedCount} Ingested</span>
          </button>
        </div>
      </div>
    </header>
  );
}
