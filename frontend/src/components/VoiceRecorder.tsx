import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, Square, Loader2, X, AlertCircle, RefreshCw } from 'lucide-react'
import { voice, type VoiceCaptureResult } from '@/lib/api'
import { cn } from '@/lib/utils'

type State =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'uploading' }
  | { kind: 'error'; message: string; recoverable: boolean }

interface Props {
  personId?: string
  context?: string
  onComplete: (result: VoiceCaptureResult) => void
  onCancel?: () => void
}

function pickMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const m of candidates) {
    // MediaRecorder.isTypeSupported can be undefined in old browsers
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m
  }
  return undefined
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60).toString().padStart(2, '0')
  const s = (total % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function VoiceRecorder({ personId, context, onComplete, onCancel }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)
  const cancelledRef = useRef(false)

  const cleanup = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (tickRef.current != null) window.clearInterval(tickRef.current)
    rafRef.current = null
    tickRef.current = null
    try { mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop() } catch { /* ignore */ }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    audioCtxRef.current?.close().catch(() => undefined)
    audioCtxRef.current = null
    analyserRef.current = null
    mediaRecorderRef.current = null
  }, [])

  useEffect(() => () => { cancelledRef.current = true; cleanup() }, [cleanup])

  const start = useCallback(async () => {
    setState({ kind: 'requesting' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (cancelledRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream

      const mimeType = pickMimeType()
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onerror = () => setState({ kind: 'error', message: 'Recorder failed', recoverable: true })
      rec.start(250)

      // Audio level for pulse animation
      try {
        const AudioCtor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioCtor) {
          const ctx = new AudioCtor()
          audioCtxRef.current = ctx
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser)
          analyserRef.current = analyser
          const data = new Uint8Array(analyser.frequencyBinCount)
          const loop = () => {
            analyser.getByteFrequencyData(data)
            let sum = 0
            for (let i = 0; i < data.length; i++) sum += data[i]
            setLevel(Math.min(1, sum / (data.length * 128)))
            rafRef.current = requestAnimationFrame(loop)
          }
          loop()
        }
      } catch { /* ignore analyser errors */ }

      const startedAt = Date.now()
      setState({ kind: 'recording', startedAt })
      setElapsed(0)
      tickRef.current = window.setInterval(() => {
        setElapsed(Date.now() - startedAt)
      }, 250)
    } catch (e) {
      const msg = e instanceof Error && e.name === 'NotAllowedError'
        ? 'Mic permission denied. Allow access in your browser settings.'
        : e instanceof Error ? e.message : 'Could not start recording.'
      setState({ kind: 'error', message: msg, recoverable: true })
    }
  }, [])

  // Auto-start on mount.
  useEffect(() => { start() }, [start])

  const stopAndUpload = useCallback(async () => {
    const rec = mediaRecorderRef.current
    if (!rec) return
    setState({ kind: 'uploading' })

    await new Promise<void>(resolve => {
      rec.onstop = () => resolve()
      try { rec.stop() } catch { resolve() }
    })
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    if (tickRef.current != null) window.clearInterval(tickRef.current)

    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' })
    try {
      const result = await voice.capture(blob, { personId, context })
      cleanup()
      onComplete(result)
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Upload or transcription failed.',
        recoverable: true,
      })
    }
  }, [cleanup, context, onComplete, personId])

  const cancel = useCallback(() => {
    cleanup()
    onCancel?.()
  }, [cleanup, onCancel])

  // UI
  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 p-6 max-w-md w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-zinc-900">Voice memo</h2>
        <button
          onClick={cancel}
          className="text-zinc-400 hover:text-zinc-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {state.kind === 'requesting' && (
        <div className="py-8 flex flex-col items-center gap-3 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-sm">Requesting microphone…</p>
        </div>
      )}

      {state.kind === 'recording' && (
        <div className="py-6 flex flex-col items-center gap-5">
          <div className="relative w-24 h-24 flex items-center justify-center">
            <div
              className="absolute inset-0 rounded-full bg-red-500/20 transition-transform"
              style={{ transform: `scale(${1 + level * 0.8})` }}
            />
            <div className="absolute inset-2 rounded-full bg-red-500/30 animate-pulse" />
            <div className="relative w-14 h-14 rounded-full bg-red-500 flex items-center justify-center">
              <Mic className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="text-2xl font-mono text-zinc-900 tabular-nums">
            {formatElapsed(elapsed)}
          </div>
          <p className="text-xs text-zinc-400">Recording… speak naturally.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={cancel}
              className="text-sm text-zinc-600 hover:bg-zinc-50 border border-zinc-200 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={stopAndUpload}
              className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop & transcribe
            </button>
          </div>
        </div>
      )}

      {state.kind === 'uploading' && (
        <div className="py-8 flex flex-col items-center gap-3 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-sm">Transcribing and extracting…</p>
          <p className="text-xs text-zinc-400">This usually takes 3–8 seconds.</p>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="py-6 flex flex-col items-center gap-3">
          <div className={cn('w-12 h-12 rounded-full flex items-center justify-center bg-red-50')}>
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm text-zinc-700 text-center">{state.message}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={cancel}
              className="text-sm text-zinc-600 hover:bg-zinc-50 border border-zinc-200 px-4 py-2 rounded-lg transition-colors"
            >
              Close
            </button>
            {state.recoverable && (
              <button
                onClick={start}
                className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {state.kind === 'idle' && (
        <div className="py-6 flex flex-col items-center">
          <button
            onClick={start}
            className="inline-flex items-center gap-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Mic className="w-4 h-4" />
            Start recording
          </button>
        </div>
      )}
    </div>
  )
}
