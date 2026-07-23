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
  created_at: string;
}

export interface CitationItem {
  citation_id: number;
  paper_id: string;
  page_number: number;
  paragraph_id: number;
  text: string;
}

export interface ChatResponse {
  intent: string;
  response: string;
  citations: CitationItem[];
  step_logs: string[];
  comparison_data?: any;
  literature_review?: any;
}

export async function searchArxiv(query: string, maxResults: number = 6): Promise<PaperSearchResult[]> {
  const res = await fetch(`${API_BASE_URL}/api/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, max_results: maxResults })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function ingestPaper(paper: Partial<PaperSearchResult>): Promise<{ paper_id: string; status: string }> {
  const params = new URLSearchParams({
    ...(paper.arxiv_id ? { arxiv_id: paper.arxiv_id } : {}),
    ...(paper.title ? { title: paper.title } : {}),
    ...(paper.pdf_url ? { pdf_url: paper.pdf_url } : {}),
    ...(paper.summary ? { summary: paper.summary } : {})
  });

  const res = await fetch(`${API_BASE_URL}/api/ingest?${params.toString()}`, {
    method: "POST"
  });
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
