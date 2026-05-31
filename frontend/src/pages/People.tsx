import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { people, type Person, type RelationshipStrength } from '@/lib/api'
import { PersonCard } from '@/components/PersonCard'
import { PersonDetailModal } from './PersonDetailModal'
import { AddPersonModal } from './AddPersonModal'
import { UserPlus, Loader2, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const STRENGTHS: { value: RelationshipStrength | 'all'; label: string }[] = [
  { value: 'all',   label: 'All' },
  { value: 'close', label: 'Close' },
  { value: 'hot',   label: 'Hot' },
  { value: 'warm',  label: 'Warm' },
  { value: 'cold',  label: 'Cold' },
]

interface PeoplePageProps {
  openPersonId?: string | null
  onPersonOpened?: () => void
}

export function PeoplePage({ openPersonId, onPersonOpened }: PeoplePageProps = {}) {
  const qc = useQueryClient()
  const [strength, setStrength] = useState<RelationshipStrength | 'all'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null)

  const backfillMut = useMutation({
    mutationFn: () => people.backfillAvatars(25),
    onSuccess: (r) => {
      setAvatarMsg(
        `Updated ${r.updated} avatar${r.updated === 1 ? '' : 's'}` +
        (r.failed > 0 ? `, ${r.failed} failed` : '') +
        (r.remaining > 0 ? ` — ${r.remaining} more to fetch (click again)` : ' — all done.')
      )
      qc.invalidateQueries({ queryKey: ['people'] })
    },
    onError: (e: unknown) => {
      setAvatarMsg(e instanceof Error ? e.message : 'Avatar fetch failed')
    },
  })
  const [search, setSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [showAddPerson, setShowAddPerson] = useState(false)

  // Deep-link: open a specific person from search navigation
  const { data: deepLinkPerson } = useQuery({
    queryKey: ['person', openPersonId],
    queryFn: () => people.get(openPersonId!),
    enabled: !!openPersonId,
    staleTime: 5_000,
  })
  useEffect(() => {
    if (deepLinkPerson) {
      setSelectedPerson(deepLinkPerson)
      onPersonOpened?.()
    }
  }, [deepLinkPerson, onPersonOpened])
  const [page, setPage] = useState(1)
  const [allPeople, setAllPeople] = useState<Person[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1)
    setAllPeople([])
  }, [strength, search])

  const params: Record<string, string> = { page: String(page) }
  if (strength !== 'all') params.relationship_strength = strength
  if (search) params.q = search

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['people', params],
    queryFn: () => people.list(params),
  })

  // Accumulate pages
  useEffect(() => {
    if (!data) return
    if (page === 1) {
      setAllPeople(data.data)
    } else {
      setAllPeople(prev => [...prev, ...data.data])
    }
  }, [data, page])

  const hasMore = data ? data.current_page < data.last_page : false

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">People</h1>
          {data && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">{data.total} contacts</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => backfillMut.mutate()}
            disabled={backfillMut.isPending}
            title="Fetch LinkedIn profile photos for contacts with a LinkedIn URL but no avatar"
            className="flex items-center gap-2 text-zinc-600 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 border border-zinc-200 hover:border-zinc-300 dark:border-zinc-700 dark:hover:border-zinc-600 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
          >
            {backfillMut.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ImageIcon className="w-4 h-4" />}
            {backfillMut.isPending ? 'Fetching photos…' : 'Fetch LinkedIn photos'}
          </button>
          <button
            onClick={() => setShowAddPerson(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add person
          </button>
        </div>
      </div>

      {avatarMsg && (
        <div className="mb-4 flex items-center justify-between gap-2 text-sm text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">
          <span>{avatarMsg}</span>
          <button onClick={() => setAvatarMsg(null)} className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-400 text-xs">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input
          type="text"
          placeholder="Search people..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="flex-1 min-w-0 max-w-xs text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
          {STRENGTHS.map(s => (
            <button
              key={s.value}
              onClick={() => setStrength(s.value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md transition-colors font-medium',
                strength === s.value
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading && allPeople.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-24 text-zinc-400">
          <p>Couldn't load contacts. Make sure you're signed in.</p>
        </div>
      )}

      {!isLoading && allPeople.length === 0 && (
        <div className="text-center py-24">
          <p className="text-zinc-400 text-sm">
            {search || strength !== 'all' ? 'No contacts match that filter.' : 'No contacts yet — add your first person.'}
          </p>
        </div>
      )}

      {allPeople.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allPeople.map(person => (
              <PersonCard
                key={person.id}
                person={person}
                onClick={() => setSelectedPerson(person)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isFetching}
                className="flex items-center gap-2 mx-auto text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {isFetching ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {selectedPerson && (
        <PersonDetailModal
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}

      {showAddPerson && (
        <AddPersonModal onClose={() => setShowAddPerson(false)} />
      )}
    </div>
  )
}
