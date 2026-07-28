"use client";

import React, { useState, useCallback } from "react";
import { exportCitations, PaperItem } from "@/lib/api";
import MarkdownRenderer from "@/components/MarkdownRenderer";

interface LiteratureDraftProps {
  papers: PaperItem[];
}

// ── Citation format metadata ────────────────────────────────────────────────
const FORMAT_OPTIONS = [
  {
    value: "bibtex",
    label: "BibTeX",
    icon: "📚",
    desc: "Machine-readable format used by LaTeX editors (Overleaf, TeXstudio). Paste into your .bib file.",
  },
  {
    value: "apa",
    label: "APA",
    icon: "📄",
    desc: "American Psychological Association style. Standard in social sciences, psychology, and education journals.",
  },
  {
    value: "ieee",
    label: "IEEE",
    icon: "🔬",
    desc: "Institute of Electrical and Electronics Engineers style. Required for CS/engineering conference papers.",
  },
  {
    value: "mla",
    label: "MLA",
    icon: "📝",
    desc: "Modern Language Association style. Used in humanities, literature, and arts papers.",
  },
];

// ── Markdown renderer: ## → styled headers, strips asterisks ────────────────
function renderMarkdownReview(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      nodes.push(
        <h3 key={key++} className="text-lg font-bold text-blue-400 mt-8 mb-3 pb-2 border-b border-slate-700/60">
          {line.replace(/^## /, "")}
        </h3>
      );
    } else if (line.startsWith("### ")) {
      nodes.push(
        <h4 key={key++} className="text-base font-semibold text-slate-200 mt-5 mb-2">
          {line.replace(/^### /, "")}
        </h4>
      );
    } else if (/^\[\d+\]/.test(line.trim()) && line.trim().length > 0) {
      nodes.push(
        <p key={key++} className="text-sm text-slate-400 font-mono leading-relaxed pl-4 border-l-2 border-slate-700 my-1">
          {line.trim()}
        </p>
      );
    } else if (line.trim().length > 0) {
      const clean = line.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
      nodes.push(
        <p key={key++} className="text-sm text-slate-300 leading-7 mb-3">{clean}</p>
      );
    } else {
      nodes.push(<div key={key++} className="h-1" />);
    }
  }
  return nodes;
}

// ── PDF export: opens a print-ready styled window ───────────────────────────
function exportAsPdf(topic: string, reviewContent: string, citationOutput: string | null, citationFormat: string) {
  const formatLabel = FORMAT_OPTIONS.find(f => f.value === citationFormat)?.label || citationFormat.toUpperCase();

  // Convert markdown to basic HTML for print
  const htmlBody = reviewContent
    .split("\n")
    .map(line => {
      if (line.startsWith("## ")) return `<h2>${line.replace(/^## /, "")}</h2>`;
      if (line.startsWith("### ")) return `<h3>${line.replace(/^### /, "")}</h3>`;
      if (/^\[\d+\]/.test(line.trim()) && line.trim()) return `<p class="ref">${line.trim()}</p>`;
      if (line.trim()) return `<p>${line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>")}</p>`;
      return "<br/>";
    })
    .join("\n");

  const citationsHtml = citationOutput
    ? `<hr/><h2>References — ${formatLabel} Format</h2><pre class="bibtex">${citationOutput}</pre>`
    : "";

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${topic} — Literature Review</title>
  <meta charset="utf-8"/>
  <style>
    body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.8; color: #111; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 20pt; margin-bottom: 4px; }
    .subtitle { color: #555; font-size: 10pt; margin-bottom: 32px; }
    h2 { font-size: 14pt; margin-top: 32px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; color: #1a3a6b; }
    h3 { font-size: 12pt; margin-top: 20px; color: #333; }
    p { margin: 0 0 12px; text-align: justify; }
    p.ref { font-family: monospace; font-size: 9pt; color: #444; border-left: 3px solid #aaa; padding-left: 10px; margin: 4px 0; }
    pre.bibtex { font-family: monospace; font-size: 9pt; background: #f5f5f5; padding: 16px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; }
    hr { margin: 32px 0; border: none; border-top: 1px solid #ddd; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <h1>${topic}</h1>
  <p class="subtitle">AI-Generated Literature Review Draft · AI Research OS · ${new Date().toLocaleDateString()}</p>
  <hr/>
  ${htmlBody}
  ${citationsHtml}
</body>
</html>`);

  printWindow.document.close();
  setTimeout(() => { printWindow.focus(); printWindow.print(); }, 400);
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function LiteratureDraft({ papers }: LiteratureDraftProps) {
  const completedPapers = papers.filter((p) => p.status === "done");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topic, setTopic] = useState("");
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [citationOutput, setCitationOutput] = useState<string | null>(null);
  const [citationFormat, setCitationFormat] = useState("bibtex");
  const [hoveredFormat, setHoveredFormat] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const selectAll = () => setSelectedIds(completedPapers.map((p) => p.id));
  const clearAll = () => setSelectedIds([]);

  const selectedPapers = selectedIds.length > 0
    ? completedPapers.filter((p) => selectedIds.includes(p.id))
    : [];

  const handleGenerateReview = async () => {
    if (!topic.trim() || selectedPapers.length === 0) return;
    setGenerating(true);
    setReviewContent(null);
    setCitationOutput(null);

    try {
      // Build query params — pass selected paper IDs to backend
      const params = new URLSearchParams({
        query: `Generate a structured literature review survey draft on the topic: ${topic}`,
      });
      selectedIds.forEach(id => params.append("paper_ids", id));

      const res = await fetch(`http://localhost:8000/api/chat?${params.toString()}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReviewContent(data.response);

      // Fetch citations for selected papers in chosen format
      const bib = await exportCitations(selectedIds, citationFormat);
      setCitationOutput(bib.content);
    } catch (e: any) {
      setReviewContent(`⚠️ Error generating review: ${e.message || e}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = useCallback(() => {
    if (!citationOutput) return;
    navigator.clipboard.writeText(citationOutput).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [citationOutput]);

  const handleDownloadMarkdown = () => {
    if (!reviewContent) return;
    const fullMd = `# ${topic}\n\n${reviewContent}\n\n${citationOutput ? `## References (${citationFormat.toUpperCase()})\n\n${citationOutput}` : ""}`;
    const blob = new Blob([fullMd], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Literature_Review_${topic.replace(/[^a-zA-Z0-9_-]/g, "_")}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Empty state ──────────────────────────────────────────────────────────
  if (completedPapers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 text-center">
        <div className="text-6xl">📝</div>
        <div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Literature Review Generator</h2>
          <p className="text-slate-400 max-w-md">
            No papers ready yet. Go to <span className="text-blue-400 font-semibold">Paper Discovery</span>,
            add papers, and wait for indexing to complete. Then come back here.
          </p>
        </div>
        <div className="glass-panel rounded-2xl p-5 max-w-sm text-left space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">How it works</p>
          <div className="space-y-2 text-sm text-slate-300">
            {["Search arXiv for papers on your topic", "Add papers to your OS library", "Wait for indexing (status: done)", "Select papers & enter topic → Generate"].map((s, i) => (
              <div key={i} className="flex gap-3"><span className="text-blue-400 font-bold">{i + 1}.</span><span>{s}</span></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Step 1: Select Papers ─────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-100">📝 Step 1 — Select Papers for Review</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Choose which papers to include. The review will only synthesize the ones you select.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-colors">
              Select All
            </button>
            <button onClick={clearAll} className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 transition-colors">
              Clear
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {completedPapers.map((p) => {
            const isSelected = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "bg-blue-600/15 border-blue-500/50 shadow-sm shadow-blue-500/10"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-600"
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-blue-600 border-blue-500" : "border-slate-600"}`}>
                  {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold line-clamp-2 ${isSelected ? "text-blue-300" : "text-slate-200"}`}>{p.title}</p>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">arXiv:{p.arxiv_id}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Step 2: Topic + Citation Format + Generate ───────────────────── */}
      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <h2 className="text-base font-bold text-slate-100">⚙️ Step 2 — Configure & Generate</h2>

        {/* Topic input */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Review Topic</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. GraphRAG vs Agentic RAG, LoRA fine-tuning, Multimodal LLMs..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500/60"
          />
        </div>

        {/* Citation Format Picker with explainer */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Citation Format</label>
            <span className="text-[10px] text-slate-500">(for the References block at the end)</span>
          </div>

          {/* Format buttons */}
          <div className="flex flex-wrap gap-2">
            {FORMAT_OPTIONS.map((f) => (
              <button
                key={f.value}
                onClick={() => setCitationFormat(f.value)}
                onMouseEnter={() => setHoveredFormat(f.value)}
                onMouseLeave={() => setHoveredFormat(null)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-all border ${
                  citationFormat === f.value
                    ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-600/20"
                    : "bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>

          {/* Format explainer — shows on hover or for current selection */}
          {(() => {
            const shown = hoveredFormat || citationFormat;
            const fmt = FORMAT_OPTIONS.find(f => f.value === shown);
            return fmt ? (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <span className="text-base shrink-0">{fmt.icon}</span>
                <div>
                  <span className="text-xs font-semibold text-slate-200">{fmt.label}: </span>
                  <span className="text-xs text-slate-400">{fmt.desc}</span>
                </div>
              </div>
            ) : null;
          })()}
        </div>

        {/* Generate button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleGenerateReview}
            disabled={generating || !topic.trim() || selectedPapers.length === 0}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium text-sm shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Drafting Survey...
              </span>
            ) : (
              "⚡ Generate Review"
            )}
          </button>
          {selectedPapers.length === 0 && (
            <p className="text-xs text-amber-400">⚠️ Select at least 1 paper above first</p>
          )}
          {selectedPapers.length > 0 && (
            <p className="text-xs text-slate-500">
              Will synthesize <span className="text-blue-300 font-semibold">{selectedPapers.length}</span> paper{selectedPapers.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {/* ── Review Output ────────────────────────────────────────────────── */}
      {reviewContent && (
        <div className="glass-panel rounded-2xl overflow-hidden">
          {/* Draft Header */}
          <div className="px-8 pt-8 pb-4 border-b border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-xl font-bold text-blue-400">Survey Draft: {topic}</h3>
              <p className="text-xs text-slate-500 mt-1">
                Synthesized from {selectedPapers.length} paper{selectedPapers.length !== 1 ? "s" : ""} ·
                AI-generated academic draft — always verify claims before submitting
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
                ✓ Draft Ready
              </span>
              <button
                onClick={handleDownloadMarkdown}
                className="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 text-xs font-medium transition-all flex items-center gap-1.5"
              >
                📥 Download (.md)
              </button>
              <button
                onClick={() => exportAsPdf(topic, reviewContent, citationOutput, citationFormat)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white text-xs font-medium transition-all flex items-center gap-1.5"
              >
                🖨️ Save as PDF
              </button>
            </div>
          </div>

          {/* Rendered Review Body — supports markdown tables, math/KaTeX, bold, headers */}
          <div className="px-8 py-6 max-w-4xl">
            <MarkdownRenderer content={reviewContent} />
          </div>

          {/* Citation Export Block */}
          {citationOutput && (
            <div className="mx-8 mb-8 rounded-2xl border border-slate-700/60 overflow-hidden">
              <div className="flex items-center justify-between bg-slate-900/80 px-5 py-3 border-b border-slate-700/60">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-300">
                    📚 References — {FORMAT_OPTIONS.find(f => f.value === citationFormat)?.label} Format
                  </span>
                  <span className="text-xs text-slate-500">({selectedPapers.length} paper{selectedPapers.length !== 1 ? "s" : ""})</span>
                </div>
                <button
                  onClick={handleCopy}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    copied
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
                  }`}
                >
                  {copied ? "✓ Copied!" : "Copy All"}
                </button>
              </div>
              <pre className="p-5 text-xs font-mono text-slate-300 overflow-x-auto bg-slate-950/60 leading-relaxed custom-scrollbar whitespace-pre-wrap">
                {citationOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
