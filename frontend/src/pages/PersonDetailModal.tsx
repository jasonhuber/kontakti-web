import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  people, activity as activityApi, quiz as quizApi, discussions as discussionsApi,
  type Person, type TimelineEvent, type Note, type SocialActivity, type ContactPrompt,
  type DiscussionType, type Discussion, type Task, type ReachOutLog, type RelationshipStrength,
} from '@/lib/api'
import {
  instagramProfile, facebookProfile, whatsappLink,
} from '@/lib/contact-links'
import { formatRelativeDate, STRENGTH_LABELS, STRENGTH_COLORS, cn } from '@/lib/utils'
import {
  X, Mail, Phone, Linkedin, Calendar, MessageSquare, CheckSquare, FileText,
  Loader2, Pencil, Trash2, Plus, Instagram, Facebook, Twitter, MessageCircle,
  RefreshCw, MapPin, Briefcase, Heart, Sparkles, Check, Mic, Brain,
  Users, Eye, Clock, Send, Ban,
} from 'lucide-react'
import { EditPersonModal } from './EditPersonModal'
import { NoteEditor } from '@/components/NoteEditor'
import { VoiceCaptureFlow } from '@/components/VoiceCaptureFlow'
import { makeInitials } from '@/components/PersonCard'
import { PhotoGallery } from '@/components/PhotoGallery'

// ── Interaction feed helpers ─────────────────────────────────────────────────

const DISCUSSION_TYPE_CONFIG: Record<DiscussionType, {
  icon: React.ComponentType<{ className?: string }>
  bg: string; border: string; text: string; label: string
}> = {
  call:    { icon: Phone,         bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600', label: 'Called' },
  meeting: { icon: Users,         bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-600', label: 'Met' },
  email:   { icon: Mail,          bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-600',    label: 'Email' },
  message: { icon: MessageCircle, bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-600',   label: 'Texted' },
  event:   { icon: Calendar,      bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-600', label: 'Event' },
  other:   { icon: Eye,           bg: 'bg-zinc-50',    border: 'border-zinc-200',    text: 'text-zinc-500',   label: 'Other' },
}

const REACH_OUT_VIA_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail, phone: Phone, sms: MessageCircle, imessage: MessageCircle,
  whatsapp: MessageCircle, instagram: Instagram, facebook: Facebook,
  in_person: Users, other: MessageSquare,
}

const LOG_TYPES: { type: DiscussionType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: 'call',    label: 'Called',   icon: Phone },
  { type: 'meeting', label: 'Met',      icon: Users },
  { type: 'message', label: 'Texted',   icon: MessageCircle },
  { type: 'email',   label: 'Emailed',  icon: Mail },
  { type: 'other',   label: 'Saw them', icon: Eye },
]

const CADENCE_DAYS: Record<RelationshipStrength, number> = {
  close: 14, hot: 30, warm: 60, cold: 90,
}

function daysSinceContact(dateStr: string | undefined | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function typeTitleForPerson(type: DiscussionType, firstName: string): string {
  const map: Record<DiscussionType, string> = {
    call: `Called ${firstName}`, meeting: `Met with ${firstName}`,
    message: `Texted ${firstName}`, email: `Emailed ${firstName}`,
    event: `Event with ${firstName}`, other: `Saw ${firstName}`,
  }
  return map[type]
}

// ── Social activity icons ─────────────────────────────────────────────────────

const ACTIVITY_SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook:  Facebook,
  linkedin:  Linkedin,
  twitter_x: Twitter,
  tiktok:    Sparkles,
}

const ACTIVITY_KIND_TINT: Record<string, string> = {
  post:           'bg-violet-50 text-violet-700',
  life_event:     'bg-rose-50 text-rose-700',
  job_change:     'bg-emerald-50 text-emerald-700',
  reaction:       'bg-zinc-50 text-zinc-600',
  check_in:       'bg-amber-50 text-amber-700',
  story_highlight:'bg-pink-50 text-pink-700',
}

interface Props {
  person: Person
  onClose: () => void
}

function initials(p: Person) {
  return makeInitials(p.first_name, p.last_name, p.full_name)
}


export function PersonDetailModal({ person, onClose }: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<'overview' | 'interactions' | 'notes'>('overview')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [creatingNote, setCreatingNote] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)

  const { data: detail } = useQuery({
    queryKey: ['person', person.id],
    queryFn: () => people.get(person.id),
    initialData: person,
  })

  const { data: activityList, isLoading: loadingActivity } = useQuery({
    queryKey: ['activity', person.id],
    queryFn: () => activityApi.forPerson(person.id),
  })

  const { data: quizHistory } = useQuery({
    queryKey: ['quiz-history', person.id],
    queryFn: () => quizApi.history({ person_id: person.id }),
  })

  const refreshActivityMut = useMutation({
    mutationFn: () => activityApi.refresh(person.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity', person.id] })
      queryClient.invalidateQueries({ queryKey: ['today'] })
    },
  })

  const ackActivityMut = useMutation({
    mutationFn: (id: string) => activityApi.acknowledge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity', person.id] })
      queryClient.invalidateQueries({ queryKey: ['today'] })
    },
  })

  const { data: notesData, isLoading: loadingNotes } = useQuery({
    queryKey: ['person-notes', person.id],
    queryFn: () => people.notes(person.id),
    enabled: tab === 'notes',
  })

  const deleteMutation = useMutation({
    mutationFn: () => people.remove(person.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      onClose()
    },
  })

  const p = detail ?? person
  const isOverdue = p.next_followup_at && new Date(p.next_followup_at) < new Date()
  const noteList = notesData?.data ?? []

  function handleNoteSaved(saved: Note) {
    setSelectedNote(saved)
    setCreatingNote(false)
    queryClient.invalidateQueries({ queryKey: ['person-notes', person.id] })
  }

  function handleNoteDeleted() {
    setSelectedNote(null)
    setCreatingNote(false)
    queryClient.invalidateQueries({ queryKey: ['person-notes', person.id] })
  }

  // Belt-and-suspenders: ignore backdrop clicks while a nested modal (edit /
  // voice) is open, so a stray bubbled click can't close this panel out from
  // under the child. The child modals also stopPropagation on their own
  // backdrop clicks. The child stacks above us via z-[60]/z-[70] (arbitrary
  // Tailwind values — see EditPersonModal).
  const backdropDisabled = editing || voiceOpen
  const handleBackdropClick = () => {
    if (backdropDisabled) return
    onClose()
  }

  return (
    <>
      {/* Backdrop (z-40 / panel z-50 — Tailwind default scale) */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={handleBackdropClick} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white dark:bg-zinc-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-lg shrink-0">
              {p.avatar_url
                ? <img src={p.avatar_url} alt={p.full_name} className="w-12 h-12 rounded-full object-cover" />
                : initials(p)
              }
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{p.full_name}</h2>
              {(p.title || p.company) && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {[p.title, p.company?.name].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600">Delete {p.first_name}?</span>
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
                <button onClick={() => setConfirmDelete(true)} className="text-zinc-400 hover:text-red-500 transition-colors" title="Delete person">
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
        <div className="flex border-b border-zinc-100 dark:border-zinc-800 shrink-0">
          <button
            onClick={() => setTab('overview')}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'overview' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setTab('interactions')}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'interactions' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            )}
          >
            Interactions
          </button>
          <button
            onClick={() => setTab('notes')}
            className={cn(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'notes' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
            )}
          >
            Notes
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'overview' && (
            <div className="space-y-5">
              {/* Strength badge */}
              <div>
                <span className={cn('text-xs font-medium px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800', STRENGTH_COLORS[p.relationship_strength])}>
                  {STRENGTH_LABELS[p.relationship_strength]}
                </span>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setVoiceOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1.5 rounded-md transition-colors"
                  title="Record a voice memo about this person"
                >
                  <Mic className="w-3.5 h-3.5" />
                  Voice memo
                </button>
              </div>

              {/* Photo gallery — primary + all attached photos */}
              <PhotoGallery personId={p.id} editable={false} />

              {/* Contact rows — every email + every phone with its label.
                  Legacy single-column values are merged into the lists so we
                  never lose them, and the primary is shown first. */}
              <ContactRows person={p} />
              {p.linkedin_url && (
                <div>
                  <a
                    href={p.linkedin_url}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    <Linkedin className="w-3.5 h-3.5" />
                    LinkedIn
                  </a>
                </div>
              )}

              {/* Social handles */}
              {(p.instagram_handle || p.facebook_url || p.twitter_x_handle || p.tiktok_handle || p.whatsapp_phone) && (
                <div className="flex flex-wrap gap-1.5">
                  {p.instagram_handle && (
                    <a
                      href={instagramProfile(p.instagram_handle)}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-pink-50 text-pink-700 border border-pink-100 rounded-full px-2 py-1 hover:bg-pink-100"
                    >
                      <Instagram className="w-3 h-3" />
                      @{p.instagram_handle.replace(/^@/, '')}
                    </a>
                  )}
                  {p.facebook_url && (
                    <a
                      href={facebookProfile(p.facebook_url)}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-1 hover:bg-blue-100"
                    >
                      <Facebook className="w-3 h-3" />
                      Facebook
                    </a>
                  )}
                  {p.twitter_x_handle && (
                    <a
                      href={`https://x.com/${p.twitter_x_handle.replace(/^@/, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-full px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    >
                      <Twitter className="w-3 h-3" />
                      @{p.twitter_x_handle.replace(/^@/, '')}
                    </a>
                  )}
                  {p.tiktok_handle && (
                    <a
                      href={`https://www.tiktok.com/@${p.tiktok_handle.replace(/^@/, '')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-zinc-900 text-white rounded-full px-2 py-1 hover:bg-zinc-700"
                    >
                      <Sparkles className="w-3 h-3" />
                      TikTok
                    </a>
                  )}
                  {p.whatsapp_phone && (
                    <a
                      href={whatsappLink(p.whatsapp_phone, '')}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-1 hover:bg-emerald-100"
                    >
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </a>
                  )}
                </div>
              )}

              {/* Facebook-only banner */}
              {p.preferred_contact_via === 'facebook' && p.facebook_url && (
                <a
                  href={facebookProfile(p.facebook_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-white no-underline"
                  style={{ backgroundColor: '#1877F2' }}
                >
                  <Facebook className="w-5 h-5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold leading-tight">Facebook is the only way to reach {p.first_name}</div>
                    <div className="text-xs opacity-80 mt-0.5">Tap to open their profile →</div>
                  </div>
                </a>
              )}

              {/* Location / how we met */}
              {(p.city || p.country || p.how_we_met) && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                  {(p.city || p.country) && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      {[p.city, p.region, p.country].filter(Boolean).join(', ')}
                    </div>
                  )}
                  {p.how_we_met && (
                    <div className="flex items-start gap-1.5">
                      <Heart className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>{p.how_we_met}</span>
                    </div>
                  )}
                  {p.previous_employers && p.previous_employers.length > 0 && (
                    <div className="flex items-start gap-1.5">
                      <Briefcase className="w-3 h-3 mt-0.5 shrink-0" />
                      <span>Previously: {p.previous_employers.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                {p.discussions_count != null && (
                  <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <div>
                      <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{p.discussions_count}</div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500">Discussions</div>
                    </div>
                  </div>
                )}
                {p.tasks_count != null && (
                  <div className="bg-zinc-50 dark:bg-zinc-800 rounded-xl px-4 py-3 flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                    <div>
                      <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{p.tasks_count}</div>
                      <div className="text-xs text-zinc-400 dark:text-zinc-500">Tasks</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Follow-up */}
              {p.next_followup_at && (
                <div className={cn(
                  'flex items-center gap-2 text-sm px-4 py-3 rounded-xl border',
                  isOverdue ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
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
                    <span key={tag.id} className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* About (plain text bio from person record) */}
              {p.notes && (
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                    <FileText className="w-3.5 h-3.5" />
                    About
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{p.notes}</p>
                </div>
              )}

              {/* Do not contact */}
              <DoNotContactPanel person={p} />

              {/* What you remember about them */}
              <RememberPanel person={p} answers={quizHistory ?? []} />

              {/* Activity */}
              <ActivityPanel
                person={p}
                items={activityList}
                loading={loadingActivity}
                refreshing={refreshActivityMut.isPending}
                onRefresh={() => refreshActivityMut.mutate()}
                onAcknowledge={(id) => ackActivityMut.mutate(id)}
              />
            </div>
          )}

          {tab === 'interactions' && (
            <InteractionsTab person={p} />
          )}

          {tab === 'notes' && (
            <div className="space-y-3">
              {/* Note list */}
              {loadingNotes && (
                <div className="flex items-center gap-2 py-4 text-zinc-400 dark:text-zinc-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading notes...
                </div>
              )}

              {!loadingNotes && noteList.length === 0 && !creatingNote && (
                <div className="text-center py-8 text-zinc-400 dark:text-zinc-500 text-sm">
                  No notes yet for {p.first_name}.
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
                          ? 'border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/40'
                          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      )}
                    >
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {note.title || 'Untitled'}
                      </p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{formatRelativeDate(note.updated_at)}</p>
                    </button>
                  ))}
                </div>
              )}

              {/* New note button */}
              {!creatingNote && !selectedNote && (
                <button
                  onClick={() => { setCreatingNote(true); setSelectedNote(null) }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg text-sm text-zinc-400 dark:text-zinc-500 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-400 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New note
                </button>
              )}

              {/* Editor */}
              {(selectedNote || creatingNote) && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      {creatingNote ? 'New note' : selectedNote?.title || 'Untitled'}
                    </span>
                    <button
                      onClick={() => { setSelectedNote(null); setCreatingNote(false) }}
                      className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400"
                    >
                      ← Back to list
                    </button>
                  </div>
                  <NoteEditor
                    key={selectedNote?.id ?? 'new-person-note'}
                    note={selectedNote ?? undefined}
                    notableType="App\Models\Person"
                    notableId={person.id}
                    onSaved={handleNoteSaved}
                    onDelete={handleNoteDeleted}
                  />
                </>
              )}

              {/* New note button when list is visible */}
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

      {editing && (
        <EditPersonModal person={p} onClose={() => setEditing(false)} />
      )}

      {voiceOpen && (
        <VoiceCaptureFlow
          personId={p.id}
          context={`Voice memo about ${p.full_name}`}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </>
  )
}

// ── Activity panel ───────────────────────────────────────────────────────────

function ActivityPanel({
  person, items, loading, refreshing, onRefresh, onAcknowledge,
}: {
  person: Person
  items: SocialActivity[] | undefined
  loading: boolean
  refreshing: boolean
  onRefresh: () => void
  onAcknowledge: (id: string) => void
}) {
  const hasAnyHandle =
    !!person.instagram_handle || !!person.facebook_url ||
    !!person.twitter_x_handle || !!person.tiktok_handle ||
    !!person.linkedin_url
  // Defensive: tolerate either a bare array or a paginator { data: [...] }
  // shape, so a future schema drift can't take down the detail modal.
  const list: SocialActivity[] = Array.isArray(items)
    ? items
    : (items as unknown as { data?: SocialActivity[] })?.data ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Activity</h3>
        {hasAnyHandle && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-60 inline-flex items-center gap-1"
          >
            {refreshing
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-4 text-zinc-400 dark:text-zinc-500 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading activity…
        </div>
      )}

      {!loading && !hasAnyHandle && list.length === 0 && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 py-3">
          Add an Instagram or Facebook handle to see recent activity.
        </p>
      )}

      {!loading && hasAnyHandle && list.length === 0 && (
        <div className="py-3 space-y-2">
          <p className="text-xs text-zinc-400 dark:text-zinc-500">No recent activity captured yet.</p>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {refreshing
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            Pull recent activity
          </button>
        </div>
      )}

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {list.map(a => (
          <ActivityRow key={a.id} item={a} onAcknowledge={() => onAcknowledge(a.id)} />
        ))}
      </div>
    </div>
  )
}

function ActivityRow({ item, onAcknowledge }: { item: SocialActivity; onAcknowledge: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = ACTIVITY_SOURCE_ICONS[item.source] ?? Sparkles
  const tint = ACTIVITY_KIND_TINT[item.kind] ?? 'bg-zinc-50 text-zinc-600'
  const isAcked = !!item.acknowledged_at
  const content = item.content ?? ''
  const isLong = content.length > 200
  const visible = expanded || !isLong ? content : content.slice(0, 200) + '…'

  return (
    <div className={cn('flex gap-3 py-3', isAcked && 'opacity-50')}>
      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', tint)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="capitalize">{item.kind.replace('_', ' ')}</span>
          <span>·</span>
          <span>{formatRelativeDate(item.occurred_at)}</span>
          {item.external_url && (
            <>
              <span>·</span>
              <a href={item.external_url} target="_blank" rel="noopener noreferrer"
                className="text-indigo-600 hover:underline">View</a>
            </>
          )}
        </div>
        {content && (
          <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1 whitespace-pre-wrap leading-snug">
            {visible}
            {isLong && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-xs text-indigo-600 hover:underline ml-1"
              >
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          {item.location && (
            <div className="flex items-center gap-1 text-xs text-zinc-500">
              <MapPin className="w-3 h-3" />
              {item.location}
            </div>
          )}
          {item.image_url && (
            <img src={item.image_url} alt="" className="w-12 h-12 rounded-md object-cover border border-zinc-100" />
          )}
        </div>
      </div>
      {!isAcked && (
        <button
          onClick={onAcknowledge}
          className="text-xs text-zinc-400 hover:text-emerald-600 shrink-0"
          title="Acknowledge"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Interactions tab ─────────────────────────────────────────────────────────

function InteractionsTab({ person }: { person: Person }) {
  const queryClient = useQueryClient()
  const [logOpen, setLogOpen] = useState(false)
  const [logType, setLogType] = useState<DiscussionType>('call')
  const [logDate, setLogDate] = useState(() => {
    const now = new Date()
    // datetime-local format: YYYY-MM-DDTHH:MM
    return now.toISOString().slice(0, 16)
  })
  const [logNote, setLogNote] = useState('')

  const { data: timeline, isLoading } = useQuery({
    queryKey: ['person-timeline', person.id],
    queryFn: () => people.timeline(person.id),
  })

  const logMut = useMutation({
    mutationFn: ({ type, date, note }: { type: DiscussionType; date: string; note: string }) =>
      discussionsApi.createForPerson(person.id, {
        title: typeTitleForPerson(type, person.first_name),
        type,
        date,
        ...(note.trim() ? { summary: note.trim() } : {}),
      }),
    onSuccess: () => {
      setLogOpen(false)
      setLogNote('')
      setLogDate(new Date().toISOString().slice(0, 16))
      queryClient.invalidateQueries({ queryKey: ['person-timeline', person.id] })
      queryClient.invalidateQueries({ queryKey: ['person', person.id] })
      queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })

  const days = daysSinceContact(person.last_contacted_at)
  const cadence = CADENCE_DAYS[person.relationship_strength]
  const cadenceOverdue = days !== null && days > cadence

  return (
    <div className="space-y-4">
      {/* Last contacted header */}
      <div className={cn(
        'flex items-center gap-2 px-4 py-3 rounded-xl border text-sm',
        cadenceOverdue
          ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
          : days === null
          ? 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
          : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
      )}>
        <Clock className="w-4 h-4 shrink-0" />
        <span>
          {days === null
            ? 'Never contacted'
            : days === 0
            ? 'Contacted today'
            : `Last contact ${days} day${days === 1 ? '' : 's'} ago`}
        </span>
        {cadenceOverdue && (
          <span className="ml-auto text-xs font-medium">Due for follow-up</span>
        )}
      </div>

      {/* Follow-up scheduled */}
      {person.next_followup_at && (
        <div className={cn(
          'flex items-center gap-2 text-sm px-4 py-3 rounded-xl border',
          new Date(person.next_followup_at) < new Date()
            ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
            : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
        )}>
          <Calendar className="w-4 h-4 shrink-0" />
          <span>Follow up {formatRelativeDate(person.next_followup_at)}</span>
          {new Date(person.next_followup_at) < new Date() && (
            <span className="ml-auto text-xs font-medium">Overdue</span>
          )}
        </div>
      )}

      {/* Log interaction */}
      {logOpen ? (
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-3 bg-zinc-50 dark:bg-zinc-800">
          {/* Type chips */}
          <div className="flex flex-wrap gap-1.5">
            {LOG_TYPES.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                onClick={() => setLogType(type)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors',
                  logType === type
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-600 hover:border-zinc-300 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-600'
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Date */}
          <input
            type="datetime-local"
            value={logDate}
            onChange={e => setLogDate(e.target.value)}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />

          {/* Note */}
          <textarea
            value={logNote}
            onChange={e => setLogNote(e.target.value)}
            placeholder="Add a note… (optional)"
            rows={2}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 dark:text-zinc-100 resize-none focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setLogOpen(false)}
              className="text-xs text-zinc-500 hover:text-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={() => logMut.mutate({ type: logType, date: logDate, note: logNote })}
              disabled={logMut.isPending || !logDate}
              className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md disabled:opacity-50 transition-colors"
            >
              {logMut.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Send className="w-3 h-3" />}
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setLogOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-zinc-300 dark:border-zinc-600 rounded-lg text-sm text-zinc-400 dark:text-zinc-500 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Log interaction
        </button>
      )}

      {/* Feed */}
      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      )}
      {!isLoading && (!timeline || timeline.length === 0) && (
        <p className="text-sm text-zinc-400 dark:text-zinc-500 py-6 text-center">
          No interactions yet. Log your first one above.
        </p>
      )}
      {timeline && timeline.length > 0 && (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {timeline.map((event, i) => (
            <InteractionRow key={i} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

function InteractionRow({ event }: { event: TimelineEvent }) {
  if (event.type === 'discussion') {
    const d = event.data as Discussion
    const cfg = DISCUSSION_TYPE_CONFIG[d.type] ?? DISCUSSION_TYPE_CONFIG.other
    const Icon = cfg.icon
    const thread = d.email_thread
    const displayTitle = d.type === 'email' && thread?.subject ? thread.subject : d.title
    const displaySub   = d.type === 'email' ? thread?.snippet : d.summary

    return (
      <div className="flex gap-3 py-3">
        <div className={cn('w-8 h-8 rounded-full border flex items-center justify-center shrink-0', cfg.bg, cfg.border)}>
          <Icon className={cn('w-4 h-4', cfg.text)} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{displayTitle}</p>
            {d.type === 'email' && thread?.message_count && thread.message_count > 1 && (
              <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1.5 py-0.5 rounded-full shrink-0">
                {thread.message_count}
              </span>
            )}
          </div>
          {displaySub && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{displaySub}</p>
          )}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{formatRelativeDate(event.date)}</p>
        </div>
      </div>
    )
  }

  if (event.type === 'note') {
    const n = event.data as Note
    return (
      <div className="flex gap-3 py-3">
        <div className="w-8 h-8 rounded-full border bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{n.title || 'Note'}</p>
          {n.body && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{n.body.slice(0, 120)}</p>}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{formatRelativeDate(event.date)}</p>
        </div>
      </div>
    )
  }

  if (event.type === 'task') {
    const t = event.data as Task
    return (
      <div className="flex gap-3 py-3">
        <div className="w-8 h-8 rounded-full border bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 flex items-center justify-center shrink-0">
          <CheckSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{t.title}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{formatRelativeDate(event.date)}</p>
        </div>
      </div>
    )
  }

  if (event.type === 'reach_out') {
    const r = event.data as ReachOutLog
    const Icon = REACH_OUT_VIA_ICON[r.via] ?? MessageSquare
    return (
      <div className="flex gap-3 py-3">
        <div className="w-8 h-8 rounded-full border bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 capitalize">
            Reached out via {r.via.replace('_', ' ')}
          </p>
          {r.note && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{r.note}</p>}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{formatRelativeDate(event.date)}</p>
        </div>
      </div>
    )
  }

  return null
}

// ── What you remember about them ─────────────────────────────────────────────

const QUIZ_KEY_FIELD: Record<string, keyof Person | null> = {
  how_we_met: 'how_we_met',
  notable: 'notes',
  recognize: null,
  relationship_type: null,
  last_recall: null,
}

const QUIZ_KEY_LABEL: Record<string, string> = {
  how_we_met: 'How you met',
  notable: 'Notable',
  recognize: 'Recognize',
  relationship_type: 'Relationship',
  last_recall: 'Last recall',
}

/**
 * Renders the full list of emails and phones a contact owns, merging the
 * legacy single-column values with the `emails` / `phones` relation rows so
 * nothing is dropped. De-duped by lowercased email / digits-only phone.
 * Primary entries are shown first.
 */
function ContactRows({ person }: { person: Person }) {
  const emails = mergeEmails(person)
  const phones = mergePhones(person)
  if (emails.length === 0 && phones.length === 0) return null
  return (
    <div className="space-y-1">
      {emails.map((e, i) => (
        <a
          key={`e-${i}-${e.value}`}
          href={`mailto:${e.value}`}
          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
        >
          <Mail className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
          <span className="truncate">{e.value}</span>
          {e.label && (
            <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5">
              {e.label}
            </span>
          )}
        </a>
      ))}
      {phones.map((ph, i) => (
        <a
          key={`p-${i}-${ph.value}`}
          href={`tel:${ph.value.replace(/\s+/g, '')}`}
          className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700"
        >
          <Phone className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
          <span className="truncate">{ph.value}</span>
          {ph.label && (
            <span className="text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded px-1 py-0.5">
              {ph.label}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}

function mergeEmails(p: Person): Array<{ value: string; label?: string }> {
  const out: Array<{ value: string; label?: string; primary: boolean }> = []
  const seen = new Set<string>()
  const push = (value: string, label: string | undefined, primary: boolean) => {
    const v = value.trim()
    if (!v) return
    const key = v.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ value: v, label, primary })
  }
  for (const e of p.emails ?? []) push(e.value, e.label, !!e.is_primary)
  if (p.email) push(p.email, undefined, false)
  return out
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map(({ value, label }) => ({ value, label }))
}

function mergePhones(p: Person): Array<{ value: string; label?: string }> {
  const out: Array<{ value: string; label?: string; primary: boolean }> = []
  const seen = new Set<string>()
  const norm = (s: string) => {
    const d = s.replace(/\D/g, '')
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  }
  const push = (value: string, label: string | undefined, primary: boolean) => {
    const v = value.trim()
    if (!v) return
    const key = norm(v)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ value: v, label, primary })
  }
  for (const ph of p.phones ?? []) push(ph.value, ph.label, !!ph.is_primary)
  if (p.phone) push(p.phone, undefined, false)
  return out
    .sort((a, b) => Number(b.primary) - Number(a.primary))
    .map(({ value, label }) => ({ value, label }))
}

function DoNotContactPanel({ person }: { person: Person }) {
  const qc = useQueryClient()
  const isDnc = !!person.do_not_contact
  const [expanded, setExpanded] = useState(isDnc)
  const [reason, setReason] = useState(person.do_not_contact_reason ?? '')

  const updateMut = useMutation({
    mutationFn: (payload: Partial<Person>) => people.update(person.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['person', person.id] })
      qc.invalidateQueries({ queryKey: ['people'] })
      qc.invalidateQueries({ queryKey: ['today'] })
    },
  })

  function toggle() {
    if (isDnc) {
      // Turning off — clear the reason too.
      updateMut.mutate({ do_not_contact: false, do_not_contact_reason: '' })
      setReason('')
      setExpanded(false)
    } else {
      updateMut.mutate({ do_not_contact: true })
      setExpanded(true)
    }
  }

  function saveReason() {
    const r = reason.trim()
    if (r === (person.do_not_contact_reason ?? '')) return
    updateMut.mutate({ do_not_contact_reason: r })
  }

  return (
    <div className={cn(
      'rounded-xl border px-4 py-3',
      isDnc ? 'bg-red-50/40 dark:bg-red-900/20 border-red-100 dark:border-red-900' : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700',
    )}>
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-2 text-left min-w-0"
        >
          <div className={cn(
            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
            isDnc ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500',
          )}>
            <Ban className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {isDnc ? 'Do not contact' : 'Contact normally'}
            </div>
            {isDnc && person.do_not_contact_reason && !expanded && (
              <div className="text-xs text-red-700/80 truncate">
                {person.do_not_contact_reason}
              </div>
            )}
            {!isDnc && (
              <div className="text-xs text-zinc-400 dark:text-zinc-500">
                Suppress reminders, drafts, and cadence checks.
              </div>
            )}
          </div>
        </button>
        <label className="inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={isDnc}
            onChange={toggle}
            disabled={updateMut.isPending}
            className="sr-only peer"
          />
          <div className="w-10 h-5 bg-zinc-200 dark:bg-zinc-700 peer-checked:bg-red-500 rounded-full transition-colors relative">
            <div className={cn(
              'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow',
              isDnc && 'translate-x-5',
            )} />
          </div>
        </label>
      </div>

      {isDnc && expanded && (
        <div className="mt-3 pt-3 border-t border-red-100/60">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onBlur={saveReason}
            placeholder="e.g. asked to be removed, deceased, ex-spouse, harassment, GDPR request"
            rows={2}
            maxLength={500}
            disabled={updateMut.isPending}
            className="w-full text-sm border border-red-200 dark:border-red-800 bg-white dark:bg-zinc-800 dark:text-zinc-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 disabled:opacity-50"
          />
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
            Saved when you click outside the field.
          </p>
        </div>
      )}
    </div>
  )
}

function RememberPanel({ person, answers }: { person: Person; answers: ContactPrompt[] }) {
  const queryClient = useQueryClient()
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // Surface answers + any pre-populated person fields (notes / how_we_met) as
  // implicit "remembered" entries even if the quiz hasn't run yet.
  const surfaced = (() => {
    const byKey = new Map<string, ContactPrompt>()
    // Defensive: callers should pass an array, but an unexpected response
    // shape from the API shouldn't crash the whole detail modal.
    const safe = Array.isArray(answers) ? answers : []
    safe.forEach(a => { byKey.set(a.question_key, a) })
    const entries: { key: string; label: string; value: string; editableField: keyof Person | null }[] = []
    Object.entries(QUIZ_KEY_LABEL).forEach(([key, label]) => {
      const field = QUIZ_KEY_FIELD[key]
      const fromQuiz = byKey.get(key)?.answer
      const fromPerson = field ? (person[field] as string | undefined) : undefined
      const value = fromQuiz || fromPerson
      if (value) entries.push({ key, label, value, editableField: field })
    })
    return entries
  })()

  const patchMut = useMutation({
    mutationFn: ({ field, value }: { field: keyof Person; value: string }) =>
      people.update(person.id, { [field]: value } as Partial<Person>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['person', person.id] })
      queryClient.invalidateQueries({ queryKey: ['quiz-history', person.id] })
      setEditingKey(null)
    },
  })

  if (surfaced.length === 0) return null

  return (
    <div>
      <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Brain className="w-3 h-3" />
        What you remember
      </h3>
      <div className="space-y-2">
        {surfaced.map(entry => {
          const isEditing = editingKey === entry.key && entry.editableField
          return (
            <div
              key={entry.key}
              className="bg-indigo-50/40 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-lg px-3 py-2 group"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-medium text-indigo-700 uppercase tracking-wide">{entry.label}</p>
                {entry.editableField && !isEditing && (
                  <button
                    onClick={() => { setEditingKey(entry.key); setDraft(entry.value) }}
                    className="opacity-0 group-hover:opacity-100 text-[11px] text-indigo-600 hover:text-indigo-700"
                  >
                    Edit
                  </button>
                )}
              </div>
              {isEditing ? (
                <div className="mt-1.5 flex gap-1.5">
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className="flex-1 text-sm border border-indigo-200 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  />
                  <button
                    onClick={() => entry.editableField && patchMut.mutate({ field: entry.editableField, value: draft.trim() })}
                    disabled={patchMut.isPending}
                    className="text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 rounded-md disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingKey(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-0.5 whitespace-pre-wrap">{entry.value}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
