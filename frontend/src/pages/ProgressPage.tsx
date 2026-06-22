import { useQuery, useQueryClient } from '@tanstack/react-query'
import { gamification, type GamificationDashboard, type GamificationAchievement, type EncouragementTone } from '@/lib/api'
import {
  Loader2, RefreshCw, Flame, Trophy, Sparkles, Users, CheckCircle2, HeartPulse,
  Send, Handshake, Lock, Target, Zap, HeartHandshake, Brush, type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  Handshake, Flame, Trophy, Sparkles, Users, CheckCircle2, HeartPulse, Send,
}

const TONE_STYLES: Record<EncouragementTone, string> = {
  celebrate: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
  nudge:     'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
  urgent:    'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200',
  setup:     'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200',
  steady:    'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300',
}

const TONE_ICON: Record<EncouragementTone, LucideIcon> = {
  celebrate: Trophy, nudge: Target, urgent: Flame, setup: Sparkles, steady: HeartHandshake,
}

/** Score → semantic color. null reads as "not enough data yet". */
function scoreColor(score: number | null): string {
  if (score === null) return 'text-zinc-300 dark:text-zinc-600'
  if (score >= 80) return 'text-emerald-500'
  if (score >= 55) return 'text-amber-500'
  return 'text-rose-500'
}

function ScoreRing({ score, size = 160, stroke = 12, label }: {
  score: number | null; size?: number; stroke?: number; label?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score))
  const dash = (pct / 100) * c

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className="stroke-zinc-100 dark:stroke-zinc-800" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          className={cn('transition-all duration-700', scoreColor(score))} stroke="currentColor" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-4xl font-bold tabular-nums', score === null ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-900 dark:text-zinc-100')}>
          {score === null ? '—' : score}
        </span>
        {label && <span className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{label}</span>}
      </div>
    </div>
  )
}

function MiniScore({ icon: Icon, title, score, sub }: {
  icon: LucideIcon; title: string; score: number | null; sub: string
}) {
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score))
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</span>
        <span className={cn('ml-auto text-lg font-bold tabular-nums', scoreColor(score))}>
          {score === null ? '—' : `${score}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-700',
          score === null ? 'bg-zinc-200 dark:bg-zinc-700'
            : score >= 80 ? 'bg-emerald-500' : score >= 55 ? 'bg-amber-500' : 'bg-rose-500')}
          style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2">{sub}</p>
    </div>
  )
}

function AchievementBadge({ a }: { a: GamificationAchievement }) {
  const Icon = ACHIEVEMENT_ICONS[a.icon] ?? Sparkles
  const pct = a.progress.target > 0 ? Math.min(100, Math.round(100 * a.progress.current / a.progress.target)) : 0
  return (
    <div className={cn(
      'rounded-xl border p-3 flex flex-col items-center text-center gap-1.5 transition-colors',
      a.earned
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        : 'bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800'
    )}>
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center',
        a.earned ? 'bg-amber-400/20 text-amber-600 dark:text-amber-300' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400')}>
        {a.earned ? <Icon className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
      </div>
      <span className={cn('text-xs font-semibold leading-tight',
        a.earned ? 'text-amber-800 dark:text-amber-200' : 'text-zinc-600 dark:text-zinc-300')}>
        {a.title}
      </span>
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight">{a.description}</span>
      {!a.earned && (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums mt-0.5">
          {a.progress.current}/{a.progress.target}
          {pct > 0 && pct < 100 ? ` · ${pct}%` : ''}
        </span>
      )}
    </div>
  )
}

export function ProgressPage() {
  const qc = useQueryClient()
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['gamification'],
    queryFn: () => gamification.dashboard(),
    staleTime: 30_000,
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Progress</h1>
          <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-0.5">
            How well you're keeping in touch and curating your circle
          </p>
        </div>
        <button
          onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['gamification'] }) }}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 border border-zinc-200 dark:border-zinc-700 px-2.5 py-1.5 rounded-lg"
        >
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}

      {isError && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-100 rounded-lg px-3 py-2">
          Failed to load your progress. Try refreshing.
        </div>
      )}

      {data && <Dashboard data={data} />}
    </div>
  )
}

function Dashboard({ data }: { data: GamificationDashboard }) {
  const ToneIcon = TONE_ICON[data.encouragement.tone]
  const lvl = data.level
  const xpPct = lvl.xp_for_next > 0 ? Math.min(100, Math.round(100 * lvl.xp_into_level / lvl.xp_for_next)) : 0
  const goalPct = data.goal.target > 0 ? Math.min(100, Math.round(100 * data.goal.progress / data.goal.target)) : 0
  const goalDone = data.goal.remaining === 0

  return (
    <div className="space-y-4">
      {/* Encouragement banner */}
      <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', TONE_STYLES[data.encouragement.tone])}>
        <ToneIcon className="w-5 h-5 shrink-0 mt-0.5" />
        <p className="text-sm font-medium leading-snug">{data.encouragement.message}</p>
      </div>

      {/* Hero: fitness ring + level */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
        <ScoreRing score={data.fitness_score} label="Fitness" />
        <div className="flex-1 w-full">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-500" />
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Level {lvl.level} · {lvl.title}
            </span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500 transition-all duration-700" style={{ width: `${xpPct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-zinc-400 dark:text-zinc-500 mt-1.5 tabular-nums">
            <span>{lvl.xp.toLocaleString()} XP</span>
            <span>{lvl.xp_into_level}/{lvl.xp_for_next} to level {lvl.level + 1}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <Stat value={data.totals.outreach_lifetime} label="touches" />
            <Stat value={data.totals.reviewed} label="curated" />
            <Stat value={data.totals.people} label="people" />
          </div>
        </div>
      </div>

      {/* Weekly goal + streak */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Goal */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className={cn('w-4 h-4', goalDone ? 'text-emerald-500' : 'text-indigo-500')} />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">This week's goal</span>
          </div>
          <p className="text-sm text-zinc-900 dark:text-zinc-100 font-semibold">{data.goal.title}</p>
          <div className="mt-3 h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-700', goalDone ? 'bg-emerald-500' : 'bg-indigo-500')}
              style={{ width: `${goalPct}%` }} />
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 tabular-nums">
            {goalDone
              ? `Done — ${data.goal.progress} reached this week. Nice.`
              : `${data.goal.progress}/${data.goal.target} reached · ${data.goal.remaining} to go`}
          </p>
        </div>

        {/* Streak */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Flame className={cn('w-4 h-4', data.streak.at_risk ? 'text-rose-500' : data.streak.current_weeks > 0 ? 'text-amber-500' : 'text-zinc-400')} />
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Weekly streak</span>
            {data.streak.at_risk && (
              <span className="ml-auto text-[10px] font-semibold bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 rounded-full px-2 py-0.5">
                at risk
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{data.streak.current_weeks}</span>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">
              {data.streak.current_weeks === 1 ? 'week' : 'weeks'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 tabular-nums">
            Longest: {data.streak.longest_weeks} · {data.streak.this_week_outreach} touch{data.streak.this_week_outreach === 1 ? '' : 'es'} this week
          </p>
        </div>
      </div>

      {/* Two sub-scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <MiniScore
          icon={HeartHandshake}
          title="Keeping in touch"
          score={data.in_touch.score}
          sub={data.in_touch.tracked === 0
            ? 'Set a cadence on people to start tracking'
            : `${data.in_touch.on_cadence}/${data.in_touch.tracked} on cadence · ${data.in_touch.overdue} overdue`}
        />
        <MiniScore
          icon={Brush}
          title="Curating contacts"
          score={data.curation.score}
          sub={data.curation.total === 0
            ? 'No contacts yet'
            : `${data.curation.complete}/${data.curation.total} clean · ${data.curation.needs_attention} need attention`}
        />
      </div>

      {/* Achievements */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          Achievements
          <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
            {data.achievements.filter(a => a.earned).length}/{data.achievements.length}
          </span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.achievements.map(a => <AchievementBadge key={a.key} a={a} />)}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-800/60 rounded-lg py-2">
      <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">{label}</div>
    </div>
  )
}
