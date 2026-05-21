import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlobalSearch } from '@/components/GlobalSearch'
import { PeoplePage } from '@/pages/People'
import { CompaniesPage } from '@/pages/Companies'
import { Search, Users, Building2, MessageSquare, Settings, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
})

type View = 'people' | 'companies' | 'interactions' | 'feed'

const NAV: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'people',       label: 'People',       icon: Users },
  { id: 'companies',    label: 'Companies',    icon: Building2 },
  { id: 'interactions', label: 'Interactions', icon: MessageSquare },
  { id: 'feed',         label: 'Activity',     icon: Activity },
]

function AppShell() {
  const [view, setView] = useState<View>('people')
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="flex h-screen bg-zinc-50 font-sans">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">K</span>
            </div>
            <span className="font-semibold text-zinc-900 text-sm">Kontakti</span>
          </div>
        </div>

        <div className="p-3">
          <button
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 text-sm text-zinc-400 px-3 py-2 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Search</span>
            <kbd className="text-xs font-mono bg-zinc-100 px-1.5 py-0.5 rounded">⌘K</kbd>
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                view === id
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-zinc-600 hover:bg-zinc-50'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-zinc-100">
          <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-50 transition-colors">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <ViewRouter view={view} />
      </main>

      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={() => setSearchOpen(false)}
      />
    </div>
  )
}

function ViewRouter({ view }: { view: View }) {
  if (view === 'people')       return <PeoplePage />
  if (view === 'companies')    return <CompaniesPage />
  if (view === 'interactions') return <Placeholder title="Interactions" />
  if (view === 'feed')         return <Placeholder title="Activity" />
  return null
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
      <p className="text-zinc-400 mt-1 text-sm">Coming soon.</p>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  )
}
