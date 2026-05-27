import { useState } from 'react'
import { type ContactPrompt } from '@/lib/api'
import { QuizCard } from '@/components/QuizSection'
import { ChevronLeft, ChevronRight, X as XIcon } from 'lucide-react'

interface Props {
  prompts: ContactPrompt[]
  onClose: () => void
}

export function QuizSessionPage({ prompts, onClose }: Props) {
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState(0)

  const total = prompts.length
  const current = prompts[index]
  const done = index >= total

  function advance() {
    setCompleted(c => c + 1)
    setIndex(i => i + 1)
  }

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/95 backdrop-blur-sm flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIndex(i => Math.max(0, i - 1))}
            disabled={index === 0}
            className="text-zinc-300 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium">
            {done ? 'Done' : `${index + 1} of ${total}`}
          </span>
        </div>
        <button onClick={onClose} className="text-zinc-300 hover:text-white transition-colors">
          <XIcon className="w-5 h-5" />
        </button>
      </header>

      {/* Progress bar */}
      <div className="px-6">
        <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-all duration-300"
            style={{ width: `${total ? Math.min(100, (index / total) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Body */}
      <main className="flex-1 flex items-center justify-center px-6">
        {done ? (
          <div className="text-center text-white max-w-md">
            <h2 className="text-2xl font-semibold mb-2">Thanks!</h2>
            <p className="text-zinc-300 mb-6">
              You saved {completed} answer{completed === 1 ? '' : 's'}. Your network just got a little smarter.
            </p>
            <button
              onClick={onClose}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
            >
              Back to Today
            </button>
          </div>
        ) : current ? (
          <div className="w-full max-w-md">
            <QuizCard
              key={current.id}
              prompt={current}
              onDone={advance}
              onSkipped={() => setIndex(i => i + 1)}
              compact={false}
            />
          </div>
        ) : null}
      </main>

      {/* Footer nav */}
      {!done && (
        <footer className="px-6 py-4 flex items-center justify-end text-white">
          <button
            onClick={() => setIndex(i => i + 1)}
            className="inline-flex items-center gap-1 text-sm text-zinc-300 hover:text-white"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </footer>
      )}
    </div>
  )
}
