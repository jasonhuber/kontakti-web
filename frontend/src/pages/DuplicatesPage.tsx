import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  duplicates,
  type DuplicateCandidate,
  type DuplicateAiMerged,
  type Person,
} from '@/lib/api'
import { Loader2, Sparkles, AlertCircle, CheckCircle2, Instagram, Facebook } from 'lucide-react'
import { cn } from '@/lib/utils'

type MergedField = keyof DuplicateAiMerged

const FIELDS: { key: MergedField; label: string; from: (p: Person) => string }[] = [
  { key: 'first_name',   label: 'First name',   from: p => p.first_name ?? '' },
  { key: 'last_name',    label: 'Last name',    from: p => p.last_name ?? '' },
  { key: 'email',        label: 'Email',        from: p => p.email ?? '' },
  { key: 'phone',        label: 'Phone',        from: p => p.phone ?? '' },
  { key: 'company_name', label: 'Company',      from: p => p.company?.name ?? '' },
]

export function DuplicatesPage() {
  const qc = useQueryClient()
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [mergeMessage, setMergeMessage] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [page, setPage] = useState(1)
  const [allCandidates, setAllCandidates] = useState<DuplicateCandidate[]>([])

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['duplicates', 'pending', page],
    queryFn: () => duplicates.list('pending', page, 50),
  })

  // Accumulate pages
  useEffect(() => {
    if (!data) return
    if (page === 1) {
      setAllCandidates(data.data)
    } else {
      setAllCandidates(prev => [...prev, ...data.data])
    }
  }, [data, page])

  const visible = useMemo(
    () => allCandidates.filter(d => !skipped.has(d.id)),
    [allCandidates, skipped],
  )

  const hasMore = data ? data.current_page < data.last_page : false

  const scanMut = useMutation({
    mutationFn: () => duplicates.scan(),
    onSuccess: (r) => {
      setScanError(null)
      setScanMessage(
        r.generated > 0
          ? `Found ${r.generated} potential duplicate${r.generated === 1 ? '' : 's'}` +
            (r.ai_resolved > 0 ? ` (${r.ai_resolved} auto-resolved by AI)` : '')
          : 'No new duplicates found.',
      )
      setPage(1)
      setAllCandidates([])
      qc.invalidateQueries({ queryKey: ['duplicates'] })
      qc.invalidateQueries({ queryKey: ['people'] })
    },
    onError: (e: unknown) => {
      setScanMessage(null)
      setScanError(e instanceof Error ? e.message : 'Scan failed')
    },
  })

  const mergeIdenticalMut = useMutation({
    mutationFn: () => duplicates.mergeIdentical(),
    onSuccess: (r) => {
      setMergeMessage(
        r.merged > 0
          ? `Auto-merged ${r.merged} identical duplicate group${r.merged === 1 ? '' : 's'}.`
          : 'No identical duplicates found to merge.',
      )
      setPage(1)
      setAllCandidates([])
      qc.invalidateQueries({ queryKey: ['duplicates'] })
      qc.invalidateQueries({ queryKey: ['people'] })
    },
  })

  const totalPending = data?.total ?? 0

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Duplicate review</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {totalPending > 0
              ? `${totalPending} pending review`
              : 'AI-assisted merging of contact duplicates'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => mergeIdenticalMut.mutate()}
            disabled={mergeIdenticalMut.isPending || scanMut.isPending}
            title="Auto-merge contacts with the same name and phone number"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            {mergeIdenticalMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <CheckCircle2 className="w-4 h-4" />}
            {mergeIdenticalMut.isPending ? 'Merging…' : 'Merge identical'}
          </button>
          <button
            onClick={() => scanMut.mutate()}
            disabled={scanMut.isPending || mergeIdenticalMut.isPending}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            {scanMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Sparkles className="w-4 h-4" />}
            {scanMut.isPending ? 'Scanning…' : 'Find duplicates'}
          </button>
        </div>
      </div>

      {mergeMessage && (
        <div className="mb-4 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{mergeMessage}</span>
        </div>
      )}
      {scanMessage && (
        <div className="mb-4 flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{scanMessage}</span>
        </div>
      )}
      {scanError && (
        <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{scanError}</span>
        </div>
      )}

      {isLoading && allCandidates.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}

      {isError && allCandidates.length === 0 && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Failed to load duplicates.
        </div>
      )}

      {!isLoading && !isError && visible.length === 0 && allCandidates.length === 0 && (
        <EmptyState onScan={() => scanMut.mutate()} scanning={scanMut.isPending} />
      )}

      <div className="space-y-4">
        {visible.map(c => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onSkip={() => setSkipped(s => new Set(s).add(c.id))}
            onAction={() => {
              // Remove from local list immediately; next invalidation will sync
              setAllCandidates(prev => prev.filter(x => x.id !== c.id))
              qc.invalidateQueries({ queryKey: ['duplicates'] })
            }}
          />
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={isFetching}
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 border border-zinc-200 hover:border-zinc-300 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {isFetching ? 'Loading…' : `Load more (${totalPending - allCandidates.length} remaining)`}
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  return (
    <div className="text-center py-20 space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">No duplicates to review.</h2>
        <p className="text-sm text-zinc-500 mt-1">You're all caught up.</p>
      </div>
      <button
        onClick={onScan}
        disabled={scanning}
        className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
      >
        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Run a scan
      </button>
    </div>
  )
}

function CandidateCard({
  candidate,
  onSkip,
  onAction,
}: {
  candidate: DuplicateCandidate
  onSkip: () => void
  onAction: () => void
}) {
  const qc = useQueryClient()
  const people = candidate.people
  const ai = candidate.ai_decision

  const [primaryId, setPrimaryId] = useState<string>(
    ai?.primary_id ?? people[0]?.id ?? '',
  )

  // Per-field selection: which person's value to use, or 'ai' for AI suggestion.
  type FieldChoice = string | 'ai'
  const initialChoices: Record<MergedField, FieldChoice> = useMemo(() => {
    const c: Record<MergedField, FieldChoice> = {
      first_name: 'ai', last_name: 'ai', email: 'ai', phone: 'ai', company_name: 'ai',
    }
    return c
  }, [])
  const [choices, setChoices] = useState<Record<MergedField, FieldChoice>>(initialChoices)

  const rawAiMerged: DuplicateAiMerged = ai?.merged ?? {
    first_name: '', last_name: '', email: '', phone: '', company_name: '',
  }

  // When the AI didn't populate a field (or it's empty), fall back to the
  // primary person's actual value so "Merged result" is never blank.
  const primaryPerson = people.find(p => p.id === primaryId) ?? people[0]
  const aiMerged: DuplicateAiMerged = {
    first_name:   rawAiMerged.first_name   || primaryPerson?.first_name   || '',
    last_name:    rawAiMerged.last_name    || primaryPerson?.last_name    || '',
    email:        rawAiMerged.email        || primaryPerson?.email        || '',
    phone:        rawAiMerged.phone        || primaryPerson?.phone        || '',
    company_name: rawAiMerged.company_name || primaryPerson?.company?.name || '',
  }

  const resolveValue = (key: MergedField): string => {
    const c = choices[key]
    if (c === 'ai') return aiMerged[key] ?? ''
    const p = people.find(p => p.id === c)
    if (!p) return aiMerged[key] ?? ''
    return FIELDS.find(f => f.key === key)!.from(p)
  }

  const mergedPayload: DuplicateAiMerged = {
    first_name:   resolveValue('first_name'),
    last_name:    resolveValue('last_name'),
    email:        resolveValue('email'),
    phone:        resolveValue('phone'),
    company_name: resolveValue('company_name'),
  }

  const mergeMut = useMutation({
    mutationFn: () => duplicates.merge(candidate.id, primaryId, mergedPayload),
    onSuccess: () => {
      onAction()
      qc.invalidateQueries({ queryKey: ['people'] })
    },
  })

  const dismissMut = useMutation({
    mutationFn: () => duplicates.dismiss(candidate.id),
    onSuccess: () => {
      onAction()
    },
  })

  const verdict = ai?.decision ?? 'not_scored'
  const verdictStyle =
    verdict === 'merge'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : verdict === 'uncertain'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : verdict === 'not_scored'
          ? 'bg-zinc-50 text-zinc-500 border-zinc-200'
          : 'bg-zinc-100 text-zinc-600 border-zinc-200'
  const verdictLabel =
    verdict === 'merge' ? 'Merge'
    : verdict === 'uncertain' ? 'Uncertain'
    : verdict === 'not_scored' ? 'Not AI-scored'
    : 'Keep separate suggested'
  const confidencePct = ai?.confidence != null
    ? Math.round((ai.confidence > 1 ? ai.confidence : ai.confidence * 100))
    : null

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
      {/* Header / AI verdict */}
      <div className="px-5 py-3 border-b border-zinc-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium px-2 py-1 rounded-full border', verdictStyle)}>
            {verdictLabel}
            {confidencePct != null && <span className="ml-1 opacity-70">{confidencePct}%</span>}
          </span>
          <span className="text-xs text-zinc-400 font-mono">{candidate.group_key}</span>
        </div>
        <div className="text-xs text-zinc-400">{people.length} contacts</div>
      </div>

      {/* People comparison */}
      <div className={cn(
        'grid gap-px bg-zinc-100',
        people.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3',
      )}>
        {people.map(p => (
          <PersonColumn
            key={p.id}
            person={p}
            isPrimary={p.id === primaryId}
            onSetPrimary={() => setPrimaryId(p.id)}
          />
        ))}
      </div>

      {/* AI reasoning */}
      {ai?.reasoning && (
        <div className="px-5 py-3 bg-indigo-50/50 border-t border-indigo-100/50">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
            <p className="text-xs text-indigo-900/80 leading-relaxed">{ai.reasoning}</p>
          </div>
        </div>
      )}

      {/* Merged preview / field picker */}
      <div className="px-5 py-4 border-t border-zinc-100 space-y-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Merged result — primary values
          </h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            Phones and emails from both contacts are <strong>all kept</strong> on the merged record.
            The selection below only picks which one is shown as the primary.
          </p>
        </div>
        <div className="space-y-2">
          {FIELDS.map(f => {
            const values = people.map(p => ({ id: p.id, value: f.from(p) }))
            const aiVal = aiMerged[f.key] ?? ''
            const distinct = new Set(values.map(v => v.value).filter(Boolean))
            const hasConflict = distinct.size > 1
            const selected = choices[f.key]
            const isMultiValueField = f.key === 'phone' || f.key === 'email'
            return (
              <div key={f.key} className="flex items-start gap-3">
                <div className="w-28 text-xs text-zinc-500 pt-1.5 shrink-0">
                  {f.label}
                  {isMultiValueField && hasConflict && (
                    <div className="text-[10px] text-emerald-600 font-normal normal-case">
                      both kept
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <FieldOption
                    label="AI"
                    value={aiVal}
                    selected={selected === 'ai'}
                    onSelect={() => setChoices(c => ({ ...c, [f.key]: 'ai' }))}
                    highlight={hasConflict}
                  />
                  {hasConflict && values.map(v => (
                    <FieldOption
                      key={v.id}
                      label={people.find(p => p.id === v.id)?.full_name ?? '—'}
                      value={v.value}
                      selected={selected === v.id}
                      onSelect={() => setChoices(c => ({ ...c, [f.key]: v.id }))}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-end gap-2 flex-wrap">
        {(mergeMut.isError || dismissMut.isError) && (
          <span className="text-xs text-red-600 mr-auto">
            {((mergeMut.error ?? dismissMut.error) as Error | undefined)?.message ?? 'Action failed'}
          </span>
        )}
        <button
          onClick={onSkip}
          disabled={mergeMut.isPending || dismissMut.isPending}
          className="text-sm text-zinc-500 hover:text-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={() => dismissMut.mutate()}
          disabled={mergeMut.isPending || dismissMut.isPending}
          className="text-sm border border-zinc-200 hover:bg-zinc-50 text-zinc-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          {dismissMut.isPending ? 'Dismissing…' : 'Keep separate'}
        </button>
        <button
          onClick={() => mergeMut.mutate()}
          disabled={mergeMut.isPending || dismissMut.isPending || !primaryId}
          className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5"
        >
          {mergeMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Merge
        </button>
      </div>
    </div>
  )
}

function PersonColumn({
  person,
  isPrimary,
  onSetPrimary,
}: {
  person: Person
  isPrimary: boolean
  onSetPrimary: () => void
}) {
  return (
    <div className={cn('bg-white p-4 space-y-2', isPrimary && 'bg-indigo-50/40')}>
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 cursor-pointer">
        <input
          type="radio"
          checked={isPrimary}
          onChange={onSetPrimary}
          className="text-indigo-600 focus:ring-indigo-500"
        />
        Primary
      </label>
      <div className="font-medium text-zinc-900 text-sm flex items-center gap-1.5 flex-wrap">
        <span className="truncate">{person.full_name || '—'}</span>
        {person.instagram_handle && (
          <span className="inline-flex items-center gap-0.5 text-[10px] bg-pink-50 text-pink-700 border border-pink-100 rounded-full px-1.5 py-0.5">
            <Instagram className="w-2.5 h-2.5" />
            @{person.instagram_handle.replace(/^@/, '')}
          </span>
        )}
        {person.facebook_url && (
          <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-1.5 py-0.5">
            <Facebook className="w-2.5 h-2.5" />
            FB
          </span>
        )}
      </div>
      <div className="space-y-0.5 text-xs text-zinc-500">
        {person.email && <div className="truncate">{person.email}</div>}
        {person.phone && <div>{person.phone}</div>}
        {person.company?.name && <div className="truncate">{person.company.name}</div>}
      </div>
    </div>
  )
}

function FieldOption({
  label,
  value,
  selected,
  onSelect,
  highlight,
}: {
  label: string
  value: string
  selected: boolean
  onSelect: () => void
  highlight?: boolean
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1 -mx-2',
        selected ? 'bg-indigo-50' : 'hover:bg-zinc-50',
      )}
    >
      <input
        type="radio"
        checked={selected}
        onChange={onSelect}
        className="text-indigo-600 focus:ring-indigo-500"
      />
      <span className={cn('text-xs shrink-0 w-12', highlight ? 'text-amber-600 font-medium' : 'text-zinc-400')}>
        {label}
      </span>
      <span className={cn('truncate', value ? 'text-zinc-800' : 'text-zinc-300 italic')}>
        {value || 'empty'}
      </span>
    </label>
  )
}

