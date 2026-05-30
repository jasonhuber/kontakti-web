// API client for Kontakti backend

export type RelationshipStrength = 'cold' | 'warm' | 'hot' | 'close'
export type ContactCadence = 'none' | 'monthly' | 'quarterly' | 'biannual' | 'annual'
export type DealStage = 'discovery' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost' | 'on_hold'
export type DiscussionType = 'call' | 'meeting' | 'email' | 'message' | 'event' | 'other'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Tag { id: string; name: string; slug: string; color: string }

export type EmailLabel = 'work' | 'home' | 'personal' | 'other'
export type PhoneLabel = 'mobile' | 'work' | 'home' | 'other'
export type AddressLabel = 'home' | 'work' | 'other'
export type UrlLabel = 'website' | 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'other'

export interface PersonEmail {
  id?: string
  value: string
  label: EmailLabel
  is_primary?: boolean
}
export interface PersonPhone {
  id?: string
  value: string
  label: PhoneLabel
  is_primary?: boolean
}
export interface Address {
  id?: string
  label: AddressLabel
  street?: string
  city?: string
  region?: string
  postal_code?: string
  country?: string
}
export interface PersonURL {
  id?: string
  label: UrlLabel
  value: string
}
export type PhotoSource = 'manual_upload' | 'linkedin' | 'device_contact' | 'paste' | 'other'
export interface PersonPhoto {
  id: string
  person_id: string
  url: string
  source: PhotoSource
  is_primary: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
export interface Company {
  id: string; name: string; domain?: string; logo_url?: string
  industry?: string; size_range?: string; linkedin_url?: string; website?: string
  notes?: string; metadata?: Record<string, unknown>
  people_count?: number; deals_count?: number
  tags: Tag[]; created_at: string; updated_at: string
}
export interface Person {
  id: string; first_name: string; last_name: string; full_name: string
  nickname?: string
  email?: string; phone?: string; linkedin_url?: string; avatar_url?: string
  company_id?: string; company?: Company; title?: string
  job_department?: string
  relationship_strength: RelationshipStrength
  last_contacted_at?: string; next_followup_at?: string
  contact_cadence?: ContactCadence
  contact_on_birthday?: boolean
  contact_on_holidays?: boolean
  birthday?: string
  notes?: string
  device_note?: string
  do_not_contact?: boolean
  do_not_contact_reason?: string
  emails?: PersonEmail[]
  phones?: PersonPhone[]
  photos?: PersonPhoto[]
  addresses?: Address[]
  urls?: PersonURL[]
  metadata?: Record<string, unknown>
  // Social handles
  instagram_handle?: string
  facebook_url?: string
  twitter_x_handle?: string
  tiktok_handle?: string
  whatsapp_phone?: string
  // Career & life
  previous_employers?: string[]
  city?: string
  region?: string
  country?: string
  how_we_met?: string
  introduced_by_id?: string
  // LinkedIn enrichment
  linkedin_last_scraped_at?: string
  linkedin_snapshot?: Record<string, unknown>
  // Relationships
  social_groups?: SocialGroup[]
  activity?: SocialActivity[]
  discussions_count?: number; deals_count?: number; tasks_count?: number
  tags: Tag[]; created_at: string; updated_at: string
}

// — Social groups & activity —
export type SocialGroupSource = 'facebook_group' | 'whatsapp_group' | 'instagram_followers' | 'manual'
export interface SocialGroup {
  id: string
  source: SocialGroupSource
  external_id: string
  name?: string
  member_count?: number
  last_synced_at?: string
  members?: Person[]
}

export type ActivitySource = 'instagram' | 'facebook' | 'linkedin' | 'twitter_x' | 'tiktok'
export type ActivityKind = 'post' | 'life_event' | 'job_change' | 'reaction' | 'check_in' | 'story_highlight'
export interface SocialActivity {
  id: string
  source: ActivitySource
  kind: ActivityKind
  occurred_at: string
  content?: string
  location?: string
  image_url?: string
  external_url?: string
  engagement?: Record<string, unknown>
  acknowledged_at?: string
  person_id?: string
}

// — Today inbox —
export type TodayKind = 'birthday' | 'cadence_overdue' | 'follow_up_due' | 'job_change' | 'social_signal' | 'anniversary_met' | 'rhythm_broken'
export type LogVia = 'email' | 'phone' | 'sms' | 'imessage' | 'whatsapp' | 'instagram' | 'facebook' | 'in_person' | 'other'
export interface TodayItem {
  id: string  // synthetic key like "birthday:{personId}"
  kind: TodayKind
  person: Person
  reason: string
  priority: number
  signal?: {
    image_url?: string
    external_url?: string
    location?: string
    content?: string
    source?: ActivitySource
    occurred_at?: string
    [k: string]: unknown
  }
  suggested_message?: string
  rhythm_context?: {
    discussion_count?: number
    span_years?: number
    avg_interval_days?: number
    last_contact_at?: string
    last_contact_human?: string
    [k: string]: unknown
  }
}

// — Contact quiz (5-a-day) —
export type QuestionKey = 'recognize' | 'how_we_met' | 'relationship_type' | 'last_recall' | 'notable'
export interface ContactPrompt {
  id: string
  person: Person
  question_key: QuestionKey
  question_text: string
  suggested_responses: string[]
  answered_at?: string
  answer?: string
}
export interface RhythmInsight {
  person_id: string
  person?: Person
  message: string
  [k: string]: unknown
}
export interface TodayResponse {
  items: TodayItem[]
  count: number
  quiz: ContactPrompt[]
  rhythm_insights: RhythmInsight[]
}
export interface Deal {
  id: string; title: string; description?: string; stage: DealStage
  value?: number; currency: string; company_id?: string; company?: Company
  expected_close_date?: string; closed_at?: string; pipeline_position: number
  metadata?: Record<string, unknown>; contacts?: Person[]; tags: Tag[]
  discussions_count?: number; tasks_count?: number
  created_at: string; updated_at: string
}
export interface EmailThread {
  id: string
  gmail_thread_id?: string
  subject?: string
  snippet?: string
  message_count?: number
  first_message_at?: string
  last_message_at?: string
}

export interface Discussion {
  id: string; title: string; date: string; type: DiscussionType
  summary?: string; body?: string; deal_id?: string; deal?: Deal
  participants?: Person[]; metadata?: Record<string, unknown>
  email_thread?: EmailThread
  created_at: string; updated_at: string
}

export type ReachOutVia = 'email' | 'phone' | 'sms' | 'imessage' | 'whatsapp' | 'instagram' | 'facebook' | 'in_person' | 'other'
export interface ReachOutLog {
  id: string
  via: ReachOutVia
  reason?: string
  note?: string
  created_at: string
}
export interface Note {
  id: string; title?: string; body: string
  notable_type?: string; notable_id?: string
  obsidian_path?: string; synced_at?: string; sync_status?: string
  metadata: Record<string, unknown>; created_at: string; updated_at: string
}
export interface Task {
  id: string; title: string; description?: string
  due_at?: string; completed_at?: string
  taskable_type?: string; taskable_id?: string
  taskable?: Person | Company | null
  priority: TaskPriority; created_at: string; updated_at: string
}
export interface SearchResult {
  type: string; id: string; title: string; subtitle: string; url: string
}
export interface Paginated<T> { data: T[]; total: number; per_page: number; current_page: number; last_page: number }
export interface TimelineEvent { type: string; date: string; data: Person | Discussion | Note | Task | ReachOutLog }

const BASE = '/api/v1'

export class ApiError extends Error {
  remediation?: string
  errorCode?: string
  payload?: unknown
  constructor(public status: number, message: string, extras?: { remediation?: string; errorCode?: string; payload?: unknown }) {
    super(message)
    this.remediation = extras?.remediation
    this.errorCode = extras?.errorCode
    this.payload = extras?.payload
  }
}

async function request<T>(method: string, path: string, body?: unknown, params?: Record<string, string>): Promise<T> {
  const token = localStorage.getItem('kontakti_token')
  const url = new URL(BASE + path, window.location.origin)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('kontakti_token')
    window.dispatchEvent(new Event('auth:logout'))
    const json = await res.json().catch(() => ({}))
    throw new ApiError(401, (json as { message?: string }).message ?? 'Unauthorized')
  }
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const j = json as { message?: string; error?: string; remediation?: string }
    throw new ApiError(res.status, j.message ?? j.error ?? res.statusText, {
      remediation: j.remediation,
      errorCode: j.error,
      payload: json,
    })
  }
  return json
}

export const get = <T>(path: string, params?: Record<string, string>) => request<T>('GET', path, undefined, params)
const post = <T>(path: string, body: unknown) => request<T>('POST', path, body)
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body)
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body)
const del = (path: string) => request<void>('DELETE', path)

// — Auth —
export const auth = {
  login: (email: string, password: string) =>
    post<{ token: string; user: unknown }>('/auth/login', { email, password }),
  register: (name: string, username: string, email: string, password: string, password_confirmation: string) =>
    post<{ token: string; user: unknown }>('/auth/register', { name, username, email, password, password_confirmation }),
  loginWithGoogle: (id_token: string) =>
    post<{ token: string; user: unknown }>('/auth/google', { id_token }),
  logout: () => post<void>('/auth/logout', {}),
  me: () => get<{ id: string; email: string; name: string }>('/auth/me'),
}

// — People —
export const people = {
  list: (params?: Record<string, string>) => get<Paginated<Person>>('/people', params),
  get: (id: string) => get<Person>(`/people/${id}`),
  create: (data: Partial<Person>) => post<Person>('/people', data),
  update: (id: string, data: Partial<Person>) => patch<Person>(`/people/${id}`, data),
  setFollowup: (id: string, next_followup_at: string | null) =>
    patch<Person>(`/people/${id}`, { next_followup_at }),
  remove: (id: string) => del(`/people/${id}`),
  enrich: (linkedin_url: string) => post<Person>('/people/enrich', { linkedin_url }),
  backfillAvatars: (limit = 25) =>
    post<{ updated: number; failed: number; remaining: number }>('/people/backfill-avatars', { limit }),
  timeline: (id: string) => get<TimelineEvent[]>(`/people/${id}/timeline`),
  discussions: (id: string) => get<Discussion[]>(`/people/${id}/discussions`),
  deals: (id: string) => get<Deal[]>(`/people/${id}/deals`),
  notes: (id: string) => get<Paginated<Note>>('/notes', { notable_type: 'App\\Models\\Person', notable_id: id }),
  listNotes: (id: string) => get<Paginated<Note>>('/notes', { notable_type: 'App\\Models\\Person', notable_id: id }),
  tasks: (id: string) => get<Task[]>(`/people/${id}/tasks`),
  listTasks: (id: string) => get<Task[]>(`/people/${id}/tasks`),
  // Photos
  listPhotos: (id: string) => get<PersonPhoto[]>(`/people/${id}/photos`),
  uploadPhoto: async (id: string, file: File, source: PhotoSource = 'manual_upload'): Promise<PersonPhoto> => {
    const token = localStorage.getItem('kontakti_token')
    const form = new FormData()
    form.append('file', file)
    form.append('source', source)
    const res = await fetch(`/api/v1/people/${id}/photos`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText)
      throw new Error(`Upload failed: ${res.status} ${msg || res.statusText}`)
    }
    return res.json()
  },
  uploadPhotoData: (id: string, dataUrl: string, source: PhotoSource = 'paste') =>
    post<PersonPhoto>(`/people/${id}/photos`, { data: dataUrl, source }),
  removePhoto: (id: string, photoId: string) =>
    del(`/people/${id}/photos/${photoId}`),
  setPrimaryPhoto: (id: string, photoId: string) =>
    post<PersonPhoto>(`/people/${id}/photos/${photoId}/primary`, {}),
  health: () => get<PeopleHealthResponse>('/people/health'),
  review: (id: string) => post<Person>(`/people/${id}/review`, {}),
}

// — Companies —
export const companies = {
  list: (params?: Record<string, string>) => get<Paginated<Company>>('/companies', params),
  get: (id: string) => get<Company>(`/companies/${id}`),
  create: (data: Partial<Company>) => post<Company>('/companies', data),
  update: (id: string, data: Partial<Company>) => put<Company>(`/companies/${id}`, data),
  remove: (id: string) => del(`/companies/${id}`),
  people: (id: string) => get<Person[]>(`/companies/${id}/people`),
  deals: (id: string) => get<Deal[]>(`/companies/${id}/deals`),
  discussions: (id: string) => get<Discussion[]>(`/companies/${id}/discussions`),
  notes: (id: string) => get<Paginated<Note>>('/notes', { notable_type: 'App\\Models\\Company', notable_id: id }),
}

// — Deals —
export const deals = {
  list: (params?: Record<string, string>) => get<Paginated<Deal>>('/deals', params),
  kanban: () => get<Record<DealStage, Deal[]>>('/deals', { kanban: 'true' }),
  get: (id: string) => get<Deal>(`/deals/${id}`),
  create: (data: Partial<Deal>) => post<Deal>('/deals', data),
  update: (id: string, data: Partial<Deal>) => put<Deal>(`/deals/${id}`, data),
  remove: (id: string) => del(`/deals/${id}`),
  setStage: (id: string, stage: DealStage, position?: number) =>
    patch<Deal>(`/deals/${id}/stage`, { stage, position }),
  reorder: (items: Array<{ id: string; stage: DealStage; position: number }>) =>
    post<{ ok: boolean }>('/deals/reorder', { items }),
  addContact: (dealId: string, personId: string, role?: string) =>
    post<Deal>(`/deals/${dealId}/contacts/${personId}`, { role }),
  removeContact: (dealId: string, personId: string) =>
    del(`/deals/${dealId}/contacts/${personId}`),
}

// — Discussions —
export const discussions = {
  list: (params?: Record<string, string>) => get<Paginated<Discussion>>('/discussions', params),
  get: (id: string) => get<Discussion>(`/discussions/${id}`),
  create: (data: Partial<Discussion>) => post<Discussion>('/discussions', data),
  createForPerson: async (
    personId: string,
    data: Partial<Discussion>,
  ): Promise<Discussion> => {
    const created = await post<Discussion>('/discussions', data)
    await post<Discussion>(`/discussions/${created.id}/participants/${personId}`, {})
    return created
  },
  update: (id: string, data: Partial<Discussion>) => put<Discussion>(`/discussions/${id}`, data),
  remove: (id: string) => del(`/discussions/${id}`),
  addParticipant: (discussionId: string, personId: string) =>
    post<Discussion>(`/discussions/${discussionId}/participants/${personId}`, {}),
  removeParticipant: (discussionId: string, personId: string) =>
    del(`/discussions/${discussionId}/participants/${personId}`),
}

// — Notes —
export const notes = {
  list: (params?: Record<string, string>) => get<Paginated<Note>>('/notes', params),
  get: (id: string) => get<Note>(`/notes/${id}`),
  create: (data: Partial<Note>) => post<Note>('/notes', data),
  update: (id: string, data: Partial<Note>) => put<Note>(`/notes/${id}`, data),
  remove: (id: string) => del(`/notes/${id}`),
  exportToObsidian: (id: string) => post<{ path: string }>(`/notes/${id}/export`, {}),
}

// — Tasks —
export const tasks = {
  list: (params?: Record<string, string>) => get<Task[]>('/tasks', params),
  create: (data: Partial<Task>) => post<Task>('/tasks', data),
  update: (id: string, data: Partial<Task>) => put<Task>(`/tasks/${id}`, data),
  complete: (id: string) => patch<Task>(`/tasks/${id}/complete`, {}),
  reopen: (id: string) => patch<Task>(`/tasks/${id}/reopen`, {}),
  remove: (id: string) => del(`/tasks/${id}`),
}

// — Search —
export const search = {
  global: (q: string) => get<{ query: string; results: SearchResult[] }>('/search', { q }),
}

// — Contacts import —
export interface ImportContact {
  first_name: string
  last_name: string
  email?: string
  phone?: string
  company_name?: string
  source?: 'device' | 'gmail' | 'google'
}
export interface ImportResult { imported: number; skipped: number; duplicates_detected?: number; auto_merged?: number }
export const contacts = {
  import: (items: ImportContact[]) =>
    post<ImportResult>('/contacts/import', { contacts: items }),
}

// — Google accounts —
export type GoogleAccountLabel = 'personal' | 'work' | 'other'
export interface GoogleAccount {
  id: number
  email: string
  label: GoogleAccountLabel
  is_primary: boolean
  avatar_url: string | null
  last_synced_at: string | null
}
export const googleAccounts = {
  list: async (): Promise<GoogleAccount[]> => {
    const raw = await get<GoogleAccount[] | { data: GoogleAccount[] }>('/google-accounts')
    return Array.isArray(raw) ? raw : raw.data
  },
  link: (id_token: string, label?: GoogleAccountLabel) =>
    post<GoogleAccount>('/google-accounts/link', { id_token, ...(label ? { label } : {}) }),
  update: (id: number, patchData: { label?: GoogleAccountLabel; is_primary?: boolean }) =>
    patch<GoogleAccount>(`/google-accounts/${id}`, patchData),
  unlink: (id: number) => del(`/google-accounts/${id}`),
}

// — Duplicates —
export type DuplicateStatus = 'pending' | 'merged' | 'dismissed' | 'kept_separate'
export type DuplicateDecision = 'merge' | 'keep_separate' | 'uncertain'
export interface DuplicateAiMerged {
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
}
export interface DuplicateAiDecision {
  decision: DuplicateDecision
  confidence: number
  primary_id: string
  merged: DuplicateAiMerged
  reasoning: string
}
export interface DuplicateCandidate {
  id: number
  group_key: string
  person_ids: string[]
  status: DuplicateStatus
  ai_decision: DuplicateAiDecision | null
  ai_confidence: number | null
  reviewed_at: string | null
  people: Person[]
}
export interface DuplicatePage {
  data: DuplicateCandidate[]
  total: number
  per_page: number
  current_page: number
  last_page: number
}
export const duplicates = {
  list: (status?: DuplicateStatus, page = 1, perPage = 50): Promise<DuplicatePage> => {
    const params: Record<string, string> = { page: String(page), per_page: String(perPage) }
    if (status) params.status = status
    return get<DuplicatePage>('/duplicates', params)
  },
  scan: () => post<{ generated: number; ai_resolved: number }>('/duplicates/scan', {}),
  mergeIdentical: () => post<{ merged: number }>('/duplicates/merge-identical', {}),
  merge: (id: number, primary_id: string, merged: DuplicateAiMerged) =>
    post<Person>(`/duplicates/${id}/merge`, { primary_id, merged }),
  dismiss: (id: number) => post<void>(`/duplicates/${id}/dismiss`, {}),
}

// — Social groups —
export const socialGroups = {
  list: async (): Promise<SocialGroup[]> => {
    const raw = await get<SocialGroup[] | { data: SocialGroup[] }>('/social-groups')
    return Array.isArray(raw) ? raw : raw.data
  },
  create: (data: { source: SocialGroupSource; external_id: string; name?: string }) =>
    post<SocialGroup>('/social-groups', data),
  sync: (id: string) =>
    post<{ created: number; attached: number; member_count: number }>(`/social-groups/${id}/sync`, {}),
  remove: (id: string) => del(`/social-groups/${id}`),
}

// — Social providers (live group picker pass-through) —
export interface FacebookGroup {
  id: string
  name: string
  url?: string
  member_count?: number
  avatar_url?: string
}
export interface WhatsappGroup {
  jid: string
  name: string
  member_count?: number
  avatar_url?: string
  is_admin?: boolean
}
export interface WhatsappStatus {
  paired: boolean
  phone_number?: string
  qr_required: boolean
  last_paired_at?: string
}
export interface WhatsappQR {
  paired: boolean
  qr_data_url: string | null
  expires_in_seconds?: number
}
export interface FacebookStatusHint {
  last_logged_in_at?: string
}

export const socialProviders = {
  facebookGroups: () => get<{ groups: FacebookGroup[]; last_logged_in_at?: string }>('/social-providers/facebook/groups'),
  whatsappStatus: () => get<WhatsappStatus>('/social-providers/whatsapp/status'),
  whatsappQR:     () => get<WhatsappQR>('/social-providers/whatsapp/qr'),
  whatsappGroups: () => get<{ groups: WhatsappGroup[] }>('/social-providers/whatsapp/my-groups'),
}

// — Activity —
export const activity = {
  // Backend paginates and returns { data, current_page, total, ... }; callers
  // want a bare array.
  forPerson: async (personId: string): Promise<SocialActivity[]> => {
    const r = await get<{ data: SocialActivity[] } | SocialActivity[]>(`/people/${personId}/activity`)
    if (Array.isArray(r)) return r
    return r?.data ?? []
  },
  refresh: (personId: string) =>
    post<{ created: SocialActivity[]; errors?: unknown[] }>(`/people/${personId}/activity/refresh`, {}),
  acknowledge: (activityId: string) => post<void>(`/activity/${activityId}/acknowledge`, {}),
}

// — Today —
export const today = {
  list: async (limit?: number): Promise<TodayResponse> => {
    const raw = await get<TodayResponse | TodayItem[]>(
      '/today', limit ? { limit: String(limit) } : undefined,
    )
    if (Array.isArray(raw)) {
      return { items: raw, count: raw.length, quiz: [], rhythm_insights: [] }
    }
    return {
      items: raw.items ?? [],
      count: raw.count ?? raw.items?.length ?? 0,
      quiz: raw.quiz ?? [],
      rhythm_insights: raw.rhythm_insights ?? [],
    }
  },
  draft: (itemKey: string) =>
    post<{ draft: string }>(`/today/items/${encodeURIComponent(itemKey)}/draft`, {}),
  log: (itemKey: string, via: LogVia, note?: string) =>
    post<{ last_contacted_at: string }>(`/today/items/${encodeURIComponent(itemKey)}/log`, { via, ...(note ? { note } : {}) }),
}

// — Contact quiz —
export const quiz = {
  answer: (id: string, answer: string, structured?: Record<string, unknown>, note?: string) =>
    post<{ person: Person }>(`/quiz/${encodeURIComponent(id)}/answer`, {
      answer,
      ...(structured ? { structured } : {}),
      ...(note && note.trim() ? { note: note.trim() } : {}),
    }),
  skip: (id: string) =>
    post<void>(`/quiz/${encodeURIComponent(id)}/skip`, {}),
  history: async (params?: { person_id?: string }): Promise<ContactPrompt[]> => {
    // Backend returns { prompts: [...] }; callers want a flat array.
    const r = await get<{ prompts: ContactPrompt[] } | ContactPrompt[]>(
      '/quiz/history',
      params as Record<string, string> | undefined,
    )
    if (Array.isArray(r)) return r
    return r?.prompts ?? []
  },
}

// — Voice capture —
export interface VoicePersonRef {
  name_hint: string
  action: 'create' | 'link' | 'ignore' | string
  suggested_handle?: string
}
export interface VoiceCaptureResult {
  transcript: string
  summary: string
  discussions: Discussion[]
  tasks: Task[]
  person_refs: VoicePersonRef[]
}

async function postMultipart<T>(path: string, fd: FormData): Promise<T> {
  const token = localStorage.getItem('kontakti_token')
  const url = new URL(BASE + path, window.location.origin)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // NOTE: don't set Content-Type — browser sets multipart boundary.
    },
    body: fd,
  })
  if (res.status === 401) {
    localStorage.removeItem('kontakti_token')
    window.dispatchEvent(new Event('auth:logout'))
    throw new ApiError(401, 'Unauthorized')
  }
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const j = json as { message?: string; error?: string; remediation?: string }
    throw new ApiError(res.status, j.message ?? j.error ?? res.statusText, {
      remediation: j.remediation,
      errorCode: j.error,
      payload: json,
    })
  }
  return json as T
}

export const voice = {
  capture: async (
    audio: Blob,
    opts?: { personId?: string; context?: string },
  ): Promise<VoiceCaptureResult> => {
    const fd = new FormData()
    fd.append('audio', audio, 'memo.webm')
    if (opts?.personId) fd.append('person_id', opts.personId)
    if (opts?.context) fd.append('context', opts.context)
    return postMultipart<VoiceCaptureResult>('/voice/capture', fd)
  },
}

// — Natural-language search —
export interface NaturalSearchResultRow {
  person: Person
  score: number
  reasoning: string
}
export interface NaturalSearchResponse {
  query: string
  results: NaturalSearchResultRow[]
}
export const naturalSearch = {
  query: (query: string, limit?: number) =>
    post<NaturalSearchResponse>('/search/natural', { query, ...(limit ? { limit } : {}) }),
}

// — People health / review queue —
export interface PeopleHealthSample {
  id: string; first_name: string; last_name: string; email: string | null
}
export interface PeopleHealthBucket {
  count: number
  samples: PeopleHealthSample[]
}
export type PeopleHealthBucketKey =
  | 'missing_first_name' | 'missing_last_name' | 'missing_contact_info'
  | 'invalid_email' | 'unlinked_company' | 'needs_review'
  | 'imported_unreviewed' | 'duplicate_email'
export interface PeopleHealthResponse {
  total: number
  buckets: Record<PeopleHealthBucketKey, PeopleHealthBucket>
}

// — Contact schedule (precomputed reach-out timeline) —
export type ScheduleReason = 'cadence' | 'birthday' | 'holiday'
export type ScheduleStatus = 'pending' | 'done' | 'snoozed' | 'dismissed'
export interface ContactScheduleItem {
  id: number
  person_id: string
  due_at: string
  reason: ScheduleReason
  label: string | null
  status: ScheduleStatus
  person?: Person
}
export interface ReachOutSuggestion {
  schedule_id: number
  person_id: string
  name: string
  reason: ScheduleReason
  label: string | null
  due_at: string
  company: string | null
  channel_hint: string
  last_contact: string
}
export const contactSchedule = {
  list: (params?: Record<string, string>) =>
    get<Paginated<ContactScheduleItem>>('/contact-schedule', params),
  suggestions: (limit = 5) =>
    get<{ count: number; suggestions: ReachOutSuggestion[] }>('/contact-schedule/suggestions', { limit: String(limit) }),
  rebuild: () => post<{ rebuilt: boolean; scheduled_items: number }>('/contact-schedule/rebuild', {}),
  complete: (id: number) => post<ContactScheduleItem>(`/contact-schedule/${id}/complete`, {}),
  snooze: (id: number, days = 7) => post<ContactScheduleItem>(`/contact-schedule/${id}/snooze`, { days }),
  dismiss: (id: number) => post<ContactScheduleItem>(`/contact-schedule/${id}/dismiss`, {}),
}

// — MCP tokens —
export interface McpToken {
  id: number
  name: string
  last_used_at: string | null
  created_at: string
  abilities: string[]
}
export const mcp = {
  listTokens: () => get<McpToken[]>('/mcp/tokens'),
  createToken: (name?: string, readOnly = false) =>
    post<{ token: string; id: number; name: string; abilities: string[] }>('/mcp/tokens', {
      name: name ?? 'mcp-' + new Date().toISOString().slice(0, 10),
      read_only: readOnly,
    }),
  revokeToken: (id: number) => del(`/mcp/tokens/${id}`),
}

// — Apple Contact links (opt-in cloud backup) —
export interface AppleContactLink {
  person_id: string
  cn_contact_identifier: string
  device_label?: string
  updated_at: string
}
export const appleContactLinks = {
  list: () => get<AppleContactLink[]>('/apple-contact-links'),
  bulkUpsert: (links: { person_id: string; cn_contact_identifier: string; device_label?: string }[]) =>
    post<{ upserted: number }>('/apple-contact-links', { links }),
  destroyByPerson: (personId: string) => del(`/apple-contact-links/${personId}`),
}

// — Web push —
export const push = {
  register: (token: string, device_id?: string) =>
    post<void>('/push/register', { platform: 'web', token, ...(device_id ? { device_id } : {}) }),
  unregister: (token: string) =>
    request<void>('DELETE', '/push/register', { token }),
}

// — Jobs —
export const jobs = {
  detectChanges: () => post<{ detected: number; errors: number }>('/jobs/detect-changes', {}),
}

// — Obsidian —
export const obsidian = {
  status: () => get<{ vault_exists: boolean; sync_enabled: boolean; unsynced_notes: number }>('/obsidian/status'),
  exportAll: () => post<{ exported: Record<string, number>; path: string }>('/obsidian/export', {}),
}
