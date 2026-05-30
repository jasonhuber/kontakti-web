import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  googleAccounts,
  mcp,
  type GoogleAccount,
  type GoogleAccountLabel,
  type McpToken,
} from '@/lib/api'
import {
  Loader2, Mail, Star, Trash2, AlertCircle, Plus, Bell, BellOff,
  Cpu, Copy, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isPushSupported, getNotificationPermission, getSubscription,
  subscribeToPush, unsubscribeFromPush, getVapidPublicKey,
} from '@/lib/push'

// ── GSI types (id_token / credential flow) ───────────────────────────────────

interface CredentialResponse {
  credential: string
  select_by?: string
}

interface GoogleIdNamespace {
  initialize(config: {
    client_id: string
    callback: (r: CredentialResponse) => void
    auto_select?: boolean
    ux_mode?: 'popup' | 'redirect'
    use_fedcm_for_prompt?: boolean
  }): void
  renderButton(parent: HTMLElement, options: {
    type?: 'standard' | 'icon'
    theme?: 'outline' | 'filled_blue' | 'filled_black'
    size?: 'large' | 'medium' | 'small'
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
    shape?: 'rectangular' | 'pill' | 'circle' | 'square'
    width?: number | string
  }): void
  prompt(): void
  disableAutoSelect(): void
}

// We access `window.google.accounts.id` via a local cast to avoid colliding
// with the inline declaration in OnboardingPage.tsx.
function getGoogleId(): GoogleIdNamespace | undefined {
  const g = (window as unknown as { google?: { accounts?: { id?: GoogleIdNamespace } } }).google
  return g?.accounts?.id
}

function loadGIS(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (getGoogleId()) { resolve(); return }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load GIS')))
      return
    }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(s)
  })
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Manage integrations and preferences.</p>
      </div>

      <GoogleAccountsSection />

      <McpTokensSection />

      <NotificationsSection />

      <section className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-2 opacity-60">
        <h2 className="text-sm font-semibold text-zinc-900">Obsidian sync</h2>
        <p className="text-xs text-zinc-500">Coming soon.</p>
      </section>
    </div>
  )
}

// ── Notifications section ────────────────────────────────────────────────────

function NotificationsSection() {
  const supported = isPushSupported()
  const hasVapid = !!getVapidPublicKey()
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('unsupported')

  useEffect(() => {
    if (!supported) return
    setPerm(getNotificationPermission())
    getSubscription().then(sub => setEnabled(!!sub)).catch(() => undefined)
  }, [supported])

  const enable = async () => {
    setBusy(true); setErr(null)
    try {
      await subscribeToPush()
      setEnabled(true)
      setPerm(getNotificationPermission())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to enable notifications.')
    } finally { setBusy(false) }
  }

  const disable = async () => {
    setBusy(true); setErr(null)
    try {
      await unsubscribeFromPush()
      setEnabled(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to disable notifications.')
    } finally { setBusy(false) }
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Notifications</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Get web push notifications for follow-ups, birthdays, and signals.
        </p>
      </div>

      {!supported && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          Your browser doesn't support web push notifications.
        </div>
      )}

      {supported && !hasVapid && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          Set <code className="font-mono">VITE_VAPID_PUBLIC_KEY</code> in your env to enable notifications.
          Generate with <code className="font-mono">npx web-push generate-vapid-keys</code>.
        </div>
      )}

      {supported && perm === 'denied' && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          Notifications are blocked in your browser settings. Unblock to enable.
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {enabled
            ? <Bell className="w-4 h-4 text-indigo-600" />
            : <BellOff className="w-4 h-4 text-zinc-400" />}
          <span className="text-zinc-700">
            {enabled ? "On — you'll receive push notifications" : 'Off'}
          </span>
        </div>
        {enabled ? (
          <button
            onClick={disable}
            disabled={busy || !supported}
            className="inline-flex items-center gap-1.5 text-sm border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Turn off
          </button>
        ) : (
          <button
            onClick={enable}
            disabled={busy || !supported || !hasVapid || perm === 'denied'}
            className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Enable notifications
          </button>
        )}
      </div>
    </section>
  )
}

// ── Google accounts section ──────────────────────────────────────────────────

function GoogleAccountsSection() {
  const qc = useQueryClient()
  const { data: accounts, isLoading, isError } = useQuery({
    queryKey: ['google-accounts'],
    queryFn: () => googleAccounts.list(),
  })

  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)

  const linkMut = useMutation({
    mutationFn: ({ id_token, label }: { id_token: string; label: GoogleAccountLabel }) =>
      googleAccounts.link(id_token, label),
    onSuccess: () => {
      setLinkOpen(false)
      setLinkError(null)
      qc.invalidateQueries({ queryKey: ['google-accounts'] })
    },
    onError: (e: unknown) => {
      setLinkError(e instanceof Error ? e.message : 'Failed to link account')
    },
  })

  const hasPersonal = !!accounts?.some(a => a.label === 'personal')
  const defaultLabel: GoogleAccountLabel = hasPersonal ? 'work' : 'personal'

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Linked Google accounts</h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Sync contacts from one or more Gmail accounts.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Failed to load accounts.
        </div>
      )}

      {accounts && accounts.length === 0 && (
        <div className="text-sm text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-3">
          No Google accounts linked yet.
        </div>
      )}

      <div className="space-y-2">
        {accounts?.map(acc => (
          <AccountRow
            key={acc.id}
            account={acc}
            hasSiblings={(accounts.length ?? 0) > 1}
          />
        ))}
      </div>

      {linkError && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{linkError}</span>
        </div>
      )}

      {!linkOpen ? (
        <button
          onClick={() => { setLinkOpen(true); setLinkError(null) }}
          className="inline-flex items-center gap-2 text-sm border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Link another Gmail account
        </button>
      ) : (
        <LinkAccountForm
          defaultLabel={defaultLabel}
          onCancel={() => { setLinkOpen(false); setLinkError(null) }}
          onCredential={(id_token, label) => linkMut.mutate({ id_token, label })}
          linking={linkMut.isPending}
          onError={setLinkError}
        />
      )}
    </section>
  )
}

// ── Account row ──────────────────────────────────────────────────────────────

function AccountRow({ account, hasSiblings }: { account: GoogleAccount; hasSiblings: boolean }) {
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rowError, setRowError] = useState<string | null>(null)

  const updateMut = useMutation({
    mutationFn: (patch: { label?: GoogleAccountLabel; is_primary?: boolean }) =>
      googleAccounts.update(account.id, patch),
    onSuccess: () => {
      setRowError(null)
      qc.invalidateQueries({ queryKey: ['google-accounts'] })
    },
    onError: (e: unknown) => setRowError(e instanceof Error ? e.message : 'Update failed'),
  })

  const unlinkMut = useMutation({
    mutationFn: () => googleAccounts.unlink(account.id),
    onSuccess: () => {
      setRowError(null)
      setConfirmDelete(false)
      qc.invalidateQueries({ queryKey: ['google-accounts'] })
    },
    onError: (e: unknown) => setRowError(e instanceof Error ? e.message : 'Unlink failed'),
  })

  const canUnlink = !(account.is_primary && hasSiblings)
  const lastSynced = account.last_synced_at
    ? new Date(account.last_synced_at).toLocaleString()
    : 'Never synced'

  return (
    <div className="border border-zinc-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      {account.avatar_url ? (
        <img
          src={account.avatar_url}
          alt=""
          className="w-9 h-9 rounded-full bg-zinc-100 shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-zinc-400" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-zinc-900 truncate">{account.email}</span>
          {account.is_primary && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              <Star className="w-2.5 h-2.5" /> Primary
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-400 mt-0.5">{lastSynced}</div>
        {rowError && (
          <div className="text-xs text-red-600 mt-1">{rowError}</div>
        )}
      </div>

      <select
        value={account.label}
        onChange={e => updateMut.mutate({ label: e.target.value as GoogleAccountLabel })}
        disabled={updateMut.isPending}
        className="text-xs border border-zinc-200 rounded-md px-2 py-1 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      >
        <option value="personal">personal</option>
        <option value="work">work</option>
        <option value="other">other</option>
      </select>

      {!account.is_primary && (
        <button
          onClick={() => updateMut.mutate({ is_primary: true })}
          disabled={updateMut.isPending}
          className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50 px-2 py-1 rounded-md"
        >
          Make primary
        </button>
      )}

      {canUnlink ? (
        confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => unlinkMut.mutate()}
              disabled={unlinkMut.isPending}
              className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2 py-1 rounded-md"
            >
              {unlinkMut.isPending ? 'Unlinking…' : 'Confirm'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-zinc-500 hover:text-zinc-700 px-2 py-1 rounded-md"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 px-2 py-1 rounded-md"
          >
            <Trash2 className="w-3.5 h-3.5" /> Unlink
          </button>
        )
      ) : (
        <button
          disabled
          title="Promote another account to primary first"
          className="text-xs text-zinc-300 inline-flex items-center gap-1 px-2 py-1 rounded-md cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" /> Unlink
        </button>
      )}
    </div>
  )
}

// ── Link-account inline form ─────────────────────────────────────────────────

function LinkAccountForm({
  defaultLabel, onCancel, onCredential, linking, onError,
}: {
  defaultLabel: GoogleAccountLabel
  onCancel: () => void
  onCredential: (id_token: string, label: GoogleAccountLabel) => void
  linking: boolean
  onError: (msg: string) => void
}) {
  const [label, setLabel] = useState<GoogleAccountLabel>(defaultLabel)
  const buttonRef = useRef<HTMLDivElement | null>(null)
  const [gsiReady, setGsiReady] = useState(false)
  const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined

  // Keep latest label accessible in the (stable) GSI callback.
  const labelRef = useRef(label)
  useEffect(() => { labelRef.current = label }, [label])

  const handleCredential = useCallback((r: CredentialResponse) => {
    if (!r.credential) {
      onError('No credential returned from Google.')
      return
    }
    onCredential(r.credential, labelRef.current)
  }, [onCredential, onError])

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    loadGIS()
      .then(() => {
        if (cancelled) return
        const gid = getGoogleId()
        if (!gid) { onError('Google Identity Services unavailable'); return }
        gid.initialize({
          client_id: clientId,
          callback: handleCredential,
          auto_select: false,
          ux_mode: 'popup',
        })
        if (buttonRef.current) {
          buttonRef.current.innerHTML = ''
          gid.renderButton(buttonRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: 'continue_with',
            shape: 'rectangular',
          })
        }
        setGsiReady(true)
      })
      .catch(e => onError(e instanceof Error ? e.message : 'Failed to load Google'))
    return () => { cancelled = true }
  }, [clientId, handleCredential, onError])

  const noClient = !clientId

  return (
    <div className="border border-zinc-200 rounded-xl p-4 space-y-3 bg-zinc-50/50">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs text-zinc-600">Label</label>
        <select
          value={label}
          onChange={e => setLabel(e.target.value as GoogleAccountLabel)}
          className="text-xs border border-zinc-200 rounded-md px-2 py-1 bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        >
          <option value="personal">personal</option>
          <option value="work">work</option>
          <option value="other">other</option>
        </select>
        <button
          onClick={onCancel}
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-700 px-2 py-1 rounded-md"
        >
          Cancel
        </button>
      </div>

      {noClient && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
          Set <code className="font-mono">VITE_GOOGLE_WEB_CLIENT_ID</code> in your env to enable account linking.
        </p>
      )}

      <div className="flex items-center gap-3">
        <div ref={buttonRef} />
        {linking && (
          <span className="text-xs text-zinc-500 inline-flex items-center gap-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Linking…
          </span>
        )}
        {!gsiReady && !noClient && !linking && (
          <span className="text-xs text-zinc-400 inline-flex items-center gap-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading Google…
          </span>
        )}
      </div>
    </div>
  )
}

// ── MCP tokens section ───────────────────────────────────────────────────────

function McpTokensSection() {
  const qc = useQueryClient()
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [readOnly, setReadOnly] = useState(false)

  const { data: tokens, isLoading } = useQuery({
    queryKey: ['mcp-tokens'],
    queryFn: () => mcp.listTokens(),
  })

  const createMut = useMutation({
    mutationFn: () => mcp.createToken(undefined, readOnly),
    onSuccess: (r) => {
      setNewTokenValue(r.token)
      setCreateError(null)
      qc.invalidateQueries({ queryKey: ['mcp-tokens'] })
    },
    onError: (e: unknown) => setCreateError(e instanceof Error ? e.message : 'Failed to create token'),
  })

  const revokeMut = useMutation({
    mutationFn: (id: number) => mcp.revokeToken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mcp-tokens'] })
    },
  })

  const copyToken = async () => {
    if (!newTokenValue) return
    await navigator.clipboard.writeText(newTokenValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-zinc-400" />
          MCP access tokens
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Create tokens for Claude Code, Claude Desktop, or Cursor to read and update your contacts via MCP.
          Write actions always preview the change before applying.
        </p>
      </div>

      <div className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2 font-mono">
        <span className="text-zinc-400">URL: </span>https://kontakti.app/api/v1/mcp
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading tokens…
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <div className="space-y-2">
          {tokens.map((t: McpToken) => (
            <div key={t.id} className="flex items-center gap-3 border border-zinc-200 rounded-xl px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-800 truncate">{t.name}</p>
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0',
                    t.abilities?.includes('mcp:write') || t.abilities?.includes('*')
                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                      : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                  )}>
                    {t.abilities?.includes('mcp:write') || t.abilities?.includes('*') ? 'read + write' : 'read-only'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Created {new Date(t.created_at).toLocaleDateString()}
                  {t.last_used_at ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}` : ' · never used'}
                </p>
              </div>
              <button
                onClick={() => revokeMut.mutate(t.id)}
                disabled={revokeMut.isPending}
                className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1 px-2 py-1 rounded-md disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {tokens?.length === 0 && !isLoading && (
        <p className="text-sm text-zinc-400">No MCP tokens yet.</p>
      )}

      {newTokenValue && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-emerald-800">Token created — copy it now, it won't be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono text-zinc-700 bg-white border border-zinc-200 rounded px-2 py-1.5 truncate">
              {newTokenValue}
            </code>
            <button
              onClick={copyToken}
              className="shrink-0 flex items-center gap-1 text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 px-2 py-1.5 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setNewTokenValue(null)}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {createError && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{createError}</span>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="inline-flex items-center gap-2 text-sm border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-60"
        >
          {createMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {createMut.isPending ? 'Creating…' : 'Create MCP token'}
        </button>
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={e => setReadOnly(e.target.checked)}
            className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400"
          />
          Read-only (no write tools)
        </label>
      </div>
    </section>
  )
}

