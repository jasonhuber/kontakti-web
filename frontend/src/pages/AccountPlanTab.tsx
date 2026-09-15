import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  accountPlans,
  companies,
  type AccountPlan,
  type AccountPlanItem,
  type AccountPlanItemType,
  type AccountPlanOperation,
  type AccountPlanStatus,
  type Company,
  type TaskPriority,
} from '@/lib/api'
import { cn } from '@/lib/utils'
import { Check, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react'

const ITEM_TYPES: AccountPlanItemType[] = ['next_step', 'milestone', 'risk', 'question', 'stakeholder_action']
const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent']
const PLAN_STATUSES: AccountPlanStatus[] = ['draft', 'active', 'paused', 'complete']

const TYPE_LABELS: Record<AccountPlanItemType, string> = {
  next_step: 'Next step',
  milestone: 'Milestone',
  risk: 'Risk',
  question: 'Question',
  stakeholder_action: 'Stakeholder',
}

const STATUS_LABELS: Record<AccountPlanStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  complete: 'Complete',
}

interface Props {
  company: Company
}

export function AccountPlanTab({ company }: Props) {
  const queryClient = useQueryClient()
  const { data: plan, isLoading, isError } = useQuery({
    queryKey: ['company-account-plan', company.id],
    queryFn: () => companies.accountPlan(company.id),
  })

  const updatePlan = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AccountPlan> }) => accountPlans.update(id, data),
    onSuccess: saved => {
      queryClient.setQueryData(['company-account-plan', company.id], saved)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-zinc-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading account plan...
      </div>
    )
  }

  if (isError || !plan) {
    return <div className="py-6 text-sm text-red-600">Could not load account plan.</div>
  }

  const missing = planHealth(plan)

  return (
    <div className="space-y-5">
      <PlanHeader plan={plan} pending={updatePlan.isPending} onSave={(data) => updatePlan.mutate({ id: plan.id, data })} />

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-xs font-medium text-amber-800 mb-1">Plan gaps</div>
          <div className="flex flex-wrap gap-1.5">
            {missing.map(gap => (
              <span key={gap} className="text-[11px] rounded-full bg-white border border-amber-200 text-amber-700 px-2 py-0.5">
                {gap}
              </span>
            ))}
          </div>
        </div>
      )}

      <AiCommandBox company={company} plan={plan} />
      <PlanItems company={company} plan={plan} />
    </div>
  )
}

function PlanHeader({
  plan,
  pending,
  onSave,
}: {
  plan: AccountPlan
  pending: boolean
  onSave: (data: Partial<AccountPlan>) => void
}) {
  const [title, setTitle] = useState(plan.title)
  const [status, setStatus] = useState<AccountPlanStatus>(plan.status)
  const [objective, setObjective] = useState(plan.objective ?? '')
  const [summary, setSummary] = useState(plan.summary ?? '')

  useEffect(() => {
    setTitle(plan.title)
    setStatus(plan.status)
    setObjective(plan.objective ?? '')
    setSummary(plan.summary ?? '')
  }, [plan.id, plan.title, plan.status, plan.objective, plan.summary])

  function saveText() {
    onSave({
      title: title.trim() || plan.title,
      objective: objective.trim() || null,
      summary: summary.trim() || null,
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={saveText}
          className="min-w-0 flex-1 text-sm font-semibold border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <select
          value={status}
          onChange={e => {
            const next = e.target.value as AccountPlanStatus
            setStatus(next)
            onSave({ status: next })
          }}
          className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 dark:bg-zinc-800 dark:text-zinc-100"
        >
          {PLAN_STATUSES.map(value => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
        </select>
      </div>
      <textarea
        value={objective}
        onChange={e => setObjective(e.target.value)}
        onBlur={saveText}
        rows={2}
        placeholder="Objective"
        className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 resize-none dark:bg-zinc-800 dark:text-zinc-100"
      />
      <textarea
        value={summary}
        onChange={e => setSummary(e.target.value)}
        onBlur={saveText}
        rows={3}
        placeholder="Summary"
        className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 resize-none dark:bg-zinc-800 dark:text-zinc-100"
      />
      {pending && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Loader2 className="w-3 h-3 animate-spin" />
          Saving
        </div>
      )}
    </div>
  )
}

function AiCommandBox({ company, plan }: { company: Company; plan: AccountPlan }) {
  const queryClient = useQueryClient()
  const [instruction, setInstruction] = useState('')
  const [preview, setPreview] = useState<AccountPlanOperation[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const previewMut = useMutation({
    mutationFn: () => accountPlans.preview(plan.id, instruction, {
      view: 'company_detail',
      selected_tab: 'account_plan',
      company_id: company.id,
      account_plan_id: plan.id,
    }),
    onSuccess: result => {
      setPreview(result.operations)
      setSelected(new Set(result.operations.map((_, index) => index)))
      setError(null)
    },
    onError: e => setError(e instanceof Error ? e.message : 'Preview failed'),
  })

  const applyMut = useMutation({
    mutationFn: () => accountPlans.apply(plan.id, preview.filter((_, index) => selected.has(index))),
    onSuccess: result => {
      queryClient.setQueryData(['company-account-plan', company.id], result.plan)
      setPreview([])
      setSelected(new Set())
      setInstruction('')
      setError(null)
    },
    onError: e => setError(e instanceof Error ? e.message : 'Apply failed'),
  })

  function updatePreview(index: number, patch: Partial<AccountPlanOperation>) {
    setPreview(ops => ops.map((op, i) => i === index ? { ...op, ...patch } : op))
  }

  function toggle(index: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-900/20 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-600" />
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Plan assistant</div>
      </div>
      <textarea
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        rows={4}
        placeholder="Paste bullets or ask for five next steps..."
        className="w-full text-sm border border-indigo-100 dark:border-indigo-800 rounded-lg px-3 py-2 resize-none dark:bg-zinc-900 dark:text-zinc-100"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => previewMut.mutate()}
          disabled={previewMut.isPending || instruction.trim().length < 2}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-md"
        >
          {previewMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Preview
        </button>
        {preview.length > 0 && (
          <button
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending || selected.size === 0}
            className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-md"
          >
            {applyMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            Apply selected
          </button>
        )}
        {preview.length > 0 && (
          <button
            onClick={() => { setPreview([]); setSelected(new Set()) }}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 px-2 py-1.5 rounded-md"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {preview.length > 0 && (
        <div className="space-y-2">
          {preview.map((op, index) => (
            <div key={index} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={selected.has(index)} onChange={() => toggle(index)} />
                <span className="text-[11px] uppercase tracking-wide text-zinc-400">{op.op === 'update_plan' ? 'Plan edit' : TYPE_LABELS[op.type ?? 'next_step']}</span>
              </div>
              {op.op === 'update_plan' ? (
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  {Object.keys(op.patch ?? {}).join(', ')}
                </div>
              ) : (
                <>
                  <input
                    value={op.title ?? ''}
                    onChange={e => updatePreview(index, { title: e.target.value })}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={op.type ?? 'next_step'}
                      onChange={e => updatePreview(index, { type: e.target.value as AccountPlanItemType })}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      {ITEM_TYPES.map(value => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}
                    </select>
                    <select
                      value={op.priority ?? 'medium'}
                      onChange={e => updatePreview(index, { priority: e.target.value as TaskPriority })}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      {PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                    <input
                      type="date"
                      value={op.due_at ?? ''}
                      onChange={e => updatePreview(index, { due_at: e.target.value || null })}
                      className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PlanItems({ company, plan }: { company: Company; plan: AccountPlan }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')

  const setPlan = (saved: AccountPlan) => queryClient.setQueryData(['company-account-plan', company.id], saved)
  const createMut = useMutation({
    mutationFn: () => accountPlans.createItem(plan.id, { type: 'next_step', title, priority: 'medium', status: 'todo' }),
    onSuccess: saved => {
      setPlan(saved)
      setTitle('')
    },
  })
  const updateMut = useMutation({
    mutationFn: ({ item, data }: { item: AccountPlanItem; data: Partial<AccountPlanItem> }) => accountPlans.updateItem(item.id, data),
    onSuccess: setPlan,
  })
  const deleteMut = useMutation({
    mutationFn: (item: AccountPlanItem) => accountPlans.removeItem(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-account-plan', company.id] }),
  })

  const grouped = useMemo(() => {
    const groups: Record<AccountPlanItemType, AccountPlanItem[]> = {
      next_step: [],
      milestone: [],
      risk: [],
      question: [],
      stakeholder_action: [],
    }
    for (const item of plan.items ?? []) groups[item.type].push(item)
    return groups
  }, [plan.items])

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && title.trim()) createMut.mutate()
          }}
          placeholder="Add next step"
          className="min-w-0 flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !title.trim()}
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 disabled:opacity-60 text-white px-3 py-2 rounded-lg"
        >
          {createMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Add
        </button>
      </div>

      {ITEM_TYPES.map(type => (
        <div key={type}>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1.5">{TYPE_LABELS[type]}</div>
          {grouped[type].length === 0 ? (
            <div className="text-xs text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2">None yet.</div>
          ) : (
            <div className="space-y-2">
              {grouped[type].map(item => (
                <PlanItemRow
                  key={item.id}
                  item={item}
                  onSave={data => updateMut.mutate({ item, data })}
                  onDelete={() => deleteMut.mutate(item)}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PlanItemRow({
  item,
  onSave,
  onDelete,
}: {
  item: AccountPlanItem
  onSave: (data: Partial<AccountPlanItem>) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(item.title)

  useEffect(() => setTitle(item.title), [item.title])

  return (
    <div className={cn(
      'border rounded-lg p-2 space-y-2',
      item.status === 'done'
        ? 'border-emerald-100 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-900/20'
        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
    )}>
      <div className="flex gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title.trim() !== item.title) onSave({ title: title.trim() })
          }}
          className="min-w-0 flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <button onClick={onDelete} className="text-zinc-400 hover:text-red-500" title="Delete item">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <select value={item.type} onChange={e => onSave({ type: e.target.value as AccountPlanItemType })} className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100">
          {ITEM_TYPES.map(value => <option key={value} value={value}>{TYPE_LABELS[value]}</option>)}
        </select>
        <select value={item.status} onChange={e => onSave({ status: e.target.value as AccountPlanItem['status'] })} className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100">
          {['todo', 'in_progress', 'done', 'dismissed'].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={item.priority} onChange={e => onSave({ priority: e.target.value as TaskPriority })} className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100">
          {PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="date" value={item.due_at ?? ''} onChange={e => onSave({ due_at: e.target.value || null })} className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 dark:bg-zinc-800 dark:text-zinc-100" />
      </div>
      {(item.person || item.ai_generated) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
          {item.person && <span>{item.person.full_name}</span>}
          {item.ai_generated && <span className="rounded-full border border-indigo-100 bg-indigo-50 text-indigo-700 px-1.5 py-0.5">AI {item.ai_confidence ?? 0}%</span>}
        </div>
      )}
    </div>
  )
}

function planHealth(plan: AccountPlan): string[] {
  const items = plan.items ?? []
  return [
    !plan.objective ? 'Objective' : null,
    !items.some(item => item.type === 'next_step' && item.status === 'todo') ? 'Next step' : null,
    !items.some(item => item.type === 'risk' && item.status === 'todo') ? 'Risks' : null,
    !items.some(item => item.type === 'question' && item.status === 'todo') ? 'Open questions' : null,
  ].filter(Boolean) as string[]
}
