"use client";

import React, { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import PaperCard from "@/components/PaperCard";
import ChatInterface from "@/components/ChatInterface";
import SynthesisStudio from "@/components/SynthesisStudio";
import ResearchTimeline from "@/components/ResearchTimeline";
import {
  searchArxiv,
  ingestPaper,
  ingestAllPapers,
  retryPaper,
  getPapers,
  deletePaper,
  PaperSearchResult,
  PaperItem,
} from "@/lib/api";

const PILLARS = ["papers", "studio", "copilot"] as const;

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<string>("papers");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PaperSearchResult[]>([]);
  const [ingestedPapers, setIngestedPapers] = useState<PaperItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [isBatchIngesting, setIsBatchIngesting] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"relevance" | "date" | "updated">("relevance");
  const [maxResults, setMaxResults] = useState<3 | 6 | 10 | 15>(6);
  const [libraryFilter, setLibraryFilter] = useState("");
  const [paperHubView, setPaperHubView] = useState<"library" | "search">("library");
  const [copilotView, setCopilotView] = useState<"chat" | "timeline">("chat");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const fetchIngestedPapers = async () => {
    try {
      const data = await getPapers();
      setIngestedPapers(data);
    } catch (e) {
      console.error("Failed to fetch ingested papers:", e);
    }
  };

  const ingestedPapersRef = useRef(ingestedPapers);
  useEffect(() => {
    ingestedPapersRef.current = ingestedPapers;
  }, [ingestedPapers]);

  const ACTIVE_STATUSES = new Set(["queued", "downloading", "parsing", "extracting", "embedding"]);

  useEffect(() => {
    fetchIngestedPapers();

    const interval = setInterval(() => {
      const hasActive = ingestedPapersRef.current.some((p) => ACTIVE_STATUSES.has(p.status));
      if (hasActive) {
        fetchIngestedPapers();
      }
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IntersectionObserver to spy on scroll position and highlight the active pillar in Navbar
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0,
      }
    );

    PILLARS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [ingestedPapers.length, searchResults.length]);

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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
    setPaperHubView("search");
    try {
      const results = await searchArxiv(searchQuery, maxResults, sortBy);
      setSearchResults(results);
    } catch (err: any) {
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
      showToast(`"${paper.title.slice(0, 45)}..." added to library`);
    } catch (err: any) {
      let msg = err?.message || String(err);
      try {
        const p = JSON.parse(msg);
        msg = p?.detail || msg;
      } catch {}
      setIngestError(msg);
    } finally {
      setIngestingId(null);
    }
  };

  const handleIngestAll = async () => {
    const notYetIngested = searchResults.filter(
      (r) => !ingestedPapers.some((p) => p.arxiv_id === r.arxiv_id)
    );
    if (!notYetIngested.length) return;
    setIsBatchIngesting(true);
    try {
      const res = await ingestAllPapers(notYetIngested);
      await fetchIngestedPapers();
      showToast(
        `Queued ${res.queued.length} papers${
          res.skipped.length ? `, skipped ${res.skipped.length} duplicates` : ""
        }`
      );
    } catch (err: any) {
      let msg = err?.message || String(err);
      try {
        const p = JSON.parse(msg);
        msg = p?.detail || msg;
      } catch {}
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
    try {
      await deletePaper(paperId);
      await fetchIngestedPapers();
      showToast("Paper removed from library");
    } catch (err: any) {
      let msg = err?.message || String(err);
      try {
        const p = JSON.parse(msg);
        msg = p?.detail || msg;
      } catch {}
      setIngestError(msg);
    }
  };

  const completedPapers = ingestedPapers.filter((p) => p.status === "done");

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-blue-600/30 selection:text-blue-200">
      {/* 3-Pillar Sticky Navbar */}
      <Navbar
        activeSection={activeSection}
        onNavigate={scrollToSection}
        ingestedCount={completedPapers.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-16">
        {/* ── CLUTTER-FREE LANDING HERO ── */}
        <section id="hero" className="pt-6 pb-8 border-b border-slate-800/80">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700/80 text-[11px] font-mono text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>AUTONOMOUS SCIENTIFIC RESEARCH INTELLIGENCE</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-100 font-serif leading-tight">
              AI RESEARCH OS
            </h1>

            <p className="text-base text-slate-300 font-light leading-relaxed">
              An autonomous research workspace that discovers arXiv preprints, extracts figures with vision models, and synthesizes multi-paper comparative matrices and literature surveys.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-mono">
              <button
                onClick={() => scrollToSection("papers")}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all flex items-center gap-2 shadow-sm"
              >
                <span>📚</span> 01. Paper Hub ↓
              </button>
              <button
                onClick={() => scrollToSection("studio")}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold transition-all flex items-center gap-2"
              >
                <span>🔬</span> 02. Synthesis Studio ↓
              </button>
              <button
                onClick={() => scrollToSection("copilot")}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold transition-all flex items-center gap-2"
              >
                <span>💬</span> 03. Agent Copilot ↓
              </button>
              <div className="ml-auto text-slate-400 text-[11px] hidden sm:block">
                ● Groq Qwen 27B · Qdrant :6333 · {completedPapers.length} Papers Ready
              </div>
            </div>
          </div>
        </section>

        {/* ── PILLAR 1: PAPER HUB (#papers) ── */}
        <section id="papers" className="scroll-mt-24 space-y-6 pt-2 border-b border-slate-800/60 pb-16">
          <div className="glass-panel rounded-2xl p-6 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    PILLAR 01
                  </span>
                  <h2 className="text-xl font-bold text-slate-100">Paper Hub</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Query arXiv preprints and manage your indexed vector knowledge base in one unified place.
                </p>
              </div>

              {/* View Mode Toggle: Library vs arXiv Search Results */}
              <div className="flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/90 font-mono text-xs">
                <button
                  onClick={() => setPaperHubView("library")}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    paperHubView === "library"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>📚</span>
                  <span>My Library ({ingestedPapers.length})</span>
                </button>
                <button
                  onClick={() => setPaperHubView("search")}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    paperHubView === "search"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>🔍</span>
                  <span>arXiv Results ({searchResults.length})</span>
                </button>
              </div>
            </div>

            {/* arXiv Search Bar */}
            <form onSubmit={handleSearch} className="flex flex-col gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">Sort:</span>
                  {(["relevance", "date", "updated"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortBy(key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        sortBy === key
                          ? "bg-blue-600/30 text-blue-300 border-blue-500/50"
                          : "bg-slate-900/60 text-slate-400 border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {key === "relevance" ? "🎯 Relevance" : key === "date" ? "🆕 Latest" : "🔄 Updated"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-slate-400 font-mono">Count:</span>
                  {([3, 6, 10, 15] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMaxResults(n)}
                      className={`w-7 py-1 rounded-lg text-xs font-medium border transition-all ${
                        maxResults === n
                          ? "bg-blue-600/30 text-blue-300 border-blue-500/50"
                          : "bg-slate-900/60 text-slate-400 border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search arXiv by topic, method, or title (e.g., GraphRAG, Agentic RAG, LoRA)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs font-mono disabled:opacity-50 transition-all shrink-0"
                >
                  {isSearching ? "Searching arXiv..." : "Search arXiv"}
                </button>
              </div>
            </form>

            {searchError && (
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                <span>⚠️</span>
                <span className="flex-1">{searchError}</span>
                <button onClick={() => setSearchError(null)} className="text-amber-400/60">✕</button>
              </div>
            )}
          </div>

          {/* Tab 1: Library View */}
          {paperHubView === "library" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400 font-mono">
                  {completedPapers.length} / {ingestedPapers.length} ready in vector index
                </p>
                <input
                  type="text"
                  value={libraryFilter}
                  onChange={(e) => setLibraryFilter(e.target.value)}
                  placeholder="Filter library..."
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/40 w-48"
                />
              </div>

              {ingestedPapers.length === 0 ? (
                <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-2">
                  <p className="text-3xl">📚</p>
                  <p className="text-sm font-semibold text-slate-200">Your library is currently empty</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Type a query above to search arXiv and click <span className="text-emerald-400 font-semibold">+ Add to OS</span> on papers you want to study.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {ingestedPapers
                    .filter((p) => !libraryFilter || p.title?.toLowerCase().includes(libraryFilter.toLowerCase()))
                    .map((paper) => (
                      <div key={paper.id} className="relative">
                        {paper.status === "failed" && (
                          <button
                            onClick={() => handleRetry(paper.id)}
                            disabled={retryingId === paper.id}
                            className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-bold transition-all"
                          >
                            {retryingId === paper.id ? "⟳" : "🔁 Retry"}
                          </button>
                        )}
                        <PaperCard paper={paper} onRemove={handleRemovePaper} />
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: arXiv Search Results View */}
          {paperHubView === "search" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400 font-mono">
                  {searchResults.length} arXiv preprints found
                </p>
                {searchResults.length > 0 && (
                  <button
                    onClick={handleIngestAll}
                    disabled={
                      isBatchIngesting ||
                      searchResults.every((r) =>
                        ingestedPapers.some((p) => p.arxiv_id === r.arxiv_id)
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold text-xs disabled:opacity-40 transition-all flex items-center gap-2 font-mono"
                  >
                    {isBatchIngesting ? (
                      <>
                        <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
                        Queuing...
                      </>
                    ) : (
                      <>
                        📥 Ingest All {searchResults.filter((r) => !ingestedPapers.some((p) => p.arxiv_id === r.arxiv_id)).length} New
                      </>
                    )}
                  </button>
                )}
              </div>

              {searchResults.length === 0 ? (
                <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-2">
                  <p className="text-3xl">🔍</p>
                  <p className="text-sm font-semibold text-slate-200">No search results yet</p>
                  <p className="text-xs text-slate-400">Enter a query in the search bar above to fetch arXiv papers.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {searchResults.map((paper) => {
                    const alreadyIn = ingestedPapers.some((p) => p.arxiv_id === paper.arxiv_id);
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
              )}
            </div>
          )}
        </section>

        {/* ── PILLAR 2: SYNTHESIS STUDIO (#studio) ── */}
        <section id="studio" className="scroll-mt-24 space-y-6 pt-2 border-b border-slate-800/60 pb-16">
          <SynthesisStudio papers={ingestedPapers} />
        </section>

        {/* ── PILLAR 3: AGENT COPILOT & TIMELINE (#copilot) ── */}
        <section id="copilot" className="scroll-mt-24 space-y-6 pt-2 pb-16">
          <div className="glass-panel rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    PILLAR 03
                  </span>
                  <h2 className="text-xl font-bold text-slate-100">Agent Copilot & Evolution</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Interact directly with your literature base via multimodal RAG or examine the chronological timeline.
                </p>
              </div>

              {/* View Switcher: Chat vs Timeline */}
              <div className="flex items-center gap-1 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800/90 font-mono text-xs">
                <button
                  onClick={() => setCopilotView("chat")}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    copilotView === "chat"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>💬</span>
                  <span>RAG Chat Assistant</span>
                </button>
                <button
                  onClick={() => setCopilotView("timeline")}
                  className={`px-3.5 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                    copilotView === "timeline"
                      ? "bg-blue-600 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span>🗓️</span>
                  <span>Field Evolution Timeline</span>
                </button>
              </div>
            </div>
          </div>

          {/* Active Copilot Mode */}
          {copilotView === "chat" ? (
            completedPapers.length === 0 ? (
              <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-3">
                <p className="text-3xl">💬</p>
                <p className="text-base font-semibold text-slate-200">No indexed papers ready for Chat</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Add papers in Pillar 01 (Paper Hub) above. Once indexed, you can ask questions with reasoning steps and page citations.
                </p>
              </div>
            ) : (
              <ChatInterface papers={completedPapers} />
            )
          ) : (
            <ResearchTimeline papers={ingestedPapers} />
          )}
        </section>
      </main>

      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 ${
            toast.type === "success"
              ? "bg-emerald-950/90 border-emerald-500/40 text-emerald-300"
              : "bg-rose-950/90 border-rose-500/40 text-rose-300"
          }`}
        >
          <span>{toast.type === "success" ? "✅" : "❌"}</span>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-2 text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
