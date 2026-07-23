"use client";

import React from "react";

interface NavbarProps {
  activeTab: "discovery" | "chat" | "compare" | "review";
  setActiveTab: (tab: "discovery" | "chat" | "compare" | "review") => void;
  ingestedCount: number;
}

export default function Navbar({ activeTab, setActiveTab, ingestedCount }: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20 font-bold text-white text-lg">
          AI
        </div>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-blue-400 bg-clip-text text-transparent">
            AI Research OS
          </h1>
          <p className="text-xs text-slate-400">Autonomous Local & Cloud Research Assistant</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center gap-1 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800">
        <button
          onClick={() => setActiveTab("discovery")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "discovery"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          🔍 Paper Discovery
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === "chat"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          💬 Agent Chat & RAG
        </button>

        <button
          onClick={() => setActiveTab("compare")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "compare"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          📊 Multi-Paper Matrix
        </button>

        <button
          onClick={() => setActiveTab("review")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "review"
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
          }`}
        >
          📝 Literature Review
        </button>
      </nav>

      {/* Status Badges */}
      <div className="flex items-center gap-3 text-xs">
        <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Dual LLM Active</span>
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300 font-mono">
          Library: {ingestedCount} Papers
        </div>
      </div>
    </header>
  );
}
