"use client";

import React, { useState, useEffect } from "react";

export interface NavPillar {
  id: string;
  icon: string;
  label: string;
  shortLabel: string;
  desc: string;
  step: number;
}

export const NAV_PILLARS: NavPillar[] = [
  {
    id: "papers",
    icon: "📚",
    label: "Paper Hub",
    shortLabel: "Paper Hub",
    desc: "arXiv preprint discovery & knowledge base management",
    step: 1,
  },
  {
    id: "studio",
    icon: "🔬",
    label: "Synthesis Studio",
    shortLabel: "Studio",
    desc: "Taxonomy matrix, deep summaries, literature surveys & research gaps",
    step: 2,
  },
  {
    id: "copilot",
    icon: "💬",
    label: "Agent Copilot",
    shortLabel: "Copilot",
    desc: "Multimodal RAG chat assistant & field evolution timeline",
    step: 3,
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
        {/* Logo & Brand Identity */}
        <button
          onClick={scrollToTop}
          className="flex items-center gap-2.5 shrink-0 text-left group focus:outline-none"
        >
          <div className="h-8 w-8 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center font-mono font-bold text-xs text-blue-400 group-hover:border-blue-500/60 transition-all">
            OS
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold tracking-tight text-slate-100 group-hover:text-blue-300 transition-colors">
                AI RESEARCH OS
              </span>
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded">
                v2.0
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">Autonomous Literature Platform</p>
          </div>
        </button>

        {/* 3 Unified Pillar Navigation Buttons */}
        <nav className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800/90">
          {NAV_PILLARS.map((pillar) => {
            const isActive = activeSection === pillar.id;
            return (
              <button
                key={pillar.id}
                onClick={() => onNavigate(pillar.id)}
                title={pillar.desc}
                className={`relative px-4 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                  isActive
                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-850"
                }`}
              >
                <span className="text-sm leading-none">{pillar.icon}</span>
                <span>{pillar.label}</span>
                <span
                  className={`text-[9px] font-mono px-1 rounded ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  0{pillar.step}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right Status Indicators */}
        <div className="hidden md:flex items-center gap-2 text-xs font-mono shrink-0">
          <div className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Groq Qwen 27B</span>
          </div>
          <button
            onClick={() => onNavigate("papers")}
            className={`px-2.5 py-1 rounded-lg border text-[11px] transition-all flex items-center gap-1.5 ${
              ingestedCount > 0
                ? "bg-blue-950/40 border-blue-500/30 text-blue-300 hover:border-blue-400"
                : "bg-slate-900 border-slate-800 text-slate-400"
            }`}
          >
            <span>📚</span>
            <span>{ingestedCount} Indexed</span>
          </button>
        </div>
      </div>
    </header>
  );
}
