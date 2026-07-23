"use client";

import React, { useState, useEffect } from "react";
import Navbar from "@/components/Navbar";
import PaperCard from "@/components/PaperCard";
import ChatInterface from "@/components/ChatInterface";
import ComparisonTable from "@/components/ComparisonTable";
import LiteratureDraft from "@/components/LiteratureDraft";
import { searchArxiv, ingestPaper, getPapers, PaperSearchResult, PaperItem } from "@/lib/api";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"discovery" | "chat" | "compare" | "review">("discovery");
  const [searchQuery, setSearchQuery] = useState("GraphRAG");
  const [searchResults, setSearchResults] = useState<PaperSearchResult[]>([]);
  const [ingestedPapers, setIngestedPapers] = useState<PaperItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);

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
    // Poll paper statuses every 4 seconds to reflect live ingestion progression (queued -> parsing -> done)
    const interval = setInterval(fetchIngestedPapers, 4000);
    return () => clearInterval(interval);
  }, []);

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

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        ingestedCount={ingestedPapers.filter(p => p.status === "done").length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Tab 1: Discovery */}
        {activeTab === "discovery" && (
          <div className="space-y-8">
            {/* Search Box */}
            <div className="glass-panel rounded-2xl p-6">
              <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search arXiv by keyword (e.g. GraphRAG, Agentic RAG, Qwen2.5-VL)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
                >
                  {isSearching ? "Searching arXiv..." : "Search arXiv"}
                </button>
              </form>
            </div>

            {/* arXiv Search Results */}
            {searchResults.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-slate-200 mb-4">arXiv Discovery Results</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {searchResults.map(paper => (
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
                <h2 className="text-lg font-bold text-slate-200">Active Knowledge Base Library</h2>
                <span className="text-xs font-mono text-slate-400">Auto-refreshing status</span>
              </div>

              {ingestedPapers.length === 0 ? (
                <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-2">
                  <p className="text-base font-semibold text-slate-300">Your AI Research OS Library is empty.</p>
                  <p className="text-xs">Search arXiv above or add papers to begin building your RAG knowledge graph.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {ingestedPapers.map(paper => (
                    <PaperCard key={paper.id} paper={paper} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Agent Chat & RAG */}
        {activeTab === "chat" && (
          <ChatInterface papers={ingestedPapers.filter(p => p.status === "done")} />
        )}

        {/* Tab 3: Multi-Paper Comparison Matrix */}
        {activeTab === "compare" && (
          <ComparisonTable papers={ingestedPapers} />
        )}

        {/* Tab 4: Literature Review Generator */}
        {activeTab === "review" && (
          <LiteratureDraft papers={ingestedPapers} />
        )}
      </main>
    </div>
  );
}
