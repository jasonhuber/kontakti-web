import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { people, type Person, type PeopleHealthBucketKey } from '@/lib/api'
import { PersonCard } from '@/components/PersonCard'
import { PersonDetailModal } from './PersonDetailModal'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const BUCKET_LABELS: Record<PeopleHealthBucketKey, string> = {
  needs_review:        'Needs review',
  imported_unreviewed: 'Imported, unreviewed',
  missing_first_name:  'Missing first name',
  missing_last_name:   'Missing last name',
  missing_contact_info:'No email or phone',
  invalid_email:       'Invalid email',
  unlinked_company:    'Unlinked company',
  duplicate_email:     'Duplicate email',
}

export function ReviewContactsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['people-health'],
    queryFn: () => people.health(),
    staleTime: 30_000,
  })

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['people-review', page],
    queryFn: () => people.list({ needs_review: '1', page: String(page) }),
    staleTime: 30_000,
  })

  const reviewMut = useMutation({
    mutationFn: (id: string) => people.review(id),
    onSuccess: (_, id) => {
      setReviewed(prev => new Set([...prev, id]))
      qc.invalidateQueries({ queryKey: ['people-review'] })
      qc.invalidateQueries({ queryKey: ['people-health'] })
    },
  })

  const visiblePeople = (data?.data ?? []).filter(p => !reviewed.has(p.id))
  const hasMore = data ? data.current_page < data.last_page : false
  const totalNeedsReview = health?.buckets?.needs_review?.count ?? 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Review Contacts</h1>
        {totalNeedsReview > 0 && (
          <p className="text-sm text-zinc-400 mt-0.5">{totalNeedsReview} contacts need review</p>
        )}
      </div>

      {/* Health bucket summary */}
      {healthLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : health ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(Object.entries(health.buckets) as [PeopleHealthBucketKey, { count: number }][])
            .filter(([, b]) => b.count > 0)
            .map(([key, bucket]) => (
              <div
                key={key}
                className={cn(
                  'rounded-xl border px-4 py-3',
                  key === 'needs_review'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-white border-zinc-200'
                )}
              >
                <p className={cn(
                  'text-2xl font-semibold',
                  key === 'needs_review' ? 'text-amber-700' : 'text-zinc-900'
                )}>{bucket.count}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{BUCKET_LABELS[key]}</p>
              </div>
            ))}
        </div>
      ) : null}

      {/* Needs-review list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-700">Flagged for review</h2>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && visiblePeople.length === 0 && (
        <div className="text-center py-24">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">No contacts flagged for review.</p>
        </div>
      )}

      {visiblePeople.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visiblePeople.map(person => (
              <div key={person.id} className="relative group">
                <PersonCard person={person} onClick={() => setSelectedPerson(person)} />
                <button
                  onClick={e => { e.stopPropagation(); reviewMut.mutate(person.id) }}
                  disabled={reviewMut.isPending}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded-md shadow disabled:opacity-50"
                >
                  {reviewMut.isPending && reviewMut.variables === person.id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <CheckCircle2 className="w-3 h-3" />}
                  Reviewed
                </button>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isFetching}
                className="flex items-center gap-2 mx-auto text-sm text-zinc-500 hover:text-zinc-700 border border-zinc-200 hover:border-zinc-300 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {isFetching ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
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
