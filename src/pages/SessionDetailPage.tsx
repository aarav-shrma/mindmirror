import { useEffect, useState } from 'react'
import { getSessionEntries, getAllSessions, type JournalSession, type JournalEntry } from '../db'

interface Props {
  sessionId: string
  onBack: () => void
}

export function SessionDetailPage({ sessionId, onBack }: Props) {
  const [session, setSession] = useState<JournalSession | null>(null)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAllSessions(), getSessionEntries(sessionId)]).then(
      ([sessions, entries]) => {
        setSession(sessions.find((s) => s.id === sessionId) ?? null)
        setEntries(entries)
        setLoading(false)
      }
    )
  }, [sessionId])

  if (loading) return <div className="detail-page"><p>Loading…</p></div>
  if (!session) return <div className="detail-page"><p>Session not found.</p></div>

  return (
    <div className="detail-page">
      <header className="detail-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="detail-title-block">
          <h2>{session.title}</h2>
          <span className="detail-meta">
            {new Date(session.startedAt).toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
            {session.moodLabel && (
              <span className="mood-badge">{session.moodLabel}</span>
            )}
          </span>
        </div>
      </header>

      {session.summary && (
        <div className="detail-summary">
          <p>{session.summary}</p>
        </div>
      )}

      <div className="transcript-list">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className={`transcript-entry ${entry.role}`}
          >
            <span className="entry-role">{entry.role === 'user' ? 'You' : 'Mirror'}</span>
            <p className="entry-text">{entry.transcript}</p>
            <span className="entry-time">
              {new Date(entry.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
