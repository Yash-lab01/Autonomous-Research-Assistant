"use client";

import React, { useState, useEffect } from "react";
import { PaperItem, fetchTimelineData, TimelineResponse, TimelinePaperNode } from "@/lib/api";

interface ResearchTimelineProps {
  papers: PaperItem[];
}

export default function ResearchTimeline({ papers }: ResearchTimelineProps) {
  const completedPapers = papers.filter((p) => p.status === "done");
  const [timelineData, setTimelineData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null);

  const loadTimeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTimelineData();
      setTimelineData(data);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTimeline();
  }, [papers]);

  if (completedPapers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
        <div className="text-6xl">🗓️</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Research Timeline & Field Evolution</h2>
          <p className="text-slate-400 max-w-md">
            No papers ready yet. Add papers in <span className="text-blue-400 font-semibold">Paper Discovery</span> and wait for indexing to complete to view your library's research evolution timeline.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="glass-panel rounded-2xl p-6 border border-purple-500/20 bg-purple-500/5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>🗓️ Interactive Research Timeline & Field Evolution</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Visualizes the chronological progression of tasks, backbone models, and benchmark methodologies across publication dates in your knowledge base.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter timeline by model, dataset, or keyword..."
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500/60 w-64"
            />
            <button
              onClick={loadTimeline}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-all"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Taxonomy Counters */}
        {timelineData?.taxonomies && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/60">
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider block">
                Primary Research Domains
              </span>
              <span className="text-base font-bold text-slate-100">
                {timelineData.taxonomies.unique_tasks.length} Domains
              </span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider block">
                Backbone Architectures
              </span>
              <span className="text-base font-bold text-slate-100">
                {timelineData.taxonomies.unique_models.length} Models
              </span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">
                Evaluated Datasets
              </span>
              <span className="text-base font-bold text-slate-100">
                {timelineData.taxonomies.unique_datasets.length} Benchmarks
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="glass-panel rounded-2xl p-12 text-center text-slate-400">
          <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Building Chronological Field Evolution Timeline...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="glass-panel rounded-2xl p-6 text-center text-rose-400 border border-rose-500/20">
          <p className="text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Timeline Tree Visualization */}
      {timelineData && !loading && (
        <div className="glass-panel rounded-2xl p-8 relative overflow-hidden">
          {/* Vertical connecting line */}
          <div className="absolute left-8 md:left-1/2 top-12 bottom-12 w-0.5 bg-gradient-to-b from-purple-500 via-indigo-500 to-blue-500 opacity-30 -translate-x-1/2 hidden sm:block" />

          <div className="space-y-12 relative z-10">
            {timelineData.milestones.map((milestone, idx) => {
              const filteredPapers = milestone.papers.filter((p) => {
                if (!searchFilter.trim()) return true;
                const query = searchFilter.toLowerCase();
                return (
                  p.title.toLowerCase().includes(query) ||
                  p.primary_task.toLowerCase().includes(query) ||
                  p.backbone_models.some((m) => m.toLowerCase().includes(query)) ||
                  p.datasets_used.some((d) => d.toLowerCase().includes(query))
                );
              });

              if (filteredPapers.length === 0) return null;

              return (
                <div key={milestone.year} className="space-y-6">
                  {/* Year Milestone Badge */}
                  <div className="flex items-center justify-center">
                    <span className="px-5 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-sm shadow-lg shadow-purple-600/30 border border-purple-400/40">
                      🗓️ {milestone.year} ({filteredPapers.length} Paper{filteredPapers.length !== 1 ? "s" : ""})
                    </span>
                  </div>

                  {/* Milestone Paper Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredPapers.map((paper) => {
                      const isExpanded = expandedPaperId === paper.id;
                      return (
                        <div
                          key={paper.id}
                          className={`glass-panel rounded-xl p-5 border transition-all duration-300 space-y-3 ${
                            isExpanded
                              ? "border-purple-500/60 bg-purple-950/20 shadow-xl"
                              : "border-slate-800 hover:border-purple-500/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                              {paper.published_date || paper.year}
                            </span>
                            {paper.primary_task && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                {paper.primary_task}
                              </span>
                            )}
                          </div>

                          <h4 className="font-bold text-slate-100 text-sm line-clamp-2 leading-snug">
                            {paper.title}
                          </h4>

                          {paper.authors && paper.authors.length > 0 && (
                            <p className="text-[11px] text-slate-400">
                              👨‍🔬 {paper.authors.slice(0, 3).join(", ")}
                              {paper.authors.length > 3 ? " et al." : ""}
                            </p>
                          )}

                          {/* Tech Taxonomy Chips */}
                          <div className="flex flex-wrap gap-1">
                            {paper.backbone_models.map((m, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px]"
                              >
                                {m}
                              </span>
                            ))}
                            {paper.datasets_used.map((d, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px]"
                              >
                                {d}
                              </span>
                            ))}
                          </div>

                          <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed">
                            {paper.methodology_summary}
                          </p>

                          {/* Toggle expand details */}
                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                            <button
                              onClick={() => setExpandedPaperId(isExpanded ? null : paper.id)}
                              className="text-[11px] font-medium text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
                            >
                              <span>{isExpanded ? "▲ Less Details" : "▼ Methodology & Metrics"}</span>
                            </button>

                            {paper.pdf_url && (
                              <a
                                href={paper.pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-slate-400 hover:text-white"
                              >
                                📄 View PDF →
                              </a>
                            )}
                          </div>

                          {/* Expanded Details Panel */}
                          {isExpanded && (
                            <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-purple-500/30 text-xs space-y-2">
                              {paper.benchmark_metrics && Object.keys(paper.benchmark_metrics).length > 0 && (
                                <div>
                                  <span className="font-semibold text-emerald-400 block mb-1">
                                    Benchmark Metrics:
                                  </span>
                                  <ul className="space-y-1 font-mono text-[11px]">
                                    {Object.entries(paper.benchmark_metrics).map(([k, v], i) => (
                                      <li key={i}>
                                        <span className="text-slate-400">{k}:</span>{" "}
                                        <span className="text-emerald-300 font-bold">{String(v)}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {paper.notes && (
                                <div className="pt-2 border-t border-slate-800">
                                  <span className="font-semibold text-blue-300 block mb-1">Researcher Notes:</span>
                                  <p className="text-slate-300 text-[11px] italic">{paper.notes}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
