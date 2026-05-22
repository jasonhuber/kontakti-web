import { useQuery } from '@tanstack/react-query'
import { get } from '@/lib/api'
import { formatRelativeDate, cn } from '@/lib/utils'
import { User, Building2, Briefcase, MessageSquare, FileText, CheckSquare, Edit } from 'lucide-react'

interface FeedItem {
  id: string
  subject_type: string
  subject_id: string
  verb: string
  object_type?: string
  object_id?: string
  payload: Record<string, unknown>
  created_at: string
}

const VERB_LABELS: Record<string, string> = {
  created: 'created',
  updated: 'updated',
  contacted: 'contacted',
  stage_changed: 'moved',
  note_added: 'added note to',
  task_completed: 'completed task on',
}

const SUBJECT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  person: User,
  company: Building2,
  deal: Briefcase,
  discussion: MessageSquare,
  note: FileText,
  task: CheckSquare,
}

function FeedItemRow({ item }: { item: FeedItem }) {
  const subjectType = item.subject_type.split('\\').pop()?.toLowerCase() ?? 'item'
  const Icon = SUBJECT_ICONS[subjectType] ?? Edit

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-zinc-500" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm text-zinc-700">
          <span className="font-medium capitalize">{subjectType} </span>
          <span className="text-zinc-500">{VERB_LABELS[item.verb] ?? item.verb}</span>
          {typeof item.payload?.title === 'string' && (
            <span className="font-medium"> &ldquo;{item.payload.title}&rdquo;</span>
          )}
          {item.verb === 'stage_changed' && typeof item.payload?.from === 'string' && typeof item.payload?.to === 'string' && (
            <span className="text-zinc-500"> from <span className="font-medium">{item.payload.from}</span> to <span className="font-medium">{item.payload.to}</span></span>
          )}
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">{formatRelativeDate(item.created_at)}</p>
      </div>
    </div>
  )
}

interface Props {
  subjectType?: string
  subjectId?: string
  className?: string
}

export function ActivityFeed({ subjectType, subjectId, className }: Props) {
  const params: Record<string, string> = {}
  if (subjectType) params.subject_type = subjectType
  if (subjectId) params.subject_id = subjectId

  const { data, isLoading } = useQuery({
    queryKey: ['feed', subjectType, subjectId],
    queryFn: () => get<FeedItem[]>('/feed', params),
    refetchInterval: 30_000,
  })

  const items = data ?? []

  return (
    <div className={cn('', className)}>
      {isLoading && (
        <div className="py-8 text-center text-sm text-zinc-400">Loading...</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="py-8 text-center text-sm text-zinc-400">No activity yet</div>
      )}

      {items.length > 0 && (
        <div className="divide-y divide-zinc-100">
          {items.map((item) => (
            <FeedItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
