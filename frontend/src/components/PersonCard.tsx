import { type Person, type RelationshipStrength } from '@/lib/api'
import { STRENGTH_COLORS, STRENGTH_LABELS, formatRelativeDate, cn } from '@/lib/utils'
import { Building2, Clock, Calendar, Ban } from 'lucide-react'

interface Props {
  person: Person
  onClick?: () => void
  compact?: boolean
}

const STRENGTH_DOTS: Record<RelationshipStrength, number> = {
  cold: 1, warm: 2, hot: 3, close: 4,
}

export function PersonCard({ person, onClick, compact }: Props) {
  const initials = makeInitials(person.first_name, person.last_name, person.full_name)

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 text-left hover:bg-zinc-50 rounded-lg px-2 py-1.5 transition-colors w-full"
      >
        <Avatar initials={initials} url={person.avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-zinc-900 truncate">{person.full_name}</span>
            {person.do_not_contact && <DncBadge reason={person.do_not_contact_reason} compact />}
          </div>
          {person.title && <div className="text-xs text-zinc-400 truncate">{person.title}</div>}
        </div>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-3">
        <Avatar initials={initials} url={person.avatar_url} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold text-zinc-900 truncate group-hover:text-indigo-600 transition-colors">
                {person.full_name}
              </span>
              {person.do_not_contact && <DncBadge reason={person.do_not_contact_reason} />}
            </div>
            <StrengthIndicator strength={person.relationship_strength} />
          </div>

          {(person.title || person.company) && (
            <div className="flex items-center gap-1 mt-0.5">
              <Building2 className="w-3 h-3 text-zinc-300 shrink-0" />
              <span className="text-xs text-zinc-500 truncate">
                {[person.title, person.company?.name].filter(Boolean).join(' · ')}
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 mt-2">
            {person.last_contacted_at && (
              <div className="flex items-center gap-1 text-xs text-zinc-400">
                <Clock className="w-3 h-3" />
                {formatRelativeDate(person.last_contacted_at)}
              </div>
            )}
            {person.next_followup_at && (
              <div className={cn(
                'flex items-center gap-1 text-xs',
                new Date(person.next_followup_at) < new Date() ? 'text-red-500' : 'text-zinc-400'
              )}>
                <Calendar className="w-3 h-3" />
                {formatRelativeDate(person.next_followup_at)}
              </div>
            )}
          </div>

          {person.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {person.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs px-1.5 py-0.5 rounded-md bg-zinc-100 text-zinc-500"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

function Avatar({ initials, url, size }: { initials: string; url?: string; size: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={cn(
      'rounded-full bg-indigo-100 flex items-center justify-center shrink-0 font-medium text-indigo-600 overflow-hidden',
      sizeClass,
    )}>
      {url
        ? <img src={url} alt={initials} className={cn('rounded-full object-cover', sizeClass)} />
        : <span className="truncate px-1 select-none">{initials}</span>}
    </div>
  )
}

/**
 * Build a 1-2 character initials string from a person's name. Defensive against
 * missing/empty first or last names — never produces "undefined" leakage.
 */
export function makeInitials(firstName?: string | null, lastName?: string | null, fullName?: string | null): string {
  const first = (firstName ?? '').trim()
  const last  = (lastName  ?? '').trim()
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first)         return first.slice(0, 2).toUpperCase()
  if (last)          return last.slice(0, 2).toUpperCase()
  const full = (fullName ?? '').trim()
  if (full) {
    const parts = full.split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return parts[0].slice(0, 2).toUpperCase()
  }
  return '?'
}

function DncBadge({ reason, compact }: { reason?: string; compact?: boolean }) {
  return (
    <span
      title={reason ? `Do not contact — ${reason}` : 'Do not contact'}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full bg-red-50 text-red-700 border border-red-100 font-medium shrink-0',
        compact ? 'text-[10px] px-1.5 py-0.5' : 'text-[10px] px-1.5 py-0.5',
      )}
    >
      <Ban className="w-2.5 h-2.5" />
      DNC
    </span>
  )
}

function StrengthIndicator({ strength }: { strength: RelationshipStrength }) {
  const count = STRENGTH_DOTS[strength]
  return (
    <div className="flex items-center gap-0.5" title={STRENGTH_LABELS[strength]}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            i <= count ? STRENGTH_COLORS[strength].replace('text-', 'bg-') : 'bg-zinc-200'
          )}
        />
      ))}
    </div>
  )
}
