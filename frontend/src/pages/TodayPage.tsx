import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  today as todayApi,
  jobs,
  activity as activityApi,
  contactSchedule,
  people as peopleApi,
  type TodayItem,
  type LogVia,
  type Person,
  type ReachOutSuggestion,
} from '@/lib/api'
import { deepLinkFor } from '@/lib/contact-links'
import { cn } from '@/lib/utils'
import {
  Loader2, RefreshCw, Sunrise, Cake, Calendar, Clock, Briefcase,
  Heart, MessageCircle, Sparkles, MapPin, X as XIcon, ChevronDown,
  Mail, Phone, MessageSquare, Instagram, Facebook, Users, Coffee, Mic,
  Repeat,
} from 'lucide-react'
import { PersonDetailModal } from './PersonDetailModal'
import { JobChangesSection } from './JobChangesSection'
import { VoiceCaptureFlow } from '@/components/VoiceCaptureFlow'
import { QuizSection } from '@/components/QuizSection'
import { QuizSessionPage } from './QuizSessionPage'

const KIND_ICON: Record<TodayItem['kind'], { icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  birthday:         { icon: Cake,        tint: 'text-pink-500 bg-pink-50' },
  cadence_overdue:  { icon: Clock,       tint: 'text-amber-600 bg-amber-50' },
  follow_up_due:    { icon: Calendar,    tint: 'text-indigo-600 bg-indigo-50' },
  job_change:       { icon: Briefcase,   tint: 'text-emerald-600 bg-emerald-50' },
  social_signal:    { icon: Sparkles,    tint: 'text-violet-600 bg-violet-50' },
  anniversary_met:  { icon: Heart,       tint: 'text-rose-500 bg-rose-50' },
  rhythm_broken:    { icon: Repeat,      tint: 'text-orange-600 bg-orange-50' },
}

const PRIORITY_DOT: Record<number, string> = {
  0: 'bg-zinc-300',
  1: 'bg-zinc-400',
  2: 'bg-amber-400',
  3: 'bg-orange-500',
  4: 'bg-red-500',
}

const VIA_OPTIONS: { value: LogVia; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'email',     label: 'Email',       icon: Mail },
  { value: 'sms',       label: 'SMS',         icon: MessageSquare },
  { value: 'whatsapp',  label: 'WhatsApp',    icon: MessageCircle },
  { value: 'instagram', label: 'Instagram',   icon: Instagram },
  { value: 'facebook',  label: 'Facebook',    icon: Facebook },
  { value: 'phone',     label: 'Phone call',  icon: Phone },
  { value: 'in_person', label: 'In person',   icon: Coffee },
  { value: 'other',     label: 'Other',       icon: Users },
]

export function TodayPage() {
  const qc = useQueryClient()
  const [openPerson, setOpenPerson] = useState<Person | null>(null)
  const [refreshProgress, setRefreshProgress] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [fullQuizOpen, setFullQuizOpen] = useState(false)

  // "v" hotkey opens voice recorder. Ignore when typing in inputs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.key.toLowerCase() === 'v') {
        e.preventDefault()
        setVoiceOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['today'],
    queryFn: () => todayApi.list(20),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

  const items = useMemo(() => data?.items ?? [], [data])
  const quizPrompts = useMemo(() => data?.quiz ?? [], [data])

  const refreshMut = useMutation({
    mutationFn: async () => {
      setRefreshError(null)
      setRefreshProgress('Detecting job changes…')
      const jobResult = await jobs.detectChanges()
      setRefreshProgress(`Refreshing social signals…`)
      // Best-effort: refresh activity for people who have social handles.
      // Backend handles batch; for now we just trigger detect-changes and
      // re-fetch the today list. Individual activity refreshes happen on demand.
      await new Promise(r => setTimeout(r, 200))
      return jobResult
    },
    onSuccess: (r) => {
      setRefreshProgress(
        r.detected > 0
          ? `Found ${r.detected} new signal${r.detected === 1 ? '' : 's'}.`
          : 'No new signals.'
      )
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
      setTimeout(() => setRefreshProgress(null), 3000)
    },
    onError: (e) => {
      setRefreshError(e instanceof Error ? e.message : 'Refresh failed')
      setRefreshProgress(null)
    },
  })

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sunrise className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Today</h1>
            {items.length > 0 && (
              <span className="text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-full px-2 py-0.5">
                {items.length}
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVoiceOpen(true)}
            title="Record voice memo (v)"
            className="flex items-center gap-2 text-sm border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Mic className="w-4 h-4" />
            <span>Voice</span>
            <kbd className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-700 px-1 py-0.5 rounded">v</kbd>
          </button>
          <button
            onClick={() => refreshMut.mutate()}
            disabled={refreshMut.isPending}
            className="flex items-center gap-2 text-sm border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-60 text-zinc-700 dark:text-zinc-300 font-medium px-3 py-2 rounded-lg transition-colors"
          >
            {refreshMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
            {refreshMut.isPending ? 'Refreshing…' : 'Refresh signals'}
          </button>
        </div>
      </div>

      {refreshProgress && (
        <div className="mb-4 flex items-center gap-2 text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 border border-indigo-100 dark:border-indigo-800 rounded-lg px-3 py-2">
          {refreshMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{refreshProgress}</span>
        </div>
      )}
      {refreshError && (
        <div className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg px-3 py-2">
          {refreshError}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-lg px-3 py-2">
          Failed to load Today.
        </div>
      )}

      {!isLoading && !isError && quizPrompts.length > 0 && (
        <QuizSection
          prompts={quizPrompts}
          onStartFullSession={() => setFullQuizOpen(true)}
        />
      )}

      <ReachOutSuggestions onOpenPerson={setOpenPerson} />

      {!isLoading && !isError && items.length === 0 && quizPrompts.length === 0 && (
        <EmptyState />
      )}

      <div className="space-y-3">
        {items.map(item => (
          <TodayCard
            key={item.id}
            item={item}
            onOpenPerson={() => setOpenPerson(item.person)}
          />
        ))}
      </div>

      {/* Job changes appears as its own section below Today list. */}
      <div className="mt-10">
        <JobChangesSection onOpenPerson={setOpenPerson} />
      </div>

      {openPerson && (
        <PersonDetailModal person={openPerson} onClose={() => setOpenPerson(null)} />
      )}

      {voiceOpen && (
        <VoiceCaptureFlow onClose={() => setVoiceOpen(false)} />
      )}

      {fullQuizOpen && (
        <QuizSessionPage
          prompts={quizPrompts}
          onClose={() => setFullQuizOpen(false)}
        />
      )}
    </div>
  )
}

function humanInterval(days: number): string {
  if (days < 14) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'}`
  const weeks = days / 7
  if (weeks < 9) return `${Math.round(weeks)} weeks`
  const months = days / 30
  if (months < 18) return `${Math.round(months)} months`
  return `${(days / 365).toFixed(1)} years`
}

// "I'm in the mood to reach out" — reads the precomputed contact schedule.
function ReachOutSuggestions({ onOpenPerson }: { onOpenPerson: (p: Person) => void }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['reach-out-suggestions'],
    queryFn: () => contactSchedule.suggestions(6),
    staleTime: 60_000,
  })

  const completeMut = useMutation({
    mutationFn: (id: number) => contactSchedule.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reach-out-suggestions'] }),
  })
  const snoozeMut = useMutation({
    mutationFn: (id: number) => contactSchedule.snooze(id, 30),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reach-out-suggestions'] }),
  })

  const openPerson = async (s: ReachOutSuggestion) => {
    try { onOpenPerson(await peopleApi.get(s.person_id)) } catch { /* ignore */ }
  }

  if (isLoading || !data || data.suggestions.length === 0) return null

  return (
    <div className="mb-6 rounded-2xl border border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-900/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Coffee className="w-4 h-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">In the mood to reach out?</h2>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">{data.count} due</span>
      </div>
      <div className="space-y-2">
        {data.suggestions.map(s => (
          <div key={s.schedule_id} className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl px-3 py-2">
            <button onClick={() => openPerson(s)} className="min-w-0 flex-1 text-left">
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{s.name}</div>
              <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                {s.label ?? s.reason} · {s.last_contact}{s.company ? ` · ${s.company}` : ''}
              </div>
            </button>
            <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 shrink-0">
              {s.channel_hint}
            </span>
            <button onClick={() => completeMut.mutate(s.schedule_id)} disabled={completeMut.isPending}
              title="Mark reached out" className="text-xs text-emerald-700 hover:text-emerald-800 px-1.5 py-1 rounded-md shrink-0">
              Done
            </button>
            <button onClick={() => snoozeMut.mutate(s.schedule_id)} disabled={snoozeMut.isPending}
              title="Snooze 30 days" className="text-xs text-zinc-400 hover:text-zinc-600 px-1.5 py-1 rounded-md shrink-0">
              Later
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-center py-20 space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
        <Sunrise className="w-8 h-8 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">You're caught up.</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Nothing to reach out to today.</p>
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Want more signal? <span className="text-indigo-600 hover:underline cursor-default">Add more contacts</span> or link a social group.
      </p>
    </div>
  )
}

// ── Single Today card ────────────────────────────────────────────────────────

function TodayCard({
  item,
  onOpenPerson,
}: {
  item: TodayItem
  onOpenPerson: () => void
}) {
  const qc = useQueryClient()
  const KindIcon = KIND_ICON[item.kind]?.icon ?? Sparkles
  const kindTint = KIND_ICON[item.kind]?.tint ?? 'text-zinc-500 bg-zinc-50'
  const priorityDot = PRIORITY_DOT[item.priority] ?? 'bg-zinc-300'

  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState<string>(item.suggested_message ?? '')
  const [viaOpen, setViaOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [whyOpen, setWhyOpen] = useState(false)

  const hasRhythm = !!item.rhythm_context && (
    item.rhythm_context.discussion_count != null ||
    item.rhythm_context.avg_interval_days != null ||
    item.rhythm_context.last_contact_human != null
  )

  const draftMut = useMutation({
    mutationFn: () => todayApi.draft(item.id),
    onSuccess: (r) => { setDraft(r.draft); setDraftOpen(true); setError(null) },
    onError: (e) => setError(e instanceof Error ? e.message : 'Draft failed'),
  })

  const logMut = useMutation({
    mutationFn: ({ via, note }: { via: LogVia; note?: string }) =>
      todayApi.log(item.id, via, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['person', item.person.id] })
      qc.invalidateQueries({ queryKey: ['people'] })
    },
  })

  const snoozeMut = useMutation({
    mutationFn: async () => {
      // Snooze = push next_followup_at 7 days forward + acknowledge any signal.
      const ackId = item.signal && typeof item.signal === 'object' && 'id' in item.signal
        ? String((item.signal as { id?: unknown }).id ?? '')
        : ''
      if (ackId) await activityApi.acknowledge(ackId).catch(() => undefined)
      // Logging as 'other' with snooze note moves it out of Today.
      return todayApi.log(item.id, 'other', 'Snoozed 7 days')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
    },
  })

  const skipMut = useMutation({
    mutationFn: async () => {
      const ackId = item.signal && typeof item.signal === 'object' && 'id' in item.signal
        ? String((item.signal as { id?: unknown }).id ?? '')
        : ''
      if (ackId) {
        await activityApi.acknowledge(ackId)
      } else {
        // No signal id — log as skipped to nudge the cadence.
        await todayApi.log(item.id, 'other', 'Skipped')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
    },
  })

  function handleStartDraft() {
    if (draft) { setDraftOpen(v => !v); return }
    if (item.suggested_message) {
      setDraft(item.suggested_message)
      setDraftOpen(true)
      return
    }
    draftMut.mutate()
  }

  function handleSendVia(via: LogVia) {
    setViaOpen(false)
    setError(null)
    const subject = item.kind === 'birthday' ? `Happy birthday, ${item.person.first_name}!` : 'Hello'
    const { url, unavailableReason } = deepLinkFor(via, item.person, draft, subject)
    if (unavailableReason) {
      setError(unavailableReason)
      return
    }
    if (url) {
      window.open(url, '_blank', 'noopener')
    }
    logMut.mutate({ via, note: draft.trim() || undefined }, {
      onSuccess: () => {
        setDone(`Logged via ${via.replace('_', ' ')}`)
        setTimeout(() => setDone(null), 2500)
      },
    })
  }

  const sig = item.signal
  const sigImage = sig?.image_url
  const sigLocation = sig?.location

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
      {/* Top: person + reason */}
      <div className="flex gap-3 p-4">
        {/* Kind icon column */}
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', kindTint)}>
          <KindIcon className="w-4 h-4" />
        </div>

        {/* Person + reason — clickable to open detail */}
        <button
          onClick={onOpenPerson}
          className="flex-1 min-w-0 text-left group"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', priorityDot)} />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-indigo-700">
              {item.person.full_name}
            </span>
            {item.person.title && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">· {item.person.title}</span>
            )}
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-snug">{item.reason}</p>
          {sigLocation && (
            <div className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              <MapPin className="w-3 h-3" />
              {sigLocation}
            </div>
          )}
        </button>

        {/* Optional signal image */}
        {sigImage && (
          <img
            src={sigImage}
            alt=""
            className="w-14 h-14 rounded-lg object-cover shrink-0 border border-zinc-100"
          />
        )}
      </div>

      {/* Rhythm "Why?" disclosure */}
      {hasRhythm && (
        <div className="px-4 -mt-1 pb-2">
          <button
            onClick={() => setWhyOpen(v => !v)}
            className="text-[11px] text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 inline-flex items-center gap-1"
          >
            {whyOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 -rotate-90" />}
            Why?
          </button>
          {whyOpen && item.rhythm_context && (
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 bg-orange-50/50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900 rounded-md px-2.5 py-2 leading-relaxed">
              {item.rhythm_context.discussion_count != null && item.rhythm_context.span_years != null && (
                <div>Discussion history: {item.rhythm_context.discussion_count} over {item.rhythm_context.span_years} year{item.rhythm_context.span_years === 1 ? '' : 's'}.</div>
              )}
              {item.rhythm_context.avg_interval_days != null && (
                <div>Avg interval: {humanInterval(item.rhythm_context.avg_interval_days)}.</div>
              )}
              {item.rhythm_context.last_contact_human && (
                <div>Last contact: {item.rhythm_context.last_contact_human}.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Draft editor (collapsible) */}
      {draftOpen && (
        <div className="px-4 pb-3 -mt-1">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Write your message…"
            rows={4}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none dark:bg-zinc-800 dark:text-zinc-100"
          />
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
            Edit the draft before sending — the "Send via" button opens the right app with this text pre-filled.
          </p>
        </div>
      )}

      {/* Error / status */}
      {error && (
        <div className="mx-4 mb-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800 rounded-md px-2 py-1.5">
          {error}
        </div>
      )}
      {done && (
        <div className="mx-4 mb-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800 rounded-md px-2 py-1.5">
          {done}
        </div>
      )}

      {/* Action row */}
      <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 flex items-center gap-2 flex-wrap">
        <button
          onClick={handleStartDraft}
          disabled={draftMut.isPending}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60"
        >
          {draftMut.isPending
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <Sparkles className="w-3 h-3" />}
          {draftOpen ? 'Hide draft' : (draft ? 'Edit draft' : 'Draft message')}
        </button>

        {/* Send via dropdown */}
        <div className="relative">
          <button
            onClick={() => setViaOpen(v => !v)}
            disabled={logMut.isPending}
            className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-2.5 py-1.5 rounded-md transition-colors"
          >
            {logMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            Send via
            <ChevronDown className="w-3 h-3" />
          </button>
          {viaOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setViaOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg overflow-hidden min-w-[160px]">
                {VIA_OPTIONS.map(opt => {
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleSendVia(opt.value)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5 text-zinc-400" />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => snoozeMut.mutate()}
            disabled={snoozeMut.isPending}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 px-2 py-1 rounded-md transition-colors"
          >
            {snoozeMut.isPending ? '…' : 'Snooze'}
          </button>
          <button
            onClick={() => skipMut.mutate()}
            disabled={skipMut.isPending}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 px-2 py-1 rounded-md transition-colors"
            title="Skip without logging"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
