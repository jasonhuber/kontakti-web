import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  jobs,
  activity as activityApi,
  today as todayApi,
  type Person,
  type SocialActivity,
  type LogVia,
} from '@/lib/api'
import { deepLinkFor } from '@/lib/contact-links'
import { formatRelativeDate, cn } from '@/lib/utils'
import {
  Briefcase, Loader2, RefreshCw, Sparkles, Check, ChevronDown,
  Mail, Phone, MessageSquare, MessageCircle, Instagram, Facebook,
  Coffee, Users,
} from 'lucide-react'

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

/**
 * Job changes feed — kind='job_change' SocialActivity items across all people.
 * We render directly off the Today inbox (`job_change` items), since the
 * backend already surfaces them there. Falls back gracefully if none.
 */
export function JobChangesSection({ onOpenPerson }: { onOpenPerson?: (p: Person) => void }) {
  const qc = useQueryClient()
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: todayItems, isLoading } = useQuery({
    queryKey: ['today'],
    queryFn: () => todayApi.list(50),
    staleTime: 60_000,
  })

  const jobChanges = (todayItems?.items ?? []).filter(i => i.kind === 'job_change')

  const detectMut = useMutation({
    mutationFn: () => jobs.detectChanges(),
    onSuccess: (r) => {
      setErrorMsg(null)
      setStatusMsg(
        r.detected > 0
          ? `Detected ${r.detected} job change${r.detected === 1 ? '' : 's'}.`
          : 'No new job changes found.'
      )
      qc.invalidateQueries({ queryKey: ['today'] })
      setTimeout(() => setStatusMsg(null), 3000)
    },
    onError: (e) => setErrorMsg(e instanceof Error ? e.message : 'Detection failed'),
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-semibold text-zinc-900">Job changes</h2>
          {jobChanges.length > 0 && (
            <span className="text-xs font-medium bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5">
              {jobChanges.length}
            </span>
          )}
        </div>
        <button
          onClick={() => detectMut.mutate()}
          disabled={detectMut.isPending}
          className="flex items-center gap-1.5 text-xs border border-zinc-200 hover:bg-zinc-50 disabled:opacity-60 text-zinc-700 font-medium px-2.5 py-1.5 rounded-md transition-colors"
        >
          {detectMut.isPending
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />}
          {detectMut.isPending ? 'Detecting…' : 'Run detection'}
        </button>
      </div>

      {statusMsg && (
        <div className="mb-3 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-2.5 py-1.5">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2.5 py-1.5">
          {errorMsg}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
        </div>
      )}

      {!isLoading && jobChanges.length === 0 && (
        <div className="text-xs text-zinc-400 italic py-3">
          No detected job changes yet. Hit "Run detection" to scan.
        </div>
      )}

      <div className="space-y-2">
        {jobChanges.map(jc => (
          <JobChangeRow
            key={jc.id}
            person={jc.person}
            reason={jc.reason}
            suggested={jc.suggested_message}
            itemKey={jc.id}
            signalId={jc.signal && typeof jc.signal === 'object' && 'id' in jc.signal
              ? String((jc.signal as { id?: unknown }).id ?? '') : undefined}
            onOpenPerson={() => onOpenPerson?.(jc.person)}
          />
        ))}
      </div>
    </section>
  )
}

function JobChangeRow({
  person, reason, suggested, itemKey, signalId, onOpenPerson,
}: {
  person: Person
  reason: string
  suggested?: string
  itemKey: string
  signalId?: string
  onOpenPerson: () => void
}) {
  const qc = useQueryClient()
  const [draftOpen, setDraftOpen] = useState(false)
  const [draft, setDraft] = useState(suggested ?? '')
  const [viaOpen, setViaOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const draftMut = useMutation({
    mutationFn: () => todayApi.draft(itemKey),
    onSuccess: r => { setDraft(r.draft); setDraftOpen(true); setError(null) },
    onError: e => setError(e instanceof Error ? e.message : 'Draft failed'),
  })

  const logMut = useMutation({
    mutationFn: (via: LogVia) => todayApi.log(itemKey, via),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['person', person.id] })
    },
  })

  const ackMut = useMutation({
    mutationFn: () => signalId ? activityApi.acknowledge(signalId) : Promise.resolve(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['today'] }),
  })

  function handleSendVia(via: LogVia) {
    setViaOpen(false)
    setError(null)
    const subject = `Congrats on the new role, ${person.first_name}!`
    const { url, unavailableReason } = deepLinkFor(via, person, draft || suggested || '', subject)
    if (unavailableReason) { setError(unavailableReason); return }
    if (url) window.open(url, '_blank', 'noopener')
    logMut.mutate(via, {
      onSuccess: () => {
        setDone(`Logged via ${via.replace('_', ' ')}`)
        setTimeout(() => setDone(null), 2500)
      },
    })
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
          <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <button onClick={onOpenPerson} className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-zinc-900 truncate">{person.full_name}</div>
          <p className="text-xs text-zinc-600 mt-0.5">{reason}</p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              if (draft) setDraftOpen(v => !v)
              else if (suggested) { setDraft(suggested); setDraftOpen(true) }
              else draftMut.mutate()
            }}
            disabled={draftMut.isPending}
            className="text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded-md inline-flex items-center gap-1"
            title="Congratulate"
          >
            {draftMut.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <Sparkles className="w-3 h-3" />}
            Congratulate
          </button>
          <button
            onClick={() => ackMut.mutate()}
            disabled={ackMut.isPending}
            className="text-[11px] text-zinc-500 hover:text-zinc-700 px-1.5 py-1 rounded-md inline-flex items-center gap-1"
            title="Acknowledge"
          >
            <Check className="w-3 h-3" />
          </button>
        </div>
      </div>

      {draftOpen && (
        <div className="mt-2 space-y-1.5">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            placeholder="Write a quick note…"
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <button
                onClick={() => setViaOpen(v => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-md transition-colors"
              >
                Send via
                <ChevronDown className="w-3 h-3" />
              </button>
              {viaOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setViaOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-zinc-200 rounded-lg shadow-lg overflow-hidden min-w-[160px]">
                    {VIA_OPTIONS.map(opt => {
                      const Icon = opt.icon
                      return (
                        <button
                          key={opt.value}
                          onClick={() => handleSendVia(opt.value)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
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
            {done && <span className="text-xs text-emerald-700">{done}</span>}
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Standalone activity card list (no Today scaffold) — used by detail modals
 * that want to render just a list of recent job changes for one person.
 */
export function PersonJobChanges({ items }: { items: SocialActivity[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1.5">
      {items.map(a => (
        <div key={a.id} className={cn(
          'text-xs flex items-center gap-2 px-2 py-1.5 rounded-md',
          a.acknowledged_at ? 'text-zinc-400' : 'bg-emerald-50/60 text-emerald-800',
        )}>
          <Briefcase className="w-3 h-3 shrink-0" />
          <span className="flex-1 truncate">{a.content || 'Job change'}</span>
          <span className="text-[10px] opacity-70">{formatRelativeDate(a.occurred_at)}</span>
        </div>
      ))}
    </div>
  )
}
