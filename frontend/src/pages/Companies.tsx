import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { companies, type Company, type Person } from '@/lib/api'
import { CompanyDetailModal } from './CompanyDetailModal'
import { AddCompanyModal } from './AddCompanyModal'
import { Building2, Plus, Search, Loader2 } from 'lucide-react'

const PEOPLE_PREVIEW = 4

function CompanyPeopleList({ companyId }: { companyId: string }) {
  const { data: people, isLoading } = useQuery<Person[]>({
    queryKey: ['company-people', companyId],
    queryFn: () => companies.people(companyId),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) {
    return <div className="mt-2 h-4 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse w-24" />
  }

  if (!people || people.length === 0) return null

  const visible = people.slice(0, PEOPLE_PREVIEW)
  const extra = people.length - PEOPLE_PREVIEW

  return (
    <div className="mt-2 space-y-0">
      {visible.map((p: Person) => (
        <div key={p.id} className="flex items-baseline gap-1 py-0.5">
          <span className="text-xs text-zinc-700 dark:text-zinc-300 truncate leading-snug">{p.full_name}</span>
          {p.title && (
            <>
              <span className="text-xs text-zinc-300 dark:text-zinc-600 shrink-0">·</span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 truncate leading-snug">{p.title}</span>
            </>
          )}
        </div>
      ))}
      {extra > 0 && (
        <div className="py-0.5 text-xs text-zinc-400">+{extra} more</div>
      )}
    </div>
  )
}

interface CompaniesPageProps {
  openCompanyId?: string | null
  onCompanyOpened?: () => void
}

export function CompaniesPage({ openCompanyId, onCompanyOpened }: CompaniesPageProps = {}) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const [page, setPage] = useState(1)
  const [allCompanies, setAllCompanies] = useState<Company[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Deep-link: open a specific company from search navigation
  const { data: deepLinkCompany } = useQuery({
    queryKey: ['company', openCompanyId],
    queryFn: () => companies.get(openCompanyId!),
    enabled: !!openCompanyId,
    staleTime: 5_000,
  })
  useEffect(() => {
    if (deepLinkCompany) {
      setSelectedCompany(deepLinkCompany)
      onCompanyOpened?.()
    }
  }, [deepLinkCompany, onCompanyOpened])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  // Reset pagination when search changes
  useEffect(() => {
    setPage(1)
    setAllCompanies([])
  }, [search])

  const params: Record<string, string> = { page: String(page) }
  if (search) params.q = search

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['companies', params],
    queryFn: () => companies.list(params),
  })

  // Accumulate pages
  useEffect(() => {
    if (!data) return
    if (page === 1) {
      setAllCompanies(data.data)
    } else {
      setAllCompanies(prev => [...prev, ...data.data])
    }
  }, [data, page])

  const hasMore = data ? data.current_page < data.last_page : false

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Companies</h1>
          {data && <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">{data.total} companies</p>}
        </div>
        <button
          onClick={() => setShowAddCompany(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add company
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search companies..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>
      </div>

      {isLoading && allCompanies.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-100 dark:bg-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-24 text-zinc-400">
          Couldn't load companies.
        </div>
      )}

      {!isLoading && allCompanies.length === 0 && (
        <div className="text-center py-24 text-zinc-400 text-sm">
          {search ? 'No companies match that search.' : 'No companies yet.'}
        </div>
      )}

      {allCompanies.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {allCompanies.map(company => (
              <button
                key={company.id}
                className="text-left bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
                onClick={() => setSelectedCompany(company)}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    {company.logo_url
                      ? <img src={company.logo_url} alt={company.name} className="w-9 h-9 rounded-lg object-contain" />
                      : <Building2 className="w-4 h-4 text-zinc-400" />
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{company.name}</div>
                    {company.domain && (
                      <div className="text-xs text-zinc-400 dark:text-zinc-500 truncate">{company.domain}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {company.industry && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">{company.industry}</span>
                  )}
                </div>
                {company.people_count != null && company.people_count > 0 && (
                  <CompanyPeopleList companyId={company.id} />
                )}
              </button>
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={isFetching}
                className="flex items-center gap-2 mx-auto text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {isFetching ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {selectedCompany && (
        <CompanyDetailModal company={selectedCompany} onClose={() => setSelectedCompany(null)} />
      )}

      {showAddCompany && (
        <AddCompanyModal onClose={() => setShowAddCompany(false)} />
      )}
    </div>
  )
}
