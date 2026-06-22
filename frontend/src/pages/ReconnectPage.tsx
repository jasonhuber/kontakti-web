import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  people,
  type ReconnectPerson,
  type LogVia,
} from '@/lib/api'
import { PersonDetailModal } from './PersonDetailModal'
import {
  Loader2, Phone, MessageSquare, MessageCircle, Mail, Users, Facebook,
  Instagram, Check, Clock, AlertCircle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const QUICK_OPTIONS: { via: LogVia; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { via: 'phone',     label: 'Called',    icon: Phone },
  { via: 'sms',       label: 'Texted',    icon: MessageSquare },
  { via: 'imessage',  label: 'iMessage',  icon: MessageCircle },
  { via: 'email',     label: 'Emailed',   icon: Mail },
  { via: 'in_person', label: 'In person', icon: Users },
  { via: 'facebook',  label: 'Facebook',  icon: Facebook },
  { via: 'instagram', label: 'Instagram', icon: Instagram },
]

function humanDays(days: number | null): string {
  if (days === null) return 'Never contacted'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.round(days / 7)} weeks ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return `${(days / 365).toFixed(1)} years ago`
}

function cadenceLabel(days: number | null): string {
  if (days === null) return ''
  if (days <= 30) return 'monthly'
  if (days <= 90) return 'quarterly'
  if (days <= 182) return 'twice a year'
  return 'yearly'
}

function ReconnectRow({ person, onOpen }: { person: ReconnectPerson; onOpen: () => void }) {
  const qc = useQueryClient()
  const [logged, setLogged] = useState<LogVia | null>(null)

  const logMut = useMutation({
    mutationFn: (via: LogVia) => people.logContact(person.id, via),
    onSuccess: (_, via) => {
      setLogged(via)
      setTimeout(() => setLogged(null), 2500)
      qc.invalidateQueries({ queryKey: ['reconnect'] })
      qc.invalidateQueries({ queryKey: ['reach-out-suggestions'] })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['person', person.id] })
    },
  })

  const overdue = person.is_overdue
  const daysSince = person.days_since_contact

  return (
    <div className={cn(
      'bg-white dark:bg-zinc-900 border rounded-xl p-4 space-y-3',
      overdue
        ? 'border-amber-200 dark:border-amber-800'
        : 'border-zinc-100 dark:border-zinc-800'
    )}>
      {/* Top row: name + last-contact badge */}
      <div className="flex items-start gap-3">
        <button onClick={onOpen} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {person.full_name}
            </span>
            {person.company && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate">
                · {person.company.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Clock className="w-3 h-3 text-zinc-400 shrink-0" />
            <span className={cn(
              'text-xs',
              overdue ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-zinc-400 dark:text-zinc-500'
            )}>
              {humanDays(daysSince)}
            </span>
            {overdue && person.overdue_by_days && (
              <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-full px-1.5 py-0.5 shrink-0">
                {person.overdue_by_days}d overdue · {cadenceLabel(person.cadence_target_days)}
              </span>
            )}
            {daysSince === null && (
              <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-full px-1.5 py-0.5 shrink-0">
                no record
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Quick-log chips */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK_OPTIONS.map(({ via, label, icon: Icon }) => {
          const isLogged = logged === via
          return (
            <button
              key={via}
              onClick={() => logMut.mutate(via)}
              disabled={logMut.isPending}
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors',
                isLogged
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-indigo-400 hover:text-indigo-600'
              )}
            >
              {isLogged ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
              {isLogged ? 'Done!' : label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ReconnectPage() {
  const qc = useQueryClient()
  const [openPerson, setOpenPerson] = useState<ReconnectPerson | null>(null)
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['reconnect'],
    queryFn: () => people.reconnect({ limit: 100 }),
    staleTime: 30_000,
  })

  const rows = (data?.data ?? []).filter(p =>
    showOverdueOnly ? p.is_overdue : true
  )

  const overdueCount = (data?.data ?? []).filter(p => p.is_overdue).length
  const neverCount   = (data?.data ?? []).filter(p => p.days_since_contact === null).length

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Reconnect</h1>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">
            Contacts sorted by longest silence first
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 rounded-lg"
        >
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {/* Stats chips */}
      {!isLoading && data && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button
            onClick={() => setShowOverdueOnly(false)}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border transition-colors',
              !showOverdueOnly
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
            )}
          >
            All ({data.data.length})
          </button>
          <button
            onClick={() => setShowOverdueOnly(true)}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors',
              showOverdueOnly
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
            )}
          >
            <AlertCircle className="w-3 h-3" />
            Overdue ({overdueCount})
          </button>
          {neverCount > 0 && (
            <span className="inline-flex items-center text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
              {neverCount} never contacted
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-100 rounded-lg px-3 py-2">
          Failed to load. Try refreshing.
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <div className="text-center py-16 text-zinc-400 dark:text-zinc-500">
          <p className="text-sm">{showOverdueOnly ? 'No overdue contacts.' : 'No contacts yet.'}</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map(p => (
          <ReconnectRow
            key={p.id}
            person={p}
            onOpen={() => setOpenPerson(p)}
          />
        ))}
      </div>

      {openPerson && (
        <PersonDetailModal
          person={openPerson}
          onClose={() => {
            setOpenPerson(null)
            qc.invalidateQueries({ queryKey: ['reconnect'] })
          }}
        />
      )}
    </div>
  )
}
