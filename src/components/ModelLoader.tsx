import { useEffect, useState } from 'react'
import { initSDK, loadAllVoiceModels, type DownloadProgress } from '../runanywhere'

interface Props {
  onReady: () => void
}

const MODEL_NAMES: Record<string, string> = {
  'silero-vad-v5': 'Speech detector',
  'sherpa-onnx-whisper-tiny.en': 'Transcription (Whisper)',
  'lfm2-350m-q4_k_m': 'Coach brain (LFM2)',
  'vits-piper-en_US-lessac-medium': 'Voice synthesis (Piper)',
}

export function ModelLoader({ onReady }: Props) {
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [currentModel, setCurrentModel] = useState('')
  const [phase, setPhase] = useState<'init' | 'downloading' | 'ready' | 'error'>('init')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setPhase('init')
        await initSDK()
        if (cancelled) return

        setPhase('downloading')
        await loadAllVoiceModels((p: DownloadProgress) => {
          if (cancelled) return
          setCurrentModel(MODEL_NAMES[p.modelId] ?? p.modelId)
          setProgress((prev) => ({ ...prev, [p.modelId]: p.progress }))
        })

        if (!cancelled) {
          setPhase('ready')
          setTimeout(onReady, 600)
        }
      } catch (err: any) {
        if (!cancelled) {
          setPhase('error')
          setErrorMsg(err?.message ?? 'Unknown error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [onReady])

  const totalProgress =
    Object.values(progress).length > 0
      ? Object.values(progress).reduce((a, b) => a + b, 0) / 4
      : 0

  return (
    <div className="loader-screen">
      <div className="loader-inner">
        <div className="loader-logo">
          <span className="logo-mark" />
          <h1>MindMirror</h1>
        </div>

        {phase === 'init' && (
          <p className="loader-status">Initialising AI engine…</p>
        )}

        {phase === 'downloading' && (
          <>
            <p className="loader-status">Loading {currentModel}</p>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.round(totalProgress * 100)}%` }}
              />
            </div>
            <p className="loader-sub">
              {Math.round(totalProgress * 100)}% — all models stay on your device
            </p>
            <div className="model-list">
              {Object.entries(MODEL_NAMES).map(([id, name]) => (
                <div key={id} className="model-row">
                  <span className="model-name">{name}</span>
                  <span
                    className={`model-status ${
                      (progress[id] ?? 0) >= 1 ? 'done' : progress[id] ? 'loading' : 'waiting'
                    }`}
                  >
                    {(progress[id] ?? 0) >= 1
                      ? 'Ready'
                      : progress[id]
                      ? `${Math.round((progress[id] ?? 0) * 100)}%`
                      : 'Waiting'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {phase === 'ready' && (
          <p className="loader-status ready">All models loaded. Starting…</p>
        )}

        {phase === 'error' && (
          <div className="loader-error">
            <p>Failed to load models</p>
            <p className="error-detail">{errorMsg}</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}
