import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { people, type RelationshipStrength } from '@/lib/api'
import { X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

const STRENGTHS: { value: RelationshipStrength; label: string; color: string }[] = [
  { value: 'cold',  label: 'Cold',  color: 'text-slate-500' },
  { value: 'warm',  label: 'Warm',  color: 'text-yellow-500' },
  { value: 'hot',   label: 'Hot',   color: 'text-orange-500' },
  { value: 'close', label: 'Close', color: 'text-green-500' },
]

export function AddPersonModal({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [strength, setStrength] = useState<RelationshipStrength>('warm')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => people.create({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      title: title.trim() || undefined,
      relationship_strength: strength,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      onClose()
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to save')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim()) { setError('First name is required'); return }
    if (!lastName.trim()) { setError('Last name is required'); return }
    setError(null)
    mutation.mutate()
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
            <h2 className="text-base font-semibold text-zinc-900">Add Person</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">First name *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Last name *</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Smith"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="CEO"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
            </div>

            {/* Relationship strength */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-2">Relationship</label>
              <div className="flex gap-2">
                {STRENGTHS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStrength(s.value)}
                    className={cn(
                      'flex-1 text-sm py-1.5 rounded-lg border transition-colors font-medium',
                      strength === s.value
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any context you want to remember..."
                rows={3}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
          </form>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 shrink-0 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-zinc-600 hover:text-zinc-800 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit as unknown as React.MouseEventHandler}
              disabled={mutation.isPending}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mutation.isPending ? 'Saving...' : 'Add person'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
