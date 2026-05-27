import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  discussions as discussionsApi,
  tasks as tasksApi,
  people as peopleApi,
  type VoiceCaptureResult,
  type Discussion,
  type Task,
  type TaskPriority,
} from '@/lib/api'
import { formatRelativeDate, cn } from '@/lib/utils'
import {
  Sparkles, MessageSquare, CheckSquare, UserPlus, X, Trash2, Pencil,
  Save, Loader2,
} from 'lucide-react'

interface Props {
  result: VoiceCaptureResult
  onClose: () => void
}

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

export function VoiceResultPreview({ result, onClose }: Props) {
  const qc = useQueryClient()
  const [transcript, setTranscript] = useState(result.transcript)
  const [editingTranscript, setEditingTranscript] = useState(false)
  const [discussions, setDiscussions] = useState<Discussion[]>(result.discussions)
  const [tasks, setTasks] = useState<Task[]>(result.tasks)
  const [personRefs, setPersonRefs] = useState(result.person_refs)
  const [busy, setBusy] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['discussions'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['people'] })
    qc.invalidateQueries({ queryKey: ['today'] })
    qc.invalidateQueries({ queryKey: ['person-timeline'] })
  }

  // Soft-delete: backend already wrote rows. "Discard" deletes them.
  const discardAll = useMutation({
    mutationFn: async () => {
      setBusy(true)
      const ops: Promise<unknown>[] = []
      for (const d of discussions) ops.push(discussionsApi.remove(d.id).catch(() => undefined))
      for (const t of tasks) ops.push(tasksApi.remove(t.id).catch(() => undefined))
      await Promise.all(ops)
    },
    onSettled: () => {
      setBusy(false)
      invalidate()
      onClose()
    },
  })

  const save = () => {
    invalidate()
    onClose()
  }

  const removeDiscussion = async (id: string) => {
    setBusy(true)
    try { await discussionsApi.remove(id) } catch { /* ignore */ }
    setDiscussions(ds => ds.filter(d => d.id !== id))
    setBusy(false)
  }

  const removeTask = async (id: string) => {
    setBusy(true)
    try { await tasksApi.remove(id) } catch { /* ignore */ }
    setTasks(ts => ts.filter(t => t.id !== id))
    setBusy(false)
  }

  const updateTask = async (id: string, patch: Partial<Task>) => {
    setTasks(ts => ts.map(t => (t.id === id ? { ...t, ...patch } : t)))
    try { await tasksApi.update(id, patch) } catch { /* ignore */ }
  }

  const createPersonFromRef = async (idx: number, ref: typeof personRefs[number]) => {
    const parts = ref.name_hint.trim().split(/\s+/)
    const first_name = parts[0] ?? ref.name_hint
    const last_name = parts.slice(1).join(' ') || ''
    try {
      await peopleApi.create({ first_name, last_name })
      setPersonRefs(rs => rs.filter((_, i) => i !== idx))
      qc.invalidateQueries({ queryKey: ['people'] })
    } catch { /* ignore */ }
  }

  const dismissRef = (idx: number) => {
    setPersonRefs(rs => rs.filter((_, i) => i !== idx))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] pb-8 px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900">Voice capture</h2>
              <p className="text-xs text-zinc-400">Review and edit before saving.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Summary */}
          {result.summary && (
            <div className="text-sm text-zinc-700 italic bg-indigo-50/50 border border-indigo-100 rounded-lg px-3 py-2.5">
              {result.summary}
            </div>
          )}

          {/* Transcript */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Transcript</h3>
              <button
                onClick={() => setEditingTranscript(v => !v)}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
              >
                <Pencil className="w-3 h-3" />
                {editingTranscript ? 'Done' : 'Edit transcript'}
              </button>
            </div>
            {editingTranscript ? (
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                rows={5}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-y"
              />
            ) : (
              <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2.5">
                {transcript || '(no transcript)'}
              </p>
            )}
          </section>

          {/* Discussions */}
          {discussions.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                Discussions ({discussions.length})
              </h3>
              <div className="space-y-2">
                {discussions.map(d => (
                  <div key={d.id} className="border border-zinc-200 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                          <span className="capitalize">{d.type}</span>
                          <span>·</span>
                          <span>{formatRelativeDate(d.date)}</span>
                        </div>
                        <p className="text-sm font-medium text-zinc-900">{d.title}</p>
                        {d.summary && (
                          <p className="text-sm text-zinc-600 mt-1">{d.summary}</p>
                        )}
                        {d.participants && d.participants.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {d.participants.map(p => (
                              <span
                                key={p.id}
                                className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2 py-0.5"
                              >
                                {p.full_name}
                                <button
                                  onClick={async () => {
                                    try { await discussionsApi.removeParticipant(d.id, p.id) } catch { /* ignore */ }
                                    setDiscussions(ds => ds.map(x => x.id === d.id
                                      ? { ...x, participants: x.participants?.filter(pp => pp.id !== p.id) }
                                      : x))
                                  }}
                                  className="text-indigo-400 hover:text-indigo-700"
                                  aria-label="Remove participant"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeDiscussion(d.id)}
                        className="text-zinc-400 hover:text-red-500 shrink-0"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tasks */}
          {tasks.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CheckSquare className="w-3 h-3" />
                Tasks ({tasks.length})
              </h3>
              <div className="space-y-2">
                {tasks.map(t => (
                  <div key={t.id} className="border border-zinc-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="text"
                        value={t.title}
                        onChange={e => setTasks(ts => ts.map(x => x.id === t.id ? { ...x, title: e.target.value } : x))}
                        onBlur={e => updateTask(t.id, { title: e.target.value })}
                        className="flex-1 text-sm border-0 bg-transparent focus:outline-none focus:bg-zinc-50 rounded px-1 -mx-1 font-medium text-zinc-900"
                      />
                      <button
                        onClick={() => removeTask(t.id)}
                        className="text-zinc-400 hover:text-red-500 shrink-0"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={t.priority}
                        onChange={e => updateTask(t.id, { priority: e.target.value as TaskPriority })}
                        className="text-xs border border-zinc-200 rounded-md px-2 py-1 bg-white text-zinc-700"
                      >
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <input
                        type="datetime-local"
                        value={t.due_at ? new Date(t.due_at).toISOString().slice(0, 16) : ''}
                        onChange={e => {
                          const v = e.target.value ? new Date(e.target.value).toISOString() : undefined
                          updateTask(t.id, { due_at: v })
                        }}
                        className="text-xs border border-zinc-200 rounded-md px-2 py-1 bg-white text-zinc-700"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Person refs */}
          {personRefs.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <UserPlus className="w-3 h-3" />
                People mentioned (not matched)
              </h3>
              <div className="space-y-2">
                {personRefs.map((ref, idx) => (
                  <div key={idx} className="flex items-center gap-2 border border-zinc-200 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900 truncate">{ref.name_hint}</p>
                      {ref.suggested_handle && (
                        <p className="text-xs text-zinc-400 truncate">Suggested: {ref.suggested_handle}</p>
                      )}
                    </div>
                    <button
                      onClick={() => createPersonFromRef(idx, ref)}
                      className="text-xs text-indigo-600 hover:text-indigo-700 px-2 py-1 rounded-md"
                    >
                      Create person
                    </button>
                    <button
                      onClick={() => dismissRef(idx)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 px-1"
                      title="Dismiss"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {discussions.length === 0 && tasks.length === 0 && personRefs.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-4">
              Nothing structured extracted. The transcript is still recorded above.
            </p>
          )}

          {/* TODO note */}
          <p className="text-[11px] text-zinc-400 italic">
            v1: rows are already saved on the backend. Discard removes them. v2 will defer writes until you confirm.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
          <button
            onClick={() => discardAll.mutate()}
            disabled={busy || discardAll.isPending}
            className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-60"
          >
            {discardAll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Discard
          </button>
          <button
            onClick={save}
            disabled={busy}
            className={cn(
              'inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60',
            )}
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
