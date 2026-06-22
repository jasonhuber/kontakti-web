import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { quiz as quizApi, type ContactPrompt, type QuestionKey } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Brain, ChevronDown, ChevronUp, Loader2, Sparkles, X as XIcon } from 'lucide-react'

const QUESTION_NEEDS_INPUT: Record<QuestionKey, boolean> = {
  recognize: false,
  how_we_met: true,
  relationship_type: false,
  last_recall: false,
  notable: true,
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function QuizSection({
  prompts,
  onStartFullSession,
}: {
  prompts: ContactPrompt[]
  onStartFullSession?: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  // Track prompts that have been answered/skipped locally so we can animate them out
  // before the next /today refetch arrives.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [answeredCount, setAnsweredCount] = useState(0)

  // Reset dismissed set when the underlying prompts identity changes
  useEffect(() => {
    setDismissed(new Set())
  }, [prompts])

  const visible = useMemo(
    () => prompts.filter(p => !dismissed.has(p.id) && p.person != null),
    [prompts, dismissed],
  )

  // Also filter upstream for the length check
  const validPrompts = useMemo(() => prompts.filter(p => p.person != null), [prompts])

  if (validPrompts.length === 0) return null

  const allDone = visible.length === 0 && answeredCount > 0

  return (
    <section className="mb-8">
      <header className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 text-left group"
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 group-hover:text-indigo-700">
              Help me learn your network
            </h2>
            <p className="text-xs text-zinc-400">
              {allDone
                ? `Saved ${answeredCount} answer${answeredCount === 1 ? '' : 's'} — loading more…`
                : `${visible.length} quick question${visible.length === 1 ? '' : 's'} about your contacts`}
            </p>
          </div>
          {collapsed
            ? <ChevronDown className="w-4 h-4 text-zinc-400 ml-1" />
            : <ChevronUp className="w-4 h-4 text-zinc-400 ml-1" />}
        </button>
        {!collapsed && !allDone && onStartFullSession && (
          <button
            onClick={onStartFullSession}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            Start full quiz
          </button>
        )}
      </header>

      {!collapsed && !allDone && (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
          {visible.map(prompt => (
            <QuizCard
              key={prompt.id}
              prompt={prompt}
              onDone={() => {
                setAnsweredCount(c => c + 1)
                setDismissed(prev => {
                  const next = new Set(prev)
                  next.add(prompt.id)
                  return next
                })
              }}
              onSkipped={() => {
                setDismissed(prev => {
                  const next = new Set(prev)
                  next.add(prompt.id)
                  return next
                })
              }}
            />
          ))}
        </div>
      )}

      {!collapsed && allDone && (
        <div className="text-sm text-zinc-500 bg-indigo-50/40 border border-indigo-100 rounded-xl px-4 py-3">
          Saved {answeredCount} answer{answeredCount === 1 ? '' : 's'} — loading more…
        </div>
      )}
    </section>
  )
}

export function QuizCard({
  prompt,
  onDone,
  onSkipped,
  compact = true,
}: {
  prompt: ContactPrompt
  onDone: () => void
  onSkipped: () => void
  compact?: boolean
}) {
  const qc = useQueryClient()
  const [customAnswer, setCustomAnswer] = useState('')
  const [note, setNote] = useState('')
  const [leaving, setLeaving] = useState(false)
  const needsInput = QUESTION_NEEDS_INPUT[prompt.question_key]

  const answerMut = useMutation({
    mutationFn: (answer: string) => quizApi.answer(prompt.id, answer, undefined, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      if (prompt.person) qc.invalidateQueries({ queryKey: ['person', prompt.person.id] })
      qc.invalidateQueries({ queryKey: ['quiz-history'] })
      setLeaving(true)
      setTimeout(onDone, 180)
    },
  })

  const skipMut = useMutation({
    mutationFn: () => quizApi.skip(prompt.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['quiz-history'] })
      setLeaving(true)
      setTimeout(onSkipped, 180)
    },
  })

  const busy = answerMut.isPending || skipMut.isPending
  const person = prompt.person

  return (
    <div
      className={cn(
        'shrink-0 bg-white border border-indigo-100 rounded-2xl overflow-hidden transition-all duration-200 snap-start',
        'shadow-sm hover:shadow-md',
        compact ? 'w-[280px]' : 'w-full max-w-md',
        leaving && 'opacity-0 scale-95',
      )}
    >
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-indigo-400 to-violet-400" />

      <div className="p-4">
        {/* Person header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center shrink-0">
            {person.avatar_url
              ? <img src={person.avatar_url} alt={person.full_name} className="w-8 h-8 rounded-full object-cover" />
              : initials(person.full_name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900 truncate">{person.full_name}</p>
            {person.title && (
              <p className="text-[11px] text-zinc-400 truncate">{person.title}</p>
            )}
          </div>
        </div>

        {/* Question */}
        <p className="text-sm text-zinc-800 leading-snug mb-3">
          {prompt.question_text}
        </p>

        {/* Suggested response chips */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {prompt.suggested_responses.map(resp => (
            <button
              key={resp}
              disabled={busy}
              onClick={() => answerMut.mutate(resp)}
              className="text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-50"
            >
              {resp}
            </button>
          ))}
        </div>

        {/* Free text for notable/how_we_met */}
        {needsInput && (
          <form
            onSubmit={e => {
              e.preventDefault()
              const v = customAnswer.trim()
              if (v) answerMut.mutate(v)
            }}
            className="flex gap-1.5 mt-2"
          >
            <input
              type="text"
              value={customAnswer}
              onChange={e => setCustomAnswer(e.target.value)}
              placeholder="Or type your own…"
              disabled={busy}
              className="flex-1 text-xs border border-zinc-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={busy || !customAnswer.trim()}
              className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-md disabled:opacity-40"
            >
              Save
            </button>
          </form>
        )}

        {/* Optional free-text note — saved as a real Note on the person so the
            AI can use it later to decide how/why to reach out. Rides along with
            whichever answer (chip or custom) the user submits. */}
        <div className="mt-2">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Add a note (optional) — how you know them, anything to remember…"
            disabled={busy}
            rows={2}
            className="w-full text-xs border border-zinc-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          />
        </div>

        {/* Save note — visible as its own button once the user types anything */}
        {note.trim() && (
          <button
            onClick={() => answerMut.mutate(note.trim())}
            disabled={busy}
            className="w-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
          >
            {answerMut.isPending ? 'Saving…' : 'Save note →'}
          </button>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
          <button
            onClick={() => skipMut.mutate()}
            disabled={busy}
            className="text-[11px] text-zinc-400 hover:text-zinc-600 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <XIcon className="w-3 h-3" />
            Skip
          </button>
          {(answerMut.isPending || skipMut.isPending) && (
            <Loader2 className="w-3 h-3 text-indigo-500 animate-spin" />
          )}
        </div>
      </div>
    </div>
  )
}
