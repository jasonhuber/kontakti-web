import { ActivityFeed } from '@/components/ActivityFeed'

export function ActivityFeedPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Activity</h1>
        <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">Everything that's happened recently</p>
      </div>
      <ActivityFeed />
    </div>
  )
}
