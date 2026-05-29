import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { GlobalSearch } from '@/components/GlobalSearch'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { PeoplePage } from '@/pages/People'
import { CompaniesPage } from '@/pages/Companies'
import { DiscussionsPage } from '@/pages/Discussions'
import { ActivityFeedPage } from '@/pages/ActivityFeedPage'
import { TasksPage } from '@/pages/TasksPage'
import { NotesPage } from '@/pages/NotesPage'
import { DuplicatesPage } from '@/pages/DuplicatesPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TodayPage } from '@/pages/TodayPage'
import { SocialGroupsPage } from '@/pages/SocialGroupsPage'
import { ReviewContactsPage } from '@/pages/ReviewContactsPage'
import { auth, duplicates, today as todayApi, people as peopleApi } from '@/lib/api'
import { isPushSupported, registerServiceWorker } from '@/lib/push'
import { VoiceCaptureFlow } from '@/components/VoiceCaptureFlow'
import {
  Search, Users, Building2, Share2, Settings, Activity, LogOut, Mic,
  CheckSquare, FileText, Copy, Sunrise, UsersRound, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000 } },
})

type View =
  | 'today' | 'people' | 'companies' | 'discussions' | 'tasks' | 'notes' | 'feed'
  | 'groups' | 'duplicates' | 'review' | 'settings'

const NAV: { id: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'today',        label: 'Today',        icon: Sunrise },
  { id: 'people',       label: 'People',       icon: Users },
  { id: 'companies',    label: 'Companies',    icon: Building2 },
  { id: 'discussions',  label: 'Discussions',  icon: Share2 },
  { id: 'tasks',        label: 'Tasks',        icon: CheckSquare },
  { id: 'notes',        label: 'Notes',        icon: FileText },
  { id: 'feed',         label: 'Activity',     icon: Activity },
  { id: 'groups',       label: 'Groups',       icon: UsersRound },
  { id: 'duplicates',   label: 'Duplicates',   icon: Copy },
  { id: 'review',       label: 'Review',       icon: ShieldCheck },
  { id: 'settings',     label: 'Settings',     icon: Settings },
]

function AppShell({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>('today')
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)

  // Register service worker (silent if unsupported / no VAPID key).
  useEffect(() => {
    if (isPushSupported()) {
      registerServiceWorker().catch(() => undefined)
    }
  }, [])

  const handleSignOut = async () => {
    try { await auth.logout() } catch { /* ignore */ }
    localStorage.removeItem('kontakti_token')
    onLogout()
  }

  // Review queue badge — 60s stale.
  const { data: healthData } = useQuery({
    queryKey: ['people-health'],
    queryFn: () => peopleApi.health(),
    staleTime: 60_000,
  })
  const reviewCount = healthData?.buckets?.needs_review?.count ?? 0

  // Pending duplicates badge — small, 60s stale.
  const { data: pendingDups } = useQuery({
    queryKey: ['duplicates', 'pending'],
    queryFn: () => duplicates.list('pending'),
    staleTime: 60_000,
  })
  const duplicateCount = pendingDups?.total ?? 0

  // Today inbox count badge — 60s stale.
  const { data: todayItems } = useQuery({
    queryKey: ['today'],
    queryFn: () => todayApi.list(20),
    staleTime: 60_000,
  })
  const todayCount = todayItems?.count ?? todayItems?.items?.length ?? 0

  // Close user menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return
    const handler = () => setMenuOpen(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuOpen])

  return (
    <div className="flex h-screen bg-zinc-50 font-sans">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-zinc-200 flex flex-col shrink-0">
        <div className="px-4 py-5 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="Kontakti" className="w-7 h-7" />
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
              <span className="flex-1 text-left">{label}</span>
              {id === 'duplicates' && duplicateCount > 0 && (
                <span className="ml-auto text-[10px] font-semibold bg-indigo-600 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {duplicateCount}
                </span>
              )}
              {id === 'review' && reviewCount > 0 && (
                <span className="ml-auto text-[10px] font-semibold bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {reviewCount}
                </span>
              )}
              {id === 'today' && todayCount > 0 && (
                <span className="ml-auto text-[10px] font-semibold bg-amber-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {todayCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-zinc-100 relative">
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:bg-zinc-50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Account
          </button>

          {menuOpen && (
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
        {view === 'today'       && <TodayPage />}
        {view === 'people'      && <PeoplePage />}
        {view === 'companies'   && <CompaniesPage />}
        {view === 'discussions' && <DiscussionsPage />}
        {view === 'tasks'       && <TasksPage />}
        {view === 'notes'       && <NotesPage />}
        {view === 'feed'        && <ActivityFeedPage />}
        {view === 'groups'      && <SocialGroupsPage />}
        {view === 'duplicates'  && <DuplicatesPage />}
        {view === 'review'      && <ReviewContactsPage />}
        {view === 'settings'    && <SettingsPage />}
      </main>

      <GlobalSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onNavigate={() => setSearchOpen(false)}
      />

      {/* Global voice memo FAB */}
      <button
        onClick={() => setVoiceOpen(true)}
        title="Voice memo"
        aria-label="Record voice memo"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 text-white flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
      >
        <Mic className="w-6 h-6" />
      </button>

      {voiceOpen && (
        <VoiceCaptureFlow onClose={() => setVoiceOpen(false)} />
      )}
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
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('kontakti_onboarded'))
  const [authView, setAuthView] = useState<'login' | 'register'>('login')

  useEffect(() => {
    const handler = () => setToken(null)
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  // Sync onboarded state from the server in case localStorage was cleared.
  // If the user already has onboarded_at set server-side, skip the wizard.
  useEffect(() => {
    if (!token || onboarded) return
    auth.me().then(user => {
      if ((user as Record<string, unknown>).onboarded_at) {
        localStorage.setItem('kontakti_onboarded', '1')
        setOnboarded(true)
      }
    }).catch(() => { /* ignore — we'll just show onboarding */ })
  }, [token, onboarded])

  const handleAuth = (newToken: string) => setToken(newToken)
  const handleLogout = () => { setToken(null); setAuthView('login') }
  const handleOnboardingComplete = () => {
    localStorage.setItem('kontakti_onboarded', '1')
    setOnboarded(true)
  }

  return (
    <QueryClientProvider client={queryClient}>
      {!token
        ? (authView === 'login'
            ? <LoginPage onLogin={handleAuth} onRegisterClick={() => setAuthView('register')} />
            : <RegisterPage onRegister={handleAuth} onLoginClick={() => setAuthView('login')} />)
        : !onboarded
          ? <OnboardingPage onComplete={handleOnboardingComplete} />
          : <AppShell onLogout={handleLogout} />
      }
    </QueryClientProvider>
  )
}
