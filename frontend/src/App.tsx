// testing here
import React, { useEffect, useMemo, useState } from 'react'
import './index.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

type JobPosting = {
  id: string
  url: string
  title: string
  company: string
  description: string
  required_skills: string[]
  location?: string | null
  salary?: string | null
  work_type?: string | null
  contact_person?: string | null
  posted_at?: string | null
}

type CsvMeta = {
  benefits?: string | null
  workplace_type?: string | null
}

type JobAnalysis = {
  job: JobPosting
  fit_score: number
  matched_skills: string[]
  missing_skills: string[]
}

type GeneratedMaterials = {
  inmail: string
  cover_letter: string
}

type SavedRecord = {
  id: string
  job: JobPosting
  fit_score: number
  missing_skills: string[]
  generated: GeneratedMaterials
  has_generated: boolean
  timestamp: string
}

type LoadingState = {
  resume: boolean
  csv: boolean
  process: boolean
  generateId: string | null
  saveId: string | null
  exportCsv: boolean
}

const initialLoading: LoadingState = {
  resume: false,
  csv: false,
  process: false,
  generateId: null,
  saveId: null,
  exportCsv: false,
}

const badgeColors = ['from-cyan-500 to-blue-500', 'from-amber-400 to-orange-500', 'from-emerald-400 to-teal-500']

const formatDate = (date: string) => new Date(date).toLocaleString()
const displayOrUnavailable = (value?: string | null) => (value && value.trim() ? value : 'Unavailable')

async function api<T>(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, options)
  if (!res.ok) {
    const message = await res.text()
    throw new Error(message || 'Request failed')
  }
  return res.json() as Promise<T>
}

function App() {
  const [resumeText, setResumeText] = useState('')
  const [resumeSkills, setResumeSkills] = useState<string[]>([])
  const [urls, setUrls] = useState<string[]>([])
  const [urlMeta, setUrlMeta] = useState<Record<string, CsvMeta>>({})
  const [resumeInputKey, setResumeInputKey] = useState(() => Date.now())
  const [csvInputKey, setCsvInputKey] = useState(() => Date.now() + 1)
  const [jobs, setJobs] = useState<JobAnalysis[]>([])
  const [materials, setMaterials] = useState<Record<string, GeneratedMaterials>>({})
  const [materialsDraft, setMaterialsDraft] = useState<Record<string, GeneratedMaterials>>({})
  const [materialsOpen, setMaterialsOpen] = useState<Record<string, boolean>>({})
  const [descriptionOpen, setDescriptionOpen] = useState<Record<string, boolean>>({})
  const [skillsExpanded, setSkillsExpanded] = useState(false)
  const [saved, setSaved] = useState<SavedRecord[]>([])
  const [loading, setLoading] = useState<LoadingState>(initialLoading)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    refreshSaved()
  }, [])

  const fitAverage = useMemo(() => {
    if (!jobs.length) return 0
    const total = jobs.reduce((sum, item) => sum + item.fit_score, 0)
    return Math.round(total / jobs.length)
  }, [jobs])

  const updateMessage = (msg: string | null) => {
    setMessage(msg)
    if (msg) {
      setTimeout(() => setMessage(null), 3500)
    }
  }

  const handleResumeUpload = async (file: File) => {
    setLoading((state) => ({ ...state, resume: true }))
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await api<{ text: string; skills: string[] }>('/upload/resume', {
        method: 'POST',
        body: formData,
      })
      setResumeText(data.text)
      setResumeSkills(data.skills || [])
      updateMessage('Resume processed')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((state) => ({ ...state, resume: false }))
    }
  }

  const handleCsvUpload = async (file: File) => {
    setLoading((state) => ({ ...state, csv: true }))
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await api<{ urls: string[]; meta: Record<string, CsvMeta> }>('/upload/csv', {
        method: 'POST',
        body: formData,
      })
      setUrls(data.urls)
      setUrlMeta(data.meta || {})
      updateMessage(`Loaded ${data.urls.length} job URLs`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((state) => ({ ...state, csv: false }))
    }
  }

  const processJobs = async () => {
    if (!resumeText || !urls.length) {
      setError('Upload a resume and CSV before processing')
      return
    }
    setLoading((state) => ({ ...state, process: true }))
    setError(null)
    try {
      const formData = new FormData()
      formData.append('resume_text', resumeText)
      formData.append('urls', urls.join(','))
      formData.append('url_meta', JSON.stringify(urlMeta))
      const data = await api<{ jobs: JobAnalysis[] }>('/jobs/process', {
        method: 'POST',
        body: formData,
      })
      setJobs(data.jobs)
      setMaterials({})
      updateMessage('Jobs analyzed')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((state) => ({ ...state, process: false }))
    }
  }

  const generateForJob = async (jobId: string) => {
    const analysis = jobs.find((j) => j.job.id === jobId)
    if (!analysis) return
    setLoading((state) => ({ ...state, generateId: jobId }))
    setError(null)
    try {
      const body = JSON.stringify({
        job: analysis.job,
        resume_text: resumeText,
        matched_skills: analysis.matched_skills,
      })
      const [inmailResp, coverResp] = await Promise.all([
        api<{ inmail: string }>('/generate/inmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
        api<{ cover_letter: string }>('/generate/coverletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        }),
      ])
      setMaterials((state) => ({
        ...state,
        [jobId]: { inmail: inmailResp.inmail, cover_letter: coverResp.cover_letter },
      }))
      setMaterialsDraft((state) => ({
        ...state,
        [jobId]: { inmail: inmailResp.inmail, cover_letter: coverResp.cover_letter },
      }))
      setMaterialsOpen((state) => ({ ...state, [jobId]: true }))
      updateMessage('Content generated')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((state) => ({ ...state, generateId: null }))
    }
  }

  const savePosting = async (jobId: string) => {
    const analysis = jobs.find((j) => j.job.id === jobId)
    if (!analysis) return

    const generated = materials[jobId] || null

    setLoading((state) => ({ ...state, saveId: jobId }))
    setError(null)
    try {
      const payload = {
        job: analysis.job,
        fit_score: analysis.fit_score,
        missing_skills: analysis.missing_skills,
        generated,
        timestamp: new Date().toISOString(),
      }

      const savedRecord = await api<SavedRecord>('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setSaved((state) => [...state, savedRecord])
      updateMessage('Application saved')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((state) => ({ ...state, saveId: null }))
    }
  }

  const refreshSaved = async () => {
    try {
      const data = await api<SavedRecord[]>('/saved')
      setSaved(data)
    } catch (err) {
      // Do not surface immediately; user can retry later.
      console.warn('Failed to load saved items', err)
    }
  }

  const exportCsv = async () => {
    setLoading((state) => ({ ...state, exportCsv: true }))
    try {
      const data = await api<{ csv: string }>('/saved/export')
      const blob = new Blob([data.csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'hiresignal_applications.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      updateMessage('CSV exported')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((state) => ({ ...state, exportCsv: false }))
    }
  }

const UploadZone = ({
  label,
  accept,
  onFile,
  busy,
  helper,
  inputKey,
  onReset,
}: {
  label: string
  accept: string
  onFile: (file: File) => void
  busy: boolean
  helper: string
  inputKey: number
  onReset: () => void
}) => {
  useEffect(() => {
    console.info(`[UploadZone] mounted inputKey=${inputKey} label=${label}`)
  }, [inputKey, label])
  console.info(`[UploadZone] render inputKey=${inputKey} label=${label}`)
  return (
    <div className="block w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-white transition hover:border-indigo-400/60 hover:bg-white/10">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-white/70 mb-2">{helper}</p>
      <input
        id={inputKey.toString()}
        key={inputKey}
        type="file"
        accept={accept}
        className="mt-2 block w-full cursor-pointer text-xs text-white/80 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-white/20 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white file:hover:border-indigo-400/60 file:hover:bg-indigo-500/20"
        onClick={(e) => {
          const target = e.target as HTMLInputElement
          target.value = ''
        }}
        onChange={(e) => {
          const selected = e.target.files?.[0]
          console.info(`[UploadZone] change inputKey=${inputKey} fileSelected=${!!selected}`)
          if (selected) onFile(selected)
          e.target.value = ''
          onReset()
        }}
        disabled={busy}
      />
    </div>
  )
}

  const renderJobCard = (item: JobAnalysis, index: number) => {
    const gradient = badgeColors[index % badgeColors.length]
    const mat = materials[item.job.id]
    const isGenerating = loading.generateId === item.job.id
    const isSaving = loading.saveId === item.job.id

    return (
      <div key={item.job.id} className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-lg shadow-indigo-900/40 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Job</p>
            <h3 className="text-xl font-semibold text-white">{item.job.title}</h3>
            <p className="text-sm text-white/70">{item.job.company}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/70">
              {item.job.contact_person && (
                <span className="rounded-full bg-indigo-500/20 px-2 py-1">
                  Contact: {item.job.contact_person}
                </span>
              )}
              {item.job.posted_at && (
                <span className="rounded-full bg-white/5 px-2 py-1">
                  Posted: {item.job.posted_at}
                </span>
              )}
              <span className="rounded-full bg-white/5 px-2 py-1">
                Location: {displayOrUnavailable(item.job.location)}
              </span>
              <span className="rounded-full bg-white/5 px-2 py-1">
                Salary: {displayOrUnavailable(item.job.salary)}
              </span>
              <span className="rounded-full bg-white/5 px-2 py-1">
                Work: {displayOrUnavailable(item.job.work_type)}
              </span>
            </div>
          </div>
          <div className={`rounded-xl bg-gradient-to-br ${gradient} px-3 py-2 text-center text-white`}>
            <p className="text-[10px] uppercase tracking-wide">Fit Score</p>
            <p className="text-xl font-bold">{item.fit_score}%</p>
          </div>
        </div>
        <p
          className={`mt-3 text-sm text-white/70 leading-6 pr-1 whitespace-pre-line ${
            descriptionOpen[item.job.id] ? 'max-h-[28rem] overflow-y-auto' : 'max-h-48 overflow-hidden text-ellipsis'
          }`}
        >
          {item.job.description
            ?.replace(/Posted\s+\d{1,2}:\d{2}:\d{2}\s+(AM|PM)\.?\s*/gi, '')
            ?.replace(/See this and similar jobs on LinkedIn\.?/gi, '')}
        </p>
        {item.job.description && item.job.description.length > 240 && (
          <button
            className="mt-2 text-xs font-semibold text-indigo-200 hover:text-indigo-100"
            onClick={() =>
              setDescriptionOpen((state) => ({ ...state, [item.job.id]: !(descriptionOpen[item.job.id] ?? false) }))
            }
          >
            {descriptionOpen[item.job.id] ? 'Less' : 'More'}
          </button>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {item.missing_skills.length ? (
            item.missing_skills.map((skill) => (
              <span key={skill} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-amber-200">
                Missing: {skill}
              </span>
            ))
          ) : (
            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
              Strong match
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => window.open(item.job.url, '_blank')}
            className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-indigo-400/60 hover:text-white"
          >
            View on LinkedIn
          </button>
          <button
            onClick={() => generateForJob(item.job.id)}
            disabled={isGenerating}
            className="rounded-xl bg-indigo-500/80 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-900/60 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? 'Generating…' : 'Generate InMail + Cover'}
          </button>
          <button
            onClick={() => savePosting(item.job.id)}
            disabled={isSaving}
            className="rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {mat && materialsOpen[item.job.id] !== false && (
          <div className="mt-4 grid gap-3 rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.2em] text-indigo-200/80">InMail</p>
              <button
                onClick={() => {
                  const draft = materialsDraft[item.job.id] || mat
                  setMaterials((state) => ({ ...state, [item.job.id]: draft }))
                  setMaterialsOpen((state) => ({ ...state, [item.job.id]: false }))
                }}
                className="text-xs text-white/60 hover:text-white"
              >
                X
              </button>
            </div>
            <div className="flex justify-end">
              <button
                className="text-[11px] font-semibold text-indigo-200 hover:text-indigo-100"
                onClick={() => handleCopy((materialsDraft[item.job.id] || mat).inmail)}
              >
                Copy
              </button>
            </div>
            <textarea
              className="w-full rounded-xl border border-white/10 bg-black/40 p-2 text-sm text-white/80"
              rows={6}
              value={(materialsDraft[item.job.id] || mat).inmail}
              onChange={(e) =>
                setMaterialsDraft((state) => ({
                  ...state,
                  [item.job.id]: {
                    ...((state[item.job.id] as GeneratedMaterials) || mat),
                    inmail: e.target.value,
                  },
                }))
              }
            />
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.2em] text-indigo-200/80">Cover Letter</p>
              </div>
              <div className="flex justify-end">
                <button
                  className="text-[11px] font-semibold text-indigo-200 hover:text-indigo-100"
                  onClick={() => handleCopy((materialsDraft[item.job.id] || mat).cover_letter)}
                >
                  Copy
                </button>
              </div>
              <textarea
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-2 text-sm text-white/80"
                rows={10}
                value={(materialsDraft[item.job.id] || mat).cover_letter}
                onChange={(e) =>
                  setMaterialsDraft((state) => ({
                    ...state,
                    [item.job.id]: {
                      ...((state[item.job.id] as GeneratedMaterials) || mat),
                      cover_letter: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
        )}
        {mat && materialsOpen[item.job.id] === false && (
          <button
            className="mt-3 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 hover:border-indigo-400/60"
            onClick={() => {
              if (!materialsDraft[item.job.id]) {
                setMaterialsDraft((state) => ({ ...state, [item.job.id]: mat }))
              }
              setMaterialsOpen((state) => ({ ...state, [item.job.id]: true }))
            }}
          >
            Reopen InMail + Cover Letter
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-indigo-900/40 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-200/80">HireSignal</p>
              <h1 className="text-3xl font-bold">Targeted applications without the busywork.</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/70">
                Upload your resume and a CSV of LinkedIn postings. We score the fit, surface missing skills, and
                generate tailored outreach for each role.
              </p>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-indigo-500/60 to-cyan-400/50 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40">
              Fit Avg {fitAverage}% · {jobs.length} jobs analyzed
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-3">
            <UploadZone
              label="Resume (PDF or DOCX)"
              accept=".pdf,.doc,.docx,.txt"
              inputKey={resumeInputKey}
              onReset={() => {
                const next = resumeInputKey + 2
                console.info(`[UploadZone] resume reset to key=${next}`)
                setResumeInputKey(next)
              }}
              busy={loading.resume}
              helper={resumeText ? 'Resume ready' : 'Upload resume to extract skills'}
              onFile={handleResumeUpload}
            />
            <UploadZone
              label="CSV of LinkedIn URLs"
              accept=".csv,text/csv"
              inputKey={csvInputKey}
              onReset={() => {
                const next = csvInputKey + 2
                console.info(`[UploadZone] csv reset to key=${next}`)
                setCsvInputKey(next)
              }}
              busy={loading.csv}
              helper={urls.length ? `${urls.length} URLs loaded` : "CSV should include a 'url' column"}
              onFile={handleCsvUpload}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={processJobs}
                disabled={loading.process}
                className="rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/50 transition hover:bg-indigo-500/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading.process ? 'Analyzing…' : 'Process Jobs'}
              </button>
              {resumeSkills.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs text-white/70">
                  <span className="rounded-full bg-white/10 px-3 py-1 font-semibold text-emerald-100">
                    {resumeSkills.length} skills detected
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {resumeSkills.slice(0, 6).map((skill) => (
                      <span key={skill} className="rounded-full bg-black/30 px-2 py-1">
                        {skill}
                      </span>
                    ))}
                    {resumeSkills.length > 6 && (
                      <button
                        className="text-white/50 underline underline-offset-2"
                        onClick={() => setSkillsExpanded((prev) => !prev)}
                      >
                        {skillsExpanded ? 'less' : '+more'}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {skillsExpanded && (
                <div className="max-h-48 w-full overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                  <div className="flex flex-wrap gap-2">
                    {resumeSkills.map((skill) => (
                      <span key={skill} className="rounded-full bg-white/10 px-2 py-1">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {error && <p className="text-sm text-rose-300">⚠ {error}</p>}
            {message && <p className="text-sm text-emerald-200">{message}</p>}
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/80 shadow-lg shadow-indigo-900/40 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.25em] text-white/60">How it works</p>
            <ol className="mt-3 space-y-2">
              <li>1) Upload resume and CSV with a <code className="text-indigo-200">url</code> column.</li>
              <li>2) Click Process Jobs to score fit and see missing skills.</li>
              <li>3) Generate InMail + Cover Letter per role.</li>
              <li>4) Save curated roles and export to CSV.</li>
            </ol>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Job Results</h2>
            <p className="text-sm text-white/60">{jobs.length ? `${jobs.length} roles analyzed` : 'Awaiting uploads'}</p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {jobs.length === 0 && (
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-6 text-sm text-white/60">
                Upload files and click Process Jobs to see scored postings.
              </div>
            )}
            {jobs.map((job, idx) => renderJobCard(job, idx))}
          </div>
        </section>

        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Saved Applications</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshSaved}
                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-indigo-400/60 hover:text-white"
              >
                Refresh
              </button>
              <button
                onClick={exportCsv}
                disabled={loading.exportCsv}
                className="rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading.exportCsv ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {saved.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-white/60">
                Saved applications will appear here after you click Save on a job.
              </div>
            )}
            {saved.map((record) => (
              <div key={record.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{record.job.title}</p>
                    <p className="text-xs text-white/60">
                      {record.job.company} • Fit {record.fit_score}% • Saved {formatDate(record.timestamp)}
                    </p>
                  </div>
                  <a
                    href={record.job.url}
                    target="_blank"
                    className="text-xs font-semibold text-indigo-200 hover:text-indigo-100"
                  >
                    LinkedIn ↗
                  </a>
                </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {record.missing_skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-amber-100">
                    Missing: {skill}
                  </span>
                ))}
              </div>
                {record.job.contact_person && (
                  <div className="mt-2 text-[11px] text-white/70">
                    Contact: {record.job.contact_person}
                  </div>
                )}
                {record.job.posted_at && (
                  <div className="text-[11px] text-white/70">
                    Posted: {record.job.posted_at}
                  </div>
                )}
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/70">
                <span className="rounded-full bg-white/5 px-2 py-1">
                  Location: {displayOrUnavailable(record.job.location)}
                </span>
                <span className="rounded-full bg-white/5 px-2 py-1">
                  Salary: {displayOrUnavailable(record.job.salary)}
                </span>
                <span className="rounded-full bg-white/5 px-2 py-1">
                  Work: {displayOrUnavailable(record.job.work_type)}
                </span>
              </div>
                {record.has_generated && record.generated && (
                  <details className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/80">
                    <summary className="cursor-pointer text-indigo-200">InMail + Cover Letter</summary>
                    <div className="mt-2 grid gap-2">
                      <div className="rounded-xl border border-white/5 bg-black/30 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-200/80">InMail</p>
                          <button
                            className="text-[11px] font-semibold text-indigo-200 hover:text-indigo-100"
                            onClick={() => handleCopy(record.generated.inmail)}
                          >
                            Copy
                          </button>
                        </div>
                        <p className="mt-1 whitespace-pre-line">{record.generated.inmail}</p>
                      </div>
                      <div className="rounded-xl border border-white/5 bg-black/30 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-200/80">Cover Letter</p>
                          <button
                            className="text-[11px] font-semibold text-indigo-200 hover:text-indigo-100"
                            onClick={() => handleCopy(record.generated.cover_letter)}
                          >
                            Copy
                          </button>
                        </div>
                        <p className="mt-1 whitespace-pre-line">{record.generated.cover_letter}</p>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
    const handleCopy = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text)
        updateMessage('Copied to clipboard')
      } catch (err) {
        setError('Copy failed')
      }
    }
