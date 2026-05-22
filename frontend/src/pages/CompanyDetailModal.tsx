import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { companies, type Company, type Person } from '@/lib/api'
import { PersonCard } from '@/components/PersonCard'
import { PersonDetailModal } from './PersonDetailModal'
import { EditCompanyModal } from './EditCompanyModal'
import { formatRelativeDate } from '@/lib/utils'
import { X, Building2, Globe, Linkedin, Users, MessageSquare, Loader2, Pencil } from 'lucide-react'

const DISCUSSION_TYPE_ICONS: Record<string, string> = {
  call: '📞', meeting: '🤝', email: '✉️', message: '💬', event: '📅', other: '•',
}

interface Props {
  company: Company
  onClose: () => void
}

export function CompanyDetailModal({ company, onClose }: Props) {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [editing, setEditing] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['company', company.id],
    queryFn: () => companies.get(company.id),
    initialData: company,
  })

  const { data: people, isLoading: loadingPeople } = useQuery({
    queryKey: ['company-people', company.id],
    queryFn: () => companies.people(company.id),
  })

  const { data: disc, isLoading: loadingDisc } = useQuery({
    queryKey: ['company-discussions', company.id],
    queryFn: () => companies.discussions(company.id),
  })

  const c = detail ?? company

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
              {c.logo_url
                ? <img src={c.logo_url} alt={c.name} className="w-10 h-10 rounded-xl object-contain" />
                : <Building2 className="w-5 h-5 text-zinc-400" />
              }
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">{c.name}</h2>
              {c.industry && <p className="text-sm text-zinc-500">{c.industry}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditing(true)} className="text-zinc-400 hover:text-zinc-600 transition-colors" title="Edit">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Links */}
          {(c.website || c.linkedin_url || c.domain) && (
            <div className="flex flex-wrap gap-3">
              {c.website && (
                <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
                  <Globe className="w-3.5 h-3.5" />
                  Website
                </a>
              )}
              {!c.website && c.domain && (
                <a href={`https://${c.domain}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
                  <Globe className="w-3.5 h-3.5" />
                  {c.domain}
                </a>
              )}
              {c.linkedin_url && (
                <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
                  <Linkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </a>
              )}
            </div>
          )}

          {/* Tags */}
          {c.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map(tag => (
                <span key={tag.id} className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {c.notes && (
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{c.notes}</p>
          )}

          {/* People */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              <Users className="w-3.5 h-3.5" />
              People
            </div>
            {loadingPeople && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
            {!loadingPeople && (!people || people.length === 0) && (
              <p className="text-sm text-zinc-400">No people linked.</p>
            )}
            {people && people.length > 0 && (
              <div className="space-y-0.5">
                {people.map(person => (
                  <PersonCard key={person.id} person={person} compact onClick={() => setSelectedPerson(person)} />
                ))}
              </div>
            )}
          </div>

          {/* Discussions */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              <MessageSquare className="w-3.5 h-3.5" />
              Recent discussions
            </div>
            {loadingDisc && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
            {!loadingDisc && (!disc || disc.length === 0) && (
              <p className="text-sm text-zinc-400">No discussions yet.</p>
            )}
            {disc && disc.length > 0 && (
              <div className="divide-y divide-zinc-100">
                {disc.slice(0, 10).map(d => (
                  <div key={d.id} className="py-2.5 flex items-start gap-2">
                    <span className="text-base shrink-0">{DISCUSSION_TYPE_ICONS[d.type] ?? '•'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{d.title}</p>
                      <p className="text-xs text-zinc-400">{formatRelativeDate(d.date)}</p>
                      {d.summary && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{d.summary}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPerson && (
        <PersonDetailModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />
      )}

      {editing && (
        <EditCompanyModal company={c} onClose={() => setEditing(false)} />
      )}
    </>
  )
}
