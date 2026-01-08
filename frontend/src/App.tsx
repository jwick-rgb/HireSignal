// testing here
import React, { useEffect, useMemo, useState } from 'react'
import './index.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
const bookmarkletCode = `javascript:(function(){try{window._LINKEDIN_JOBS_=window._LINKEDIN_JOBS_||[];function clean(t){return t?t.replace(/[\\n\\r]+/g," ").trim():""}function findTxt(r,s){for(const sel of s){const el=r.querySelector(sel);if(el&&clean(el.innerText))return clean(el.innerText)}return""}const cards=document.querySelectorAll('li.scaffold-layout__list-item, li[data-occludable-job-id], li[id^="ember"]');let added=0;cards.forEach(card=>{const link=card.querySelector('a[href*="/jobs/view"]');if(!link)return;const url=link.href.split("?")[0];if(window._LINKEDIN_JOBS_.some(j=>j.url===url))return;const title=findTxt(card,['.job-card-list__title--link','.job-card-list__title','a.job-card-container__link']);const company=findTxt(card,['.artdeco-entity-lockup__subtitle span','.artdeco-entity-lockup__subtitle','.job-card-container__company-name']);const location=findTxt(card,['.artdeco-entity-lockup__caption li span','.artdeco-entity-lockup__caption span','.job-card-container__metadata-wrapper li span']);let workplace="";if(/\\((.*?)\\)/.test(location))workplace=location.match(/\\((.*?)\\)/)[1];const benefits=findTxt(card,['.artdeco-entity-lockup__metadata li span','.job-card-container__metadata-wrapper li span']);const insight=findTxt(card,['.job-card-container__job-insight-text']);let chips=[...card.querySelectorAll('.job-card-container__footer-item')].map(n=>clean(n.innerText)).filter(Boolean).join("; ");window._LINKEDIN_JOBS_.push({title,company,location,workplace,benefits,insight,chips,url});added++;});if(!confirm("Added "+added+" new jobs.\\nTotal collected: "+window._LINKEDIN_JOBS_.length+"\\n\\nClick OK to EXPORT combined CSV.\\nClick Cancel to continue collecting pages."))return;const header="Job Title,Company,Location,Workplace Type,Benefits,Job Insight,Footer Chips,URL\\n";const csv=header+window._LINKEDIN_JOBS_.map(r=>\`\"\${r.title}\",\"\${r.company}\",\"\${r.location}\",\"\${r.workplace}\",\"\${r.benefits}\",\"\${r.insight}\",\"\${r.chips}\",\"\${r.url}\"\`).join("\\n");const blob=new Blob([csv],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="linkedin_jobs_combined.csv";document.body.appendChild(a);a.click();document.body.removeChild(a);alert("CSV exported with "+window._LINKEDIN_JOBS_.length+" total job cards.")}catch(e){alert("Extractor error: "+e)}})();`

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
  applicants?: string | null
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
  single: boolean
  generateId: string | null
  saveId: string | null
  exportCsv: boolean
}

const initialLoading: LoadingState = {
  resume: false,
  csv: false,
  process: false,
  single: false,
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
  const [singleUrl, setSingleUrl] = useState('')
  const [showCsvUpload, setShowCsvUpload] = useState(true)
  const [jobs, setJobs] = useState<JobAnalysis[]>([])
  const [materials, setMaterials] = useState<Record<string, GeneratedMaterials>>({})
  const [materialsDraft, setMaterialsDraft] = useState<Record<string, GeneratedMaterials>>({})
  const [materialsOpen, setMaterialsOpen] = useState<Record<string, boolean>>({})
  const [descriptionOpen, setDescriptionOpen] = useState<Record<string, boolean>>({})
  const [skillsExpanded, setSkillsExpanded] = useState(false)
  const [progress, setProgress] = useState<{ visible: boolean; total: number; current: number }>({
    visible: false,
    total: 0,
    current: 0,
  })
  const [showBookmarklet, setShowBookmarklet] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
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
    if (!resumeText) {
      setError('Upload a resume before processing')
      return
    }

    if (showCsvUpload) {
      if (!urls.length) {
        setError('Upload a CSV before processing')
        return
      }
      const totalJobs = urls.length
      setProgress({ visible: true, total: totalJobs, current: 0 })
      setLoading((state) => ({ ...state, process: true }))
      setError(null)
      const savedUrls = new Set(saved.map((s) => s.job.url))
      const results: JobAnalysis[] = []
      try {
        for (let idx = 0; idx < urls.length; idx++) {
          const url = urls[idx]
          if (savedUrls.has(url)) {
            const currentCompleted = idx + 1
            setProgress({ visible: true, total: totalJobs, current: currentCompleted })
            continue
          }
          const formData = new FormData()
          formData.append('resume_text', resumeText)
          formData.append('url', url)
          formData.append('meta', JSON.stringify(urlMeta[url] || {}))
          const resp = await api<{ job: JobAnalysis }>('/jobs/process_one', {
            method: 'POST',
            body: formData,
          })
          results.push(resp.job)
          const currentCompleted = idx + 1
          setProgress({ visible: true, total: totalJobs, current: currentCompleted })
        }
        setJobs(results)
        setMaterials({})
        updateMessage('Jobs analyzed')
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setProgress({ visible: false, total: 0, current: 0 })
        setLoading((state) => ({ ...state, process: false }))
      }
      return
    }

    const trimmed = singleUrl.trim()
    if (!trimmed) {
      setError('Enter a LinkedIn URL before processing')
      return
    }
    setLoading((state) => ({ ...state, single: true }))
    setError(null)
    try {
      const formData = new FormData()
      formData.append('resume_text', resumeText)
      formData.append('url', trimmed)
      const resp = await api<{ job: JobAnalysis }>('/jobs/process_one', {
        method: 'POST',
        body: formData,
      })
      setJobs((state) => [resp.job, ...state])
      setMaterials({})
      updateMessage('Job analyzed')
      setSingleUrl('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading((state) => ({ ...state, single: false }))
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
      updateMessage(`Saved ${analysis.job.title}`)
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

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      updateMessage('Copied to clipboard')
    } catch (err) {
      setError('Copy failed')
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
              {item.job.applicants && (
                <span className="rounded-full bg-white/5 px-2 py-1">
                  Applicants: {item.job.applicants}
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
                Save and Close
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
      <ProgressOverlay progress={progress} />
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowCsvUpload(true)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  showCsvUpload
                    ? 'bg-indigo-500/80 text-white shadow-md shadow-indigo-900/60'
                    : 'border border-white/15 text-white/80 hover:border-indigo-400/60 hover:text-white'
                }`}
              >
                CSV Upload
              </button>
              <button
                onClick={() => setShowCsvUpload(false)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  !showCsvUpload
                    ? 'bg-indigo-500/80 text-white shadow-md shadow-indigo-900/60'
                    : 'border border-white/15 text-white/80 hover:border-indigo-400/60 hover:text-white'
                }`}
              >
                Single URL
              </button>
            </div>
            {showCsvUpload ? (
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
            ) : (
              <div className="block w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-white transition hover:border-indigo-400/60 hover:bg-white/10">
                <p className="text-sm font-semibold">Single LinkedIn URL</p>
                <p className="text-xs text-white/70 mb-2">Paste a single job URL to process without CSV upload.</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={singleUrl}
                    onChange={(e) => setSingleUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/jobs/view/..."
                    className="flex-1 min-w-[220px] rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/80 focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
                  />
                  <span className="text-xs text-white/60 self-center">Use Process Jobs below</span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={processJobs}
                disabled={loading.process || loading.single}
                className="rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-900/50 transition hover:bg-indigo-500/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading.process || loading.single ? 'Analyzing…' : 'Process Jobs'}
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
              <li>1) Upload your resume. </li>
              <li>2) Upload a CSV containing LinkedIn job URLs OR paste in a single URL.</li>
              <li>3) Click Process Jobs to score fit and see missing skills.</li>
              <li>4) Generate InMail + Cover Letter per role.</li>
              <li>5) Save and export curated roles.</li>
              <li>
                6) Use our <button className="text-indigo-200 underline" onClick={() => {
                  const element = document.getElementById('bookmarklet-section')
                  if (element) element.scrollIntoView({ behavior: 'smooth' })
                }}>bookmarklet</button> below to create the LinkedIn CSV for upload.
              </li>
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
            {[...jobs]
              .sort((a, b) => b.fit_score - a.fit_score)
              .map((job, idx) => renderJobCard(job, idx))}
          </div>
        </section>

        <section id="bookmarklet-section" className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/80 shadow-lg shadow-indigo-900/40 backdrop-blur">
          <h2 className="text-lg font-semibold text-white">LinkedIn Job Extractor Bookmarklet</h2>
          <p className="mt-2 text-xs text-white/70">
            Use this bookmarklet to automatically generate a CSV file containing job postings listed on LinkedIn’s classic job list view. Collect across multiple pages and export when ready.
          </p>
          <p className="mt-2 text-xs text-white/70">
            NOTE: This is intended to work within LinkedIn's Terms of Service.
          </p>
          <div className="mt-3 space-y-2">
            <p className="font-semibold text-white/90">How to Install</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>Show your bookmarks bar (Ctrl+Shift+B on Windows, Cmd+Shift+B on Mac).</li>
              <li>Add a new bookmark named <span className="font-semibold text-white">LinkedIn Job Extractor</span>.</li>
              <li>
                In the URL field, paste the bookmarklet code (see 'Copy bookmarklet code' below).
              </li>
              <li>Save the bookmark.</li>
            </ol>
          </div>
          <div className="mt-4 space-y-2">
            <p className="font-semibold text-white/90">How to Use It</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                Go to a classic LinkedIn job results page (
                <a
                  href="https://www.linkedin.com/jobs/search/?keywords=&location=United%20States&refresh=true"
                  target="_blank"
                  className="text-indigo-200 underline"
                >
                  use this link
                </a>
                ).
              </li>
              <li>Enter your job search filters as you normally would.</li>
              <li>Scroll down until all of the job results on the page are visible.</li>
              <li>Click <span className="font-semibold text-white">LinkedIn Job Extractor</span> from your bookmarks bar.</li>
              <li>The tool collects postings and tells you how many were added.</li>
              <li>Click:
                <ul className="list-disc pl-6">
                  <li><span className="font-semibold text-white">Cancel</span> to keep collecting from more pages by hitting 'Next' at bottom of the page and repeating steps 3 & 4 above.</li>
                  <li><span className="font-semibold text-white">OK</span> to download what's been collected into a CSV file.</li>
                </ul>
              </li>
            </ol>
          </div>
          <div className="mt-4 space-y-1">
            <p className="font-semibold text-white/90">What the CSV Includes</p>
            <ul className="list-disc pl-6">
              <li>Job Title</li>
              <li>Company</li>
              <li>Location</li>
              <li>Workplace Type</li>
              <li>Benefits (salary)</li>
              <li>URL</li>
            </ul>
          </div>
          <div className="mt-4">
            <button
              className="rounded-lg border border-indigo-300/40 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-50 hover:bg-indigo-500/30"
              onClick={() => setShowBookmarklet(true)}
            >
              Copy bookmarklet code
            </button>
          </div>
        </section>

        {showBookmarklet && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-white shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">LinkedIn Job Extractor Code</h3>
                <button
                  className="text-xs text-white/60 hover:text-white"
                  onClick={() => setShowBookmarklet(false)}
                >
                  X
                </button>
              </div>
              <div className="mt-3 h-64 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-white">
                {bookmarkletCode}
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  className="rounded-lg border border-indigo-300/40 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-50 hover:bg-indigo-500/30"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(bookmarkletCode)
                      updateMessage('Bookmarklet code copied')
                    } catch (err) {
                      setError('Copy failed')
                    }
                  }}
                >
                  Copy Code
                </button>
              </div>
            </div>
          </div>
        )}

        <section className="mt-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Saved Applications</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSavedOpen((prev) => !prev)}
                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/80 transition hover:border-indigo-400/60 hover:text-white"
              >
                {savedOpen ? 'Hide' : 'Show'}
              </button>
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
                {loading.exportCsv ? 'Exporting?I' : 'Export CSV'}
              </button>
            </div>
          </div>

          {savedOpen && (
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
                        {record.job.company} ? Fit {record.fit_score}% ? Saved {formatDate(record.timestamp)}
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
          )}
        </section>

      </div>
    </div>
  )
}

export default App

// Progress overlay component
const ProgressOverlay = ({ progress }: { progress: { visible: boolean; total: number; current: number } }) => {
  if (!progress.visible) return null
  const percent = progress.total ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0
  const remaining = Math.max(progress.total - progress.current, 0)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-xl">
        <div className="flex items-center justify-between text-sm text-white/80">
          <span>Processing jobs...</span>
          <span>{percent}%</span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-200"
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-white/70">Remaining: {remaining} of {progress.total}</p>
      </div>
    </div>
  )
}
