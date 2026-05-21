import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { people, type RelationshipStrength } from '@/lib/api'
import { PersonCard } from '@/components/PersonCard'
import { UserPlus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const STRENGTHS: { value: RelationshipStrength | 'all'; label: string }[] = [
  { value: 'all',   label: 'All' },
  { value: 'close', label: 'Close' },
  { value: 'hot',   label: 'Hot' },
  { value: 'warm',  label: 'Warm' },
  { value: 'cold',  label: 'Cold' },
]

export function PeoplePage() {
  const [strength, setStrength] = useState<RelationshipStrength | 'all'>('all')
  const [search, setSearch] = useState('')

  const params: Record<string, string> = {}
  if (strength !== 'all') params.strength = strength
  if (search) params.q = search

  const { data, isLoading, isError } = useQuery({
    queryKey: ['people', params],
    queryFn: () => people.list(params),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">People</h1>
          {data && (
            <p className="text-sm text-zinc-400 mt-0.5">{data.total} contacts</p>
          )}
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <UserPlus className="w-4 h-4" />
          Add person
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="Search people..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-xs text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
        />
        <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
          {STRENGTHS.map(s => (
            <button
              key={s.value}
              onClick={() => setStrength(s.value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md transition-colors font-medium',
                strength === s.value
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      )}

      {isError && (
        <div className="text-center py-24 text-zinc-400">
          <p>Couldn't load contacts. Make sure you're signed in.</p>
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-center py-24">
          <p className="text-zinc-400 text-sm">
            {search || strength !== 'all' ? 'No contacts match that filter.' : 'No contacts yet — add your first person.'}
          </p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.data.map(person => (
            <PersonCard
              key={person.id}
              person={person}
              onClick={() => console.log('open', person.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
