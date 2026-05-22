import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { companies, type Company } from '@/lib/api'
import { CompanyDetailModal } from './CompanyDetailModal'
import { AddCompanyModal } from './AddCompanyModal'
import { Building2, Users, Plus, Search } from 'lucide-react'

export function CompaniesPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [showAddCompany, setShowAddCompany] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchInput])

  const params: Record<string, string> = {}
  if (search) params.q = search

  const { data, isLoading, isError } = useQuery({
    queryKey: ['companies', params],
    queryFn: () => companies.list(params),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Companies</h1>
          {data && <p className="text-sm text-zinc-400 mt-0.5">{data.total} companies</p>}
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
            className="w-full text-sm border border-zinc-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
          />
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-zinc-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <div className="text-center py-24 text-zinc-400">
          Couldn't load companies.
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-center py-24 text-zinc-400 text-sm">
          {search ? 'No companies match that search.' : 'No companies yet.'}
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.data.map(company => (
            <button
              key={company.id}
              className="text-left bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all"
              onClick={() => setSelectedCompany(company)}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
                  {company.logo_url
                    ? <img src={company.logo_url} alt={company.name} className="w-9 h-9 rounded-lg object-contain" />
                    : <Building2 className="w-4 h-4 text-zinc-400" />
                  }
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900 truncate">{company.name}</div>
                  {company.domain && (
                    <div className="text-xs text-zinc-400 truncate">{company.domain}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {company.industry && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">{company.industry}</span>
                )}
                {company.people_count != null && (
                  <div className="flex items-center gap-1 text-xs text-zinc-400">
                    <Users className="w-3 h-3" />
                    {company.people_count}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
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
