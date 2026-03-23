import { useEffect, useState } from 'react'
import { getAllSessions, type JournalSession } from '../db'

interface Props {
  onStartNew: () => void
  onViewSession: (id: string) => void
}

const MOOD_COLORS: Record<string, string> = {
  anxious: '#E8A87C',
  sad: '#7CA9E8',
  hopeful: '#7CE8A4',
  calm: '#A87CE8',
  frustrated: '#E87C7C',
  grateful: '#7CE8D4',
  confused: '#D4E87C',
  energized: '#E8D47C',
  overwhelmed: '#E87CB8',
  content: '#B8E87C',
  neutral: '#C0C0C0',
}

function MoodDot({ label }: { label: string | null }) {
  const color = MOOD_COLORS[label ?? 'neutral'] ?? '#C0C0C0'
  return (
    <span
      className="mood-dot"
      style={{ background: color }}
      title={label ?? 'neutral'}
    />
  )
}

function ScoreBar({ score }: { score: number | null }) {
  if (score === null) return null
  return (
    <div className="score-bar-track">
      <div
        className="score-bar-fill"
        style={{ width: `${(score / 10) * 100}%` }}
      />
    </div>
  )
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function HistoryPage({ onStartNew, onViewSession }: Props) {
  const [sessions, setSessions] = useState<JournalSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAllSessions().then((s) => {
      setSessions(s)
      setLoading(false)
    })
  }, [])

  const completedSessions = sessions.filter((s) => s.endedAt !== null)
  const avgMood =
    completedSessions.filter((s) => s.moodScore !== null).length > 0
      ? completedSessions
          .filter((s) => s.moodScore !== null)
          .reduce((acc, s) => acc + (s.moodScore ?? 0), 0) /
        completedSessions.filter((s) => s.moodScore !== null).length
      : null

  return (
    <div className="history-page">
      <header className="history-header">
        <h2>Your reflections</h2>
        <button className="primary-btn small" onClick={onStartNew}>
          New session
        </button>
      </header>

      {/* Stats strip */}
      {completedSessions.length > 0 && (
        <div className="stats-strip">
          <div className="stat-card">
            <span className="stat-num">{completedSessions.length}</span>
            <span className="stat-label">Sessions</span>
          </div>
          <div className="stat-card">
            <span className="stat-num">
              {completedSessions.reduce((a, s) => a + s.turnCount, 0)}
            </span>
            <span className="stat-label">Reflections</span>
          </div>
          {avgMood !== null && (
            <div className="stat-card">
              <span className="stat-num">{avgMood.toFixed(1)}</span>
              <span className="stat-label">Avg mood</span>
            </div>
          )}
        </div>
      )}

      {loading && <p className="history-empty">Loading…</p>}

      {!loading && sessions.length === 0 && (
        <div className="history-empty">
          <p>No sessions yet.</p>
          <p>Start speaking — your reflections live only on this device.</p>
          <button className="primary-btn" onClick={onStartNew}>
            Begin your first session
          </button>
        </div>
      )}

      <div className="session-list">
        {sessions.map((s) => (
          <button
            key={s.id}
            className="session-card"
            onClick={() => onViewSession(s.id)}
          >
            <div className="session-card-top">
              <MoodDot label={s.moodLabel} />
              <span className="session-title">{s.title}</span>
              <span className="session-date">{formatRelative(s.startedAt)}</span>
            </div>
            {s.summary && <p className="session-summary">{s.summary}</p>}
            <div className="session-meta">
              <ScoreBar score={s.moodScore} />
              <span className="session-turns">{s.turnCount} turns</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
