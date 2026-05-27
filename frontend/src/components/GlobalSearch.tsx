import { useEffect, useState, useCallback, useMemo } from 'react'
import { Command } from 'cmdk'
import { Search, User, Building2, Briefcase, MessageSquare, FileText, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { search, type SearchResult, type Person } from '@/lib/api'
import { NaturalSearchPanel, looksLikeNaturalQuery } from './NaturalSearchPanel'
import { cn } from '@/lib/utils'

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  person: User,
  company: Building2,
  deal: Briefcase,
  discussion: MessageSquare,
  note: FileText,
}

type Mode = 'fast' | 'ai'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (url: string) => void
  onSelectPerson?: (person: Person) => void
}

export function GlobalSearch({ open, onOpenChange, onNavigate, onSelectPerson }: Props) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('fast')

  // Auto-switch to AI when the query looks sentence-like.
  const autoAi = useMemo(() => looksLikeNaturalQuery(query), [query])
  const effectiveMode: Mode = mode === 'ai' || autoAi ? 'ai' : 'fast'

  const { data } = useQuery({
    queryKey: ['search', query],
    queryFn: () => search.global(query),
    enabled: effectiveMode === 'fast' && query.length >= 2,
    staleTime: 30_000,
  })

  const results = data?.results ?? []

  const handleSelect = useCallback((url: string) => {
    onNavigate(url)
    onOpenChange(false)
    setQuery('')
  }, [onNavigate, onOpenChange])

  // Open on Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div className="relative w-full max-w-xl">
        <Command className="rounded-xl border border-zinc-200 bg-white shadow-2xl overflow-hidden" shouldFilter={false}>
          <div className="flex items-center border-b border-zinc-100 px-4">
            {effectiveMode === 'ai'
              ? <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
              : <Search className="w-4 h-4 text-zinc-400 shrink-0" />
            }
            <Command.Input
              placeholder={effectiveMode === 'ai'
                ? 'Ask anything…'
                : 'Search people, companies, deals…'}
              value={query}
              onValueChange={setQuery}
              className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-zinc-400 px-3"
              autoFocus
            />
            <kbd className="text-xs text-zinc-300 font-mono">ESC</kbd>
          </div>

          {/* Mode toggle */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-zinc-100 bg-zinc-50/50">
            <button
              onClick={() => setMode('fast')}
              className={cn(
                'text-xs px-2 py-1 rounded-md transition-colors',
                effectiveMode === 'fast'
                  ? 'bg-white border border-zinc-200 text-zinc-900 font-medium'
                  : 'text-zinc-500 hover:text-zinc-700',
              )}
            >
              Fast
            </button>
            <button
              onClick={() => setMode('ai')}
              className={cn(
                'text-xs px-2 py-1 rounded-md transition-colors inline-flex items-center gap-1',
                effectiveMode === 'ai'
                  ? 'bg-white border border-indigo-200 text-indigo-700 font-medium'
                  : 'text-zinc-500 hover:text-zinc-700',
              )}
            >
              <Sparkles className="w-3 h-3" />
              Ask AI
            </button>
            {autoAi && mode !== 'ai' && (
              <span className="text-[10px] text-zinc-400 ml-1">auto-detected</span>
            )}
          </div>

          <Command.List className="max-h-80 overflow-y-auto py-2">
            {effectiveMode === 'fast' ? (
              <>
                {query.length < 2 && (
                  <Command.Empty className="py-8 text-center text-sm text-zinc-400">
                    Type to search…
                  </Command.Empty>
                )}

                {query.length >= 2 && results.length === 0 && (
                  <Command.Empty className="py-8 text-center text-sm text-zinc-400">
                    No results for "{query}"
                  </Command.Empty>
                )}

                {results.length > 0 && (
                  <Command.Group>
                    {results.map((result: SearchResult) => {
                      const Icon = TYPE_ICONS[result.type] ?? FileText
                      return (
                        <Command.Item
                          key={result.id}
                          value={result.id}
                          onSelect={() => handleSelect(result.url)}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer aria-selected:bg-zinc-50"
                        >
                          <Icon className="w-4 h-4 text-zinc-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-zinc-900 truncate">{result.title}</div>
                            {result.subtitle && (
                              <div className="text-xs text-zinc-400 truncate">{result.subtitle}</div>
                            )}
                          </div>
                          <span className="ml-auto text-xs text-zinc-300 capitalize shrink-0">{result.type}</span>
                        </Command.Item>
                      )
                    })}
                  </Command.Group>
                )}
              </>
            ) : (
              <NaturalSearchPanel
                query={query}
                onSelectPerson={(person) => {
                  if (onSelectPerson) {
                    onSelectPerson(person)
                  } else {
                    handleSelect(`/people/${person.id}`)
                  }
                  onOpenChange(false)
                  setQuery('')
                }}
              />
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
