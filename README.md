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
- Job details are generated from mock templates for now to avoid LinkedIn scraping limits.
- Saved applications are stored in `backend/db.json`; keep it alongside the API.
