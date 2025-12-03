import csv
import json
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "db.json"


# Simple keyword list for the MVP; extend in later iterations.
SKILL_KEYWORDS = [
    "python",
    "javascript",
    "typescript",
    "react",
    "node",
    "fastapi",
    "aws",
    "gcp",
    "azure",
    "sql",
    "postgres",
    "docker",
    "kubernetes",
    "ci",
    "cd",
    "ml",
    "ai",
    "llm",
    "nlp",
    "data",
    "analytics",
    "django",
    "flask",
    "tailwind",
    "css",
    "html",
    "rest",
    "api",
    "graphql",
    "devops",
]

# Mock job records we can fall back to if fetching real content fails.
MOCK_JOBS = [
    {
        "title": "Senior Frontend Engineer",
        "company": "BrightPath",
        "description": "Build React interfaces, collaborate with design, own accessibility, optimize performance. Stack: React, TypeScript, Tailwind, Vite.",
        "skills": ["react", "typescript", "tailwind", "accessibility", "performance"],
    },
    {
        "title": "Data Engineer",
        "company": "North Analytics",
        "description": "Design data pipelines, manage ETL, work with Python, SQL, Airflow, and cloud warehouses. Improve data quality and reliability.",
        "skills": ["python", "sql", "airflow", "etl", "data quality"],
    },
    {
        "title": "Applied ML Engineer",
        "company": "Signal Labs",
        "description": "Ship ML features using Python, FastAPI, embeddings, and vector search. Work on LLM-powered assistants.",
        "skills": ["python", "fastapi", "embeddings", "llm", "vector search"],
    },
]


class JobPosting(BaseModel):
    id: str
    url: str
    title: str
    company: str
    description: str
    required_skills: List[str]


class JobAnalysis(BaseModel):
    job: JobPosting
    fit_score: float
    matched_skills: List[str]
    missing_skills: List[str]


class GeneratedMaterials(BaseModel):
    inmail: str
    cover_letter: str


class SavePayload(BaseModel):
    job: JobPosting
    fit_score: float
    missing_skills: List[str]
    generated: GeneratedMaterials
    timestamp: str


class SavedRecord(SavePayload):
    id: str


app = FastAPI(title="HireSignal MVP API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def init_db() -> None:
    if not DB_PATH.exists():
        DB_PATH.write_text("[]", encoding="utf-8")


def normalize_text(raw: bytes, filename: str) -> str:
    text = raw.decode(errors="ignore")
    # Basic cleanup to trim noisy whitespace
    text = re.sub(r"\s+", " ", text)
    if not text.strip():
        raise HTTPException(status_code=400, detail=f"Could not parse text from {filename}")
    return text.strip()


def parse_csv(file_bytes: bytes) -> List[str]:
    decoded = file_bytes.decode(errors="ignore").splitlines()
    reader = csv.DictReader(decoded)
    if "url" not in reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a 'url' header")
    urls = [row["url"] for row in reader if row.get("url")]
    if not urls:
        raise HTTPException(status_code=400, detail="CSV must include at least one URL")
    return urls


def extract_skills(text: str) -> List[str]:
    lowered = text.lower()
    found = {skill for skill in SKILL_KEYWORDS if skill in lowered}
    return sorted(found)


def get_mock_job(url: str) -> JobPosting:
    mock = MOCK_JOBS[len(url) % len(MOCK_JOBS)]
    slug = url.rstrip("/").split("/")[-1] or "listing"
    generated_title = f"{mock['title']} ({slug})"
    return JobPosting(
        id=str(uuid.uuid4()),
        url=url,
        title=generated_title,
        company=mock["company"],
        description=mock["description"],
        required_skills=extract_skills(mock["description"]) or mock["skills"],
    )


def compute_fit(job: JobPosting, resume_text: str) -> JobAnalysis:
    resume_skills = extract_skills(resume_text)
    required = job.required_skills or extract_skills(job.description)
    matched = sorted({skill for skill in required if skill in resume_skills})
    missing = sorted({skill for skill in required if skill not in resume_skills})
    total = len(required) or 1
    fit_score = round((len(matched) / total) * 100, 2)
    return JobAnalysis(job=job, fit_score=fit_score, matched_skills=matched, missing_skills=missing)


def generate_inmail(job: JobPosting, resume_text: str, matched_skills: List[str]) -> str:
    highlights = ", ".join(matched_skills[:3]) if matched_skills else "relevant experience"
    return (
        f"Hi {job.company} team,\n"
        f"I'm excited about the {job.title} role. I bring {highlights} and have shipped products "
        f"that align with your needs. I'd appreciate the chance to discuss how I can help. "
        f"Thanks for your time."
    )


def generate_cover_letter(job: JobPosting, resume_text: str, matched_skills: List[str]) -> str:
    skills_text = ", ".join(matched_skills[:5]) if matched_skills else "relevant technical experience"
    return (
        f"Dear {job.company} Hiring Team,\n\n"
        f"I am applying for the {job.title} position. My background includes {skills_text}, "
        f"and I have delivered outcomes in similar environments.\n\n"
        f"I am motivated by {job.company}'s mission and would welcome the opportunity to contribute. "
        f"Thank you for your consideration.\n"
    )


@app.on_event("startup")
def startup_event() -> None:
    init_db()


@app.post("/upload/resume")
async def upload_resume(file: UploadFile = File(...)) -> dict:
    contents = await file.read()
    text = normalize_text(contents, file.filename)
    detected_skills = extract_skills(text)
    return {"text": text, "skills": detected_skills}


@app.post("/upload/csv")
async def upload_csv(file: UploadFile = File(...)) -> dict:
    contents = await file.read()
    urls = parse_csv(contents)
    return {"urls": urls}


@app.post("/jobs/process")
async def process_jobs(
    resume_text: str = Form(...),
    urls: str = Form(...),
) -> dict:
    url_list = [u.strip() for u in urls.split(",") if u.strip()]
    if not url_list:
        raise HTTPException(status_code=400, detail="No URLs provided")

    analyses: List[JobAnalysis] = []
    for url in url_list:
        job = get_mock_job(url)
        analysis = compute_fit(job, resume_text)
        analyses.append(analysis)

    return {
        "jobs": [analysis.model_dump() for analysis in analyses],
    }


@app.post("/generate/inmail")
async def generate_inmail_endpoint(
    job: JobPosting = Body(...),
    resume_text: str = Body(""),
    matched_skills: Optional[List[str]] = Body(None),
) -> dict:
    content = generate_inmail(job, resume_text, matched_skills or [])
    return {"inmail": content}


@app.post("/generate/coverletter")
async def generate_cover_letter_endpoint(
    job: JobPosting = Body(...),
    resume_text: str = Body(""),
    matched_skills: Optional[List[str]] = Body(None),
) -> dict:
    content = generate_cover_letter(job, resume_text, matched_skills or [])
    return {"cover_letter": content}


def read_saved() -> List[SavedRecord]:
    init_db()
    with DB_PATH.open("r", encoding="utf-8") as f:
        return [SavedRecord.model_validate(entry) for entry in json.load(f)]


def write_saved(records: List[SavedRecord]) -> None:
    with DB_PATH.open("w", encoding="utf-8") as f:
        json.dump([record.model_dump() for record in records], f, indent=2)


@app.get("/saved", response_model=List[SavedRecord])
async def get_saved() -> List[SavedRecord]:
    return read_saved()


@app.post("/save", response_model=SavedRecord)
async def save_application(payload: SavePayload) -> SavedRecord:
    records = read_saved()
    new_record = SavedRecord(id=str(uuid.uuid4()), **payload.model_dump())
    records.append(new_record)
    write_saved(records)
    return new_record


@app.get("/saved/export")
async def export_saved() -> dict:
    records = read_saved()
    csv_lines = ["job_title,company,fit_score,missing_skills,linkedin_url,timestamp"]
    for record in records:
        csv_lines.append(
            f"\"{record.job.title}\",\"{record.job.company}\",{record.fit_score},"
            f"\"{'|'.join(record.missing_skills)}\",\"{record.job.url}\",\"{record.timestamp}\""
        )
    csv_content = "\n".join(csv_lines)
    return {"csv": csv_content}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
