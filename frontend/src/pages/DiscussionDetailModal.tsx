import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { discussions, type Discussion, type Person } from '@/lib/api'
import { PersonCard } from '@/components/PersonCard'
import { PersonDetailModal } from './PersonDetailModal'
import { formatRelativeDate } from '@/lib/utils'
import { X, Users, Loader2 } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  call: 'Call', meeting: 'Meeting', email: 'Email',
  message: 'Message', event: 'Event', other: 'Other',
}

const TYPE_COLORS: Record<string, string> = {
  call:    'bg-green-100 text-green-700',
  meeting: 'bg-blue-100 text-blue-700',
  email:   'bg-yellow-100 text-yellow-700',
  message: 'bg-purple-100 text-purple-700',
  event:   'bg-pink-100 text-pink-700',
  other:   'bg-zinc-100 text-zinc-600',
}

const TYPE_ICONS: Record<string, string> = {
  call: '📞', meeting: '🤝', email: '✉️', message: '💬', event: '📅', other: '•',
}

interface Props {
  discussion: Discussion
  onClose: () => void
}

export function DiscussionDetailModal({ discussion, onClose }: Props) {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)

  const { data: detail, isLoading } = useQuery({
    queryKey: ['discussion', discussion.id],
    queryFn: () => discussions.get(discussion.id),
    initialData: discussion,
  })

  const d = detail ?? discussion

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-zinc-100 shrink-0 gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{TYPE_ICONS[d.type] ?? '•'}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[d.type] ?? 'bg-zinc-100 text-zinc-600'}`}>
                {TYPE_LABELS[d.type] ?? d.type}
              </span>
            </div>
            <h2 className="text-base font-semibold text-zinc-900">{d.title}</h2>
            <p className="text-sm text-zinc-500 mt-0.5">{formatRelativeDate(d.date)}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {isLoading && (
            <div className="flex items-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          )}

          {/* Summary */}
          {d.summary && (
            <div>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Summary</h3>
              <p className="text-sm text-zinc-700">{d.summary}</p>
            </div>
          )}

          {/* Body / notes */}
          {d.body && (
            <div>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Notes</h3>
              <div
                className="prose prose-sm max-w-none text-zinc-700"
                dangerouslySetInnerHTML={{ __html: d.body }}
              />
            </div>
          )}

          {/* Participants */}
          {d.participants && d.participants.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                <Users className="w-3.5 h-3.5" />
                Participants ({d.participants.length})
              </div>
              <div className="space-y-0.5">
                {d.participants.map(person => (
                  <PersonCard key={person.id} person={person} compact onClick={() => setSelectedPerson(person)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedPerson && (
        <PersonDetailModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />
      )}
    </>
  )
}
