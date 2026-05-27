import { useQuery } from '@tanstack/react-query'
import { Sparkles, Loader2, User } from 'lucide-react'
import { naturalSearch, type Person } from '@/lib/api'
import { STRENGTH_LABELS, STRENGTH_COLORS, cn } from '@/lib/utils'
import { makeInitials } from './PersonCard'

interface Props {
  query: string
  onSelectPerson: (person: Person) => void
}

/**
 * Heuristic: query reads like a sentence/question rather than a name.
 * Triggers when query has 4+ words, or contains question/intent words.
 */
export function looksLikeNaturalQuery(q: string): boolean {
  const trimmed = q.trim()
  if (!trimmed) return false
  if (trimmed.length < 8) return false
  const wordCount = trimmed.split(/\s+/).length
  if (wordCount >= 4) return true
  const intent = /\b(who|which|find|show|intro|introduce|designer|engineer|founder|knows|works|lives|recently|met|talked|emailed)\b/i
  return intent.test(trimmed)
}

function initials(p: Person) {
  return makeInitials(p.first_name, p.last_name, p.full_name)
}

export function NaturalSearchPanel({ query, onSelectPerson }: Props) {
  const enabled = query.trim().length >= 4
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['natural-search', query],
    queryFn: () => naturalSearch.query(query, 10),
    enabled,
    staleTime: 60_000,
  })

  if (!enabled) {
    return (
      <div className="py-10 text-center text-sm text-zinc-400 flex flex-col items-center gap-2">
        <Sparkles className="w-5 h-5 text-indigo-400" />
        Ask anything in plain English. e.g. "designers I met in Lisbon last year".
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="py-10 flex flex-col items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
        <span>Thinking…</span>
        <span className="text-xs text-zinc-400">This can take a few seconds.</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="py-6 text-center text-sm text-red-600">
        {error instanceof Error ? error.message : 'Search failed.'}
      </div>
    )
  }

  const results = data?.results ?? []

  if (results.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-zinc-400">
        No matches for that query.
      </div>
    )
  }

  return (
    <div className="py-2">
      {results.map(row => (
        <button
          key={row.person.id}
          onClick={() => onSelectPerson(row.person)}
          className="w-full text-left flex gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-0"
        >
          <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-semibold text-sm flex items-center justify-center shrink-0">
            {row.person.avatar_url
              ? <img src={row.person.avatar_url} alt={row.person.full_name} className="w-9 h-9 rounded-full object-cover" />
              : (initials(row.person) || <User className="w-4 h-4" />)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-900 truncate">{row.person.full_name}</span>
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-zinc-100',
                STRENGTH_COLORS[row.person.relationship_strength],
              )}>
                {STRENGTH_LABELS[row.person.relationship_strength]}
              </span>
            </div>
            {(row.person.title || row.person.company) && (
              <p className="text-xs text-zinc-500 truncate">
                {[row.person.title, row.person.company?.name].filter(Boolean).join(' · ')}
              </p>
            )}
            {row.reasoning && (
              <p className="text-xs text-zinc-500 italic mt-1 leading-snug">{row.reasoning}</p>
            )}
          </div>
          <span className="text-[10px] text-zinc-300 shrink-0 self-start mt-0.5">
            {Math.round(row.score * 100)}%
          </span>
        </button>
      ))}
    </div>
  )
}
