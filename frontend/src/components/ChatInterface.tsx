"use client";

import React, { useState, useEffect, useRef } from "react";
import { ChatResponse, CitationItem, PaperItem, PaperFigure } from "@/lib/api";
import MarkdownRenderer from "@/components/MarkdownRenderer";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHAT_STORAGE_KEY = "ai_research_os_chat_history";


interface ChatInterfaceProps {
  papers: PaperItem[];
}

export default function ChatInterface({ papers }: ChatInterfaceProps) {
  const [query, setQuery] = useState("");
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string; citations?: CitationItem[]; figuresCited?: PaperFigure[]; stepLogs?: string[] }[]
  >(() => {
    // Restore from localStorage on first render
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(CHAT_STORAGE_KEY);
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [{ role: "assistant", content: "Hello! I am your AI Research Assistant. Ask me any question across your ingested papers or request comparisons, method breakdowns, and literature surveys." }];
  });
  const [loading, setLoading] = useState(false);
  const [liveStep, setLiveStep] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<CitationItem | null>(null);
  const [activeLightboxFig, setActiveLightboxFig] = useState<{ url: string; caption: string; pageNumber: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Voice Research Mode states
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  // Speech Recognition setup
  const handleMicClick = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setQuery(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Text-to-Speech playback
  const speakText = (text: string, index: number) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel(); // Stop any current speech

    if (speakingIndex === index) {
      setSpeakingIndex(null);
      return;
    }

    const cleanText = text.replace(/##\s+/g, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[\d+\]/g, "");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);

    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  // Persist chat to localStorage on every message change
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-30))); // keep last 30 messages
    }
  }, [messages]);

  // Auto-scroll to latest message
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveStep]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    const userText = query;
    setQuery("");
    setMessages(prev => [...prev, { role: "user", content: userText }]);
    setLoading(true);
    setLiveStep("🧠 Planning your query...");

    try {
      // Use SSE streaming endpoint for live step-log feedback
      const res = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userText, paper_ids: selectedPaperIds.length ? selectedPaperIds : null }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const dataLine = line.startsWith("data: ") ? line.slice(6) : null;
          if (!dataLine) continue;
          try {
            const event = JSON.parse(dataLine);
            if (event.type === "step") {
              setLiveStep(event.data);
            } else if (event.type === "done") {
              const newIndex = messages.length + 1;
              setMessages(prev => [
                ...prev,
                {
                  role: "assistant",
                  content: event.response,
                  citations: event.citations,
                  figuresCited: event.figures_cited,
                  stepLogs: event.step_logs
                }
              ]);
              setLiveStep(null);
              if (voiceEnabled && "speechSynthesis" in window) {
                speakText(event.response, newIndex);
              }
            } else if (event.type === "error") {
              throw new Error(event.data);
            }
          } catch (parseErr) {
            // Skip malformed SSE lines
          }
        }
      }
    } catch (err: any) {
      setLiveStep(null);
      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Error executing query: ${err.message || err}`
        }
      ]);
    } finally {
      setLoading(false);
      setLiveStep(null);
    }
  };

  const togglePaperSelection = (id: string) => {
    setSelectedPaperIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col h-[78vh] glass-panel rounded-2xl overflow-hidden">
      {/* Paper Scope Selector Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-400">Target Knowledge Scope:</span>
          <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
            {selectedPaperIds.length === 0 ? "All Ingested Papers" : `${selectedPaperIds.length} Selected`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Clear Chat */}
          <button
            type="button"
            onClick={() => {
              const initial = [{ role: "assistant" as const, content: "Hello! I am your AI Research Assistant. Ask me any question across your ingested papers or request comparisons, method breakdowns, and literature surveys." }];
              setMessages(initial);
              localStorage.removeItem(CHAT_STORAGE_KEY);
            }}
            className="text-xs px-2.5 py-1 rounded-lg border bg-slate-800/60 text-slate-500 border-slate-700 hover:text-rose-300 hover:border-rose-500/40 transition-all"
            title="Clear chat history"
          >
            🗑️ Clear
          </button>

          {/* Voice Output Toggle */}
          <button
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
              voiceEnabled
                ? "bg-purple-600/20 text-purple-300 border-purple-500/40"
                : "bg-slate-800/60 text-slate-500 border-slate-700"
            }`}
            title="Auto-read assistant responses using Speech Synthesis"
          >
            <span>{voiceEnabled ? "🔊 Voice Mode ON" : "🔇 Voice Mode OFF"}</span>
          </button>

          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar max-w-sm">
            {papers.map(p => {
              const isSelected = selectedPaperIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePaperSelection(p.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all whitespace-nowrap ${
                    isSelected
                      ? "bg-blue-600/30 text-blue-300 border-blue-500/50"
                      : "bg-slate-800/60 text-slate-400 border-slate-700 hover:text-slate-200"
                  }`}
                >
                  {p.title.slice(0, 18)}...
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-3xl rounded-2xl p-5 leading-relaxed text-sm relative group ${
                m.role === "user"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20 rounded-br-none"
                  : "bg-slate-900/90 text-slate-200 border border-slate-800 rounded-bl-none"
              }`}
            >
              {/* Speaker button for Assistant messages */}
              {m.role === "assistant" && (
                <button
                  onClick={() => speakText(m.content, idx)}
                  className="absolute top-3 right-3 text-slate-400 hover:text-purple-300 transition-colors p-1 rounded-md bg-slate-950/60"
                  title="Read response aloud"
                >
                  {speakingIndex === idx ? "⏸️" : "🔊"}
                </button>
              )}

              {/* Step Logs Accordion for Assistant */}
              {m.stepLogs && m.stepLogs.length > 0 && (
                <details className="mb-3 p-2 rounded bg-slate-950/60 border border-slate-800 text-xs font-mono text-slate-400">
                  <summary className="cursor-pointer font-semibold text-blue-400 hover:underline">
                    ⚙️ LangGraph Agent Execution Steps ({m.stepLogs.length})
                  </summary>
                  <ul className="mt-2 space-y-1 pl-2 border-l border-slate-800">
                    {m.stepLogs.map((log, lIdx) => (
                      <li key={lIdx}>{log}</li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Message content — use MarkdownRenderer for assistant, plain text for user */}
              {m.role === "assistant" ? (
                <MarkdownRenderer content={m.content} className="text-sm" />
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}

              {/* Matched Relevant Figures & Diagrams */}
              {m.figuresCited && m.figuresCited.length > 0 && (
                <div className="mt-3 pt-3 border-t border-purple-500/20 space-y-2">
                  <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                    🖼️ Relevant Diagrams & Figures ({m.figuresCited.length}):
                  </span>
                  <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1">
                    {m.figuresCited.map((fig, figIdx) => (
                      <button
                        key={figIdx}
                        onClick={() => setActiveLightboxFig({
                          url: fig.url.startsWith("http") ? fig.url : `${API_BASE_URL}${fig.url}`,
                          caption: fig.caption || `Diagram on page ${fig.page_number}`,
                          pageNumber: fig.page_number
                        })}
                        className="group shrink-0 flex flex-col gap-1 w-36 text-left p-1.5 rounded-lg bg-slate-950/80 border border-slate-800 hover:border-purple-500/60 transition-all"
                      >
                        <div className="aspect-video w-full rounded overflow-hidden bg-slate-900 flex items-center justify-center border border-slate-850 relative">
                          <img
                            src={fig.url.startsWith("http") ? fig.url : `${API_BASE_URL}${fig.url}`}
                            alt={fig.caption}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono text-purple-300 bg-slate-950/90 px-1 rounded">
                            p.{fig.page_number}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">
                          {fig.caption}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Citations List Badges */}
              {m.citations && m.citations.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Verified Citations:</span>
                  {m.citations.map((c, cIdx) => (
                    <button
                      key={cIdx}
                      onClick={() => setActiveCitation(c)}
                      className="px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono transition-colors"
                    >
                      📌 [{c.citation_id}] Paper {c.paper_id.slice(-4)}, p.{c.page_number}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {(loading || liveStep) && (
          <div className="flex items-start gap-3 p-4 glass-panel rounded-xl max-w-md">
            <div className="flex flex-col gap-1.5 pt-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-blue-300">Agent Running</span>
              <span className="text-xs font-mono text-slate-400 leading-relaxed">
                {liveStep || "🧠 Planning your query..."}
              </span>
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input Form with Push-to-Talk Mic */}
      <form onSubmit={handleSubmit} className="p-4 bg-slate-900/80 border-t border-slate-800 flex gap-3 items-center">
        {/* Push-to-Talk Microphone Button */}
        <button
          type="button"
          onClick={handleMicClick}
          className={`p-3 rounded-xl border transition-all ${
            isListening
              ? "bg-rose-600 border-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/30"
              : "bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-purple-500/60"
          }`}
          title={isListening ? "Listening... Click to stop" : "Push-to-talk microphone"}
        >
          {isListening ? "🎙️ Recording..." : "🎤"}
        </button>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={isListening ? "Listening to your voice..." : "Ask a question, compare datasets, or generate a literature review... (Ctrl+Enter to send)"}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/60"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              if (!loading && query.trim()) handleSubmit(e as any);
            }
          }}
        />

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm shadow-lg shadow-blue-600/20 disabled:opacity-50 transition-all"
        >
          Send Query
        </button>
      </form>

      {/* Citation Inspector Modal */}
      {activeCitation && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel-glow max-w-lg w-full rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-slate-100 flex items-center gap-2">
                📌 Verified Citation Anchor
              </h4>
              <button
                onClick={() => setActiveCitation(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs font-mono text-slate-400">
              <div>Paper ID: <span className="text-blue-400">{activeCitation.paper_id}</span></div>
              <div>Location: <span className="text-blue-400">Page {activeCitation.page_number}, Paragraph {activeCitation.paragraph_id}</span></div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar italic">
              "{activeCitation.text}"
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setActiveCitation(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Figures in Chat */}
      {activeLightboxFig && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-200">
          <div className="glass-panel-glow max-w-4xl w-full rounded-2xl p-6 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-slate-100 flex items-center gap-2">🖼️ Relevant Figure Preview</h4>
                <p className="text-xs text-slate-400 font-mono">Page {activeLightboxFig.pageNumber}</p>
              </div>
              <button
                onClick={() => setActiveLightboxFig(null)}
                className="text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-800 text-xs font-medium"
              >
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-950 rounded-xl p-4 border border-slate-800">
              <img
                src={activeLightboxFig.url}
                alt={activeLightboxFig.caption}
                className="max-h-[60vh] object-contain rounded-lg"
              />
            </div>
            <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-purple-400 block mb-1">Figure Caption / AI Analysis</span>
              {activeLightboxFig.caption}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
