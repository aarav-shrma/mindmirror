import { useState, useCallback, useEffect } from 'react'
import { useVoicePipeline, type PipelineState, type Turn } from '../hooks/useVoicePipeline'
import { useSessionSummary } from '../hooks/useSessionSummary'
import {
  createSession,
  getSessionEntries,
  type JournalSession,
} from '../db'

interface Props {
  onSessionEnd: () => void
}

const STATE_LABELS: Record<PipelineState, string> = {
  idle: 'Tap to begin',
  listening: 'Listening…',
  transcribing: 'Transcribing…',
  thinking: 'Reflecting…',
  speaking: 'Speaking…',
  error: 'Something went wrong',
}

export function JournalPage({ onSessionEnd }: Props) {
  const [session, setSession] = useState<JournalSession | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [liveCoach, setLiveCoach] = useState('')
  const [isEnding, setIsEnding] = useState(false)

  const { generateSummary } = useSessionSummary()

  const handleTurnComplete = useCallback((turn: Turn) => {
    setTurns((prev) => [...prev, turn])
    setLiveTranscript('')
    setLiveCoach('')
  }, [])

  const { start, stop, resetHistory, audioLevel, isActive } = useVoicePipeline({
    session,
    onTurnComplete: handleTurnComplete,
    onTranscript: setLiveTranscript,
    onCoachToken: (_token, accumulated) => setLiveCoach(accumulated),
    onStateChange: setPipelineState,
  })

  // Auto-create session on mount
  useEffect(() => {
    createSession().then(setSession)
  }, [])

  const handleStart = useCallback(async () => {
    if (!session) return
    resetHistory()
    await start()
  }, [session, start, resetHistory])

  const handleStop = useCallback(() => {
    stop()
  }, [stop])

  const handleEndSession = useCallback(async () => {
    if (!session || isEnding) return
    setIsEnding(true)
    stop()
    const entries = await getSessionEntries(session.id)
    await generateSummary(session, entries)
    onSessionEnd()
  }, [session, isEnding, stop, generateSummary, onSessionEnd])

  const orbScale = 1 + audioLevel * 0.4
  const orbOpacity = pipelineState === 'listening' ? 0.9 : 0.5

  return (
    <div className="journal-page">
      <header className="journal-header">
        <span className="journal-date">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <button className="end-session-btn" onClick={handleEndSession} disabled={isEnding}>
          {isEnding ? 'Saving…' : 'End session'}
        </button>
      </header>

      <div className="journal-body">
        {/* Conversation history */}
        <div className="turns-list">
          {turns.map((turn) => (
            <div key={turn.id} className="turn-block">
              <div className="turn-user">
                <span className="turn-label">You</span>
                <p>{turn.userText}</p>
              </div>
              <div className="turn-coach">
                <span className="turn-label">Mirror</span>
                <p>{turn.coachText}</p>
              </div>
            </div>
          ))}

          {/* Live turn in progress */}
          {liveTranscript && (
            <div className="turn-block live">
              <div className="turn-user">
                <span className="turn-label">You</span>
                <p>{liveTranscript}</p>
              </div>
              {liveCoach && (
                <div className="turn-coach">
                  <span className="turn-label">Mirror</span>
                  <p>{liveCoach}<span className="cursor-blink">|</span></p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Orb + controls */}
        <div className="orb-area">
          <div
            className={`orb orb-${pipelineState}`}
            style={{
              transform: `scale(${orbScale})`,
              opacity: orbOpacity,
            }}
          >
            <div className="orb-ring" />
            <div className="orb-ring orb-ring-2" />
          </div>

          <p className="state-label">{STATE_LABELS[pipelineState]}</p>

          <div className="control-row">
            {!isActive ? (
              <button
                className="primary-btn"
                onClick={handleStart}
                disabled={pipelineState === 'thinking' || pipelineState === 'speaking'}
              >
                {turns.length === 0 ? 'Start speaking' : 'Continue'}
              </button>
            ) : (
              <button className="stop-btn" onClick={handleStop}>
                Pause
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
