import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notes, type Note } from '@/lib/api'
import { Save, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  note?: Note
  notableType?: string
  notableId?: string
  onSaved?: (note: Note) => void
  className?: string
}

export function NoteEditor({ note, notableType, notableId, onSaved, className }: Props) {
  const queryClient = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: (body: string) =>
      note
        ? notes.update(note.id, { body })
        : notes.create({ body, notable_type: notableType, notable_id: notableId }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      onSaved?.(saved)
    },
  })

  const exportMutation = useMutation({
    mutationFn: (id: string) => notes.exportToObsidian(id),
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Start writing... (Markdown supported)' }),
    ],
    content: note?.body ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[200px] p-4',
      },
    },
  })

  const handleSave = () => {
    if (!editor) return
    const body = editor.getHTML()
    saveMutation.mutate(body)
  }

  const handleExport = () => {
    if (note) exportMutation.mutate(note.id)
  }

  return (
    <div className={cn('border border-zinc-200 rounded-xl overflow-hidden', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 bg-zinc-50">
        <div className="flex items-center gap-1">
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBold().run()}
            active={editor?.isActive('bold')}
            title="Bold"
          >
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            active={editor?.isActive('italic')}
            title="Italic"
          >
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            active={editor?.isActive('bulletList')}
            title="Bullet list"
          >
            •
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            active={editor?.isActive('orderedList')}
            title="Numbered list"
          >
            1.
          </ToolbarButton>
        </div>

        <div className="flex items-center gap-2">
          {note?.sync_status && (
            <span className={cn(
              'text-xs',
              note.sync_status === 'synced' ? 'text-green-500' : 'text-zinc-400'
            )}>
              {note.sync_status === 'synced' ? 'Synced' : 'Unsynced'}
            </span>
          )}
          {note && (
            <button
              onClick={handleExport}
              disabled={exportMutation.isPending}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
              title="Export to Obsidian"
            >
              <Download className="w-3 h-3" />
              Obsidian
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1 text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-md hover:bg-indigo-700 transition-colors"
          >
            <Save className="w-3 h-3" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarButton({
  children, onClick, active, title,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'w-7 h-7 rounded text-xs flex items-center justify-center transition-colors',
        active ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-500 hover:bg-zinc-100'
      )}
    >
      {children}
    </button>
  )
}
