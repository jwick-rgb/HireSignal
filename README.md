# HireSignal MVP

Lightweight assistant that ingests a resume and a CSV of LinkedIn job URLs, scores fit, surfaces missing skills, generates InMail + cover letters, and lets you save/export curated applications.

## Stack
- Frontend: React + Vite + TypeScript + Tailwind
- Backend: FastAPI (Python)
- Storage: Local `db.json` file

## Getting Started

### Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
# Point to backend if not on http://localhost:8000
set VITE_API_BASE=http://localhost:8000   # PowerShell: $env:VITE_API_BASE="http://localhost:8000"
npm run dev
```

Open the Vite dev URL, upload a resume (PDF/DOCX/TXT) and a CSV with a `url` column, click **Process Jobs**, generate materials per job, save favorites, and export CSV from the Saved section.

## Notes
- Saved applications are stored in `backend/db.json`; keep it alongside the API.
- AI generation uses OpenAI (chatgpt 5.2). Set an `OPENAI_API_KEY` environment variable (server-side only). Examples:
  - macOS/Linux: `export OPENAI_API_KEY=sk-...`
  - Windows PowerShell: `$env:OPENAI_API_KEY="sk-..."`
  - Windows CMD: `set OPENAI_API_KEY=sk-...`
  - Optional overrides: `OPENAI_MODEL` (default `gpt-5.2`), `OPENAI_TIMEOUT` (seconds), `OPENAI_MAX_INPUT` (chars).
  - Keep `.env` files out of version control; add to `.gitignore` if you create one for local dev.
