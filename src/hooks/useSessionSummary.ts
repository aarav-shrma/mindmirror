import { useCallback } from 'react'
import { TextGeneration } from '@runanywhere/web-llamacpp'
import { updateSession, type JournalSession, type JournalEntry } from '../db'

interface SessionSummary {
  title: string
  moodLabel: string
  moodScore: number
  summary: string
}

export function useSessionSummary() {
  const generateSummary = useCallback(
    async (session: JournalSession, entries: JournalEntry[]): Promise<SessionSummary> => {
      const userEntries = entries
        .filter((e) => e.role === 'user')
        .map((e) => e.transcript)
        .join(' | ')

      if (!userEntries.trim()) {
        return {
          title: 'Empty session',
          moodLabel: 'neutral',
          moodScore: 5,
          summary: 'No entries recorded.',
        }
      }

      const prompt = `Analyze this voice journal session and respond with ONLY a JSON object.

User said: "${userEntries}"

Return exactly this JSON (no extra text):
{
  "title": "<5 word session title>",
  "moodLabel": "<one word: anxious|sad|hopeful|calm|frustrated|grateful|confused|energized|overwhelmed|content>",
  "moodScore": <integer 1-10 where 1=very negative, 10=very positive>,
  "summary": "<1-2 sentence summary of key themes>"
}`

      const { stream, result: resultPromise } = await TextGeneration.generateStream(prompt, {
        maxTokens: 120,
        temperature: 0.3,
      })

      let raw = ''
      for await (const token of stream) {
        raw += token
      }
      await resultPromise

      // Extract JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return {
          title: 'Reflection session',
          moodLabel: 'neutral',
          moodScore: 5,
          summary: userEntries.slice(0, 100) + '...',
        }
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]) as SessionSummary
        // Persist to DB
        await updateSession(session.id, {
          title: parsed.title,
          moodLabel: parsed.moodLabel,
          moodScore: Math.min(10, Math.max(1, parsed.moodScore)),
          summary: parsed.summary,
          endedAt: Date.now(),
        })
        return parsed
      } catch {
        return {
          title: 'Reflection session',
          moodLabel: 'neutral',
          moodScore: 5,
          summary: 'Session recorded.',
        }
      }
    },
    []
  )

  return { generateSummary }
}
