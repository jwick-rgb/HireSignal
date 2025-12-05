import csv
import io
import json
import re
import uuid
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import List, Optional

import httpx
import logging
from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
DB_PATH = BASE_DIR / "db.json"
INMAIL_TEMPLATE = ROOT_DIR / "templates" / "emails" / "inmail.md"
COVER_TEMPLATE = ROOT_DIR / "templates" / "cover_letters" / "cover_letter.md"
FETCHED_DIR = BASE_DIR / "fetched_pages"


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
    "api",
    "graphql",
    "devops",
    "governance",
    "audit",
    "lifecycle management",
    "modeling",
    "taxonomy",
    "chatbot",
    "voice assistant",
    "agentic system",
    "agent",
    "ux",
    "consulting",
    "prompting",
    "prompt engineering",
    "workflow design",
    "risk management",
    "business intelligence",
    "advanced analytics",
    "data science",
    "team building",
    "project management",
    "data visualization",
    "data model",
    "etl",
    "data lake",
    "data warehouse",
    "data quality",
    "data management",
    "process engineering",
    "automation",
    "solution design",
    "change management",
    "lean operations",
    "agile",
    "finance",
    "financial reporting",
    "dashboard",
    "product strategy",
    "product management",
    "customer engagement",
    "research",
    "vendor",
    "statistics",
    "hugging face",
    "anthropic",
    "langchain",
    "tableau",
    "power bi",
    "looker",
    "gcp",
    "google cloud",
    "aws",
    "bigquery",
    "vertex ai",
    "airflow",
    "snowflake",
    "plotly",
    "qlik",
    "dbeaver",
    "elastic",
    "mongo",
    "apache",
    "spark",
    "azure",
    "git",
    "jira",
    "saas",
    "databricks",
    "streamlit",
    "loveable",
    "deep learning"
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
    location: Optional[str] = None
    salary: Optional[str] = None
    work_type: Optional[str] = None
    contact_person: Optional[str] = None
    posted_at: Optional[str] = None


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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hiresignal")

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
    if not FETCHED_DIR.exists():
        FETCHED_DIR.mkdir(parents=True, exist_ok=True)
    if not INMAIL_TEMPLATE.exists():
        INMAIL_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)
    if not COVER_TEMPLATE.exists():
        COVER_TEMPLATE.parent.mkdir(parents=True, exist_ok=True)


def normalize_text(raw: bytes, filename: str) -> str:
    name_lower = filename.lower()
    text: Optional[str] = None

    # PDF extraction
    if name_lower.endswith(".pdf"):
        try:
            import PyPDF2  # type: ignore

            reader = PyPDF2.PdfReader(io.BytesIO(raw))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n".join(pages)
        except Exception as exc:
            logger.warning("PDF parse failed for %s: %s", filename, exc)

    # DOCX extraction
    if text is None and name_lower.endswith(".docx"):
        try:
            import docx  # type: ignore

            doc = docx.Document(io.BytesIO(raw))
            text = "\n".join(paragraph.text for paragraph in doc.paragraphs)
        except Exception as exc:
            logger.warning("DOCX parse failed for %s: %s", filename, exc)

    # Fallback to plain decode
    if text is None:
        text = raw.decode(errors="ignore")

    # Basic cleanup to trim noisy whitespace
    text = re.sub(r"\s+", " ", text)
    if not text.strip():
        raise HTTPException(status_code=400, detail=f"Could not parse text from {filename}")
    return text.strip()


def parse_csv(file_bytes: bytes) -> List[str]:
    decoded = file_bytes.decode(errors="ignore").splitlines()
    reader = csv.DictReader(decoded)
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV must include a 'url' header")

    # Normalize headers for case-insensitive matching
    field_map = {name.lower(): name for name in reader.fieldnames}
    url_key = field_map.get("url")
    if not url_key:
        raise HTTPException(status_code=400, detail="CSV must include a 'url' header")

    benefits_key = field_map.get("benefits")
    workplace_key = field_map.get("workplace type")

    rows = []
    for row in reader:
        if not row.get(url_key):
            continue
        rows.append(
            {
                "url": row.get(url_key, "").strip(),
                "benefits": (row.get(benefits_key, "") if benefits_key else "").strip(),
                "workplace_type": (row.get(workplace_key, "") if workplace_key else "").strip(),
            }
        )

    if not rows:
        raise HTTPException(status_code=400, detail="CSV must include at least one URL")
    return rows


def extract_skills(text: str) -> List[str]:
    lowered = text.lower()
    found = {skill for skill in SKILL_KEYWORDS if skill in lowered}
    return sorted(found)


def clean_html_to_text(html: str) -> str:
    # Remove scripts/styles and collapse whitespace for a rough text extraction.
    html = re.sub(r"(?s)<(script|style).*?>.*?(</\\1>)", " ", html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;?", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_first(patterns: list[str], text: str) -> Optional[str]:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE | re.DOTALL)
        if match:
            return unescape(match.group(1)).strip()
    return None


def get_salutation(job: JobPosting) -> str:
    if job.contact_person:
        return job.contact_person
    return f"{job.company} hiring team"


def load_template(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def format_salary_to_k(value: str) -> str:
    """
    Attempt to normalize salary strings like "$265,000.00/yr" or "$265,000 - $275,000/yr" to "$265K/yr".
    If parsing fails, return the original string.
    """
    try:
        numbers = re.findall(r"\$?\s*([0-9][0-9,\.]+)", value)
        if not numbers:
            return value

        def fmt(num_str: str) -> str:
            num = float(num_str.replace(",", ""))
            k_val = int(round(num / 1000))
            return f"${k_val}K"

        suffix_part = "/yr" if "yr" in value.lower() else ""
        if len(numbers) >= 2:
            first, second = fmt(numbers[0]), fmt(numbers[1])
            return f"{first}{suffix_part} - {second}{suffix_part}"
        else:
            return f"{fmt(numbers[0])}{suffix_part}"
    except Exception:
        return value


def clean_job_title(title: str) -> str:
    """Strip company/location phrases from scraped job titles for messaging."""
    t = title.strip()
    hiring_in = re.search(r"hiring\s+(.+?)\s+in\s+.+", t, flags=re.IGNORECASE)
    if hiring_in:
        t = hiring_in.group(1)
    else:
        hiring_only = re.search(r"hiring\s+(.+)", t, flags=re.IGNORECASE)
        if hiring_only:
            t = hiring_only.group(1)
        else:
            at_match = re.search(r"(.+?)\s+at\s+.+", t, flags=re.IGNORECASE)
            if at_match:
                t = at_match.group(1)
    t = re.sub(r"\s+in\s+[^,]+$", "", t, flags=re.IGNORECASE)
    return t.strip(" ,")


def sanitize_description(text: str) -> str:
    # Remove noisy "Posted HH:MM:SS AM/PM" and LinkedIn boilerplate.
    text = re.sub(r"Posted\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)\.?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"See this and similar jobs on LinkedIn\.?", "", text, flags=re.IGNORECASE)
    return text.strip()


def fetch_job_from_linkedin(
    url: str,
    salary_override: Optional[str] = None,
    workplace_override: Optional[str] = None,
) -> Optional[JobPosting]:
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    }
    try:
        resp = httpx.get(url, headers=headers, timeout=10.0)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("Fetch failed for %s: %s", url, exc)
        return None

    html = resp.text
    # Persist fetched HTML for debugging/comparison
    try:
        safe_name = url.replace("://", "_").replace("/", "_")
        (FETCHED_DIR / f"{safe_name}.html").write_text(html, encoding="utf-8", errors="ignore")
    except Exception as exc:  # pragma: no cover - best effort
        logger.warning("Failed to persist fetched HTML for %s: %s", url, exc)
    title_patterns = [
        r'"title"\s*:\s*"([^"]+)"',
        r'\\"title\\":\\"([^"\\]+)',
        r'<meta property="og:title"\s+content="([^"]+)"',
        r'<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([^<]+)</h1>',
        r'<h1[^>]*class="[^"]*topcard__title[^"]*"[^>]*>([^<]+)</h1>',
        r"<title>([^<]+)</title>",
    ]
    company_patterns = [
        r'"companyName"\s*:\s*"([^"]+)"',
        r'\\"companyName\\":\\"([^"\\]+)',
        r'data-company-name="([^"]+)"',
        r'"companyUniversalName"\s*:\s*"([^"]+)"',
        r'"decoratedCompany"\s*:\s*{"name":"([^"]+)"',
        r'<a[^>]*class="[^"]*top-card-layout__company-url[^"]*"[^>]*>([^<]+)</a>',
        r'<a[^>]*class="[^"]*topcard__org-name-link[^"]*"[^>]*>([^<]+)</a>',
        r'<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>([^<]+)</span>',
    ]

    title = extract_first(title_patterns, html)
    if title and "|" in title:
        title = title.split("|")[0].strip()

    company = extract_first(company_patterns, html)
    if not company and title:
        company_tag = re.search(r"at\s+([^|<]+)\|", title or "", flags=re.IGNORECASE)
        if company_tag:
            company = company_tag.group(1).strip()

    description_match = extract_first(
        [
            r'"description"\s*:\s*"(.+?)"',
            r'\\"description\\":\\"(.+?)\\"',
            r'<div class="show-more-less-html__markup[^"]*">(.+?)</div>',
            r'<meta name="description"\s+content="([^"]+)"',
            r'<meta property="og:description"\s+content="([^"]+)"',
        ],
        html,
    )
    description_text = description_match if description_match else html
    description = sanitize_description(clean_html_to_text(description_text))

    if not title or not company:
        logger.info("Missing parsed title/company for %s; falling back to mock", url)
        return None

    # Extract skills from both the cleaned description and the full HTML to avoid missing context.
    required_skills = sorted(
        set(extract_skills(description)) | set(extract_skills(clean_html_to_text(html)))
    )

    posted_at = extract_first(
        [
            r'<time[^>]*datetime="([^"]+)"',
        ],
        html,
    )

    contact_person = extract_first(
        [
            r'aria-label="Message\s+([^"]+)"',
            r"aria-label='Message\s+([^']+)'",
            r'Message\s+([A-Za-z][A-Za-z\\s\\-\\\']+)</',
        ],
        html,
    )

    location = extract_first(
        [
            r'"formattedLocation"\s*:\s*"([^"]+)"',
            r'"jobLocation"\s*:\s*"([^"]+)"',
            r'"formattedLocation"\s*:\s*\\"([^"\\]+)',
            r'<span[^>]*class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([^<]+)</span>',
            r'<span[^>]*class="[^"]*topcard__flavor[^"]*"[^>]*>([^<]+)</span>',
            r'NavigationBarSubtitle&quot;:&quot;[^·]+·\s*([^(&]+)',
            r'&quot;navigationBarSubtitle&quot;:&quot;[^·]+·\s*([^(&]+)',
        ],
        html,
    )

    # Simple salary extraction: look for "$... - $...yr" patterns; if none, fallback to override or unavailable
    salary_range_match = re.search(r"\$[^$\\n]{1,40}?-\s*\$[^$\\n]{1,40}?yr", html, flags=re.IGNORECASE)
    raw_salary = salary_range_match.group(0).strip() if salary_range_match else (salary_override or "Unavailable")
    salary = format_salary_to_k(raw_salary) if raw_salary.lower() != "unavailable" else "Unavailable"

    # Work type: prefer override from CSV, else detect hybrid/remote in html, else unavailable
    raw_work_type = None
    work_type_match = re.search(r"\b(Hybrid|Remote|On[- ]?site)\b", html, flags=re.IGNORECASE)
    if work_type_match:
        raw_work_type = work_type_match.group(1)

    html_lower = html.lower()
    hybrid_found = "hybrid" in html_lower
    normalized_work_type = workplace_override or None
    if normalized_work_type:
        normalized_work_type = normalized_work_type.capitalize()
    else:
        if hybrid_found:
            normalized_work_type = "Hybrid"
        elif "remote" in html_lower:
            normalized_work_type = "Remote"
        else:
            normalized_work_type = "Unavailable"

    logger.info(
        "Parsed LinkedIn job for %s -> %s @ %s | location=%r salary=%r work_type_raw=%r work_type=%r",
        url,
        title,
        company,
        location,
        salary,
        raw_work_type,
        normalized_work_type,
    )
    return JobPosting(
        id=str(uuid.uuid4()),
        url=url,
        title=title,
        company=company,
        description=description,
        required_skills=required_skills,
        location=location,
        salary=salary,
        work_type=normalized_work_type,
        contact_person=contact_person,
        posted_at=posted_at,
    )


def get_job(url: str, salary_override: Optional[str] = None, workplace_override: Optional[str] = None) -> JobPosting:
    fetched = fetch_job_from_linkedin(url, salary_override=salary_override, workplace_override=workplace_override)
    if fetched:
        return fetched

    # Fallback to mocks if fetch/parsing fails.
    logger.info("Using mock fallback for %s", url)
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
        location=None,
        salary=salary_override or "Unavailable",
        work_type=workplace_override.capitalize() if workplace_override else "Unavailable",
    )


def compute_fit(job: JobPosting, resume_text: str) -> JobAnalysis:
    resume_skills = extract_skills(resume_text)
    required = job.required_skills or extract_skills(job.description)
    matched = sorted({skill for skill in required if skill in resume_skills})
    missing = sorted({skill for skill in required if skill not in resume_skills})
    total = len(required) or 1
    fit_score = round((len(matched) / total) * 100)
    logger.info(
        "Job skills for %s -> required=%s matched=%s missing=%s",
        job.url,
        required,
        matched,
        missing,
    )
    return JobAnalysis(job=job, fit_score=fit_score, matched_skills=matched, missing_skills=missing)


def generate_inmail(job: JobPosting, resume_text: str, matched_skills: List[str]) -> str:
    salutation = get_salutation(job)
    clean_title = clean_job_title(job.title)
    template = load_template(INMAIL_TEMPLATE)
    if not template:
        highlights = ", ".join(matched_skills[:3]) if matched_skills else "relevant experience"
        logger.info("InMail template missing; using fallback copy")
        return (
            f"Hello {salutation},\n"
            f"I'm excited about the {clean_title} role at {job.company}. I bring {highlights} and have shipped products "
            f"that align with your needs. Job link: {job.url}"
        )
    populated = (
        template.replace("<job title>", clean_title)
        .replace("<contact>", salutation)
        .replace("<company>", job.company)
        .replace("<job url>", job.url)
    )
    return populated


def generate_cover_letter(job: JobPosting, resume_text: str, matched_skills: List[str]) -> str:
    clean_title = clean_job_title(job.title)
    template = load_template(COVER_TEMPLATE)
    today = datetime.now().strftime("%B %d, %Y")
    if not template:
        skills_text = ", ".join(matched_skills[:5]) if matched_skills else "relevant technical experience"
        logger.info("Cover letter template missing; using fallback copy")
        return (
            f"I am applying for the {clean_title} position at {job.company}. My background includes {skills_text}.\n\n"
            f"Thank you for your consideration.\n"
        )
    populated = (
        template.replace("<current date>", today)
        .replace("<company>", job.company)
        .replace("<job title>", clean_title)
    )
    return populated


@app.on_event("startup")
def startup_event() -> None:
    init_db()


@app.post("/upload/resume")
async def upload_resume(file: UploadFile = File(...)) -> dict:
    contents = await file.read()
    text = normalize_text(contents, file.filename)
    detected_skills = extract_skills(text)
    try:
        # Write normalized text for legibility
        Path("resume_extracted.txt").write_text(text, encoding="utf-8", errors="ignore")
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed to persist extracted resume text: %s", exc)
    logger.info("Resume skills extracted: %s", detected_skills)
    return {"text": text, "skills": detected_skills}


@app.post("/upload/csv")
async def upload_csv(file: UploadFile = File(...)) -> dict:
    contents = await file.read()
    rows = parse_csv(contents)
    meta = {row["url"]: {"benefits": row.get("benefits"), "workplace_type": row.get("workplace_type")} for row in rows}
    urls = [row["url"] for row in rows]
    return {"urls": urls, "meta": meta}


@app.post("/jobs/process")
async def process_jobs(
    resume_text: str = Form(...),
    urls: str = Form(...),
    url_meta: Optional[str] = Form(None),
) -> dict:
    url_list = [u.strip() for u in urls.split(",") if u.strip()]
    if not url_list:
        raise HTTPException(status_code=400, detail="No URLs provided")

    meta_map = {}
    if url_meta:
        try:
            meta_map = json.loads(url_meta)
        except json.JSONDecodeError:
            meta_map = {}

    logger.info("Processing %d job URLs", len(url_list))
    analyses: List[JobAnalysis] = []
    for url in url_list:
        meta = meta_map.get(url, {}) if isinstance(meta_map, dict) else {}
        job = get_job(
            url,
            salary_override=meta.get("benefits") or None,
            workplace_override=meta.get("workplace_type") or None,
        )
        analysis = compute_fit(job, resume_text)
        logger.info(
            "Fit score for %s -> %s%%; missing skills: %s",
            url,
            analysis.fit_score,
            analysis.missing_skills,
        )
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
