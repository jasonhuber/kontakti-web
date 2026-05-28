import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { people, type PersonPhoto } from '@/lib/api'
import { Image as ImageIcon, Loader2, Star, Trash2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  personId: string
  /** When true, shows the upload / drag-drop / paste affordances. */
  editable?: boolean
}

/**
 * Horizontal photo strip for a contact. Renders the primary first, then the
 * rest. In editable mode also exposes:
 *  - drag-and-drop a file or files anywhere on the strip
 *  - click-to-pick from disk
 *  - paste an image from the clipboard (Cmd/Ctrl+V while the strip is focused)
 *  - per-photo "set primary" star + delete
 */
export function PhotoGallery({ personId, editable = false }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { data: photos } = useQuery({
    queryKey: ['person-photos', personId],
    queryFn: () => people.listPhotos(personId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['person-photos', personId] })
    qc.invalidateQueries({ queryKey: ['person', personId] })
    qc.invalidateQueries({ queryKey: ['people'] })
  }

  const uploadFile = useMutation({
    mutationFn: (file: File) => people.uploadPhoto(personId, file, 'manual_upload'),
    onSuccess: invalidate,
    onError: (e) => setUploadError(e instanceof Error ? e.message : 'Upload failed'),
  })

  const uploadData = useMutation({
    mutationFn: (data: string) => people.uploadPhotoData(personId, data, 'paste'),
    onSuccess: invalidate,
    onError: (e) => setUploadError(e instanceof Error ? e.message : 'Upload failed'),
  })

  const removeMut = useMutation({
    mutationFn: (photoId: string) => people.removePhoto(personId, photoId),
    onSuccess: invalidate,
  })

  const setPrimaryMut = useMutation({
    mutationFn: (photoId: string) => people.setPrimaryPhoto(personId, photoId),
    onSuccess: invalidate,
  })

  function handleFiles(list: FileList | File[] | null | undefined) {
    if (!list) return
    setUploadError(null)
    const files = Array.from(list).filter(f => f.type.startsWith('image/'))
    for (const f of files) uploadFile.mutate(f)
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (!editable) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.kind !== 'file' || !item.type.startsWith('image/')) continue
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        uploadFile.mutate(file)
      }
    }
  }

  const list = photos ?? []
  const sorted = [...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))

  return (
    <div
      tabIndex={editable ? 0 : -1}
      onPaste={handlePaste}
      onDragOver={editable ? (e) => { e.preventDefault(); setDragOver(true) } : undefined}
      onDragLeave={editable ? () => setDragOver(false) : undefined}
      onDrop={editable ? (e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      } : undefined}
      className={cn(
        'rounded-xl outline-none',
        editable && 'focus:ring-2 focus:ring-indigo-200',
        editable && dragOver && 'ring-2 ring-indigo-400 bg-indigo-50/40',
      )}
    >
      {sorted.length === 0 && !editable && null}

      {(sorted.length > 0 || editable) && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {sorted.map(photo => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              editable={editable}
              onSetPrimary={() => setPrimaryMut.mutate(photo.id)}
              onRemove={() => removeMut.mutate(photo.id)}
              busy={setPrimaryMut.isPending || removeMut.isPending}
            />
          ))}

          {editable && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadFile.isPending}
              className="shrink-0 w-20 h-20 rounded-lg border-2 border-dashed border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/30 flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-indigo-500 transition-colors disabled:opacity-50"
              title="Upload, drag a file, or paste an image"
            >
              {uploadFile.isPending || uploadData.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Upload className="w-4 h-4" />}
              <span className="text-[10px]">
                {uploadFile.isPending || uploadData.isPending ? 'Uploading' : 'Add photo'}
              </span>
            </button>
          )}
        </div>
      )}

      {editable && sorted.length === 0 && (
        <p className="text-[11px] text-zinc-400 mt-1.5">
          Drag &amp; drop, paste from clipboard, or click "Add photo".
        </p>
      )}

      {uploadError && (
        <div className="mt-2 flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = '' // allow re-selecting the same file
        }}
      />
    </div>
  )
}

function PhotoTile({
  photo,
  editable,
  onSetPrimary,
  onRemove,
  busy,
}: {
  photo: PersonPhoto
  editable: boolean
  onSetPrimary: () => void
  onRemove: () => void
  busy: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="relative shrink-0 group">
      <a href={photo.url} target="_blank" rel="noopener noreferrer">
        <img
          src={photo.url}
          alt=""
          className={cn(
            'w-20 h-20 rounded-lg object-cover border',
            photo.is_primary ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-zinc-200',
          )}
          onError={(e) => {
            // Broken external URL — show a placeholder so the gallery doesn't
            // collapse to a 0×0 square.
            (e.currentTarget as HTMLImageElement).style.display = 'none'
            const parent = (e.currentTarget as HTMLImageElement).parentElement
            if (parent && !parent.querySelector('.broken-placeholder')) {
              const span = document.createElement('span')
              span.className = 'broken-placeholder w-20 h-20 rounded-lg bg-zinc-100 text-zinc-300 flex items-center justify-center border border-zinc-200'
              span.textContent = '?'
              parent.appendChild(span)
            }
          }}
        />
      </a>
      {photo.is_primary && (
        <span
          className="absolute -top-1 -left-1 bg-indigo-600 text-white rounded-full p-0.5"
          title="Primary photo"
        >
          <Star className="w-3 h-3 fill-current" />
        </span>
      )}
      {editable && (
        <div className="absolute top-1 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!photo.is_primary && (
            <button
              type="button"
              onClick={onSetPrimary}
              disabled={busy}
              title="Make primary"
              className="w-5 h-5 rounded-full bg-white/90 hover:bg-white text-zinc-600 hover:text-indigo-600 shadow flex items-center justify-center"
            >
              <Star className="w-3 h-3" />
            </button>
          )}
          {confirming ? (
            <button
              type="button"
              onClick={() => { setConfirming(false); onRemove() }}
              disabled={busy}
              title="Confirm delete"
              className="w-5 h-5 rounded-full bg-red-600 hover:bg-red-700 text-white shadow flex items-center justify-center"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              title="Delete"
              className="w-5 h-5 rounded-full bg-white/90 hover:bg-white text-zinc-600 hover:text-red-600 shadow flex items-center justify-center"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {confirming && (
            <button
              type="button"
              onClick={() => setConfirming(false)}
              title="Cancel"
              className="w-5 h-5 rounded-full bg-white/90 hover:bg-white text-zinc-600 shadow flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Re-export for tree-shaking visibility
export type { PersonPhoto }
export const PhotoIcon = ImageIcon
