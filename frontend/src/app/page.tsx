"use client";

import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import PaperCard from "@/components/PaperCard";
import ChatInterface from "@/components/ChatInterface";
import ComparisonTable from "@/components/ComparisonTable";
import LiteratureDraft from "@/components/LiteratureDraft";
import { searchArxiv, ingestPaper, getPapers, PaperSearchResult, PaperItem } from "@/lib/api";

const WORKFLOW_STEPS = [
  {
    icon: "🔍",
    title: "1. Discover Papers",
    desc: "Search arXiv for any research topic and add papers to your OS library.",
    color: "blue",
  },
  {
    icon: "💬",
    title: "2. Ask Questions",
    desc: "Chat with your papers — get cited answers, method breakdowns, and comparisons.",
    color: "indigo",
  },
  {
    icon: "📊",
    title: "3. Compare",
    desc: "View a side-by-side matrix of datasets, models, metrics, and limitations.",
    color: "purple",
  },
  {
    icon: "📝",
    title: "4. Generate Review",
    desc: "Auto-generate a structured literature survey draft with references.",
    color: "violet",
  },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"discovery" | "chat" | "compare" | "review">("discovery");
  const [searchQuery, setSearchQuery] = useState("GraphRAG");
  const [searchResults, setSearchResults] = useState<PaperSearchResult[]>([]);
  const [ingestedPapers, setIngestedPapers] = useState<PaperItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(true);

  const fetchIngestedPapers = async () => {
    try {
      const data = await getPapers();
      setIngestedPapers(data);
    } catch (e) {
      console.error("Failed to fetch ingested papers:", e);
    }
  };

  useEffect(() => {
    fetchIngestedPapers();
    // Poll paper statuses every 4 seconds to reflect live ingestion progression (queued → parsing → done)
    const interval = setInterval(fetchIngestedPapers, 4000);
    return () => clearInterval(interval);
  }, []);

  // Auto-hide onboarding once user has at least one paper
  useEffect(() => {
    if (ingestedPapers.length > 0) setShowOnboarding(false);
  }, [ingestedPapers]);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    try {
      const results = await searchArxiv(searchQuery, 6);
      setSearchResults(results);
    } catch (err: any) {
      alert(`Search Error: ${err.message || err}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleIngest = async (paper: PaperSearchResult) => {
    setIngestingId(paper.arxiv_id);
    try {
      await ingestPaper(paper);
      await fetchIngestedPapers();
    } catch (err: any) {
      alert(`Ingestion Error: ${err.message || err}`);
    } finally {
      setIngestingId(null);
    }
  };

  const completedPapers = ingestedPapers.filter((p) => p.status === "done");

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        ingestedCount={completedPapers.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">

        {/* ── Onboarding Banner (only shown when library is empty) ── */}
        {showOnboarding && activeTab === "discovery" && (
          <div className="glass-panel rounded-2xl p-6 border border-blue-500/20 bg-blue-500/5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-4">
                <div>
                  <h2 className="text-base font-bold text-blue-300">👋 Welcome to AI Research OS</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    Your autonomous research assistant. Follow these 4 steps to get started:
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {WORKFLOW_STEPS.map((s) => (
                    <div
                      key={s.title}
                      className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 space-y-1.5"
                    >
                      <div className="text-2xl">{s.icon}</div>
                      <p className="text-xs font-bold text-slate-200">{s.title}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setShowOnboarding(false)}
                className="text-slate-500 hover:text-slate-300 text-lg shrink-0 mt-0.5"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Tab 1: Discovery ── */}
        {activeTab === "discovery" && (
          <div className="space-y-8">
            {/* Search Box */}
            <div className="glass-panel rounded-2xl p-6">
              <div className="mb-4">
                <h2 className="text-base font-bold text-slate-100">Search arXiv</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Search by topic, keyword, or paper title. Results come directly from arXiv.
                  Click <span className="text-emerald-400 font-semibold">+ Add to OS</span> to download, parse, and index a paper into your library.
                </p>
              </div>
              <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. GraphRAG, Agentic RAG, Qwen2.5-VL, LoRA fine-tuning..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
                >
                  {isSearching ? "Searching arXiv..." : "🔍 Search arXiv"}
                </button>
              </form>
            </div>

            {/* arXiv Search Results */}
            {searchResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-slate-200">arXiv Results</h2>
                  <span className="text-xs text-slate-500">{searchResults.length} papers found</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {searchResults.map((paper) => (
                    <PaperCard
                      key={paper.arxiv_id}
                      paper={paper}
                      onIngest={handleIngest}
                      isIngesting={ingestingId === paper.arxiv_id}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Ingested Paper Library */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-200">Your Knowledge Base</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Papers you've added. Status updates automatically as they download and process.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-500 bg-slate-900/60 px-2 py-1 rounded-lg border border-slate-800">
                  {ingestedPapers.length} total · {completedPapers.length} ready
                </span>
              </div>

              {ingestedPapers.length === 0 ? (
                <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-3">
                  <p className="text-4xl">📚</p>
                  <p className="text-base font-semibold text-slate-300">Your library is empty</p>
                  <p className="text-sm">Search arXiv above and click <span className="text-emerald-400 font-semibold">+ Add to OS</span> on any paper to start building your knowledge base.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {ingestedPapers.map((paper) => (
                    <PaperCard key={paper.id} paper={paper} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: Agent Chat & RAG ── */}
        {activeTab === "chat" && (
          <>
            {completedPapers.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-5 text-center">
                <div className="text-6xl">💬</div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-100 mb-2">Chat & Ask</h2>
                  <p className="text-slate-400 max-w-md">
                    No papers are ready yet. Go to{" "}
                    <button
                      onClick={() => setActiveTab("discovery")}
                      className="text-blue-400 underline hover:text-blue-300"
                    >
                      Paper Discovery
                    </button>
                    , add some papers, and wait for them to finish indexing — then come back here to ask questions.
                  </p>
                </div>
                <div className="glass-panel rounded-2xl p-5 max-w-sm text-left space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">What you can ask</p>
                  <div className="space-y-2 text-sm text-slate-300">
                    <div className="flex gap-3 items-start"><span className="text-blue-400 text-lg">→</span><span>Which models perform best on HotpotQA?</span></div>
                    <div className="flex gap-3 items-start"><span className="text-blue-400 text-lg">→</span><span>Explain the methodology of GraphRAG under Fire</span></div>
                    <div className="flex gap-3 items-start"><span className="text-blue-400 text-lg">→</span><span>Compare these two papers</span></div>
                    <div className="flex gap-3 items-start"><span className="text-blue-400 text-lg">→</span><span>What are the research gaps across all papers?</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <ChatInterface papers={completedPapers} />
            )}
          </>
        )}

        {/* ── Tab 3: Multi-Paper Comparison Matrix ── */}
        {activeTab === "compare" && (
          <>
            {completedPapers.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-5 text-center">
                <div className="text-6xl">📊</div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-100 mb-2">Compare Papers</h2>
                  <p className="text-slate-400 max-w-md">
                    Add at least 2–3 papers via{" "}
                    <button
                      onClick={() => setActiveTab("discovery")}
                      className="text-blue-400 underline hover:text-blue-300"
                    >
                      Paper Discovery
                    </button>{" "}
                    first. Once they're indexed, the comparison matrix will automatically populate with their datasets, models, metrics, and limitations.
                  </p>
                </div>
              </div>
            ) : (
              <ComparisonTable papers={ingestedPapers} />
            )}
          </>
        )}

        {/* ── Tab 4: Literature Review Generator ── */}
        {activeTab === "review" && (
          <LiteratureDraft papers={ingestedPapers} />
        )}
      </main>
    </div>
  );
}
