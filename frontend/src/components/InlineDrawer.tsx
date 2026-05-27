import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

/**
 * Lightweight slide-up drawer. Renders a fixed backdrop + bottom-anchored
 * panel constrained to the right-side modal width. No third-party deps.
 */
export function InlineDrawer({ open, onClose, title, children, footer, className }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/30"
        onClick={onClose}
      />
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-[70] bg-white rounded-t-2xl shadow-2xl',
          'sm:right-0 sm:inset-x-auto sm:bottom-0 sm:w-full sm:max-w-md',
          'flex flex-col max-h-[85vh] animate-in slide-in-from-bottom duration-200',
          className,
        )}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-100 shrink-0">
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-zinc-100 shrink-0 flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
