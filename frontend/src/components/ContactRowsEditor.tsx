import {
  type PersonEmail, type PersonPhone,
  type EmailLabel, type PhoneLabel,
} from '@/lib/api'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const EMAIL_LABELS: EmailLabel[] = ['work', 'home', 'personal', 'other']
const PHONE_LABELS: PhoneLabel[] = ['mobile', 'work', 'home', 'other']

export function EmailRows({ emails, onChange }: { emails: PersonEmail[]; onChange: (v: PersonEmail[]) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-zinc-500">Emails</label>
        <button
          type="button"
          onClick={() => onChange([...emails, { value: '', label: 'personal', is_primary: emails.length === 0 }])}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-3 h-3" /> Add email
        </button>
      </div>
      <div className="space-y-1.5">
        {emails.length === 0 && (
          <button
            type="button"
            onClick={() => onChange([{ value: '', label: 'personal', is_primary: true }])}
            className="w-full text-sm text-zinc-400 border border-dashed border-zinc-200 rounded-lg px-3 py-2 hover:border-zinc-300 hover:text-zinc-500 transition-colors text-left"
          >
            + Add email
          </button>
        )}
        {emails.map((e, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="email"
              value={e.value}
              onChange={ev => {
                const next = [...emails]; next[i] = { ...next[i], value: ev.target.value }; onChange(next)
              }}
              placeholder="email@example.com"
              className="flex-1 text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
            <select
              value={e.label}
              onChange={ev => {
                const next = [...emails]; next[i] = { ...next[i], label: ev.target.value as EmailLabel }; onChange(next)
              }}
              className="text-xs border border-zinc-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            >
              {EMAIL_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              type="button"
              title={e.is_primary ? 'Primary' : 'Make primary'}
              onClick={() => onChange(emails.map((x, j) => ({ ...x, is_primary: j === i })))}
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-1.5 rounded border shrink-0',
                e.is_primary
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'text-zinc-400 border-zinc-200 hover:text-zinc-600',
              )}
            >
              ★
            </button>
            <button
              type="button"
              onClick={() => onChange(emails.filter((_, j) => j !== i))}
              className="text-zinc-300 hover:text-red-500 transition-colors p-1.5 shrink-0"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PhoneRows({ phones, onChange }: { phones: PersonPhone[]; onChange: (v: PersonPhone[]) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-xs font-medium text-zinc-500">Phones</label>
        <button
          type="button"
          onClick={() => onChange([...phones, { value: '', label: 'mobile', is_primary: phones.length === 0 }])}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-3 h-3" /> Add phone
        </button>
      </div>
      <div className="space-y-1.5">
        {phones.length === 0 && (
          <button
            type="button"
            onClick={() => onChange([{ value: '', label: 'mobile', is_primary: true }])}
            className="w-full text-sm text-zinc-400 border border-dashed border-zinc-200 rounded-lg px-3 py-2 hover:border-zinc-300 hover:text-zinc-500 transition-colors text-left"
          >
            + Add phone
          </button>
        )}
        {phones.map((p, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="tel"
              value={p.value}
              onChange={ev => {
                const next = [...phones]; next[i] = { ...next[i], value: ev.target.value }; onChange(next)
              }}
              placeholder="+1 555 0123"
              className="flex-1 text-sm border border-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
            <select
              value={p.label}
              onChange={ev => {
                const next = [...phones]; next[i] = { ...next[i], label: ev.target.value as PhoneLabel }; onChange(next)
              }}
              className="text-xs border border-zinc-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            >
              {PHONE_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              type="button"
              title={p.is_primary ? 'Primary' : 'Make primary'}
              onClick={() => onChange(phones.map((x, j) => ({ ...x, is_primary: j === i })))}
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-1.5 rounded border shrink-0',
                p.is_primary
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'text-zinc-400 border-zinc-200 hover:text-zinc-600',
              )}
            >
              ★
            </button>
            <button
              type="button"
              onClick={() => onChange(phones.filter((_, j) => j !== i))}
              className="text-zinc-300 hover:text-red-500 transition-colors p-1.5 shrink-0"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
