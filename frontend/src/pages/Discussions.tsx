import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { discussions, type Discussion, type DiscussionType } from '@/lib/api'
import { DiscussionDetailModal } from './DiscussionDetailModal'
import { LogDiscussionModal } from './LogDiscussionModal'
import { formatRelativeDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Search, Users } from 'lucide-react'

const TYPE_FILTERS: { value: DiscussionType | 'all'; label: string }[] = [
  { value: 'all',     label: 'All' },
  { value: 'call',    label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'email',   label: 'Email' },
  { value: 'message', label: 'Message' },
  { value: 'event',   label: 'Event' },
]

const TYPE_ICONS: Record<string, string> = {
  call: '📞', meeting: '🤝', email: '✉️', message: '💬', event: '📅', other: '•',
}

const TYPE_COLORS: Record<string, string> = {
  call:    'bg-green-100 text-green-700',
  meeting: 'bg-blue-100 text-blue-700',
  email:   'bg-yellow-100 text-yellow-700',
  message: 'bg-purple-100 text-purple-700',
  event:   'bg-pink-100 text-pink-700',
  other:   'bg-zinc-100 text-zinc-600',
}

export function DiscussionsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<DiscussionType | 'all'>('all')
  const [selectedDiscussion, setSelectedDiscussion] = useState<Discussion | null>(null)
  const [showLog, setShowLog] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  const params: Record<string, string> = {}
  if (search) params.q = search
  if (typeFilter !== 'all') params.type = typeFilter

  const { data, isLoading, isError } = useQuery({
    queryKey: ['discussions', params],
    queryFn: () => discussions.list(params),
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Discussions</h1>
          {data && <p className="text-sm text-zinc-400 mt-0.5">{data.total} interactions</p>}
        </div>
        <button
          onClick={() => setShowLog(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Log interaction
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative max-w-xs flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search discussions..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-md transition-colors font-medium',
                typeFilter === f.value
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-24 text-zinc-400">
          Couldn't load discussions.
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-center py-24 text-zinc-400 text-sm">
          {search || typeFilter !== 'all' ? 'No discussions match that filter.' : 'No discussions yet — log your first interaction.'}
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="space-y-2">
          {data.data.map(discussion => (
            <button
              key={discussion.id}
              onClick={() => setSelectedDiscussion(discussion)}
              className="w-full text-left bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all flex items-start gap-3"
            >
              <span className="text-xl shrink-0 mt-0.5">{TYPE_ICONS[discussion.type] ?? '•'}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-zinc-900 truncate">{discussion.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_COLORS[discussion.type] ?? 'bg-zinc-100 text-zinc-600')}>
                      {discussion.type}
                    </span>
                    <span className="text-xs text-zinc-400">{formatRelativeDate(discussion.date)}</span>
                  </div>
                </div>
                {discussion.summary && (
                  <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{discussion.summary}</p>
                )}
                {discussion.participants && discussion.participants.length > 0 && (
                  <div className="flex items-center gap-1 mt-1.5 text-xs text-zinc-400">
                    <Users className="w-3 h-3" />
                    {discussion.participants.map(p => p.full_name).join(', ')}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedDiscussion && (
        <DiscussionDetailModal discussion={selectedDiscussion} onClose={() => setSelectedDiscussion(null)} />
      )}

      {showLog && (
        <LogDiscussionModal onClose={() => setShowLog(false)} />
      )}
    </div>
  )
}
