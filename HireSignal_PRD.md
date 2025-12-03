# Product Requirements Document (PRD)

## Project: HireSignal MVP

## Version: 1.0

## Owner: \[Founder Name\]

------------------------------------------------------------------------

# 1. Overview

**HireSignal** is a lightweight job-application assistant that ingests
LinkedIn job posting URLs and a user résumé, then ranks job fit and
highlights missing skills. The MVP focuses on three core capabilities:

1.  **Curate and display a list of job postings** from user-uploaded CSV
    (containing LinkedIn URLs).
2.  **Score résumé-to-job fit** based on text analysis.
3.  **Highlight missing skills** and auto-generate application materials
    (InMail + Cover Letter).

This MVP intentionally excludes complex integrations (real-time LinkedIn
scraping, user accounts, multi-version résumé editing). It is a small,
focused deliverable for validating core value.

------------------------------------------------------------------------

# 2. Goals & Non-Goals

## 2.1 Goals (MVP)

-   Allow user to upload:
    -   A **résumé file** (PDF or DOCX).
    -   A **CSV file** containing LinkedIn job posting URLs.
-   Fetch job posting content from each URL (simple HTML fetch +
    extraction OR placeholder text extraction for first iteration).
-   Compute a **Fit Score** (0--100) based on required skills vs résumé
    content.
-   Identify and display **missing skills** for each posting.
-   Auto-generate:
    -   A suggested **InMail message**.
    -   A suggested **Cover Letter**.
-   Let user **save** a curated posting + generated materials into local
    storage.
-   Allow user to **export a CSV** of saved applications.

## 2.2 Non-Goals (Not in MVP)

-   Real-time LinkedIn API integration.
-   Automated job searching or filters directly inside app.
-   Resume editing UI.
-   ATS-aware formatting.
-   User authentication / multi-user accounts.
-   Mobile app version.

------------------------------------------------------------------------

# 3. User Personas

### Persona: Mid-Senior Professional Job Seeker

-   Has an existing résumé.
-   Actively browsing LinkedIn.
-   Wants targeted applications and more efficient tailoring.
-   Comfortable uploading files.
-   Wants to track applications and generate templated messages.

------------------------------------------------------------------------

# 4. User Flows

## 4.1 Primary Flow (MVP)

1.  User visits the web app (React + Vite).
2.  User uploads:
    -   **Resume file**
    -   **CSV of LinkedIn URLs**
3.  Backend retrieves job descriptions (HTML fetch or placeholder
    parse).
4.  App analyzes each posting and displays:
    -   Job title\
    -   Company\
    -   Location\
    -   Salary\
    -   Work Type\
    -   Fit Score\
    -   Missing skills\
    -   "Generate InMail" button\
    -   "Generate Cover Letter" button\
    -   Direct link to LinkedIn posting
5.  User chooses to **Save** posting → stored in local database/db.json.
6.  User can export **CSV of saved applications**.

------------------------------------------------------------------------

# 5. Functional Requirements

## 5.1 File Upload

-   Resume file types supported:
    -   `.pdf`, `.docx`
-   CSV format example:

```{=html}
<!-- -->
```
    url
    https://www.linkedin.com/jobs/view/12345/
    https://www.linkedin.com/jobs/view/67890/

-   Validate:
    -   Must contain at least 1 URL.
    -   Must have a `url` header.

## 5.2 Job Fetching

-   Input: LinkedIn job URL.
-   Output (MVP options):
    1.  **If feasible**: Pull raw HTML → extract:
        -   Job title
        -   Company
        -   Job description text
    2.  **If not possible initially**: Return "placeholder" extracted
        text from local mock DB for testing.

## 5.3 Text Parsing

-   Extract required skills ("hard skills") using:
    -   Keyword detection
    -   N-gram embeddings
    -   Basic regex patterns for:
        -   "requirements"
        -   "qualifications"
        -   "skills"
-   Normalize résumé and job text using embeddings.

## 5.4 Fit Scoring

Compute 0--100 score by: - Counting matched skills. - Weighting by
keyword frequency. - Embedding similarity between résumé summary and job
description.

Formula (simple MVP):

    fit_score = (matched_skills / total_job_skills) * 100

## 5.5 Missing Skills Identification

-   List skills required by job but not found in résumé.
-   Show as pill-tags under each posting.

## 5.6 Auto-Generated Application Materials

Use GPT-based prompts to generate:

### InMail

-   Short 3--5 sentence message.
-   Include 1--2 résumé metrics automatically extracted.
-   Tone: professional, concise.

### Cover Letter

-   2--3 paragraphs.
-   Includes:
    -   Company name
    -   Role title
    -   1--2 résumé metrics
    -   Keywords from job description

## 5.7 Saving + Exporting

-   Save posting locally with:
    -   Job title\
    -   Company\
    -   Fit Score\
    -   Missing skills\
    -   Generated InMail\
    -   Generated Cover Letter\
    -   LinkedIn URL\
    -   Timestamp
-   Export all saved entries to a CSV.

------------------------------------------------------------------------

# 6. UI Requirements

## 6.1 Pages

### **Page A: Upload Inputs**

-   Two upload zones:
    -   Résumé file
    -   CSV of URLs
-   Button: "Process Jobs"

### **Page B: Job Results List**

For each job: - Title - Company - Fit Score badge - Missing Skills
pills - Buttons: - "View Details" - "Generate InMail" - "Generate Cover
Letter" - "Save" - "Open in LinkedIn" external link.

### **Page C: Saved Applications**

-   Table-like view showing:
    -   Job Title
    -   Company
    -   Fit Score
    -   Date Applied
    -   Button to expand (view stored InMail + cover letter)
-   Button: "Export CSV"

------------------------------------------------------------------------

# 7. Technical Requirements

## 7.1 Frontend

-   **React + Vite + Tailwind**
-   File upload components
-   Job card components
-   Local storage or simple backend GET/POST requests

## 7.2 Backend

-   **Python FastAPI** or Node/Express
-   Endpoints:
    -   `POST /upload/resume`
    -   `POST /upload/csv`
    -   `GET /jobs`
    -   `POST /generate/inmail`
    -   `POST /generate/coverletter`
    -   `POST /save`
    -   `GET /saved`
    -   `GET /saved/export`

## 7.3 Storage

-   `db.json` or SQLite

## 7.4 AI Models

-   Embeddings for résumé + job text
-   GPT-based generation for InMail + cover letter

------------------------------------------------------------------------

# 8. Success Metrics (MVP)

-   User successfully uploads résumé and CSV.
-   System extracts at least 1 job description.
-   Fit Score feels directionally correct.
-   User saves at least 1 posting.
-   CSV export works.
-   Generated messages are usable.

------------------------------------------------------------------------

# 9. Risks & Mitigations

  -----------------------------------------------------------------------
  Risk                    Mitigation
  ----------------------- -----------------------------------------------
  Job descriptions        Allow paste-in description or use mocks
  blocked by LinkedIn     

  Fit Score inaccurate    Improve extraction in v2

  Bad résumé parsing      Add normalization

  Large files             Limit to ≤ 5MB
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 10. Future Enhancements

-   Real LinkedIn scraping
-   Multi-resume management
-   Automated job searching with filters
-   Cloud accounts
-   Resume versioning & diffing
-   ATS-optimized outputs

------------------------------------------------------------------------

**End of PRD**
