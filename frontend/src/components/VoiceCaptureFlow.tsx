import { useCallback, useEffect, useState } from 'react'
import { Mic, X, Loader2, AlertCircle } from 'lucide-react'
import { VoiceRecorder } from './VoiceRecorder'
import { VoiceResultPreview } from './VoiceResultPreview'
import type { VoiceCaptureResult } from '@/lib/api'

interface Props {
  personId?: string
  context?: string
  onClose: () => void
}

const STORAGE_KEY = 'kontakti_mic_device_id'

type DeviceInfo = { deviceId: string; label: string }

type PickerState =
  | { kind: 'enumerating' }
  | { kind: 'needs-permission' }
  | { kind: 'requesting-permission' }
  | { kind: 'ready'; devices: DeviceInfo[]; selected: string }
  | { kind: 'error'; message: string }

/**
 * Modal flow:
 *   1. Enumerate audio input devices.
 *      - On first run, device labels are empty until permission is granted.
 *        We call getUserMedia({audio:true}) once to unlock labels, then stop
 *        the stream and re-enumerate.
 *   2. Show a picker — unless a previously chosen deviceId is still present
 *      in localStorage AND still exists in the device list, in which case
 *      jump straight to recording.
 *   3. Record on the chosen mic. "Switch microphone" returns to the picker.
 *   4. Preview the transcription result.
 */
export function VoiceCaptureFlow({ personId, context, onClose }: Props) {
  const [picker, setPicker] = useState<PickerState>({ kind: 'enumerating' })
  const [recording, setRecording] = useState(false)
  const [result, setResult] = useState<VoiceCaptureResult | null>(null)

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setPicker({ kind: 'error', message: 'This browser does not support device enumeration.' })
      return
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs: DeviceInfo[] = all
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }))

      if (inputs.length === 0) {
        setPicker({ kind: 'error', message: 'No microphones detected.' })
        return
      }

      // Labels come back empty until the user has granted mic permission at
      // least once. Detect that and show a "Grant access" CTA.
      const labelsUnlocked = inputs.some(d => d.label && !/^Microphone \d+$/.test(d.label))
      if (!labelsUnlocked) {
        setPicker({ kind: 'needs-permission' })
        return
      }

      const saved = (() => {
        try { return localStorage.getItem(STORAGE_KEY) ?? '' } catch { return '' }
      })()
      const savedStillExists = saved && inputs.some(d => d.deviceId === saved)
      if (!savedStillExists && saved) {
        // Saved device unplugged — clear so we don't keep retrying it.
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      }

      const selected = savedStillExists ? saved : inputs[0].deviceId
      setPicker({ kind: 'ready', devices: inputs, selected })

      // If a previously chosen device is still attached, skip the picker
      // entirely. The user can still hit "Switch microphone" mid-flow.
      if (savedStillExists) {
        setRecording(true)
      }
    } catch (e) {
      setPicker({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Could not list microphones.',
      })
    }
  }, [])

  useEffect(() => { loadDevices() }, [loadDevices])

  // Unlock labels by briefly grabbing the mic, then stopping it.
  const requestPermission = useCallback(async () => {
    setPicker({ kind: 'requesting-permission' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      await loadDevices()
    } catch (e) {
      const msg = e instanceof Error && e.name === 'NotAllowedError'
        ? 'Mic permission denied. Allow access in your browser settings, then reopen.'
        : e instanceof Error ? e.message : 'Could not access the microphone.'
      setPicker({ kind: 'error', message: msg })
    }
  }, [loadDevices])

  const confirmAndRecord = (deviceId: string) => {
    try { localStorage.setItem(STORAGE_KEY, deviceId) } catch { /* ignore */ }
    setPicker(p => (p.kind === 'ready' ? { ...p, selected: deviceId } : p))
    setRecording(true)
  }

  const backToPicker = () => setRecording(false)

  if (result) {
    return <VoiceResultPreview result={result} onClose={onClose} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md">
        {recording && picker.kind === 'ready' ? (
          <VoiceRecorder
            personId={personId}
            context={context}
            deviceId={picker.selected}
            onSwitchDevice={backToPicker}
            onComplete={setResult}
            onCancel={onClose}
          />
        ) : (
          <MicPicker
            state={picker}
            onPick={confirmAndRecord}
            onChangeSelected={(id) => setPicker(p => (p.kind === 'ready' ? { ...p, selected: id } : p))}
            onRequestPermission={requestPermission}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

interface PickerProps {
  state: PickerState
  onPick: (deviceId: string) => void
  onChangeSelected: (deviceId: string) => void
  onRequestPermission: () => void
  onClose: () => void
}

function MicPicker({ state, onPick, onChangeSelected, onRequestPermission, onClose }: PickerProps) {
  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 p-6 max-w-md w-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-zinc-900">Choose microphone</h2>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-zinc-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {(state.kind === 'enumerating' || state.kind === 'requesting-permission') && (
        <div className="py-8 flex flex-col items-center gap-3 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          <p className="text-sm">
            {state.kind === 'requesting-permission' ? 'Waiting for mic permission…' : 'Looking for microphones…'}
          </p>
        </div>
      )}

      {state.kind === 'needs-permission' && (
        <div className="py-6 flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
            <Mic className="w-6 h-6 text-indigo-600" />
          </div>
          <p className="text-sm text-zinc-700 text-center">
            Grant microphone access to see the list of available devices.
          </p>
          <button
            onClick={onRequestPermission}
            className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Mic className="w-4 h-4" />
            Grant access
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="py-6 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <p className="text-sm text-zinc-700 text-center">{state.message}</p>
          <button
            onClick={onClose}
            className="text-sm text-zinc-600 hover:bg-zinc-50 border border-zinc-200 px-4 py-2 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="py-2 flex flex-col gap-4">
          <label className="block">
            <span className="text-xs text-zinc-500 mb-1.5 block">Microphone</span>
            <select
              value={state.selected}
              onChange={e => onChangeSelected(e.target.value)}
              className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            >
              {state.devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          </label>
          <p className="text-[11px] text-zinc-400">
            We'll remember your choice. Use "Switch microphone" in the recorder to change later.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="text-sm text-zinc-600 hover:bg-zinc-50 border border-zinc-200 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onPick(state.selected)}
              className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <Mic className="w-4 h-4" />
              Start recording
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
