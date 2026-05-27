import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deals, type Deal, type DealStage } from '@/lib/api'
import { DEAL_STAGE_LABELS, DEAL_STAGE_COLORS, formatCurrency, cn } from '@/lib/utils'
import { GripVertical, Plus } from 'lucide-react'
import { makeInitials } from './PersonCard'

const STAGES: DealStage[] = ['discovery', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost', 'on_hold']

interface DealCardProps {
  deal: Deal
  isDragging?: boolean
}

function DealCard({ deal, isDragging }: DealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white rounded-lg border border-zinc-200 p-3 cursor-default',
        'hover:border-zinc-300 hover:shadow-sm transition-all',
        isDragging && 'opacity-50 shadow-lg border-blue-300',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 text-zinc-300 hover:text-zinc-400 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3 h-3" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-zinc-900 truncate">{deal.title}</div>
          {deal.company && (
            <div className="text-xs text-zinc-400 truncate mt-0.5">{deal.company.name}</div>
          )}
          <div className="flex items-center gap-2 mt-2">
            {deal.value && (
              <span className="text-xs font-medium text-zinc-700">
                {formatCurrency(deal.value, deal.currency)}
              </span>
            )}
            {deal.contacts && deal.contacts.length > 0 && (
              <div className="flex -space-x-1">
                {deal.contacts.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="w-5 h-5 rounded-full bg-indigo-100 border border-white flex items-center justify-center"
                    title={c.full_name}
                  >
                    <span className="text-[9px] font-medium text-indigo-600">
                      {makeInitials(c.first_name, c.last_name, c.full_name)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface KanbanColumnProps {
  stage: DealStage
  deals: Deal[]
  onAddDeal: (stage: DealStage) => void
}

function KanbanColumn({ stage, deals: columnDeals, onAddDeal }: KanbanColumnProps) {
  const totalValue = columnDeals.reduce((sum, d) => sum + (d.value ?? 0), 0)

  return (
    <div className="flex flex-col w-64 shrink-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', DEAL_STAGE_COLORS[stage])}>
            {DEAL_STAGE_LABELS[stage]}
          </span>
          <span className="text-xs text-zinc-400">{columnDeals.length}</span>
        </div>
        {totalValue > 0 && (
          <span className="text-xs text-zinc-400">{formatCurrency(totalValue)}</span>
        )}
      </div>

      <div className="flex flex-col gap-2 min-h-[200px] rounded-xl bg-zinc-50 p-2">
        <SortableContext items={columnDeals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {columnDeals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
        </SortableContext>

        <button
          onClick={() => onAddDeal(stage)}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 p-2 rounded-lg hover:bg-zinc-100 transition-colors"
        >
          <Plus className="w-3 h-3" /> Add deal
        </button>
      </div>
    </div>
  )
}

interface Props {
  columns: Record<DealStage, Deal[]>
  onAddDeal: (stage: DealStage) => void
}

export function KanbanBoard({ columns, onAddDeal }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const reorderMutation = useMutation({
    mutationFn: deals.reorder,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['deals', 'kanban'] }),
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const allDeals = STAGES.flatMap((s) => columns[s] ?? [])
  const activeDeal = activeId ? allDeals.find((d) => d.id === activeId) : null

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
  }, [])

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveId(null)
    if (!over || active.id === over.id) return

    // Find destination stage — over.id could be a deal id or a stage id
    let destStage: DealStage | undefined
    let destPosition = 0

    for (const stage of STAGES) {
      const col = columns[stage] ?? []
      const overIdx = col.findIndex((d) => d.id === over.id)
      if (overIdx !== -1) {
        destStage = stage
        destPosition = overIdx
        break
      }
    }

    if (!destStage) return

    const items = allDeals
      .filter((d) => d.id !== active.id)
      .map((d, i) => ({ id: d.id, stage: d.stage, position: i }))

    // Insert moved deal at destination
    const moved = allDeals.find((d) => d.id === active.id)!
    items.splice(destPosition, 0, { id: moved.id, stage: destStage, position: destPosition })

    reorderMutation.mutate(items.map((item, i) => ({ ...item, position: i })))
  }, [columns, allDeals, reorderMutation])

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            deals={columns[stage] ?? []}
            onAddDeal={onAddDeal}
          />
        ))}
      </div>

      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore – DragOverlay types require style/className/transition/adjustScale but they have defaults */}
      <DragOverlay>
        {activeDeal && <DealCard deal={activeDeal} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}
