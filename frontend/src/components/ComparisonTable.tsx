"use client";

import React from "react";
import { PaperItem } from "@/lib/api";

interface ComparisonTableProps {
  papers: PaperItem[];
}

export default function ComparisonTable({ papers }: ComparisonTableProps) {
  const completedPapers = papers.filter(p => p.status === "done" && p.structured_data);

  if (completedPapers.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center text-slate-400 space-y-3">
        <span className="text-3xl">📊</span>
        <h3 className="text-lg font-bold text-slate-200">No Ingested Papers Available</h3>
        <p className="text-sm max-w-md mx-auto">
          Ingest at least 2 research papers in the <b>Paper Discovery</b> tab to build a side-by-side comparison matrix across tasks, datasets, models, metrics, and limitations.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Multi-Paper Comparison Matrix</h2>
          <p className="text-xs text-slate-400">Side-by-side technical taxonomy across {completedPapers.length} papers</p>
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60">
              <th className="p-4 text-xs font-semibold text-slate-400 uppercase tracking-wider w-44">Attribute</th>
              {completedPapers.map(p => (
                <th key={p.id} className="p-4 text-sm font-bold text-blue-400 min-w-[260px] border-l border-slate-800/80">
                  <div className="line-clamp-2">{p.title}</div>
                  <div className="text-xs font-mono text-slate-500 font-normal mt-1">arXiv:{p.arxiv_id || p.id}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {/* Primary Task */}
            <tr>
              <td className="p-4 font-semibold text-slate-300 bg-slate-950/40">Primary Task</td>
              {completedPapers.map(p => (
                <td key={p.id} className="p-4 border-l border-slate-800/80 text-slate-200">
                  <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                    {p.structured_data?.primary_task || "N/A"}
                  </span>
                </td>
              ))}
            </tr>

            {/* Base / Backbone Models */}
            <tr>
              <td className="p-4 font-semibold text-slate-300 bg-slate-950/40">Backbone Models</td>
              {completedPapers.map(p => (
                <td key={p.id} className="p-4 border-l border-slate-800/80 text-slate-200">
                  <div className="flex flex-wrap gap-1">
                    {p.structured_data?.backbone_models?.length ? (
                      p.structured_data.backbone_models.map((m, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                          {m}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500">Unspecified</span>
                    )}
                  </div>
                </td>
              ))}
            </tr>

            {/* Datasets Evaluated */}
            <tr>
              <td className="p-4 font-semibold text-slate-300 bg-slate-950/40">Datasets Evaluated</td>
              {completedPapers.map(p => (
                <td key={p.id} className="p-4 border-l border-slate-800/80 text-slate-200">
                  <div className="flex flex-wrap gap-1">
                    {p.structured_data?.datasets_used?.length ? (
                      p.structured_data.datasets_used.map((d, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {d}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500">Unspecified</span>
                    )}
                  </div>
                </td>
              ))}
            </tr>

            {/* Benchmark Metrics */}
            <tr>
              <td className="p-4 font-semibold text-slate-300 bg-slate-950/40">Benchmark Metrics</td>
              {completedPapers.map(p => (
                <td key={p.id} className="p-4 border-l border-slate-800/80 text-slate-200 font-mono">
                  {p.structured_data?.benchmark_metrics && Object.keys(p.structured_data.benchmark_metrics).length > 0 ? (
                    <ul className="space-y-1">
                      {Object.entries(p.structured_data.benchmark_metrics).map(([k, v], idx) => (
                        <li key={idx}>
                          <span className="text-slate-400">{k}:</span> <span className="text-emerald-400 font-bold">{String(v)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </td>
              ))}
            </tr>

            {/* Limitations */}
            <tr>
              <td className="p-4 font-semibold text-slate-300 bg-slate-950/40">Limitations</td>
              {completedPapers.map(p => (
                <td key={p.id} className="p-4 border-l border-slate-800/80 text-slate-300">
                  {p.structured_data?.limitations?.length ? (
                    <ul className="list-disc pl-4 space-y-1 text-slate-300">
                      {p.structured_data.limitations.map((l, idx) => (
                        <li key={idx}>{l}</li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-slate-500">None stated</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
