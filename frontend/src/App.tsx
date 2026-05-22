import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlobalSearch } from '@/components/GlobalSearch'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { PeoplePage } from '@/pages/People'
import { CompaniesPage } from '@/pages/Companies'
import { DiscussionsPage } from '@/pages/Discussions'
import { ActivityFeedPage } from '@/pages/ActivityFeedPage'
import { TasksPage } from '@/pages/TasksPage'
import { auth } from '@/lib/api'
import { Search, Users, Building2, MessageSquare, Settings, Activity, LogOut, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
})

type View = 'people' | 'companies' | 'discussions' | 'tasks' | 'feed'

const NAV: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'people',       label: 'People',       icon: Users },
  { id: 'companies',    label: 'Companies',    icon: Building2 },
  { id: 'discussions',  label: 'Discussions',  icon: MessageSquare },
  { id: 'tasks',        label: 'Tasks',        icon: CheckSquare },
  { id: 'feed',         label: 'Activity',     icon: Activity },
]

function AppShell({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>('people')
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const handleSignOut = async () => {
    try { await auth.logout() } catch { /* ignore */ }
    localStorage.removeItem('kontakti_token')
    onLogout()
  }

  // Close settings dropdown when clicking outside
  useEffect(() => {
    if (!settingsOpen) return
    const handler = () => setSettingsOpen(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [settingsOpen])

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

        <div className="p-3 border-t border-zinc-100 relative">
          <button
            onClick={e => { e.stopPropagation(); setSettingsOpen(v => !v) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>

          {settingsOpen && (
            <div
              className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {view === 'people'      && <PeoplePage />}
        {view === 'companies'   && <CompaniesPage />}
        {view === 'discussions' && <DiscussionsPage />}
        {view === 'tasks'       && <TasksPage />}
        {view === 'feed'        && <ActivityFeedPage />}
      </main>

      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={() => setSearchOpen(false)}
      />
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => {
    // Handle Google OAuth redirect: /app?token=xxx
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      localStorage.setItem('kontakti_token', urlToken)
      window.history.replaceState({}, '', window.location.pathname)
      return urlToken
    }
    return localStorage.getItem('kontakti_token')
  })
  const [authView, setAuthView] = useState<'login' | 'register'>('login')

  useEffect(() => {
    const handler = () => setToken(null)
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const handleAuth = (newToken: string) => setToken(newToken)
  const handleLogout = () => { setToken(null); setAuthView('login') }

  return (
    <QueryClientProvider client={queryClient}>
      {token
        ? <AppShell onLogout={handleLogout} />
        : authView === 'login'
          ? <LoginPage onLogin={handleAuth} onRegisterClick={() => setAuthView('register')} />
          : <RegisterPage onRegister={handleAuth} onLoginClick={() => setAuthView('login')} />
      }
    </QueryClientProvider>
  )
}
