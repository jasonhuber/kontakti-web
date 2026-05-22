import { useState } from 'react'
import { auth } from '@/lib/api'

interface Props {
  onLogin: (token: string) => void
  onRegisterClick?: () => void
}

export function LoginPage({ onLogin, onRegisterClick }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { token } = await auth.login(email, password)
      localStorage.setItem('kontakti_token', token)
      onLogin(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex items-start justify-center pt-32">
      <div className="w-full max-w-sm mx-auto px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4">
            <span className="text-white text-xl font-bold">K</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Kontakti</h1>
          <p className="text-sm text-zinc-500 mt-1">Personal relationship intelligence</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        {onRegisterClick && (
          <p className="text-center text-sm text-zinc-500 mt-5">
            Don't have an account?{' '}
            <button onClick={onRegisterClick} className="text-indigo-600 hover:text-indigo-700 font-medium">
              Create one
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
