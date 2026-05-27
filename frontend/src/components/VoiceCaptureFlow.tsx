import { useState } from 'react'
import { VoiceRecorder } from './VoiceRecorder'
import { VoiceResultPreview } from './VoiceResultPreview'
import type { VoiceCaptureResult } from '@/lib/api'

interface Props {
  personId?: string
  context?: string
  onClose: () => void
}

/** Modal flow: record → preview result → close. */
export function VoiceCaptureFlow({ personId, context, onClose }: Props) {
  const [result, setResult] = useState<VoiceCaptureResult | null>(null)

  if (result) {
    return <VoiceResultPreview result={result} onClose={onClose} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md">
        <VoiceRecorder
          personId={personId}
          context={context}
          onComplete={setResult}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
