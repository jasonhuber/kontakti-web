import { useCallback, useEffect, useRef, useState } from 'react'
import { auth } from '@/lib/api'

interface Props {
  onLogin: (token: string) => void
  onRegisterClick?: () => void
}

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    ux_mode?: 'popup' | 'redirect'
  }): void
  renderButton(parent: HTMLElement, options: {
    theme?: 'outline' | 'filled_blue' | 'filled_black'
    size?: 'large' | 'medium' | 'small'
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
    shape?: 'rectangular' | 'pill' | 'circle' | 'square'
    logo_alignment?: 'left' | 'center'
    width?: number
  }): void
}

interface GoogleIdentityWindow {
  google?: {
    accounts?: {
      id?: GoogleAccountsId
    }
  }
}

function getGoogleAccountsId() {
  return (window as unknown as GoogleIdentityWindow).google?.accounts?.id
}

function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  return new Promise((resolve, reject) => {
    const existingClient = getGoogleAccountsId()
    if (existingClient) {
      resolve(existingClient)
      return
    }

    const existingScript = document.querySelector<HTMLScriptElement>('script[src*="accounts.google.com/gsi/client"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        const client = getGoogleAccountsId()
        client ? resolve(client) : reject(new Error('Google Sign-In did not initialize'))
      }, { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      const client = getGoogleAccountsId()
      client ? resolve(client) : reject(new Error('Google Sign-In did not initialize'))
    }
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'))
    document.head.appendChild(script)
  })
}

export function LoginPage({ onLogin, onRegisterClick }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

  const handleGoogleCredential = useCallback(async (credential?: string) => {
    if (!credential) {
      setError('No Google credential received.')
      return
    }

    setError(null)
    setLoading(true)
    try {
      const { token } = await auth.loginWithGoogle(credential)
      localStorage.setItem('kontakti_token', token)
      onLogin(token)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google login failed')
    } finally {
      setLoading(false)
    }
  }, [onLogin])

  useEffect(() => {
    if (!googleClientId) return

    let cancelled = false

    loadGoogleIdentity()
      .then((googleId) => {
        if (cancelled || !googleButtonRef.current) return

        googleButtonRef.current.innerHTML = ''
        googleId.initialize({
          client_id: googleClientId,
          callback: (response) => void handleGoogleCredential(response.credential),
          ux_mode: 'popup',
        })
        googleId.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: googleButtonRef.current.offsetWidth || 304,
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load Google Sign-In')
        }
      })

    return () => {
      cancelled = true
    }
  }, [googleClientId, handleGoogleCredential])

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
    <div className="min-h-screen bg-zinc-50 flex items-start justify-center pt-20">
      <div className="w-full max-w-sm mx-auto px-4">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img
            src="/favicon.svg"
            alt="Kontakti"
            className="w-24 h-24 mb-5 drop-shadow-sm"
          />
          <h1 className="text-2xl font-bold text-zinc-900">Kontakti</h1>
          <p className="text-sm text-zinc-400 mt-1 mb-4">Personal relationship intelligence</p>
          <blockquote className="text-center px-6">
            <p className="text-sm text-zinc-500 italic leading-relaxed">
              "Your network is your net worth — but only if you actually nurture it."
            </p>
          </blockquote>
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

          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px bg-zinc-200" />
            <span className="text-xs text-zinc-400">or</span>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          <div className="mt-4 min-h-[40px]" ref={googleButtonRef}>
            {!googleClientId && (
              <button
                type="button"
                onClick={() => setError('Google Client ID not configured (VITE_GOOGLE_CLIENT_ID).')}
                className="flex items-center justify-center w-full border border-zinc-200 rounded-lg py-2.5 text-sm font-medium text-zinc-500 bg-zinc-50"
              >
                Continue with Google
              </button>
            )}
          </div>
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
