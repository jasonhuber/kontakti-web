import { useState, useCallback } from 'react'
import { contacts, type ImportContact } from '@/lib/api'
import { Users, Mail, CheckCircle, ArrowRight, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Google Identity Services types ──────────────────────────────────────────

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (r: { access_token?: string; error?: string }) => void
            error_callback?: (e: { type: string; message: string }) => void
          }): { requestAccessToken(): void }
        }
      }
    }
  }
}

// ── Google People API helpers ────────────────────────────────────────────────

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi"]')
    if (existing) { existing.addEventListener('load', () => resolve()); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(s)
  })
}

function getGoogleToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/contacts.readonly',
      callback: (r) => {
        if (r.error) { reject(new Error(r.error)); return }
        if (r.access_token) { resolve(r.access_token) }
        else { reject(new Error('No access token received')) }
      },
      error_callback: (e) => reject(new Error(e.message || 'OAuth error')),
    })
    client.requestAccessToken()
  })
}

interface GPerson {
  names?: { givenName?: string; familyName?: string; metadata?: { primary?: boolean } }[]
  emailAddresses?: { value: string; metadata?: { primary?: boolean } }[]
  organizations?: { name?: string }[]
  phoneNumbers?: { value: string; metadata?: { primary?: boolean } }[]
}

async function fetchGoogleContacts(accessToken: string): Promise<ImportContact[]> {
  const url = new URL('https://people.googleapis.com/v1/people/me/connections')
  url.searchParams.set('personFields', 'names,emailAddresses,organizations,phoneNumbers')
  url.searchParams.set('pageSize', '1000')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Google Contacts')

  const data: { connections?: GPerson[] } = await res.json()
  return (data.connections ?? []).flatMap((p): ImportContact[] => {
    const name = p.names?.find(n => n.metadata?.primary) ?? p.names?.[0]
    const firstName = name?.givenName ?? ''
    const lastName  = name?.familyName ?? ''
    if (!firstName && !lastName) return []

    const email = (p.emailAddresses?.find(e => e.metadata?.primary) ?? p.emailAddresses?.[0])?.value
    const phone = (p.phoneNumbers?.find(ph => ph.metadata?.primary) ?? p.phoneNumbers?.[0])?.value
    const company = p.organizations?.[0]?.name

    return [{ first_name: firstName, last_name: lastName, email, phone, company_name: company, source: 'google' }]
  })
}

// ── Step types ───────────────────────────────────────────────────────────────

type Step = 'welcome' | 'google' | 'done'
type GooglePhase = 'idle' | 'connecting' | 'fetching' | 'preview' | 'importing' | 'imported' | 'error'

// ── Main component ───────────────────────────────────────────────────────────

export function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const [step, setStep]       = useState<Step>('welcome')
  const [phase, setPhase]     = useState<GooglePhase>('idle')
  const [candidates, setCandidates] = useState<ImportContact[]>([])
  const [imported, setImported]     = useState(0)
  const [duplicatesDetected, setDuplicatesDetected] = useState(0)
  const [error, setError]     = useState<string | null>(null)

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  const connectGoogle = useCallback(async () => {
    if (!clientId) { setError('Google Client ID not configured (VITE_GOOGLE_CLIENT_ID).'); return }
    setError(null)
    setPhase('connecting')
    try {
      await loadGIS()
      setPhase('fetching')
      const token = await getGoogleToken(clientId)
      const found = await fetchGoogleContacts(token)
      setCandidates(found)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
      setPhase('error')
    }
  }, [clientId])

  const importContacts = useCallback(async () => {
    if (!candidates.length) return
    setPhase('importing')
    setError(null)
    try {
      const result = await contacts.import(candidates)
      setImported(result.imported)
      setDuplicatesDetected(result.duplicates_detected ?? 0)
      setPhase('imported')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setPhase('preview')
    }
  }, [candidates])

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {step === 'welcome' && (
          <WelcomeStep
            onStart={() => setStep('google')}
            onSkip={onComplete}
          />
        )}
        {step === 'google' && (
          <GoogleStep
            phase={phase}
            candidates={candidates}
            error={error}
            imported={imported}
            duplicatesDetected={duplicatesDetected}
            hasClientId={!!clientId}
            onConnect={connectGoogle}
            onImport={importContacts}
            onSkip={() => setStep('done')}
            onNext={() => setStep('done')}
          />
        )}
        {step === 'done' && (
          <DoneStep
            imported={imported}
            duplicatesDetected={duplicatesDetected}
            onFinish={onComplete}
          />
        )}
      </div>
    </div>
  )
}

// ── Welcome step ─────────────────────────────────────────────────────────────

function WelcomeStep({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div className="flex flex-col items-center gap-5">
        <div className="w-20 h-20 rounded-3xl bg-indigo-600 flex items-center justify-center">
          <span className="text-white text-4xl font-bold">K</span>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900">Welcome to Kontakti</h1>
          <p className="text-zinc-500 text-sm leading-relaxed">
            Let's seed your network with real contacts<br />
            so you're not starting from a blank page.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={onStart}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          Get started <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={onSkip}
          className="w-full text-zinc-400 hover:text-zinc-600 text-sm py-2 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}

// ── Google step ──────────────────────────────────────────────────────────────

function GoogleStep({
  phase, candidates, error, imported, duplicatesDetected, hasClientId,
  onConnect, onImport, onSkip, onNext,
}: {
  phase: GooglePhase
  candidates: ImportContact[]
  error: string | null
  imported: number
  duplicatesDetected: number
  hasClientId: boolean
  onConnect: () => void
  onImport: () => void
  onSkip: () => void
  onNext: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
          <Mail className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Import from Google</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Pull in Google Contacts and frequent Gmail senders.
          </p>
        </div>
      </div>

      {/* Status area */}
      <div className="min-h-[160px] flex items-center justify-center">
        {phase === 'idle' || phase === 'error' ? (
          <div className="text-center space-y-3 w-full">
            {!hasClientId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> to enable Google import.
              </p>
            )}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : phase === 'connecting' || phase === 'fetching' ? (
          <div className="text-center space-y-2">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
            <p className="text-sm text-zinc-400">
              {phase === 'connecting' ? 'Connecting to Google…' : 'Fetching contacts…'}
            </p>
          </div>
        ) : phase === 'preview' ? (
          <div className="w-full space-y-3">
            <p className="text-sm font-medium text-zinc-700">
              {candidates.length} contacts found
            </p>
            {error && (
              <p className="text-xs text-red-600">{error}</p>
            )}
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
              {candidates.slice(0, 4).map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    i < Math.min(candidates.length, 4) - 1 && 'border-b border-zinc-100'
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-semibold text-zinc-500 shrink-0">
                    {((c.first_name[0] ?? '') + (c.last_name[0] ?? '')).toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                    </p>
                    {c.email && (
                      <p className="text-xs text-zinc-400 truncate">{c.email}</p>
                    )}
                  </div>
                </div>
              ))}
              {candidates.length > 4 && (
                <div className="px-4 py-2 text-xs text-zinc-400 text-center border-t border-zinc-100">
                  + {candidates.length - 4} more
                </div>
              )}
            </div>
          </div>
        ) : phase === 'importing' ? (
          <div className="text-center space-y-2">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
            <p className="text-sm text-zinc-400">Importing contacts…</p>
          </div>
        ) : phase === 'imported' ? (
          <div className="text-center space-y-2 w-full">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-base font-semibold text-zinc-800">{imported} contacts imported</p>
            {duplicatesDetected > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
                We found {duplicatesDetected} potential duplicate{duplicatesDetected === 1 ? '' : 's'} —
                review them after onboarding.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {(phase === 'idle' || phase === 'error') && (
          <button
            onClick={onConnect}
            disabled={!hasClientId}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Connect Google Contacts
          </button>
        )}
        {phase === 'preview' && (
          <button
            onClick={onImport}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors"
          >
            Import {candidates.length} contacts
          </button>
        )}
        {phase === 'imported' && (
          <button
            onClick={onNext}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        )}
        {phase !== 'imported' && phase !== 'importing' && phase !== 'connecting' && phase !== 'fetching' && (
          <button
            onClick={onSkip}
            className="w-full text-zinc-400 hover:text-zinc-600 text-sm py-2 transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}

// ── Done step ────────────────────────────────────────────────────────────────

function DoneStep({
  imported, duplicatesDetected, onFinish,
}: { imported: number; duplicatesDetected: number; onFinish: () => void }) {
  return (
    <div className="text-center space-y-8">
      <div className="flex flex-col items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-zinc-900">You're all set!</h1>
          <p className="text-zinc-500 text-sm leading-relaxed">
            {imported > 0
              ? `${imported} contacts imported and ready to manage.`
              : 'You can import contacts anytime from the People section.'}
          </p>
        </div>
        {imported > 0 && (
          <div className="w-full flex items-center gap-3 bg-white border border-zinc-200 rounded-xl px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-red-500" />
            </div>
            <span className="text-sm text-zinc-700">Google contacts</span>
            <span className="ml-auto text-sm font-semibold text-indigo-600">{imported}</span>
          </div>
        )}
        {duplicatesDetected > 0 && (
          <div className="w-full text-left text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            We found {duplicatesDetected} potential duplicate{duplicatesDetected === 1 ? '' : 's'} in your imported contacts.
            Open <span className="font-medium">Duplicates</span> after onboarding to review them.
          </div>
        )}
      </div>

      <button
        onClick={onFinish}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        Open Kontakti <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}
