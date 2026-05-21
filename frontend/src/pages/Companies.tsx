import { useQuery } from '@tanstack/react-query'
import { companies } from '@/lib/api'
import { Building2, Users, Loader2, Plus } from 'lucide-react'

export function CompaniesPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['companies'],
    queryFn: () => companies.list(),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Companies</h1>
          {data && <p className="text-sm text-zinc-400 mt-0.5">{data.total} companies</p>}
        </div>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          Add company
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading...
        </div>
      )}

      {isError && (
        <div className="text-center py-24 text-zinc-400">
          Couldn't load companies.
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="text-center py-24 text-zinc-400 text-sm">
          No companies yet.
        </div>
      )}

      {data && data.data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.data.map(company => (
            <button
              key={company.id}
              className="text-left bg-white border border-zinc-200 rounded-xl p-4 hover:border-zinc-300 hover:shadow-sm transition-all"
              onClick={() => console.log('open', company.id)}
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
                  {company.industry && (
                    <div className="text-xs text-zinc-400 truncate">{company.industry}</div>
                  )}
                </div>
              </div>
              {company.people_count != null && (
                <div className="flex items-center gap-1 text-xs text-zinc-400">
                  <Users className="w-3 h-3" />
                  {company.people_count} {company.people_count === 1 ? 'person' : 'people'}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
