import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { socialGroups, type SocialGroup, type SocialGroupSource } from '@/lib/api'
import { GroupImportWizard } from '@/components/GroupImportWizard'
import { formatRelativeDate, cn } from '@/lib/utils'
import {
  Loader2, Plus, RefreshCw, Trash2, Facebook, MessageCircle,
  Instagram, Users as UsersIcon,
} from 'lucide-react'

const SOURCE_META: Record<SocialGroupSource, { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  facebook_group:        { label: 'Facebook Group',     icon: Facebook,      tint: 'text-blue-600 bg-blue-50' },
  whatsapp_group:        { label: 'WhatsApp Group',     icon: MessageCircle, tint: 'text-emerald-600 bg-emerald-50' },
  instagram_followers:   { label: 'Instagram',          icon: Instagram,     tint: 'text-pink-600 bg-pink-50' },
  manual:                { label: 'Manual',             icon: UsersIcon,     tint: 'text-zinc-600 bg-zinc-100' },
}

export function SocialGroupsPage() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['social-groups'],
    queryFn: () => socialGroups.list(),
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Groups</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Pull contacts in bulk from Facebook Groups, WhatsApp chats, and more.
          </p>
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add group
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          Failed to load groups.
        </div>
      )}

      {!isLoading && !isError && (data?.length ?? 0) === 0 && (
        <div className="text-center py-16 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto">
            <UsersIcon className="w-6 h-6 text-zinc-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-900">No groups yet.</p>
            <p className="text-xs text-zinc-500 mt-1">
              Import members from a Facebook group or WhatsApp chat in one shot.
            </p>
          </div>
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3 py-2 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add your first group
          </button>
        </div>
      )}

      <div className="space-y-2">
        {data?.map(group => (
          <GroupRow key={group.id} group={group} />
        ))}
      </div>

      {wizardOpen && <GroupImportWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}

function GroupRow({ group }: { group: SocialGroup }) {
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meta = SOURCE_META[group.source] ?? SOURCE_META.manual
  const Icon = meta.icon

  const syncMut = useMutation({
    mutationFn: () => socialGroups.sync(group.id),
    onSuccess: () => {
      setError(null)
      qc.invalidateQueries({ queryKey: ['social-groups'] })
      qc.invalidateQueries({ queryKey: ['people'] })
    },
    onError: e => setError(e instanceof Error ? e.message : 'Sync failed'),
  })

  const removeMut = useMutation({
    mutationFn: () => socialGroups.remove(group.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-groups'] })
    },
    onError: e => setError(e instanceof Error ? e.message : 'Remove failed'),
  })

  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center gap-3 flex-wrap">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', meta.tint)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-zinc-900 truncate">
          {group.name || group.external_id}
        </div>
        <div className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{meta.label}</span>
          <span>·</span>
          <span>{group.member_count ?? 0} members</span>
          <span>·</span>
          <span>
            {group.last_synced_at
              ? `Synced ${formatRelativeDate(group.last_synced_at)}`
              : 'Never synced'}
          </span>
        </div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </div>
      <button
        onClick={() => syncMut.mutate()}
        disabled={syncMut.isPending}
        className="text-xs text-indigo-600 hover:bg-indigo-50 disabled:opacity-60 px-2.5 py-1.5 rounded-md inline-flex items-center gap-1.5 transition-colors"
      >
        {syncMut.isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />}
        {syncMut.isPending ? 'Syncing…' : 'Sync now'}
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-1">
          <button
            onClick={() => removeMut.mutate()}
            disabled={removeMut.isPending}
            className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2 py-1 rounded-md"
          >
            {removeMut.isPending ? '…' : 'Confirm'}
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
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
