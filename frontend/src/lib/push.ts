import { push } from './api'

const SUBSCRIPTION_KEY = 'kontakti_push_subscription'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function getVapidPublicKey(): string | undefined {
  return (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || undefined
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!isPushSupported()) return Promise.reject(new Error('Push not supported in this browser'))
  if (registrationPromise) return registrationPromise
  registrationPromise = navigator.serviceWorker.register('/sw.js', { scope: '/' })
  return registrationPromise
}

export async function getSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  try {
    const reg = await registerServiceWorker()
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!isPushSupported()) throw new Error('Web push is not supported in this browser.')
  const vapid = getVapidPublicKey()
  if (!vapid) throw new Error('Missing VITE_VAPID_PUBLIC_KEY. See .env.example to generate keys.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was denied.')

  const reg = await registerServiceWorker()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
    })
  }

  // Send to backend. The backend expects a `token` string — we serialise the
  // subscription endpoint+keys as JSON. The backend can parse this to push.
  const token = JSON.stringify(sub.toJSON())
  await push.register(token)
  localStorage.setItem(SUBSCRIPTION_KEY, token)
  return sub
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const reg = await registerServiceWorker()
  const sub = await reg.pushManager.getSubscription()
  const token = localStorage.getItem(SUBSCRIPTION_KEY)
  if (sub) {
    try { await sub.unsubscribe() } catch { /* ignore */ }
  }
  if (token) {
    try { await push.unregister(token) } catch { /* ignore */ }
  }
  localStorage.removeItem(SUBSCRIPTION_KEY)
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission
}
