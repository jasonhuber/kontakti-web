// Deep-link helpers for "Send via" actions in the Today inbox and elsewhere.
//
// Each helper takes the person + draft body (already plain text) and returns
// a URL ready to open in a new tab/window. URL encoding handled here.

import type { Person, LogVia } from './api'

function encode(s: string): string {
  return encodeURIComponent(s ?? '')
}

/** Strip a leading @ from a handle. */
function clean(handle?: string): string | undefined {
  if (!handle) return undefined
  return handle.replace(/^@+/, '').trim() || undefined
}

/** Strip non-digits/+ from a phone for sms/tel/wa.me. */
function phoneDigits(phone?: string): string | undefined {
  if (!phone) return undefined
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned || undefined
}

/** wa.me requires digits only, no leading +. */
function waPhone(phone?: string): string | undefined {
  if (!phone) return undefined
  const cleaned = phone.replace(/\D/g, '')
  return cleaned || undefined
}

export function mailto(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encode(subject)}&body=${encode(body)}`
}

export function smsLink(phone: string, body: string): string {
  // iOS uses `&body=`, Android tolerates the same when prefixed by `?`.
  const p = phoneDigits(phone) ?? phone
  return `sms:${p}?body=${encode(body)}`
}

export function whatsappLink(phone: string, body: string): string {
  const p = waPhone(phone) ?? phone
  return `https://wa.me/${p}?text=${encode(body)}`
}

export function instagramProfile(handle: string): string {
  return `https://www.instagram.com/${clean(handle) ?? handle}/`
}

export function facebookProfile(handleOrUrl: string): string {
  if (/^https?:\/\//i.test(handleOrUrl)) return handleOrUrl
  return `https://www.facebook.com/${clean(handleOrUrl) ?? handleOrUrl}`
}

export function telLink(phone: string): string {
  return `tel:${phoneDigits(phone) ?? phone}`
}

export interface DeepLinkResult {
  /** URL to open (or null for in_person/other). */
  url: string | null
  /** Human-readable reason if we can't open. */
  unavailableReason?: string
}

/**
 * Resolve a "Send via X" choice to an actual deep link.
 * Caller handles window.open + logging separately.
 */
export function deepLinkFor(
  via: LogVia,
  person: Person,
  draft: string,
  subject = 'Hello',
): DeepLinkResult {
  switch (via) {
    case 'email': {
      const to = person.email ?? person.emails?.[0]?.value
      if (!to) return { url: null, unavailableReason: 'No email on file' }
      return { url: mailto(to, subject, draft) }
    }
    case 'sms':
    case 'imessage': {
      const phone = person.phone ?? person.phones?.[0]?.value
      if (!phone) return { url: null, unavailableReason: 'No phone on file' }
      return { url: smsLink(phone, draft) }
    }
    case 'phone': {
      const phone = person.phone ?? person.phones?.[0]?.value
      if (!phone) return { url: null, unavailableReason: 'No phone on file' }
      return { url: telLink(phone) }
    }
    case 'whatsapp': {
      const phone = person.whatsapp_phone ?? person.phone ?? person.phones?.[0]?.value
      if (!phone) return { url: null, unavailableReason: 'No WhatsApp number on file' }
      return { url: whatsappLink(phone, draft) }
    }
    case 'instagram': {
      if (!person.instagram_handle) {
        return { url: null, unavailableReason: 'No Instagram handle on file' }
      }
      // IG has no DM deep-link; open profile so the user can DM from there.
      return { url: instagramProfile(person.instagram_handle) }
    }
    case 'facebook': {
      if (!person.facebook_url) {
        return { url: null, unavailableReason: 'No Facebook profile on file' }
      }
      return { url: facebookProfile(person.facebook_url) }
    }
    case 'in_person':
    case 'other':
    default:
      return { url: null }
  }
}
