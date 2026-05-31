import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  people, contactSchedule,
  type Person, type RelationshipStrength, type ContactCadence,
  type PersonEmail, type PersonPhone,
} from '@/lib/api'
import { X, Loader2, Instagram, Facebook, Twitter, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmailRows, PhoneRows } from '@/components/ContactRowsEditor'
import { PhotoGallery } from '@/components/PhotoGallery'

/** Seed the editor's email rows from a Person — merges legacy `email` if it
 *  isn't already in the `emails` array, deduping by lowercased value. */
function seedEmails(p: Person): PersonEmail[] {
  const out: PersonEmail[] = []
  const seen = new Set<string>()
  for (const e of p.emails ?? []) {
    const k = e.value.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ id: e.id, value: e.value, label: e.label, is_primary: e.is_primary })
  }
  if (p.email) {
    const k = p.email.trim().toLowerCase()
    if (k && !seen.has(k)) {
      out.push({ value: p.email, label: 'personal', is_primary: out.length === 0 })
    }
  }
  return out
}

function seedPhones(p: Person): PersonPhone[] {
  const out: PersonPhone[] = []
  const seen = new Set<string>()
  const norm = (s: string) => {
    const d = s.replace(/\D/g, '')
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  }
  for (const ph of p.phones ?? []) {
    const k = norm(ph.value)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push({ id: ph.id, value: ph.value, label: ph.label, is_primary: ph.is_primary })
  }
  if (p.phone) {
    const k = norm(p.phone)
    if (k && !seen.has(k)) {
      out.push({ value: p.phone, label: 'mobile', is_primary: out.length === 0 })
    }
  }
  return out
}

/** Extract handle from a possible URL or @handle string. */
function normalizeHandle(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  // Strip URL prefix.
  const m = trimmed.match(/(?:instagram\.com|twitter\.com|x\.com|tiktok\.com)\/@?([A-Za-z0-9_.]+)/i)
  if (m) return m[1]
  return trimmed.replace(/^@+/, '')
}

interface Props {
  person: Person
  onClose: () => void
}

const STRENGTHS: { value: RelationshipStrength; label: string }[] = [
  { value: 'cold',  label: 'Cold' },
  { value: 'warm',  label: 'Warm' },
  { value: 'hot',   label: 'Hot' },
  { value: 'close', label: 'Close' },
]

const CADENCES: { value: ContactCadence; label: string }[] = [
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'biannual',  label: 'Twice a year' },
  { value: 'annual',    label: 'Once a year' },
  { value: 'none',      label: 'No reminders' },
]

export function EditPersonModal({ person, onClose }: Props) {
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState(person.first_name)
  const [lastName, setLastName]   = useState(person.last_name)
  const [emails, setEmails]       = useState<PersonEmail[]>(() => seedEmails(person))
  const [phones, setPhones]       = useState<PersonPhone[]>(() => seedPhones(person))
  const [title, setTitle]         = useState(person.title ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(person.linkedin_url ?? '')
  const [strength, setStrength]   = useState<RelationshipStrength>(person.relationship_strength)
  const [followup, setFollowup]   = useState(
    person.next_followup_at ? person.next_followup_at.slice(0, 10) : ''
  )
  const [notes, setNotes]         = useState(person.notes ?? '')

  // Stay-in-touch cadence
  const [cadence, setCadence]     = useState<ContactCadence>(person.contact_cadence ?? 'biannual')
  const [onBirthday, setOnBirthday] = useState(person.contact_on_birthday ?? true)
  const [onHolidays, setOnHolidays] = useState(person.contact_on_holidays ?? false)

  // Social handles
  const [instagram, setInstagram] = useState(person.instagram_handle ?? '')
  const [facebookUrl, setFacebookUrl] = useState(person.facebook_url ?? '')
  const [facebookPrimary, setFacebookPrimary] = useState(person?.preferred_contact_via === 'facebook')
  const [twitter, setTwitter]     = useState(person.twitter_x_handle ?? '')
  const [tiktok, setTiktok]       = useState(person.tiktok_handle ?? '')
  const [whatsapp, setWhatsapp]   = useState(person.whatsapp_phone ?? '')

  // Career
  const [previousEmployersText, setPreviousEmployersText] = useState(
    (person.previous_employers ?? []).join(', ')
  )
  const [howWeMet, setHowWeMet]   = useState(person.how_we_met ?? '')
  const [introducedById, setIntroducedById] = useState(person.introduced_by_id ?? '')
  const [introducedByQuery, setIntroducedByQuery] = useState('')

  // Location
  const [city, setCity]           = useState(person.city ?? '')
  const [region, setRegion]       = useState(person.region ?? '')
  const [country, setCountry]     = useState(person.country ?? '')

  const [error, setError]         = useState<string | null>(null)

  // Introduced-by autocomplete
  const { data: introCandidates } = useQuery({
    queryKey: ['people', 'search-intro', introducedByQuery],
    queryFn: () => people.list({ q: introducedByQuery, per_page: '6' }),
    enabled: introducedByQuery.trim().length >= 2,
  })
  const [introResolved, setIntroResolved] = useState<Person | null>(null)
  useEffect(() => {
    if (introducedById && !introResolved && introducedById !== person.id) {
      people.get(introducedById).then(setIntroResolved).catch(() => undefined)
    }
  }, [introducedById, introResolved, person.id])

  const mutation = useMutation({
    mutationFn: () => {
      // Strip empty rows, normalise primary flag (exactly one or none).
      const cleanEmails = emails
        .filter(e => e.value.trim() !== '')
        .map(e => ({ id: e.id, value: e.value.trim(), label: e.label, is_primary: !!e.is_primary }))
      const cleanPhones = phones
        .filter(p => p.value.trim() !== '')
        .map(p => ({ id: p.id, value: p.value.trim(), label: p.label, is_primary: !!p.is_primary }))

      // Make sure the primary flag is sane: if none flagged, mark the first;
      // if multiple flagged, keep just the first.
      const ensurePrimary = <T extends { is_primary?: boolean }>(arr: T[]) => {
        if (arr.length === 0) return arr
        const firstPrimary = arr.findIndex(x => x.is_primary)
        const keep = firstPrimary === -1 ? 0 : firstPrimary
        return arr.map((x, i) => ({ ...x, is_primary: i === keep }))
      }
      const finalEmails = ensurePrimary(cleanEmails)
      const finalPhones = ensurePrimary(cleanPhones)

      // Mirror the primary value into the legacy single-column fields so list
      // views, search, and any code still reading person.email/phone keep working.
      const primaryEmail = finalEmails.find(e => e.is_primary)?.value ?? ''
      const primaryPhone = finalPhones.find(p => p.is_primary)?.value ?? ''

      return people.update(person.id, {
      first_name: firstName.trim(),
      last_name:  lastName.trim(),
      email:      primaryEmail || undefined,
      phone:      primaryPhone || undefined,
      emails:     finalEmails,
      phones:     finalPhones,
      title:      title.trim() || undefined,
      linkedin_url: linkedinUrl.trim() || undefined,
      relationship_strength: strength,
      next_followup_at: followup || undefined,
      contact_cadence: cadence,
      contact_on_birthday: onBirthday,
      contact_on_holidays: onHolidays,
      notes: notes.trim() || undefined,
      // Social
      instagram_handle:   normalizeHandle(instagram) || undefined,
      facebook_url:       facebookUrl.trim() || undefined,
      preferred_contact_via: facebookUrl.trim() && facebookPrimary ? 'facebook' : '',
      twitter_x_handle:   normalizeHandle(twitter) || undefined,
      tiktok_handle:      normalizeHandle(tiktok) || undefined,
      whatsapp_phone:     whatsapp.trim() || undefined,
      // Career
      previous_employers: previousEmployersText
        .split(',').map(s => s.trim()).filter(Boolean),
      how_we_met:         howWeMet.trim() || undefined,
      introduced_by_id:   introducedById || undefined,
      // Location
      city:    city.trim() || undefined,
      region:  region.trim() || undefined,
      country: country.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] })
      queryClient.invalidateQueries({ queryKey: ['person', person.id] })
      // Refresh the precomputed timeline so the new cadence takes effect now,
      // not on the next nightly rebuild. Best-effort — don't block the close.
      contactSchedule.rebuild()
        .then(() => queryClient.invalidateQueries({ queryKey: ['reach-out-suggestions'] }))
        .catch(() => undefined)
      onClose()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Only require *something* identifying — last_name is optional in the
    // backend (the import flow happily ingests first-name-only device contacts
    // like "Drazenko"). Requiring it here was silently blocking save.
    if (!firstName.trim() && !lastName.trim()) {
      setError('Enter a first or last name.'); return
    }
    setError(null)
    mutation.mutate()
  }

  // Backdrop click closes this modal only. We stopPropagation so the click
  // does not bubble to the underlying PersonDetailModal backdrop (z-40) and
  // close that too. Arbitrary z-values: Tailwind's default scale tops out at
  // z-50, which PersonDetailModal already uses for its panel — we need to sit
  // strictly above it. (See InlineDrawer.tsx for the same z-[60]/z-[70] pattern.)
  const handleBackdropClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={handleBackdropClick} />

      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Edit {person.full_name}</h2>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Photos</label>
              <PhotoGallery personId={person.id} editable />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">First name</label>
                <input type="text" autoFocus value={firstName} onChange={e => setFirstName(e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Last name</label>
                <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100" />
              </div>
            </div>

            <EmailRows emails={emails} onChange={setEmails} />

            <PhoneRows phones={phones} onChange={setPhones} />

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Title</label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">LinkedIn URL</label>
              <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100" />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Relationship</label>
              <div className="flex gap-2">
                {STRENGTHS.map(s => (
                  <button key={s.value} type="button" onClick={() => setStrength(s.value)}
                    className={cn(
                      'flex-1 text-sm py-1.5 rounded-lg border transition-colors font-medium',
                      strength === s.value
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'border-zinc-200 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-500'
                    )}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Follow-up date</label>
              <input type="date" value={followup} onChange={e => setFollowup(e.target.value)}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100" />
            </div>

            {/* Stay in touch — drives the precomputed reach-out reminders */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Stay in touch</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">How often to reach out</label>
                  <select value={cadence} onChange={e => setCadence(e.target.value as ContactCadence)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400">
                    {CADENCES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={onBirthday} onChange={e => setOnBirthday(e.target.checked)}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400" />
                  Remind me on their birthday
                </label>
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={onHolidays} onChange={e => setOnHolidays(e.target.checked)}
                    className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-400" />
                  Remind me around the holidays
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none dark:bg-zinc-800 dark:text-zinc-100" />
            </div>

            {/* Social */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Social</h3>
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1.5">
                    <Instagram className="w-3 h-3" /> Instagram
                  </label>
                  <input
                    type="text"
                    value={instagram}
                    onChange={e => setInstagram(e.target.value)}
                    placeholder="@username or full profile URL"
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">Paste their username or full profile URL — we'll extract.</p>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1.5">
                    <Facebook className="w-3 h-3" /> Facebook
                  </label>
                  <input
                    type="url"
                    value={facebookUrl}
                    onChange={e => setFacebookUrl(e.target.value)}
                    placeholder="https://facebook.com/username"
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  {facebookUrl.trim() && (
                    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={facebookPrimary}
                        onChange={e => setFacebookPrimary(e.target.checked)}
                        className="w-4 h-4 rounded accent-blue-600"
                      />
                      <span className="text-xs text-zinc-600">Facebook is the only way to reach them</span>
                    </label>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1.5">
                      <Twitter className="w-3 h-3" /> Twitter / X
                    </label>
                    <input
                      type="text"
                      value={twitter}
                      onChange={e => setTwitter(e.target.value)}
                      placeholder="@username"
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">TikTok</label>
                    <input
                      type="text"
                      value={tiktok}
                      onChange={e => setTiktok(e.target.value)}
                      placeholder="@username"
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 mb-1.5">
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    placeholder="+1 555 555 0123"
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">Include country code, e.g. +1 for US.</p>
                </div>
              </div>
            </div>

            {/* Career */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Career & relationship</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Previous employers</label>
                  <input
                    type="text"
                    value={previousEmployersText}
                    onChange={e => setPreviousEmployersText(e.target.value)}
                    placeholder="Stripe, Airbnb, Apple"
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">Comma-separated company names.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">How we met</label>
                  <textarea
                    value={howWeMet}
                    onChange={e => setHowWeMet(e.target.value)}
                    rows={2}
                    placeholder="YC W22 batch dinner…"
                    className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                  />
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Introduced by</label>
                  {introducedById && introResolved ? (
                    <div className="flex items-center gap-2 text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 bg-zinc-50 dark:bg-zinc-800">
                      <span className="flex-1 truncate text-zinc-900 dark:text-zinc-100">{introResolved.full_name}</span>
                      <button
                        type="button"
                        onClick={() => { setIntroducedById(''); setIntroResolved(null); setIntroducedByQuery('') }}
                        className="text-xs text-zinc-400 hover:text-zinc-600"
                      >Clear</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={introducedByQuery}
                        onChange={e => setIntroducedByQuery(e.target.value)}
                        placeholder="Search contacts…"
                        className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                      {introducedByQuery.trim().length >= 2 && introCandidates && introCandidates.data.length > 0 && (
                        <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                          {introCandidates.data
                            .filter(p => p.id !== person.id)
                            .map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setIntroducedById(p.id)
                                  setIntroResolved(p)
                                  setIntroducedByQuery('')
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-50 dark:border-zinc-800 last:border-b-0"
                              >
                                <div className="text-zinc-900 dark:text-zinc-100">{p.full_name}</div>
                                {p.company?.name && <div className="text-xs text-zinc-400 dark:text-zinc-500">{p.company.name}</div>}
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">Location</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Region</label>
                  <input
                    type="text"
                    value={region}
                    onChange={e => setRegion(e.target.value)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>

          </form>

          {/* Sticky action bar — errors live HERE so they're always visible
              alongside the Save button, not lost in the scrollable form above. */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 shrink-0">
            {error && (
              <div className="px-6 pt-3">
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              </div>
            )}
            <div className="px-6 py-4 flex justify-end gap-3">
              <button type="button" onClick={onClose}
                className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleSubmit as unknown as React.MouseEventHandler}
                disabled={mutation.isPending}
                className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
                {mutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {mutation.isPending ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

