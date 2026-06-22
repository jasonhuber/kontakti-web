import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { notes, type Note } from '@/lib/api'
import { NoteEditor } from '@/components/NoteEditor'
import { Plus, FileText, Loader2, Search } from 'lucide-react'
import { formatRelativeDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

export function NotesPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['notes', search],
    queryFn: () => notes.list(search ? { q: search } : undefined),
  })

  const noteList = data?.data ?? []

  function handleSelect(note: Note) {
    setSelectedNote(note)
    setCreating(false)
  }

  function handleNew() {
    setSelectedNote(null)
    setCreating(true)
  }

  function handleSaved(saved: Note) {
    setSelectedNote(saved)
    setCreating(false)
  }

  function handleDeleted(_id: string) {
    setSelectedNote(null)
    queryClient.invalidateQueries({ queryKey: ['notes'] })
  }

  return (
    <div className="flex h-full">
      {/* Left: note list */}
      <div className="w-72 border-r border-zinc-200 dark:border-zinc-700 flex flex-col shrink-0 bg-white dark:bg-zinc-900">
        <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Notes</h1>
            <button
              onClick={handleNew}
              className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
          )}
          {!isLoading && noteList.length === 0 && (
            <div className="text-center py-12 px-4 text-zinc-400 text-sm">
              {search ? 'No notes match that search.' : 'No notes yet — create your first one.'}
            </div>
          )}
          {noteList.map(note => (
            <button
              key={note.id}
              className={cn(
                'w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 transition-colors',
                selectedNote?.id === note.id ? 'bg-indigo-50 dark:bg-indigo-900/40' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
              )}
              onClick={() => handleSelect(note)}
            >
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {note.title || 'Untitled'}
              </p>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2">
                {note.body.replace(/<[^>]+>/g, '').slice(0, 80) || '—'}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    note.notable_label
                      ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300'
                      : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
                  )}
                >
                  {note.notable_label ? `↳ ${note.notable_label}` : 'Unfiled'}
                </span>
                <span className="text-xs text-zinc-300 dark:text-zinc-600">{formatRelativeDate(note.updated_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedNote && !creating && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 dark:text-zinc-500">
            <FileText className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        )}
        {(selectedNote || creating) && (
          <div className="max-w-2xl">
            <NoteEditor
              key={selectedNote?.id ?? 'new'}
              note={selectedNote ?? undefined}
              onSaved={handleSaved}
              onDelete={handleDeleted}
            />
          </div>
        )}
      </div>
    </div>
  )
}
