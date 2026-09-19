"use client";

import React, { useState, useEffect, useRef } from "react";
import { PaperItem, CitationGraphData, CitationGraphNode, CitationGraphEdge, fetchCitationGraph } from "@/lib/api";

interface CitationGraphProps {
  papers: PaperItem[];
}

const TASK_COLORS: Record<string, string> = {
  "RAG": "#3b82f6", // blue
  "GraphRAG": "#8b5cf6", // purple
  "Reasoning": "#10b981", // emerald
  "Code Generation": "#f59e0b", // amber
  "Vision-Language": "#ec4899", // pink
  "Agent Architecture": "#06b6d4", // cyan
  "Default": "#64748b" // slate
};

function getTaskColor(task: string): string {
  for (const [key, color] of Object.entries(TASK_COLORS)) {
    if (task.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return TASK_COLORS.Default;
}

export default function CitationGraph({ papers }: CitationGraphProps) {
  const [data, setData] = useState<CitationGraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<CitationGraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTask, setSelectedTask] = useState<string>("all");

  // Canvas pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // Simulated node positions
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    setLoading(true);
    fetchCitationGraph()
      .then((res) => {
        setData(res);
        // Compute circular / force layout initial positions
        const count = res.nodes.length;
        const initialPos: Record<string, { x: number; y: number }> = {};
        const radius = Math.min(280, Math.max(160, count * 35));
        const centerX = 400;
        const centerY = 300;

        res.nodes.forEach((node, i) => {
          const angle = (2 * Math.PI * i) / Math.max(1, count);
          // Scatter slightly by year and landmark status
          const r = node.is_landmark ? radius * 0.5 : radius * (0.8 + (i % 3) * 0.15);
          initialPos[node.id] = {
            x: centerX + r * Math.cos(angle),
            y: centerY + r * Math.sin(angle)
          };
        });
        setPositions(initialPos);
      })
      .catch((err) => console.error("Error loading citation graph:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => setIsPanning(false);

  const handleZoomIn = () => setZoom((z) => Math.min(2.5, z + 0.2));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, z - 0.2));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-mono">Synthesizing cross-citation network & co-citation clusters...</p>
      </div>
    );
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center text-slate-500 space-y-2">
        <p className="text-3xl">🕸️</p>
        <p className="text-sm font-semibold text-slate-400">No cross-citations detected yet</p>
        <p className="text-xs">Ingest more research papers to build your interactive citation lineage graph.</p>
      </div>
    );
  }

  // Filter nodes based on search and task filter
  const visibleNodes = data.nodes.filter((node) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      node.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (node.arxiv_id && node.arxiv_id.includes(searchQuery));
    const matchesTask = selectedTask === "all" || node.primary_task === selectedTask;
    return matchesSearch && matchesTask;
  });

  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

  // Filter edges where both ends are visible
  const visibleEdges = data.edges.filter(
    (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );

  return (
    <div className="space-y-4">
      {/* Top Controls Toolbar */}
      <div className="glass-panel rounded-2xl p-4 border border-purple-500/20 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="text-lg">🕸️</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">Citation Lineage & Co-Citation Network</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                Connected Papers Parity
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {data.total_nodes} papers · {data.total_edges} cross-citation links
            </p>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Task cluster filter */}
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
          >
            <option value="all">All Research Fields</option>
            {data.clusters.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Search box */}
          <input
            type="text"
            placeholder="Search paper in graph..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 w-44"
          />

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={handleZoomIn}
              className="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded text-xs font-mono cursor-pointer"
              title="Zoom In"
            >
              +
            </button>
            <button
              onClick={handleZoomOut}
              className="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded text-xs font-mono cursor-pointer"
              title="Zoom Out"
            >
              −
            </button>
            <button
              onClick={handleReset}
              className="px-2 py-1 hover:bg-slate-800 text-slate-300 rounded text-[10px] font-mono cursor-pointer"
              title="Reset View"
            >
              ⟲
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Graph Canvas & Side Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* SVG Canvas Container */}
        <div
          className="lg:col-span-3 glass-panel rounded-2xl border border-slate-800 bg-slate-950/80 h-[550px] relative overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-2xl"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Subtle Grid Background */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#64748b" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Interactive Graph SVG */}
          <svg
            className="w-full h-full"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "center center",
              transition: isPanning ? "none" : "transform 0.1s ease-out"
            }}
          >
            <defs>
              {/* Arrowhead marker for directed citations */}
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="20"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
              </marker>
            </defs>

            {/* Edges */}
            <g className="edges">
              {visibleEdges.map((edge, idx) => {
                const src = positions[edge.source];
                const tgt = positions[edge.target];
                if (!src || !tgt) return null;

                const isConnectedToSelected =
                  selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);

                return (
                  <line
                    key={idx}
                    x1={src.x}
                    y1={src.y}
                    x2={tgt.x}
                    y2={tgt.y}
                    stroke={
                      isConnectedToSelected
                        ? "#a855f7"
                        : edge.type === "cites"
                        ? "#7c3aed"
                        : "#64748b"
                    }
                    strokeWidth={isConnectedToSelected ? 2.5 : edge.type === "cites" ? 1.5 : 1}
                    strokeDasharray={edge.type === "co_citation" ? "4 4" : "none"}
                    strokeOpacity={isConnectedToSelected ? 0.9 : 0.4}
                    markerEnd={edge.type === "cites" ? "url(#arrow)" : undefined}
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g className="nodes">
              {visibleNodes.map((node) => {
                const pos = positions[node.id] || { x: 400, y: 300 };
                const isSelected = selectedNode?.id === node.id;
                const nodeColor = getTaskColor(node.primary_task);
                const radius = 14 + Math.min(16, node.total_degree * 4);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNode(node);
                    }}
                    className="cursor-pointer group"
                  >
                    {/* Outer landmark glow ring */}
                    {node.is_landmark && (
                      <circle
                        r={radius + 6}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                        className="animate-spin-slow opacity-70"
                      />
                    )}

                    {/* Selection highlight */}
                    {isSelected && (
                      <circle
                        r={radius + 8}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2.5"
                        className="animate-pulse"
                      />
                    )}

                    {/* Main Node Circle */}
                    <circle
                      r={radius}
                      fill={nodeColor}
                      stroke="#0f172a"
                      strokeWidth="2.5"
                      className="transition-transform group-hover:scale-110"
                    />

                    {/* Label inside node (Year or Degree) */}
                    <text
                      textAnchor="middle"
                      dy=".3em"
                      fill="#ffffff"
                      fontSize={radius > 18 ? 10 : 8}
                      fontWeight="bold"
                      className="pointer-events-none select-none font-mono"
                    >
                      {node.year}
                    </text>

                    {/* Label below node */}
                    <text
                      textAnchor="middle"
                      y={radius + 14}
                      fill={isSelected ? "#38bdf8" : "#e2e8f0"}
                      fontSize="10"
                      fontWeight={isSelected ? "bold" : "medium"}
                      className="pointer-events-none select-none drop-shadow"
                    >
                      {node.title.length > 25 ? `${node.title.slice(0, 22)}...` : node.title}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Graph Legend Overlay */}
          <div className="absolute bottom-3 left-3 p-2.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[10px] space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-purple-500 inline-block" />
              <span className="text-slate-300">Direct Citation (older → newer)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 border-b border-dashed border-slate-400 inline-block" />
              <span className="text-slate-400">Co-Citation / Shared Context</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full border border-amber-400 inline-block" />
              <span className="text-amber-300">Landmark Foundational Paper</span>
            </div>
          </div>
        </div>

        {/* Side Inspector Details Panel */}
        <div className="lg:col-span-1 glass-panel rounded-2xl p-5 border border-slate-800 flex flex-col justify-between space-y-4">
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    {selectedNode.year} · {selectedNode.primary_task}
                  </span>
                  <h4 className="font-bold text-slate-100 text-sm mt-1 leading-snug">
                    {selectedNode.title}
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-500 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {selectedNode.authors && (
                <p className="text-xs text-slate-400 line-clamp-2">
                  👨‍🔬 {selectedNode.authors.join(", ")}
                </p>
              )}

              {/* Citation Influence Stats */}
              <div className="grid grid-cols-2 gap-2 text-center font-mono">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-lg font-bold text-purple-400 block">{selectedNode.in_degree}</span>
                  <span className="text-[10px] text-slate-500">Incoming Citations</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-lg font-bold text-blue-400 block">{selectedNode.out_degree}</span>
                  <span className="text-[10px] text-slate-500">Outgoing References</span>
                </div>
              </div>

              {selectedNode.summary && (
                <p className="text-xs text-slate-300 leading-relaxed line-clamp-4">
                  {selectedNode.summary}
                </p>
              )}

              {/* Connected Papers list */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Cross-Citation Links:
                </span>
                <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {data.edges
                    .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
                    .map((edge, idx) => {
                      const otherId = edge.source === selectedNode.id ? edge.target : edge.source;
                      const other = data.nodes.find((n) => n.id === otherId);
                      if (!other) return null;
                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedNode(other)}
                          className="p-2 rounded-lg bg-slate-950/60 hover:bg-slate-900 border border-slate-800/80 hover:border-purple-500/50 cursor-pointer transition-all flex items-center justify-between text-[11px]"
                        >
                          <span className="text-slate-300 truncate max-w-[140px]">{other.title}</span>
                          <span className="text-[9px] text-purple-400 font-mono">
                            {edge.source === selectedNode.id ? "→ Cites" : "← Cited By"}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <p className="text-2xl">👆</p>
              <p className="text-xs font-semibold text-slate-400">Click any paper node in the graph</p>
              <p className="text-[11px]">Inspect citation lineage, landmark influence, and co-citation connections.</p>
            </div>
          )}

          {selectedNode?.pdf_url && (
            <a
              href={selectedNode.pdf_url}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 font-semibold rounded-xl text-xs text-center transition-all block"
            >
              📄 Read PDF
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
