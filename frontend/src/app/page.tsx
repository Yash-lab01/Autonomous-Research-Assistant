"use client";

import React, { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import PaperCard from "@/components/PaperCard";
import ChatInterface from "@/components/ChatInterface";
import ComparisonTable from "@/components/ComparisonTable";
import LiteratureDraft from "@/components/LiteratureDraft";
import ResearchGaps from "@/components/ResearchGaps";
import ResearchTimeline from "@/components/ResearchTimeline";
import { searchArxiv, ingestPaper, ingestAllPapers, retryPaper, getPapers, deletePaper, PaperSearchResult, PaperItem } from "@/lib/api";

const WORKFLOW_STEPS = [
  {
    icon: "🔍",
    title: "1. Discover Papers",
    desc: "Search arXiv for any research topic and add papers to your OS library.",
  },
  {
    icon: "💬",
    title: "2. Ask Questions",
    desc: "Chat with your papers — get cited answers, method breakdowns, and comparisons.",
  },
  {
    icon: "📊",
    title: "3. Compare",
    desc: "Select papers and view a side-by-side matrix of datasets, models, and metrics.",
  },
  {
    icon: "📝",
    title: "4. Generate Review",
    desc: "Auto-generate a structured literature survey draft with references.",
  },
  {
    icon: "⚡",
    title: "5. Discover Gaps",
    desc: "Synthesize limitations & future work to find open research problems.",
  },
  {
    icon: "🗓️",
    title: "6. Field Evolution",
    desc: "Chronological timeline of tasks, models, and benchmark metrics over time.",
  },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"discovery" | "chat" | "compare" | "review" | "gaps" | "timeline">("discovery");
  const [searchQuery, setSearchQuery] = useState(""); // ← always blank on load
  const [searchResults, setSearchResults] = useState<PaperSearchResult[]>([]);
  const [ingestedPapers, setIngestedPapers] = useState<PaperItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [isBatchIngesting, setIsBatchIngesting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"relevance" | "date" | "updated">("relevance");
  const [maxResults, setMaxResults] = useState<3 | 6 | 10 | 15>(6);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const libraryRef = useRef<HTMLDivElement>(null);

  const fetchIngestedPapers = async () => {
    try {
      const data = await getPapers();
      setIngestedPapers(data);
    } catch (e) {
      console.error("Failed to fetch ingested papers:", e);
    }
  };

  // Keep a ref to the latest ingestedPapers so the interval can read it without re-registering
  const ingestedPapersRef = useRef(ingestedPapers);
  useEffect(() => { ingestedPapersRef.current = ingestedPapers; }, [ingestedPapers]);

  const ACTIVE_STATUSES = new Set(["queued", "downloading", "parsing", "extracting", "embedding"]);

  useEffect(() => {
    fetchIngestedPapers(); // initial load on mount

    // Smart poll: only hits the API when at least one paper is actively processing
    const interval = setInterval(() => {
      const hasActive = ingestedPapersRef.current.some(p => ACTIVE_STATUSES.has(p.status));
      if (hasActive) {
        fetchIngestedPapers();
      }
    }, 4000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    try {
      const results = await searchArxiv(searchQuery, maxResults, sortBy);
      setSearchResults(results);
    } catch (err: any) {
      // Parse a clean message — avoid showing raw JSON to the user
      let msg = err?.message || String(err);
      try {
        const parsed = JSON.parse(msg);
        msg = parsed?.detail || msg;
      } catch {}
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleIngest = async (paper: PaperSearchResult) => {
    setIngestingId(paper.arxiv_id);
    setIngestError(null);
    try {
      await ingestPaper(paper);
      await fetchIngestedPapers();
      setShowLibrary(true);
      showToast(`"${paper.title.slice(0, 50)}..." added to library`);
    } catch (err: any) {
      let msg = err?.message || String(err);
      try { const p = JSON.parse(msg); msg = p?.detail || msg; } catch {}
      setIngestError(msg);
    } finally {
      setIngestingId(null);
    }
  };

  const handleIngestAll = async () => {
    const notYetIngested = searchResults.filter(r => !ingestedPapers.some(p => p.arxiv_id === r.arxiv_id));
    if (!notYetIngested.length) return;
    setIsBatchIngesting(true);
    try {
      const res = await ingestAllPapers(notYetIngested);
      await fetchIngestedPapers();
      setShowLibrary(true);
      showToast(`Queued ${res.queued.length} papers${res.skipped.length ? `, skipped ${res.skipped.length} duplicates` : ""}`);
    } catch (err: any) {
      let msg = err?.message || String(err);
      try { const p = JSON.parse(msg); msg = p?.detail || msg; } catch {}
      showToast(msg, "error");
    } finally {
      setIsBatchIngesting(false);
    }
  };

  const handleRetry = async (paperId: string) => {
    setRetryingId(paperId);
    try {
      await retryPaper(paperId);
      await fetchIngestedPapers();
      showToast("Paper re-queued for retry");
    } catch (err: any) {
      showToast("Retry failed: " + (err?.message || String(err)), "error");
    } finally {
      setRetryingId(null);
    }
  };

  const handleRemovePaper = async (paperId: string) => {
    setRemovingId(paperId);
    try {
      await deletePaper(paperId);
      await fetchIngestedPapers();
    } catch (err: any) {
      let msg = err?.message || String(err);
      try { const p = JSON.parse(msg); msg = p?.detail || msg; } catch {}
      setIngestError(msg);
    } finally {
      setRemovingId(null);
    }
  };

  const handleShowLibrary = () => {
    setShowLibrary(true);
    setTimeout(() => libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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

        {/* ── Tab 1: Discovery ── */}
        {activeTab === "discovery" && (
          <div className="space-y-8">

            {/* Welcome Banner — always shown on Discovery tab */}
            <div className="glass-panel rounded-2xl p-6 border border-blue-500/20 bg-blue-500/5">
              <div className="mb-4">
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

            {/* Search Box */}
            <div className="glass-panel rounded-2xl p-6">
              <div className="mb-4">
                <h2 className="text-base font-bold text-slate-100">Search arXiv</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Search by topic, keyword, or paper title. Click{" "}
                  <span className="text-emerald-400 font-semibold">+ Add to OS</span> to download, parse,
                  and index a paper into your library.
                </p>
              </div>
              <form onSubmit={handleSearch} className="flex flex-col gap-3">
                {/* Sort + Count Row */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium shrink-0">Sort by:</span>
                    {(["relevance", "date", "updated"] as const).map((key) => (
                      <button key={key} type="button" onClick={() => setSortBy(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          sortBy === key ? "bg-blue-600/30 text-blue-300 border-blue-500/50" : "bg-slate-900/60 text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500"
                        }`}>
                        {key === "relevance" ? "🎯 Relevance" : key === "date" ? "🆕 Latest" : "🔄 Updated"}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-500 font-medium shrink-0">Results:</span>
                    {([3, 6, 10, 15] as const).map((n) => (
                      <button key={n} type="button" onClick={() => setMaxResults(n)}
                        className={`w-9 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          maxResults === n ? "bg-blue-600/30 text-blue-300 border-blue-500/50" : "bg-slate-900/60 text-slate-400 border-slate-700 hover:text-slate-200"
                        }`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Input Row */}
                <div className="flex flex-col md:flex-row gap-3">
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. GraphRAG, Agentic RAG, Qwen2.5-VL, LoRA fine-tuning..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                  />
                  <button type="submit" disabled={isSearching || !searchQuery.trim()}
                    className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all">
                    {isSearching ? "Searching arXiv..." : "🔍 Search arXiv"}
                  </button>
                </div>
              </form>

              {/* Search Error Banner */}
              {searchError && (
                <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <span className="text-xl shrink-0">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-300">Search Failed</p>
                    <p className="text-xs text-amber-200/70 mt-0.5 leading-relaxed">{searchError}</p>
                  </div>
                  <button
                    onClick={() => setSearchError(null)}
                    className="text-amber-400/60 hover:text-amber-300 text-lg shrink-0"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* arXiv Search Results */}
            {searchResults.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-200">arXiv Results</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{searchResults.length} papers · {searchResults.filter(r => ingestedPapers.some(p => p.arxiv_id === r.arxiv_id)).length} already in library</p>
                  </div>
                  <button
                    onClick={handleIngestAll}
                    disabled={isBatchIngesting || searchResults.every(r => ingestedPapers.some(p => p.arxiv_id === r.arxiv_id))}
                    className="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold text-xs disabled:opacity-40 transition-all flex items-center gap-2"
                  >
                    {isBatchIngesting ? (
                      <><span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" /> Queuing...</>
                    ) : (
                      <>📥 Ingest All {searchResults.filter(r => !ingestedPapers.some(p => p.arxiv_id === r.arxiv_id)).length} New</>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {searchResults.map((paper) => {
                    const alreadyIn = ingestedPapers.some(p => p.arxiv_id === paper.arxiv_id);
                    return (
                      <div key={paper.arxiv_id} className="relative">
                        {alreadyIn && (
                          <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                            ✓ In Library
                          </div>
                        )}
                        <PaperCard
                          paper={paper}
                          onIngest={alreadyIn ? undefined : handleIngest}
                          isIngesting={ingestingId === paper.arxiv_id}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Knowledge Base Indicator / Toggle */}
            {ingestedPapers.length > 0 && (
              <div>
                {!showLibrary ? (
                  /* Collapsed indicator */
                  <button onClick={handleShowLibrary}
                    className="w-full glass-panel rounded-2xl p-5 flex items-center justify-between hover:border-blue-500/30 transition-all group">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600/30 to-indigo-600/30 border border-blue-500/20 flex items-center justify-center text-lg">📚</div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-slate-200 group-hover:text-blue-300 transition-colors">Your Knowledge Base</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {ingestedPapers.length} paper{ingestedPapers.length !== 1 ? "s" : ""} total ·{" "}
                          <span className="text-emerald-400">{completedPapers.length} ready</span>
                          {ingestedPapers.length - completedPapers.length > 0 && (
                            <span className="text-amber-400 ml-1">· {ingestedPapers.length - completedPapers.length} processing</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 group-hover:text-blue-300 transition-colors">
                      <span className="text-xs font-medium">View Library</span>
                      <span className="text-lg">↓</span>
                    </div>
                  </button>
                ) : (
                  /* Expanded library */
                  <div ref={libraryRef} className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-base font-bold text-slate-200">Your Knowledge Base</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {ingestedPapers.length} total · {completedPapers.length} ready
                          {ingestedPapers.filter(p => p.status !== "done" && p.status !== "failed").length > 0 && (
                            <span className="text-amber-400 ml-1">
                              · {ingestedPapers.filter(p => p.status !== "done" && p.status !== "failed").length} processing
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="text" value={libraryFilter} onChange={(e) => setLibraryFilter(e.target.value)}
                          placeholder="Filter library..." className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/40 w-44" />
                        <button onClick={() => setShowLibrary(false)}
                          className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-600 transition-colors">
                          ↑ Collapse
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {ingestedPapers
                        .filter(p => !libraryFilter || p.title?.toLowerCase().includes(libraryFilter.toLowerCase()))
                        .map((paper) => (
                        <div key={paper.id} className="relative">
                          {paper.status === "failed" && (
                            <button onClick={() => handleRetry(paper.id)} disabled={retryingId === paper.id}
                              className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-bold transition-all">
                              {retryingId === paper.id ? "⟳" : "🔁 Retry"}
                            </button>
                          )}
                          <PaperCard paper={paper} onRemove={handleRemovePaper} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            )}

            {/* Empty library — shown only if no papers at all */}
            {ingestedPapers.length === 0 && searchResults.length === 0 && (
              <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-3">
                <p className="text-4xl">📚</p>
                <p className="text-base font-semibold text-slate-300">Your library is empty</p>
                <p className="text-sm">
                  Search arXiv above and click{" "}
                  <span className="text-emerald-400 font-semibold">+ Add to OS</span> on any paper to
                  start building your knowledge base.
                </p>
              </div>
            )}

            {/* Ingest / Remove Error Banner */}
            {ingestError && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <span className="text-xl shrink-0">❌</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-rose-300">Action Failed</p>
                  <p className="text-xs text-rose-200/70 mt-0.5 leading-relaxed">{ingestError}</p>
                </div>
                <button
                  onClick={() => setIngestError(null)}
                  className="text-rose-400/60 hover:text-rose-300 text-lg shrink-0"
                >
                  ✕
                </button>
              </div>
            )}
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
                    <button onClick={() => setActiveTab("discovery")} className="text-blue-400 underline hover:text-blue-300">
                      Paper Discovery
                    </button>
                    , add some papers, and wait for them to finish indexing — then come back here.
                  </p>
                </div>
                <div className="glass-panel rounded-2xl p-5 max-w-sm text-left space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">What you can ask</p>
                  <div className="space-y-2 text-sm text-slate-300">
                    <div className="flex gap-3 items-start"><span className="text-blue-400">→</span><span>Which models perform best on HotpotQA?</span></div>
                    <div className="flex gap-3 items-start"><span className="text-blue-400">→</span><span>Explain the methodology in GraphRAG under Fire</span></div>
                    <div className="flex gap-3 items-start"><span className="text-blue-400">→</span><span>Compare these two papers side-by-side</span></div>
                    <div className="flex gap-3 items-start"><span className="text-blue-400">→</span><span>What are the research gaps across all papers?</span></div>
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
          <ComparisonTable papers={ingestedPapers} />
        )}

        {/* ── Tab 4: Literature Review Generator ── */}
        {activeTab === "review" && (
          <LiteratureDraft papers={ingestedPapers} />
        )}

        {/* ── Tab 5: Research Gap & Innovation Agent ── */}
        {activeTab === "gaps" && (
          <ResearchGaps papers={ingestedPapers} />
        )}

        {/* ── Tab 6: Interactive Research Timeline ── */}
        {activeTab === "timeline" && (
          <ResearchTimeline papers={ingestedPapers} />
        )}
      </main>

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
          toast.type === "success"
            ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-300"
            : "bg-rose-950/90 border-rose-500/40 text-rose-300"
        }`}>
          <span>{toast.type === "success" ? "✅" : "❌"}</span>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
}
