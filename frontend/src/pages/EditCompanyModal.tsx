import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { companies, type Company } from '@/lib/api'
import { X, Loader2 } from 'lucide-react'

interface Props {
  company: Company
  onClose: () => void
}

export function EditCompanyModal({ company, onClose }: Props) {
  const queryClient = useQueryClient()
  const [name, setName]         = useState(company.name)
  const [domain, setDomain]     = useState(company.domain ?? '')
  const [industry, setIndustry] = useState(company.industry ?? '')
  const [sizeRange, setSizeRange] = useState(company.size_range ?? '')
  const [website, setWebsite]   = useState(company.website ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(company.linkedin_url ?? '')
  const [notes, setNotes]       = useState(company.notes ?? '')
  const [error, setError]       = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => companies.update(company.id, {
      name:         name.trim(),
      domain:       domain.trim() || undefined,
      industry:     industry.trim() || undefined,
      size_range:   sizeRange.trim() || undefined,
      website:      website.trim() || undefined,
      linkedin_url: linkedinUrl.trim() || undefined,
      notes:        notes.trim() || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      queryClient.invalidateQueries({ queryKey: ['company', company.id] })
      onClose()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Company name is required'); return }
    setError(null)
    mutation.mutate()
  }

  // Backdrop click closes this modal only. We stopPropagation so the click
  // does not bubble to the underlying CompanyDetailModal backdrop (z-40) and
  // close that too. Arbitrary z-values: Tailwind's default scale tops out at
  // z-50, which CompanyDetailModal already uses for its panel — we need to sit
  // strictly above it. (See InlineDrawer.tsx for the same z-[60]/z-[70] pattern.)
  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={handleBackdropClick} />

      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
            <h2 className="text-base font-semibold text-zinc-900">Edit {company.name}</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Company name *</label>
              <input type="text" required autoFocus value={name} onChange={e => setName(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Domain</label>
                <input type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Industry</label>
                <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} placeholder="SaaS"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Size</label>
                <input type="text" value={sizeRange} onChange={e => setSizeRange(e.target.value)} placeholder="11–50"
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Website</label>
                <input type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..."
                  className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">LinkedIn URL</label>
              <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/company/..."
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none" />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
          </form>

          <div className="px-6 py-4 border-t border-zinc-100 shrink-0 flex justify-end gap-3">
            <button type="button" onClick={onClose}
              className="text-sm text-zinc-600 hover:text-zinc-800 px-4 py-2 rounded-lg hover:bg-zinc-50 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit as unknown as React.MouseEventHandler}
              disabled={mutation.isPending}
              className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
              {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mutation.isPending ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
