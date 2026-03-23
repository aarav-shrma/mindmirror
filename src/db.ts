import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

// ─── Schema ───────────────────────────────────────────────────────────────────
// sessions   → one per journaling conversation
// entries    → individual voice turns within a session
// insights   → AI-generated pattern insights across sessions

export interface JournalSession {
  id: string               // uuid
  startedAt: number        // Date.now()
  endedAt: number | null
  title: string            // auto-generated summary title
  moodScore: number | null // 1-10, derived from LLM
  moodLabel: string | null // e.g. "anxious", "hopeful", "calm"
  summary: string | null   // 1-2 sentence LLM summary
  turnCount: number
}

export interface JournalEntry {
  id: string
  sessionId: string
  timestamp: number
  role: 'user' | 'coach'
  transcript: string       // STT output or LLM text response
  audioBlob?: Blob         // optional: raw user audio
}

export interface Insight {
  id: string
  generatedAt: number
  type: 'pattern' | 'streak' | 'shift'
  title: string
  body: string
  relatedSessionIds: string[]
}

interface MindMirrorDB extends DBSchema {
  sessions: {
    key: string
    value: JournalSession
    indexes: { 'by-startedAt': number }
  }
  entries: {
    key: string
    value: JournalEntry
    indexes: { 'by-sessionId': string; 'by-timestamp': number }
  }
  insights: {
    key: string
    value: Insight
    indexes: { 'by-generatedAt': number }
  }
}

let _db: IDBPDatabase<MindMirrorDB> | null = null

export async function getDB(): Promise<IDBPDatabase<MindMirrorDB>> {
  if (_db) return _db
  _db = await openDB<MindMirrorDB>('mindmirror', 1, {
    upgrade(db) {
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
      sessions.createIndex('by-startedAt', 'startedAt')

      const entries = db.createObjectStore('entries', { keyPath: 'id' })
      entries.createIndex('by-sessionId', 'sessionId')
      entries.createIndex('by-timestamp', 'timestamp')

      const insights = db.createObjectStore('insights', { keyPath: 'id' })
      insights.createIndex('by-generatedAt', 'generatedAt')
    },
  })
  return _db
}

// ─── Session helpers ───────────────────────────────────────────────────────────

export function newId(): string {
  return crypto.randomUUID()
}

export async function createSession(): Promise<JournalSession> {
  const db = await getDB()
  const session: JournalSession = {
    id: newId(),
    startedAt: Date.now(),
    endedAt: null,
    title: 'New session',
    moodScore: null,
    moodLabel: null,
    summary: null,
    turnCount: 0,
  }
  await db.add('sessions', session)
  return session
}

export async function updateSession(
  id: string,
  patch: Partial<JournalSession>
): Promise<void> {
  const db = await getDB()
  const existing = await db.get('sessions', id)
  if (!existing) return
  await db.put('sessions', { ...existing, ...patch })
}

export async function getAllSessions(): Promise<JournalSession[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sessions', 'by-startedAt')
  return all.reverse() // newest first
}

export async function getSessionEntries(sessionId: string): Promise<JournalEntry[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('entries', 'by-sessionId', sessionId)
  return all.sort((a, b) => a.timestamp - b.timestamp)
}

export async function addEntry(entry: Omit<JournalEntry, 'id'>): Promise<JournalEntry> {
  const db = await getDB()
  const full: JournalEntry = { id: newId(), ...entry }
  await db.add('entries', full)
  // bump session turn count
  const session = await db.get('sessions', entry.sessionId)
  if (session) {
    await db.put('sessions', { ...session, turnCount: session.turnCount + 1 })
  }
  return full
}

export async function saveInsight(insight: Omit<Insight, 'id'>): Promise<Insight> {
  const db = await getDB()
  const full: Insight = { id: newId(), ...insight }
  await db.add('insights', full)
  return full
}

export async function getRecentInsights(limit = 5): Promise<Insight[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('insights', 'by-generatedAt')
  return all.reverse().slice(0, limit)
}
