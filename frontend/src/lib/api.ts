const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface PaperSearchResult {
  arxiv_id: string;
  title: string;
  authors: string[];
  published_date: string;
  pdf_url: string;
  summary: string;
  already_ingested: boolean;
}

export interface PaperItem {
  id: string;
  arxiv_id?: string;
  title: string;
  authors: string[];
  published_date?: string;
  pdf_url?: string;
  summary?: string;
  status: "queued" | "downloading" | "parsing" | "extracting" | "embedding" | "done" | "failed";
  failure_reason?: string;
  extraction_parser?: string;
  paragraph_count?: number;
  structured_data?: {
    title: string;
    abstract: string;
    primary_task: string;
    methodology_summary: string;
    datasets_used: string[];
    backbone_models: string[];
    benchmark_metrics: Record<string, any>;
    limitations: string[];
    future_work: string[];
    bibtex?: string;
  };
  notes?: string;
  tags?: string[];
  created_at: string;
}

export interface CitationItem {
  citation_id: number;
  paper_id: string;
  page_number: number;
  paragraph_id: number;
  text: string;
  section_name?: string;
  verified?: boolean;
  grounding_score?: number;
  verification_reason?: string;
}

export interface ExtractedTable {
  table_id: string;
  paper_id: string;
  page_number: number;
  headers: string[];
  rows: string[][];
  markdown: string;
  caption?: string;
}

export interface ChatResponse {
  intent: string;
  response: string;
  citations: CitationItem[];
  figures_cited?: PaperFigure[];
  step_logs: string[];
  comparison_data?: any;
  literature_review?: any;
}

export interface GapAnalysisResponse {
  paper_count: number;
  gaps_markdown: string;
  paper_titles?: string[];
}

export interface TimelinePaperNode {
  id: string;
  arxiv_id?: string;
  title: string;
  authors: string[];
  published_date: string;
  year: string;
  primary_task: string;
  methodology_summary: string;
  backbone_models: string[];
  datasets_used: string[];
  benchmark_metrics: Record<string, any>;
  pdf_url?: string;
  notes?: string;
  tags?: string[];
}

export interface TimelineMilestone {
  year: string;
  papers: TimelinePaperNode[];
  paper_count: number;
}

export interface TimelineResponse {
  milestones: TimelineMilestone[];
  total_papers: number;
  taxonomies: {
    unique_tasks: string[];
    unique_models: string[];
    unique_datasets: string[];
  };
}

export interface PaperFigure {
  figure_id: string;
  paper_id: string;
  page_number: number;
  file_path: string;
  url: string;
  width: number;
  height: number;
  caption: string;
  ai_captioned?: boolean;
}

export async function searchArxiv(
  query: string,
  maxResults: number = 6,
  sortBy: "relevance" | "date" | "updated" = "relevance"
): Promise<PaperSearchResult[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE_URL}/api/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, max_results: maxResults, sort_by: sortBy }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("arXiv search request timed out. arXiv may be temporarily slow or throttling — please try again in a few seconds.");
    }
    throw err;
  }
}


export async function ingestPaper(paper: Partial<PaperSearchResult>): Promise<{ paper_id: string; status: string }> {
  const params = new URLSearchParams({
    ...(paper.arxiv_id ? { arxiv_id: paper.arxiv_id } : {}),
    ...(paper.title ? { title: paper.title } : {}),
    ...(paper.pdf_url ? { pdf_url: paper.pdf_url } : {}),
    ...(paper.summary ? { summary: paper.summary } : {}),
  });
  if (paper.authors?.length) {
    paper.authors.forEach((a) => params.append("authors", a));
  }
  const res = await fetch(`${API_BASE_URL}/api/ingest?${params.toString()}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ingestAllPapers(papers: Partial<PaperSearchResult>[]): Promise<{ queued: string[]; skipped: string[] }> {
  const res = await fetch(`${API_BASE_URL}/api/ingest/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ papers }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function retryPaper(paperId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/retry`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


export async function getPapers(): Promise<PaperItem[]> {
  const res = await fetch(`${API_BASE_URL}/api/papers`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendChatQuery(query: string, paperIds?: string[]): Promise<ChatResponse> {
  const params = new URLSearchParams({ query });
  if (paperIds && paperIds.length > 0) {
    paperIds.forEach(id => params.append("paper_ids", id));
  }

  const res = await fetch(`${API_BASE_URL}/api/chat?${params.toString()}`, {
    method: "POST"
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportCitations(paperIds: string[], formatType: string = "bibtex"): Promise<{ format: string; content: string }> {
  const params = new URLSearchParams({ format_type: formatType });
  paperIds.forEach(id => params.append("paper_ids", id));

  const res = await fetch(`${API_BASE_URL}/api/citations/export?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deletePaper(paperId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updatePaperNotes(paperId: string, notes?: string, tags?: string[]): Promise<{ message: string; notes?: string; tags?: string[] }> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/notes`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes, tags })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchResearchGaps(paperIds?: string[]): Promise<GapAnalysisResponse> {
  const params = new URLSearchParams();
  if (paperIds && paperIds.length > 0) {
    paperIds.forEach(id => params.append("paper_ids", id));
  }
  const res = await fetch(`${API_BASE_URL}/api/gaps?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getExportComparisonCSVUrl(paperIds?: string[]): string {
  const params = new URLSearchParams({ format_type: "csv" });
  if (paperIds && paperIds.length > 0) {
    paperIds.forEach(id => params.append("paper_ids", id));
  }
  return `${API_BASE_URL}/api/papers/export?${params.toString()}`;
}

export async function fetchTimelineData(paperIds?: string[]): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  if (paperIds && paperIds.length > 0) {
    paperIds.forEach(id => params.append("paper_ids", id));
  }
  const res = await fetch(`${API_BASE_URL}/api/timeline?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchPaperFigures(paperId: string): Promise<{ paper_id: string; figure_count: number; ai_captioned: boolean; figures: PaperFigure[] }> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/figures`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchVisionStatus(): Promise<{ available: boolean; model: string }> {
  const res = await fetch(`${API_BASE_URL}/api/vision/status`);
  if (!res.ok) return { available: false, model: "unknown" };
  return res.json();
}

export async function fetchSimilarPapers(paperId: string, topK: number = 3): Promise<{
  paper_id: string;
  similar: { paper_id: string; title: string; arxiv_id: string; score: number }[];
}> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/similar?top_k=${topK}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchProseComparison(paperIds?: string[]): Promise<{ prose: string }> {
  const res = await fetch(`${API_BASE_URL}/api/compare/prose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds || null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchSinglePaperSummary(paperId: string): Promise<{ paper_id: string; summary: string }> {
  const res = await fetch(`${API_BASE_URL}/api/summary/paper`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_id: paperId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchCombinedSummary(paperIds: string[], topic?: string): Promise<{ summary: string }> {
  const res = await fetch(`${API_BASE_URL}/api/summary/combined`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paper_ids: paperIds, topic: topic || null }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * Generic helper to consume Server-Sent Events (SSE) token streams
 */
export async function streamSSE(
  url: string,
  body: any,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("Response body is not readable");

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "data: [DONE]") {
          if (onDone) onDone();
          return;
        }
        if (trimmed.startsWith("data: ")) {
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.token) {
              onToken(data.token);
            } else if (data.error) {
              throw new Error(data.error);
            }
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) {
              throw e;
            }
          }
        }
      }
    }

    if (onDone) onDone();
  } catch (err: any) {
    if (signal?.aborted) return;
    if (onError) onError(err);
    else throw err;
  }
}

export function streamProseComparison(
  paperIds: string[] | undefined,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
  signal?: AbortSignal
) {
  return streamSSE(
    `${API_BASE_URL}/api/compare/prose/stream`,
    { paper_ids: paperIds || null },
    onToken,
    onDone,
    onError,
    signal
  );
}

export function streamSinglePaperSummary(
  paperId: string,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
  signal?: AbortSignal
) {
  return streamSSE(
    `${API_BASE_URL}/api/summary/paper/stream`,
    { paper_id: paperId },
    onToken,
    onDone,
    onError,
    signal
  );
}

export function streamCombinedSummary(
  paperIds: string[],
  topic: string | undefined,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
  signal?: AbortSignal
) {
  return streamSSE(
    `${API_BASE_URL}/api/summary/combined/stream`,
    { paper_ids: paperIds, topic: topic || null },
    onToken,
    onDone,
    onError,
    signal
  );
}

export function streamResearchGaps(
  paperIds: string[] | undefined,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
  signal?: AbortSignal
) {
  return streamSSE(
    `${API_BASE_URL}/api/gaps/stream`,
    { paper_ids: paperIds || null },
    onToken,
    onDone,
    onError,
    signal
  );
}

export async function fetchPaperTables(paperId: string): Promise<{ paper_id: string; table_count: number; tables: ExtractedTable[] }> {
  const res = await fetch(`${API_BASE_URL}/api/papers/${paperId}/tables`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function askFigureQuestion(
  paperId: string,
  question: string,
  figureId?: string,
  filePath?: string
): Promise<{ paper_id: string; figure_id?: string; question: string; answer: string }> {
  const res = await fetch(`${API_BASE_URL}/api/figures/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paper_id: paperId,
      figure_id: figureId || null,
      file_path: filePath || null,
      question: question
    })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}


