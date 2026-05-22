import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { people, type RelationshipStrength } from '@/lib/api'
import { X, Loader2, Linkedin, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  onClose: () => void
}

const STRENGTHS: { value: RelationshipStrength; label: string }[] = [
  { value: 'cold',  label: 'Cold'  },
  { value: 'warm',  label: 'Warm'  },
  { value: 'hot',   label: 'Hot'   },
  { value: 'close', label: 'Close' },
]

type Step = 'linkedin' | 'manual'

export function AddPersonModal({ onClose }: Props) {
  const queryClient = useQueryClient()

  // Step state
  const [step, setStep] = useState<Step>('linkedin')

  // LinkedIn step
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [enrichError, setEnrichError] = useState<string | null>(null)

  // Manual form state
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [title, setTitle] = useState('')
  const [strength, setStrength] = useState<RelationshipStrength>('warm')
  const [notes, setNotes] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)

  // Enrich mutation
  const enrichMutation = useMutation({
    mutationFn: () => people.enrich(linkedinUrl.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      onClose()
    },
    onError: (err) => {
      setEnrichError(err instanceof Error ? err.message : 'Proxycurl lookup failed')
    },
  })

  // Manual create mutation
  const createMutation = useMutation({
    mutationFn: () => people.create({
      first_name:            firstName.trim(),
      last_name:             lastName.trim(),
      email:                 email.trim() || undefined,
      phone:                 phone.trim() || undefined,
      title:                 title.trim() || undefined,
      linkedin_url:          linkedinUrl.trim() || undefined,
      relationship_strength: strength,
      notes:                 notes.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      onClose()
    },
    onError: (err) => {
      setManualError(err instanceof Error ? err.message : 'Failed to save')
    },
  })

  const handleEnrich = () => {
    if (!linkedinUrl.trim()) {
      setEnrichError('Paste a LinkedIn URL to continue')
      return
    }
    setEnrichError(null)
    enrichMutation.mutate()
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!firstName.trim()) { setManualError('First name is required'); return }
    if (!lastName.trim())  { setManualError('Last name is required');  return }
    setManualError(null)
    createMutation.mutate()
  }

  const switchToManual = () => {
    setEnrichError(null)
    setStep('manual')
  }

  const inputClass = 'w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400'

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

          {/* ── Step 1: LinkedIn ── */}
          {step === 'linkedin' && (
            <>
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                <div className="flex items-center gap-2 text-zinc-500 text-sm">
                  <Linkedin className="w-4 h-4 text-[#0A66C2]" />
                  <span>Paste a LinkedIn profile URL to auto-fill details</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                    LinkedIn profile URL
                  </label>
                  <input
                    type="url"
                    autoFocus
                    value={linkedinUrl}
                    onChange={e => { setLinkedinUrl(e.target.value); setEnrichError(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') handleEnrich() }}
                    placeholder="https://www.linkedin.com/in/username"
                    className={inputClass}
                  />
                </div>

                {enrichError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 space-y-1">
                    <p>{enrichError}</p>
                    <button
                      type="button"
                      onClick={switchToManual}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium text-xs mt-1"
                    >
                      Fill in manually <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {!enrichError && (
                  <button
                    type="button"
                    onClick={switchToManual}
                    className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    Skip — fill in manually <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>

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
                  onClick={handleEnrich}
                  disabled={enrichMutation.isPending}
                  className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  {enrichMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {enrichMutation.isPending ? 'Pulling profile…' : 'Add person'}
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: Manual form ── */}
          {step === 'manual' && (
            <>
              <form onSubmit={handleManualSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                      className={inputClass}
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
                      className={inputClass}
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
                    className={inputClass}
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
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1.5">Title</label>
                    <input
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="CEO"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1.5">LinkedIn URL</label>
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={e => setLinkedinUrl(e.target.value)}
                    placeholder="https://www.linkedin.com/in/username"
                    className={inputClass}
                  />
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
                    className={cn(inputClass, 'resize-none')}
                  />
                </div>

                {manualError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{manualError}</p>
                )}
              </form>

              <div className="px-6 py-4 border-t border-zinc-100 shrink-0 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => { setStep('linkedin'); setManualError(null) }}
                  className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  ← Back to LinkedIn
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-sm text-zinc-600 hover:text-zinc-800 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleManualSubmit as unknown as React.MouseEventHandler}
                    disabled={createMutation.isPending}
                    className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {createMutation.isPending ? 'Saving…' : 'Add person'}
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
