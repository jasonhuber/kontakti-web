import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { tasks, type Task, type TaskPriority, type Person, type Company } from '@/lib/api'
import { PersonDetailModal } from './PersonDetailModal'
import { formatRelativeDate, cn } from '@/lib/utils'
import { Plus, CheckSquare, Square, Clock, Loader2, ChevronDown, ChevronRight, User } from 'lucide-react'

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:    'bg-zinc-100 text-zinc-500',
  medium: 'bg-blue-100 text-blue-600',
  high:   'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
}

const PRIORITY_OPTIONS: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

function isPerson(t: Person | Company | null | undefined): t is Person {
  return !!t && 'first_name' in t
}

interface AddTaskRowProps {
  onAdd: (title: string, priority: TaskPriority, dueAt?: string) => void
  isPending: boolean
}

function AddTaskRow({ onAdd, isPending }: AddTaskRowProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueAt, setDueAt] = useState('')

  const submit = () => {
    if (!title.trim()) return
    onAdd(title.trim(), priority, dueAt || undefined)
    setTitle('')
    setPriority('medium')
    setDueAt('')
    setOpen(false)
  }

  return (
    <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Plus className="w-4 h-4 text-zinc-300 shrink-0" />
        <input
          type="text"
          placeholder="Add a task…"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-zinc-400"
        />
        {title && (
          <button
            onClick={submit}
            disabled={isPending}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700 shrink-0"
          >
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
          </button>
        )}
      </div>

      {open && title && (
        <div className="flex items-center gap-3 px-4 pb-3 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <div className="flex gap-1">
            {PRIORITY_OPTIONS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={cn(
                  'text-xs px-2 py-0.5 rounded-md font-medium transition-colors capitalize',
                  priority === p ? PRIORITY_COLORS[p] : 'text-zinc-400 hover:text-zinc-600'
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={dueAt}
            onChange={e => setDueAt(e.target.value)}
            className="text-xs border border-zinc-200 dark:border-zinc-600 rounded px-2 py-0.5 outline-none focus:border-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      )}
    </div>
  )
}

interface TaskRowProps {
  task: Task
  onComplete: () => void
  onReopen: () => void
  completing: boolean
  onPersonClick: (person: Person) => void
}

function TaskRow({ task, onComplete, onReopen, completing, onPersonClick }: TaskRowProps) {
  const isDone = task.completed_at != null
  const isOverdue = !isDone && task.due_at && new Date(task.due_at) < new Date()
  const linked = task.taskable

  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-3 group hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors rounded-xl',
      isDone && 'opacity-50'
    )}>
      <button
        onClick={isDone ? onReopen : onComplete}
        disabled={completing}
        className="mt-0.5 shrink-0 text-zinc-300 hover:text-indigo-500 transition-colors"
      >
        {completing
          ? <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
          : isDone
            ? <CheckSquare className="w-4 h-4 text-indigo-400" />
            : <Square className="w-4 h-4" />
        }
      </button>

      <div className="min-w-0 flex-1">
        <span className={cn(
          'text-sm text-zinc-800 dark:text-zinc-200',
          isDone && 'line-through text-zinc-400 dark:text-zinc-500'
        )}>
          {task.title}
        </span>
        {task.description && (
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-1">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium capitalize', PRIORITY_COLORS[task.priority])}>
            {task.priority}
          </span>
          {task.due_at && (
            <span className={cn('flex items-center gap-1 text-xs', isOverdue ? 'text-red-500' : 'text-zinc-400')}>
              <Clock className="w-3 h-3" />
              {formatRelativeDate(task.due_at)}
            </span>
          )}
          {linked && isPerson(linked) && (
            <button
              onClick={() => onPersonClick(linked as Person)}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              <User className="w-3 h-3" />
              {(linked as Person).full_name}
            </button>
          )}
          {linked && !isPerson(linked) && (linked as Company).name && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              {(linked as Company).name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function TasksPage() {
  const queryClient = useQueryClient()
  const [showCompleted, setShowCompleted] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => tasks.list(),
  })

  const addMutation = useMutation({
    mutationFn: (vars: { title: string; priority: TaskPriority; due_at?: string }) =>
      tasks.create(vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const handleToggle = async (task: Task) => {
    setCompleting(task.id)
    try {
      if (task.completed_at) {
        await tasks.reopen(task.id)
      } else {
        await tasks.complete(task.id)
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    } finally {
      setCompleting(null)
    }
  }

  const allTasks = data ?? []
  const pending   = allTasks.filter(t => !t.completed_at)
  const completed = allTasks.filter(t => t.completed_at)

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Tasks</h1>
          {data && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">
              {pending.length} pending{completed.length > 0 ? `, ${completed.length} done` : ''}
            </p>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-center py-16 text-zinc-400 text-sm">Couldn't load tasks.</p>
      )}

      {!isLoading && !isError && (
        <div className="space-y-2">
          {/* Add task */}
          <AddTaskRow
            onAdd={(title, priority, due_at) => addMutation.mutate({ title, priority, due_at })}
            isPending={addMutation.isPending}
          />

          {/* Pending */}
          {pending.length === 0 && (
            <p className="text-center py-10 text-sm text-zinc-400">No pending tasks. Nice.</p>
          )}
          {pending.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={() => handleToggle(task)}
              onReopen={() => handleToggle(task)}
              completing={completing === task.id}
              onPersonClick={setSelectedPerson}
            />
          ))}

          {/* Completed toggle */}
          {completed.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowCompleted(v => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
              >
                {showCompleted ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {completed.length} completed
              </button>

              {showCompleted && (
                <div className="mt-2 space-y-0.5">
                  {completed.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onComplete={() => handleToggle(task)}
                      onReopen={() => handleToggle(task)}
                      completing={completing === task.id}
                      onPersonClick={setSelectedPerson}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedPerson && (
        <PersonDetailModal
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}
    </div>
  )
}
