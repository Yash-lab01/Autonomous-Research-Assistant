# 04. What Failed, Post-Mortems & What NOT To Do

This document serves as an institutional memory log. It records the architectural and engineering attempts that failed, why they failed, how they were resolved, and strict anti-patterns that must never be repeated by any developer or AI assistant working on this project.

---

## 💥 Part 1: Post-Mortems of What Failed

### 1. The Groq Deprecated Model Incident
- **What was attempted:** The backend config initially specified `llama-3.3-70b-versatile` as the default Groq model.
- **Why it failed:** Groq decommissioned and removed `llama-3.3-70b-versatile` from their active API endpoints. All requests started returning 404 / unrecognized model errors.
- **How it was resolved:** Updated `.env`, `.env.example`, and `backend/app/config.py` to use active, supported Groq models:
  - Primary: `qwen/qwen3.8-27b`
  - Secondary/Failover: `openai/gpt-oss-120b` and `openai/gpt-oss-20b`

---

### 2. The 36,000-Character Prompt Overflow (Groq 413 / 429 TPM Crash)
- **What was attempted:** When generating comparative analysis or literature reviews across 3 papers, the backend retrieved 10 uncompressed paragraphs per paper from SQLite and directly concatenated them into the prompt.
- **Why it failed:**
  - 3 papers × 10 paragraphs = 36,601 characters (~9,000–10,000 tokens).
  - Groq's free-tier enforces a hard ceiling of **8,000 Tokens Per Minute (TPM)**.
  - The single request exceeded the entire minute's quota before even considering output generation, immediately triggering `413 Payload Too Large` or `429 Rate limit reached`.
- **How it was resolved:**
  - In `backend/app/agents/writing.py`, truncated chunks to 750 characters max, limited paragraphs to top 6, and capped total prompt context to under 6,000 characters (~1,500 tokens).
  - In `backend/app/services/llm_factory.py`, added safety truncation capping input prompts to ~12,000 characters max with automatic failover.

---

### 3. The Offline Ollama Cascading Protocol Error
- **What was attempted:** When Groq threw a 429 error, `llm_factory.py` automatically attempted to fall back to a local Ollama instance on `http://localhost:11434`.
- **Why it failed:**
  - Ollama was not installed or not running as a background service on the host machine.
  - The HTTP client raised `httpx.RemoteProtocolError` / connection refused, which crashed the FastAPI request worker with an unhandled 500 error instead of displaying a clear, actionable message to the user.
- **How it was resolved:**
  - Reordered fallback sequence: Try primary Groq model -> Try secondary Groq model -> Only try local Ollama if reachable -> Return graceful degradation error with clear advice.

---

### 4. The Infinite Re-installation Loop in Startup Scripts
- **What was attempted:** Early versions of `start_all.bat` ran `pip install -r requirements.txt` and `npm install` every time the user launched the app.
- **Why it failed:**
  - Startup took 3 to 6 minutes on every single boot.
  - Python wheels and node package trees were constantly scanned and verified on disk, locking files and annoying the user.
- **How it was resolved:**
  - Rewrote batch scripts with existence guards:
    - In `start_backend.bat`: Only run `pip install` if `venv\Scripts\activate.bat` does not exist.
    - In `start_frontend.bat`: Only run `npm install` if `frontend\node_modules` does not exist.
  - Result: Startup time dropped from 4 minutes to under 2 seconds.

---

### 5. PowerShell Execution Policy & Virtualenv Syntax Traps
- **What was attempted:** Using `.venv\Scripts\activate.ps1` in PowerShell scripts.
- **Why it failed:**
  - Windows restricts PowerShell script execution by default (`Restricted` policy), preventing `.ps1` activation.
  - In PowerShell, typing `.venv` without `.\` causes an error because PowerShell searches for a module rather than a local directory.
- **How it was resolved:**
  - Provided robust native `.bat` scripts (`start_all.bat`, `start_backend.bat`, `start_frontend.bat`) that run directly via `cmd.exe` without execution policy restrictions.

---

### 6. The 8-Tab Fragmented UI Sprawl
- **What was attempted:** The early frontend had 8 separate top-level navigation tabs: *Overview*, *Papers*, *Compare*, *Review*, *Gaps*, *Timeline*, *Figures*, and *Chat*.
- **Why it failed:**
  - It fragmented the researcher's mental model. Comparing papers required switching to tab 3, checking gaps required tab 5, reviewing figures required tab 7.
  - Violated the core tenets of [`guide.txt`](file:///guide.txt), which emphasizes a unified, dense, clutter-free academic workstation.
- **How it was resolved:**
  - Consolidated all features into **3 Unified Pillars**:
    1. **Paper Hub (`#papers`)**
    2. **Synthesis Studio (`#studio`)** (housing Compare, Literature Review, Gaps, and Timeline)
    3. **Agent Copilot (`#copilot`)**
  - Connected with a single, elegant sticky spy navbar.

---

## 🚫 Part 2: Strict "What NOT To Do" Rules (Anti-Patterns)

Any developer or AI assistant working on this codebase must strictly observe these prohibitions:

### 1. 🛑 NEVER Dump Uncompressed Raw Paper Text into Prompts
- **Forbidden:** Fetching whole sections or full page extracts and pasting them into Groq prompt templates.
- **Consequence:** Immediate Groq `413 Payload Too Large` or `429 TPM` crash.
- **Rule:** Always extract structured snippets, query targeted vector chunks (max 500–750 chars), or use pre-summarized database cards.

### 2. 🛑 NEVER Re-introduce Generic AI SaaS Tropes
- **Forbidden:** Adding purple or indigo blurred gradient balls (`blur-3xl`), generic marketing slogans ("supercharge your research"), centered floating pill buttons, or fake stock illustrations.
- **Rule:** Read [`guide.txt`](file:///guide.txt). Keep the aesthetic clean, slate-monochrome, dense, and academically functional.

### 3. 🛑 NEVER Install Dependencies Unconditionally in Launch Scripts
- **Forbidden:** Adding `pip install` or `npm install` into scripts executed on daily startup.
- **Rule:** Check if the directory/virtualenv exists first. Only install when explicitly requested or during first-time setup.

### 4. 🛑 NEVER Dump LLM Responses as Sudden Text Blocks
- **Forbidden:** Setting raw unstreamed strings in UI states that flash 1,000 words in 1 millisecond.
- **Rule:** Always route AI generation through [`StreamedMarkdown.tsx`](file:///frontend/src/components/StreamedMarkdown.tsx) or backend SSE streams for progressive token-by-token rendering.

### 5. 🛑 NEVER Hardcode Deprecated Model Names
- **Forbidden:** Writing `llama-3.3-70b-versatile` or hardcoded model strings in agent files.
- **Rule:** Always pull model names from [`backend/app/config.py`](file:///backend/app/config.py) and ensure they reference active, verified endpoints (`qwen/qwen3.8-27b`, `openai/gpt-oss-120b`).

### 6. 🛑 NEVER Break Windows Path & Encoding Compatibility
- **Forbidden:** Writing Linux-only shell assumptions (`source venv/bin/activate`, UTF-8 terminal defaults without `chcp 65001`).
- **Rule:** The primary local OS for this project is Windows. Always use Windows-safe batch constructs and test on PowerShell / `cmd.exe`.
