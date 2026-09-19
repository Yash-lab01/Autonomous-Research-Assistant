"use client";

import React, { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import PaperCard from "@/components/PaperCard";
import ChatInterface from "@/components/ChatInterface";
import ComparisonTable from "@/components/ComparisonTable";
import PaperSummary from "@/components/PaperSummary";
import LiteratureDraft from "@/components/LiteratureDraft";
import ResearchGaps from "@/components/ResearchGaps";
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

const SECTIONS = [
  "discovery",
  "library",
  "chat",
  "compare",
  "summary",
  "review",
  "gaps",
  "timeline",
] as const;

export default function Dashboard() {
  const [activeSection, setActiveSection] = useState<string>("discovery");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PaperSearchResult[]>([]);
  const [ingestedPapers, setIngestedPapers] = useState<PaperItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ingestingId, setIngestingId] = useState<string | null>(null);
  const [isBatchIngesting, setIsBatchIngesting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"relevance" | "date" | "updated">("relevance");
  const [maxResults, setMaxResults] = useState<3 | 6 | 10 | 15>(6);
  const [libraryFilter, setLibraryFilter] = useState("");
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

  // IntersectionObserver to spy on scroll position and highlight the active section in Navbar
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
        rootMargin: "-25% 0px -55% 0px",
        threshold: 0,
      }
    );

    SECTIONS.forEach((id) => {
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
    setRemovingId(paperId);
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
    } finally {
      setRemovingId(null);
    }
  };

  const completedPapers = ingestedPapers.filter((p) => p.status === "done");

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-blue-600/30 selection:text-blue-200">
      {/* Sticky, scroll-tracking navbar */}
      <Navbar
        activeSection={activeSection}
        onNavigate={scrollToSection}
        ingestedCount={completedPapers.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-16">
        {/* ── LANDING PAGE HERO (Adhering strictly to guide.txt principles) ── */}
        <section id="hero" className="pt-4 pb-10 border-b border-slate-800/80">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-8 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-slate-900 border border-slate-700/80 text-[11px] font-mono text-blue-400">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span>SCIENTIFIC LITERATURE INTELLIGENCE PLATFORM</span>
              </div>

              <div>
                <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-100 font-serif leading-[1.08]">
                  AI RESEARCH OS
                </h1>
                <p className="text-lg sm:text-xl text-slate-300 font-light mt-3 leading-relaxed">
                  Autonomous literature discovery, multimodal figure extraction, and thesis-grade hypothesis synthesis.
                </p>
              </div>

              {/* Concrete, non-generic explanation of actual capabilities */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 space-y-1.5">
                  <div className="text-xs font-mono font-semibold text-blue-300">01. INGESTION & VISION</div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Downloads arXiv preprints, parses multi-column PDF layouts, and extracts scientific diagrams with AI vision captioning.
                  </p>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 space-y-1.5">
                  <div className="text-xs font-mono font-semibold text-emerald-300">02. DENSE VECTOR MEMORY</div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Indexes chunk embeddings into Qdrant, enabling multi-hop citation tracing and high-speed semantic retrieval via Groq Qwen 27B.
                  </p>
                </div>
                <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-800 space-y-1.5">
                  <div className="text-xs font-mono font-semibold text-amber-300">03. SYNTHESIS WORKBENCH</div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Builds side-by-side benchmark matrices, drafts literature reviews, and cross-examines paper limitations to surface novel research gaps.
                  </p>
                </div>
              </div>

              {/* Quick Jump Anchors */}
              <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-400 font-mono text-[11px] mr-1">Quick Jump:</span>
                <button
                  onClick={() => scrollToSection("discovery")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>🔍</span> Search arXiv
                </button>
                <button
                  onClick={() => scrollToSection("library")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>📚</span> Library ({completedPapers.length})
                </button>
                <button
                  onClick={() => scrollToSection("chat")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>💬</span> Ask Agent
                </button>
                <button
                  onClick={() => scrollToSection("compare")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>📊</span> Compare Matrix
                </button>
                <button
                  onClick={() => scrollToSection("summary")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>📑</span> Deep Summary
                </button>
                <button
                  onClick={() => scrollToSection("review")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>📝</span> Literature Review
                </button>
                <button
                  onClick={() => scrollToSection("gaps")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>⚡</span> Research Gaps
                </button>
                <button
                  onClick={() => scrollToSection("timeline")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span>🗓️</span> Timeline
                </button>
              </div>
            </div>

            {/* Live System Telemetry Card */}
            <div className="lg:col-span-4 bg-slate-900/90 rounded-2xl border border-slate-800 p-5 space-y-4 font-mono text-xs shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="font-semibold text-slate-200">System Telemetry</span>
                <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Operational
                </span>
              </div>

              <div className="space-y-2.5 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Primary Inference:</span>
                  <span className="text-blue-300 font-semibold">Groq (Qwen 27B)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Local Fallback:</span>
                  <span className="text-slate-300">Ollama (qwen2.5:7b)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Vision Model:</span>
                  <span className="text-slate-300">qwen2.5vl:3b (Figures)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Vector Store:</span>
                  <span className="text-emerald-300">Qdrant (:6333)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Indexed Papers:</span>
                  <span className="text-slate-200 font-bold">
                    {completedPapers.length} / {ingestedPapers.length} Ready
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed font-sans">
                Scroll through any section below or use the navigation bar above to jump directly to any tool.
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 1: PAPER DISCOVERY (#discovery) ── */}
        <section id="discovery" className="scroll-mt-24 space-y-6 pt-4 border-b border-slate-800/60 pb-16">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  STEP 01
                </span>
                <h2 className="text-xl font-bold text-slate-100">Paper Discovery</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Query arXiv preprints, filter by relevance or date, and queue papers for hybrid layout and vision ingestion.
              </p>
            </div>
            {searchResults.length > 0 && (
              <button
                onClick={handleIngestAll}
                disabled={
                  isBatchIngesting ||
                  searchResults.every((r) =>
                    ingestedPapers.some((p) => p.arxiv_id === r.arxiv_id)
                  )
                }
                className="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-semibold text-xs disabled:opacity-40 transition-all flex items-center gap-2 font-mono"
              >
                {isBatchIngesting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
                    Ingesting...
                  </>
                ) : (
                  <>
                    📥 Ingest All {searchResults.filter((r) => !ingestedPapers.some((p) => p.arxiv_id === r.arxiv_id)).length} New
                  </>
                )}
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="glass-panel rounded-2xl p-6">
            <form onSubmit={handleSearch} className="flex flex-col gap-3">
              {/* Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-medium shrink-0 font-mono">Sort:</span>
                  {(["relevance", "date", "updated"] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSortBy(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
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
                  <span className="text-xs text-slate-400 font-medium shrink-0 font-mono">Count:</span>
                  {([3, 6, 10, 15] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setMaxResults(n)}
                      className={`w-8 py-1.5 rounded-lg text-xs font-medium border transition-all ${
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

              {/* Input Row */}
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter research topic, method, or title (e.g., GraphRAG, Vision-Language Agents, LoRA)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
                />
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all font-mono"
                >
                  {isSearching ? "Searching arXiv..." : "Search arXiv"}
                </button>
              </div>
            </form>

            {searchError && (
              <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <span className="text-lg">⚠️</span>
                <div className="flex-1 text-xs text-amber-200/90">{searchError}</div>
                <button onClick={() => setSearchError(null)} className="text-amber-400/60 text-sm">✕</button>
              </div>
            )}
          </div>

          {/* Results Grid */}
          {searchResults.length > 0 && (
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
        </section>

        {/* ── SECTION 2: KNOWLEDGE LIBRARY (#library) ── */}
        <section id="library" className="scroll-mt-24 space-y-6 pt-4 border-b border-slate-800/60 pb-16">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                  STEP 02
                </span>
                <h2 className="text-xl font-bold text-slate-100">Knowledge Base Library</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {ingestedPapers.length} ingested paper{ingestedPapers.length !== 1 ? "s" : ""} ·{" "}
                <span className="text-emerald-400 font-semibold">{completedPapers.length} indexed in Qdrant</span>
                {ingestedPapers.length - completedPapers.length > 0 && (
                  <span className="text-amber-400 ml-1">
                    · {ingestedPapers.length - completedPapers.length} actively processing
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={libraryFilter}
                onChange={(e) => setLibraryFilter(e.target.value)}
                placeholder="Filter library by title..."
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/40 w-52"
              />
            </div>
          </div>

          {ingestedPapers.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-3">
              <p className="text-3xl">📚</p>
              <p className="text-base font-semibold text-slate-200">Knowledge base is currently empty</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Search arXiv in Step 01 above and click <span className="text-emerald-400 font-semibold">+ Add to OS</span> to download, parse, and index papers into your vector memory.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {ingestedPapers
                .filter(
                  (p) =>
                    !libraryFilter ||
                    p.title?.toLowerCase().includes(libraryFilter.toLowerCase())
                )
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
        </section>

        {/* ── SECTION 3: AGENTIC CHAT & RAG (#chat) ── */}
        <section id="chat" className="scroll-mt-24 space-y-6 pt-4 border-b border-slate-800/60 pb-16">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                STEP 03
              </span>
              <h2 className="text-xl font-bold text-slate-100">Agentic Chat & Multimodal RAG</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Ask deep technical questions across your indexed papers with streaming execution logs, page citations, and diagrams.
            </p>
          </div>

          {completedPapers.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 text-center text-slate-400 space-y-3">
              <p className="text-3xl">💬</p>
              <p className="text-base font-semibold text-slate-200">No indexed papers available for Chat</p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Ingest at least one paper in Step 01 above. Once indexed, you can ask questions, compare methodologies, and retrieve cited evidence.
              </p>
            </div>
          ) : (
            <ChatInterface papers={completedPapers} />
          )}
        </section>

        {/* ── SECTION 4: MULTI-PAPER COMPARISON MATRIX (#compare) ── */}
        <section id="compare" className="scroll-mt-24 space-y-6 pt-4 border-b border-slate-800/60 pb-16">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                STEP 04
              </span>
              <h2 className="text-xl font-bold text-slate-100">Multi-Paper Comparison Matrix</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Cross-examine tasks, backbone models, datasets, and benchmark metrics side-by-side with point-based prose analysis.
            </p>
          </div>

          <ComparisonTable papers={ingestedPapers} />
        </section>

        {/* ── SECTION 5: DEEP PAPER SUMMARY (#summary) ── */}
        <section id="summary" className="scroll-mt-24 space-y-6 pt-4 border-b border-slate-800/60 pb-16">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                STEP 05
              </span>
              <h2 className="text-xl font-bold text-slate-100">Deep Paper Summary</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Generate single-paper architectural breakdowns or multi-paper synthesis summaries with embedded visual diagram lightboxes.
            </p>
          </div>

          <PaperSummary papers={ingestedPapers} />
        </section>

        {/* ── SECTION 6: LITERATURE REVIEW GENERATOR (#review) ── */}
        <section id="review" className="scroll-mt-24 space-y-6 pt-4 border-b border-slate-800/60 pb-16">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                STEP 06
              </span>
              <h2 className="text-xl font-bold text-slate-100">Literature Review Generator</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Draft comprehensive academic surveys (Introduction, Methodology, Benchmark Gaps) and export formatted citations (BibTeX, APA, IEEE).
            </p>
          </div>

          <LiteratureDraft papers={ingestedPapers} />
        </section>

        {/* ── SECTION 7: RESEARCH GAPS & INNOVATION AGENT (#gaps) ── */}
        <section id="gaps" className="scroll-mt-24 space-y-6 pt-4 border-b border-slate-800/60 pb-16">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                STEP 07
              </span>
              <h2 className="text-xl font-bold text-slate-100">Research Gaps & Novel Idea Agent</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Synthesizes stated limitations and future work across all ingested papers to uncover open problems and thesis ideas.
            </p>
          </div>

          <ResearchGaps papers={ingestedPapers} />
        </section>

        {/* ── SECTION 8: INTERACTIVE RESEARCH TIMELINE (#timeline) ── */}
        <section id="timeline" className="scroll-mt-24 space-y-6 pt-4 pb-16">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                STEP 08
              </span>
              <h2 className="text-xl font-bold text-slate-100">Field Evolution & Timeline</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Interactive chronological timeline tracking publication dates, core methodology transitions, and benchmark performance over time.
            </p>
          </div>

          <ResearchTimeline papers={ingestedPapers} />
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
