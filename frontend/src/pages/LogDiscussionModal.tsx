import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { discussions, people, type Person, type DiscussionType } from '@/lib/api'
import { PersonCard } from '@/components/PersonCard'
import { X, Search, UserPlus, Loader2 } from 'lucide-react'

const TYPES: { value: DiscussionType; label: string; icon: string }[] = [
  { value: 'call',    label: 'Call',    icon: '📞' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'email',   label: 'Email',   icon: '✉️' },
  { value: 'message', label: 'Message', icon: '💬' },
  { value: 'event',   label: 'Event',   icon: '📅' },
  { value: 'other',   label: 'Other',   icon: '•' },
]

interface Props {
  onClose: () => void
}

export function LogDiscussionModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<DiscussionType>('call')
  const [summary, setSummary] = useState('')
  const [participants, setParticipants] = useState<Person[]>([])
  const [participantSearch, setParticipantSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['people-search', participantSearch],
    queryFn: () => people.list({ q: participantSearch }),
    enabled: participantSearch.length >= 2,
    staleTime: 10_000,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const created = await discussions.create({
        title,
        date,
        type,
        summary,
      })
      // Add participants one by one
      for (const p of participants) {
        await discussions.addParticipant(created.id, p.id)
      }
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discussions'] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to save')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setError(null)
    mutation.mutate()
  }

  const addParticipant = (person: Person) => {
    if (!participants.find(p => p.id === person.id)) {
      setParticipants(prev => [...prev, person])
    }
    setParticipantSearch('')
  }

  const removeParticipant = (id: string) => {
    setParticipants(prev => prev.filter(p => p.id !== id))
  }

  const candidateResults = (searchResults?.data ?? []).filter(
    p => !participants.find(pp => pp.id === p.id)
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Log Interaction</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Type</label>
              <div className="flex flex-wrap gap-2">
                {TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                      type === t.value
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-500'
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="What was this about?"
                className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Summary */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Summary</label>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="Brief summary of what was discussed..."
                rows={3}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>

            {/* Participants */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                <span className="flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Participants</span>
              </label>

              {participants.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {participants.map(p => (
                    <span key={p.id} className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                      {p.full_name}
                      <button type="button" onClick={() => removeParticipant(p.id)} className="hover:text-indigo-900 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <div className="flex items-center border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 dark:bg-zinc-800">
                  <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <input
                    type="text"
                    value={participantSearch}
                    onChange={e => setParticipantSearch(e.target.value)}
                    placeholder="Search people..."
                    className="flex-1 text-sm bg-transparent outline-none px-2"
                  />
                  {searching && <Loader2 className="w-3.5 h-3.5 text-zinc-400 animate-spin shrink-0" />}
                </div>

                {participantSearch.length >= 2 && candidateResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                    {candidateResults.slice(0, 8).map(person => (
                      <PersonCard key={person.id} person={person} compact onClick={() => addParticipant(person)} />
                    ))}
                  </div>
                )}

                {participantSearch.length >= 2 && !searching && candidateResults.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-10 px-4 py-3 text-sm text-zinc-400 dark:text-zinc-500">
                    No people found
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
          </form>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 shrink-0 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mutation.isPending ? 'Saving...' : 'Log interaction'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
