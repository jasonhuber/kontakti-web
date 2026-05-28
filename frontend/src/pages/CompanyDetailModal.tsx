import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { companies, type Company, type Person, type Note } from '@/lib/api'
import { PersonCard } from '@/components/PersonCard'
import { PersonDetailModal } from './PersonDetailModal'
import { EditCompanyModal } from './EditCompanyModal'
import { NoteEditor } from '@/components/NoteEditor'
import { formatRelativeDate, cn } from '@/lib/utils'
import { X, Building2, Globe, Linkedin, Users, MessageSquare, Loader2, Pencil, Trash2, Plus, Copy } from 'lucide-react'

const DISCUSSION_TYPE_ICONS: Record<string, string> = {
  call: '📞', meeting: '🤝', email: '✉️', message: '💬', event: '📅', other: '•',
}

interface Props {
  company: Company
  onClose: () => void
}

export function CompanyDetailModal({ company, onClose }: Props) {
  const queryClient = useQueryClient()
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<'overview' | 'notes'>('overview')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [creatingNote, setCreatingNote] = useState(false)

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

  const { data: notesData, isLoading: loadingNotes } = useQuery({
    queryKey: ['company-notes', company.id],
    queryFn: () => companies.notes(company.id),
    enabled: tab === 'notes',
  })

  const deleteMutation = useMutation({
    mutationFn: () => companies.remove(company.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      onClose()
    },
  })

  const c = detail ?? company
  const noteList = notesData?.data ?? []

  // Detect same-first-name clusters (potential duplicates within this company).
  const dupGroups = useMemo(() => {
    if (!people) return []
    const byFirst: Record<string, Person[]> = {}
    for (const p of people) {
      const key = (p.first_name ?? '').trim().toLowerCase()
      if (!key) continue
      if (!byFirst[key]) byFirst[key] = []
      byFirst[key].push(p)
    }
    return Object.values(byFirst).filter(g => g.length > 1)
  }, [people])

  const dupCount = dupGroups.reduce((acc, g) => acc + g.length, 0)

  function handleNoteSaved(saved: Note) {
    setSelectedNote(saved)
    setCreatingNote(false)
    queryClient.invalidateQueries({ queryKey: ['company-notes', company.id] })
  }

  function handleNoteDeleted() {
    setSelectedNote(null)
    setCreatingNote(false)
    queryClient.invalidateQueries({ queryKey: ['company-notes', company.id] })
  }

  // Belt-and-suspenders: ignore backdrop clicks while a nested modal
  // (selected person / edit company) is open, so a stray bubbled click can't
  // close this panel out from under the child. The child modals also
  // stopPropagation on their own backdrop clicks. EditCompanyModal stacks
  // above us via z-[60]/z-[70] (arbitrary Tailwind values).
  const backdropDisabled = !!selectedPerson || editing
  const handleBackdropClick = () => {
    if (backdropDisabled) return
    onClose()
  }

  return (
    <>
      {/* Backdrop (z-40 / panel z-50 — Tailwind default scale) */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={handleBackdropClick} />

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
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete {c.name}?</span>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-zinc-500 hover:text-zinc-700">Cancel</button>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => setConfirmDelete(true)} className="text-zinc-400 hover:text-red-500 transition-colors" title="Delete company">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setEditing(true)} className="text-zinc-400 hover:text-zinc-600 transition-colors" title="Edit">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 shrink-0">
          <button
            onClick={() => setTab('overview')}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'overview' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setTab('notes')}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'notes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            Notes
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'overview' && (
            <div className="space-y-5">
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

              {/* Notes/bio */}
              {c.notes && (
                <p className="text-sm text-zinc-700 whitespace-pre-wrap">{c.notes}</p>
              )}

              {/* People */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide">
                    <Users className="w-3.5 h-3.5" />
                    People {people && people.length > 0 && <span className="normal-case font-normal text-zinc-400">({people.length})</span>}
                  </div>
                  {dupCount > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <Copy className="w-3 h-3" />
                      {dupCount} possible duplicates
                    </span>
                  )}
                </div>
                {loadingPeople && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
                {!loadingPeople && (!people || people.length === 0) && (
                  <p className="text-sm text-zinc-400">No people linked.</p>
                )}
                {people && people.length > 0 && (() => {
                  // Build a set of IDs that are in a duplicate cluster for highlight.
                  const dupIds = new Set(dupGroups.flatMap(g => g.map(p => p.id)))
                  return (
                    <div className="space-y-0.5">
                      {people.map(person => (
                        <div
                          key={person.id}
                          className={cn(
                            'rounded-lg',
                            dupIds.has(person.id) && 'ring-1 ring-amber-300 ring-offset-1',
                          )}
                        >
                          <PersonCard person={person} compact onClick={() => setSelectedPerson(person)} />
                        </div>
                      ))}
                    </div>
                  )
                })()}
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
          )}

          {tab === 'notes' && (
            <div className="space-y-3">
              {loadingNotes && (
                <div className="flex items-center gap-2 py-4 text-zinc-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading notes...
                </div>
              )}

              {!loadingNotes && noteList.length === 0 && !creatingNote && (
                <div className="text-center py-8 text-zinc-400 text-sm">
                  No notes yet for {c.name}.
                </div>
              )}

              {!loadingNotes && noteList.length > 0 && (
                <div className="space-y-1 mb-4">
                  {noteList.map(note => (
                    <button
                      key={note.id}
                      onClick={() => { setSelectedNote(note); setCreatingNote(false) }}
                      className={cn(
                        'w-full text-left px-3 py-2.5 rounded-lg border transition-colors',
                        selectedNote?.id === note.id
                          ? 'border-indigo-200 bg-indigo-50'
                          : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                      )}
                    >
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {note.title || 'Untitled'}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">{formatRelativeDate(note.updated_at)}</p>
                    </button>
                  ))}
                </div>
              )}

              {!creatingNote && !selectedNote && (
                <button
                  onClick={() => { setCreatingNote(true); setSelectedNote(null) }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-300 rounded-lg text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-500 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New note
                </button>
              )}

              {(selectedNote || creatingNote) && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">
                      {creatingNote ? 'New note' : selectedNote?.title || 'Untitled'}
                    </span>
                    <button
                      onClick={() => { setSelectedNote(null); setCreatingNote(false) }}
                      className="text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      ← Back to list
                    </button>
                  </div>
                  <NoteEditor
                    key={selectedNote?.id ?? 'new-company-note'}
                    note={selectedNote ?? undefined}
                    notableType="App\Models\Company"
                    notableId={company.id}
                    onSaved={handleNoteSaved}
                    onDelete={handleNoteDeleted}
                  />
                </>
              )}

              {!creatingNote && selectedNote && (
                <button
                  onClick={() => { setCreatingNote(true); setSelectedNote(null) }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-300 rounded-lg text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-500 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New note
                </button>
              )}
            </div>
          )}
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
