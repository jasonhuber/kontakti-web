// API client for Kontakti backend

export type RelationshipStrength = 'cold' | 'warm' | 'hot' | 'close'
export type DealStage = 'discovery' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost' | 'on_hold'
export type DiscussionType = 'call' | 'meeting' | 'email' | 'message' | 'event' | 'other'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Tag { id: string; name: string; slug: string; color: string }
export interface Company {
  id: string; name: string; domain?: string; logo_url?: string
  industry?: string; size_range?: string; linkedin_url?: string; website?: string
  notes?: string; metadata: Record<string, unknown>
  people_count?: number; deals_count?: number
  tags: Tag[]; created_at: string; updated_at: string
}
export interface Person {
  id: string; first_name: string; last_name: string; full_name: string
  email?: string; phone?: string; linkedin_url?: string; avatar_url?: string
  company_id?: string; company?: Company; title?: string
  relationship_strength: RelationshipStrength
  last_contacted_at?: string; next_followup_at?: string
  notes?: string; metadata: Record<string, unknown>
  discussions_count?: number; deals_count?: number; tasks_count?: number
  tags: Tag[]; created_at: string; updated_at: string
}
export interface Deal {
  id: string; title: string; description?: string; stage: DealStage
  value?: number; currency: string; company_id?: string; company?: Company
  expected_close_date?: string; closed_at?: string; pipeline_position: number
  metadata: Record<string, unknown>; contacts?: Person[]; tags: Tag[]
  discussions_count?: number; tasks_count?: number
  created_at: string; updated_at: string
}
export interface Discussion {
  id: string; title: string; date: string; type: DiscussionType
  summary?: string; body?: string; deal_id?: string; deal?: Deal
  participants?: Person[]; metadata: Record<string, unknown>
  created_at: string; updated_at: string
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
  priority: TaskPriority; created_at: string; updated_at: string
}
export interface SearchResult {
  type: string; id: string; title: string; subtitle: string; url: string
}
export interface Paginated<T> { data: T[]; total: number; per_page: number; current_page: number; last_page: number }
export interface TimelineEvent { type: string; date: string; data: Person | Discussion | Note | Task }

const BASE = '/api/v1'

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
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

  if (res.status === 204) return undefined as T
  const json = await res.json()
  if (!res.ok) throw new ApiError(res.status, json.message ?? res.statusText)
  return json
}

export const get = <T>(path: string, params?: Record<string, string>) => request<T>('GET', path, undefined, params)
const post = <T>(path: string, body: unknown) => request<T>('POST', path, body)
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body)
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body)
const del = (path: string) => request<void>('DELETE', path)

// — Auth —
export const auth = {
  login: (email: string, password: string) => post<{ token: string; user: unknown }>('/auth/login', { email, password }),
  logout: () => post<void>('/auth/logout', {}),
  me: () => get<{ id: string; email: string; name: string }>('/auth/me'),
}

// — People —
export const people = {
  list: (params?: Record<string, string>) => get<Paginated<Person>>('/people', params),
  get: (id: string) => get<Person>(`/people/${id}`),
  create: (data: Partial<Person>) => post<Person>('/people', data),
  update: (id: string, data: Partial<Person>) => put<Person>(`/people/${id}`, data),
  remove: (id: string) => del(`/people/${id}`),
  timeline: (id: string) => get<TimelineEvent[]>(`/people/${id}/timeline`),
  discussions: (id: string) => get<Discussion[]>(`/people/${id}/discussions`),
  deals: (id: string) => get<Deal[]>(`/people/${id}/deals`),
  tasks: (id: string) => get<Task[]>(`/people/${id}/tasks`),
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

// — Obsidian —
export const obsidian = {
  status: () => get<{ vault_exists: boolean; sync_enabled: boolean; unsynced_notes: number }>('/obsidian/status'),
  exportAll: () => post<{ exported: Record<string, number>; path: string }>('/obsidian/export', {}),
}
