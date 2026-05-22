import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { people, type Person, type TimelineEvent } from '@/lib/api'
import { formatRelativeDate, STRENGTH_LABELS, STRENGTH_COLORS, cn } from '@/lib/utils'
import { X, Mail, Phone, Linkedin, Calendar, MessageSquare, CheckSquare, FileText, Loader2, Pencil } from 'lucide-react'
import { EditPersonModal } from './EditPersonModal'

interface Props {
  person: Person
  onClose: () => void
}

function initials(p: Person) {
  return `${p.first_name[0]}${p.last_name[0]}`
}

const TIMELINE_ICONS: Record<string, { icon: string; color: string }> = {
  discussion: { icon: '💬', color: 'bg-purple-50 border-purple-200' },
  note:       { icon: '📝', color: 'bg-blue-50 border-blue-200' },
  task:       { icon: '✅', color: 'bg-green-50 border-green-200' },
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  const cfg = TIMELINE_ICONS[event.type] ?? { icon: '•', color: 'bg-zinc-50 border-zinc-200' }
  const data = event.data as unknown as Record<string, unknown>
  const title = (data.title as string | undefined) ?? (data.body as string | undefined) ?? event.type

  return (
    <div className="flex gap-3 py-3">
      <div className={cn('w-7 h-7 rounded-full border flex items-center justify-center text-sm shrink-0', cfg.color)}>
        {cfg.icon}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm text-zinc-800 truncate">{title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{formatRelativeDate(event.date)}</p>
      </div>
    </div>
  )
}

export function PersonDetailModal({ person, onClose }: Props) {
  const [editing, setEditing] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['person', person.id],
    queryFn: () => people.get(person.id),
    initialData: person,
  })

  const { data: timeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ['person-timeline', person.id],
    queryFn: () => people.timeline(person.id),
  })

  const p = detail ?? person
  const isOverdue = p.next_followup_at && new Date(p.next_followup_at) < new Date()

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-lg shrink-0">
              {p.avatar_url
                ? <img src={p.avatar_url} alt={p.full_name} className="w-12 h-12 rounded-full object-cover" />
                : initials(p)
              }
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">{p.full_name}</h2>
              {(p.title || p.company) && (
                <p className="text-sm text-zinc-500">
                  {[p.title, p.company?.name].filter(Boolean).join(' · ')}
                </p>
              )}
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
          {/* Strength badge */}
          <div>
            <span className={cn('text-xs font-medium px-2 py-1 rounded-full bg-zinc-100', STRENGTH_COLORS[p.relationship_strength])}>
              {STRENGTH_LABELS[p.relationship_strength]}
            </span>
          </div>

          {/* Contact row */}
          {(p.email || p.phone || p.linkedin_url) && (
            <div className="flex flex-wrap gap-3">
              {p.email && (
                <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
                  <Mail className="w-3.5 h-3.5" />
                  {p.email}
                </a>
              )}
              {p.phone && (
                <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
                  <Phone className="w-3.5 h-3.5" />
                  {p.phone}
                </a>
              )}
              {p.linkedin_url && (
                <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700">
                  <Linkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </a>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            {p.discussions_count != null && (
              <div className="bg-zinc-50 rounded-xl px-4 py-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-zinc-400" />
                <div>
                  <div className="text-lg font-semibold text-zinc-900">{p.discussions_count}</div>
                  <div className="text-xs text-zinc-400">Discussions</div>
                </div>
              </div>
            )}
            {p.tasks_count != null && (
              <div className="bg-zinc-50 rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-zinc-400" />
                <div>
                  <div className="text-lg font-semibold text-zinc-900">{p.tasks_count}</div>
                  <div className="text-xs text-zinc-400">Tasks</div>
                </div>
              </div>
            )}
          </div>

          {/* Follow-up */}
          {p.next_followup_at && (
            <div className={cn(
              'flex items-center gap-2 text-sm px-4 py-3 rounded-xl border',
              isOverdue ? 'bg-red-50 border-red-200 text-red-600' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
            )}>
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Follow up {formatRelativeDate(p.next_followup_at)}</span>
              {isOverdue && <span className="ml-auto text-xs font-medium">Overdue</span>}
            </div>
          )}

          {/* Tags */}
          {p.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {p.tags.map(tag => (
                <span key={tag.id} className="text-xs px-2 py-1 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                  {tag.name}
                </span>
              ))}
            </div>
          )}

          {/* Notes */}
          {p.notes && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-2">
                <FileText className="w-3.5 h-3.5" />
                Notes
              </div>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">{p.notes}</p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Timeline</h3>
            {loadingTimeline && (
              <div className="flex items-center gap-2 py-4 text-zinc-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </div>
            )}
            {!loadingTimeline && (!timeline || timeline.length === 0) && (
              <p className="text-sm text-zinc-400 py-4">No activity yet.</p>
            )}
            {timeline && timeline.length > 0 && (
              <div className="divide-y divide-zinc-100">
                {timeline.map((event, i) => (
                  <TimelineRow key={i} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {editing && (
        <EditPersonModal person={p} onClose={() => setEditing(false)} />
      )}
    </>
  )
}
