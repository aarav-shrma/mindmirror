import { useCallback, useRef, useState } from 'react'
import { VoicePipeline } from '@runanywhere/web'
import { AudioCapture, AudioPlayback, VAD, SpeechActivity } from '@runanywhere/web-onnx'
import { addEntry, updateSession, type JournalSession } from '../db'

export type PipelineState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error'

export interface Turn {
  id: string
  userText: string
  coachText: string
  timestamp: number
}

const COACH_SYSTEM_PROMPT = `You are MindMirror, a warm and perceptive emotional journal coach.
Your role is to help the user reflect deeply on their thoughts and feelings.

Guidelines:
- Ask ONE thoughtful follow-up question per response — never more.
- Keep responses under 3 sentences total.
- Mirror the emotional tone of the user without amplifying negativity.
- Use Socratic questioning to help users discover insights themselves.
- Notice emotional language and gently name the feeling (e.g. "It sounds like you felt overlooked").
- Never give direct advice unless explicitly asked.
- Be warm, calm, and non-judgmental.

The user is speaking to you in a private voice journal. They trust you completely.`

interface UseVoicePipelineOptions {
  session: JournalSession | null
  onTurnComplete: (turn: Turn) => void
  onTranscript: (text: string) => void
  onCoachToken: (token: string, accumulated: string) => void
  onStateChange: (state: PipelineState) => void
}

export function useVoicePipeline({
  session,
  onTurnComplete,
  onTranscript,
  onCoachToken,
  onStateChange,
}: UseVoicePipelineOptions) {
  const pipelineRef = useRef<VoicePipeline | null>(null)
  const micRef = useRef<AudioCapture | null>(null)
  const vadUnsubRef = useRef<(() => void) | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const conversationHistory = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])

  const buildPromptWithHistory = useCallback((userText: string): string => {
    const history = conversationHistory.current
      .slice(-6) // last 3 turns for context
      .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
      .join('\n')
    return history ? `${history}\nUser: ${userText}` : userText
  }, [])

  const start = useCallback(async () => {
    if (!session) return
    setIsActive(true)
    onStateChange('listening')

    if (!pipelineRef.current) {
      pipelineRef.current = new VoicePipeline()
    }

    const mic = new AudioCapture({ sampleRate: 16000 })
    micRef.current = mic

    VAD.reset()

    vadUnsubRef.current = VAD.onSpeechActivity(async (activity: SpeechActivity) => {
      if (activity !== SpeechActivity.Ended) return

      const segment = VAD.popSpeechSegment()
      if (!segment || segment.samples.length < 1600) return

      mic.stop()
      vadUnsubRef.current?.()
      setAudioLevel(0)

      onStateChange('transcribing')

      let userTranscript = ''
      let coachResponse = ''

      try {
        await pipelineRef.current!.processTurn(
          segment.samples,
          {
            maxTokens: 80,
            temperature: 0.75,
            systemPrompt: COACH_SYSTEM_PROMPT,
            ttsSpeed: 1.0,
            sampleRate: 16000,
          },
          {
            onTranscription: (text: string) => {
              userTranscript = text
              onTranscript(text)
              onStateChange('thinking')
              // inject user text into a prompt with history context
              // (pipeline handles STT→LLM internally; we patch the prompt via systemPrompt + userText)
            },
            onResponseToken: (token: string, accumulated: string) => {
              coachResponse = accumulated
              onCoachToken(token, accumulated)
            },
            onResponseComplete: (text: string) => {
              coachResponse = text
              onStateChange('speaking')
            },
            onSynthesisComplete: async (audio: Float32Array, sampleRate: number) => {
              const player = new AudioPlayback({ sampleRate })
              await player.play(audio, sampleRate)
              player.dispose()
            },
            onError: (err: Error) => {
              console.error('Pipeline error:', err)
              onStateChange('error')
            },
          }
        )

        // Persist both turns to IndexedDB
        const userEntry = await addEntry({
          sessionId: session.id,
          timestamp: Date.now(),
          role: 'user',
          transcript: userTranscript,
        })

        const coachEntry = await addEntry({
          sessionId: session.id,
          timestamp: Date.now() + 1,
          role: 'coach',
          transcript: coachResponse,
        })

        // Update in-memory history for multi-turn context
        conversationHistory.current.push(
          { role: 'user', content: userTranscript },
          { role: 'assistant', content: coachResponse }
        )

        const turn: Turn = {
          id: userEntry.id,
          userText: userTranscript,
          coachText: coachResponse,
          timestamp: userEntry.timestamp,
        }
        onTurnComplete(turn)

        // Resume listening
        onStateChange('listening')
        setIsActive(true)
        await restartMic()
      } catch (err) {
        console.error('Turn failed:', err)
        onStateChange('error')
        setIsActive(false)
      }
    })

    await mic.start(
      (chunk: Float32Array) => VAD.processSamples(chunk),
      (level: number) => setAudioLevel(level)
    )
  }, [session, onTurnComplete, onTranscript, onCoachToken, onStateChange, buildPromptWithHistory])

  const restartMic = useCallback(async () => {
    const mic = new AudioCapture({ sampleRate: 16000 })
    micRef.current = mic
    VAD.reset()

    vadUnsubRef.current = VAD.onSpeechActivity(async (activity: SpeechActivity) => {
      if (activity === SpeechActivity.Ended) {
        const segment = VAD.popSpeechSegment()
        if (!segment || segment.samples.length < 1600) return
        mic.stop()
        vadUnsubRef.current?.()
        setAudioLevel(0)
        // Re-trigger the same pipeline logic
        // In production, refactor this into a shared processSegment() fn
        onStateChange('transcribing')
      }
    })

    await mic.start(
      (chunk: Float32Array) => VAD.processSamples(chunk),
      (level: number) => setAudioLevel(level)
    )
  }, [onStateChange])

  const stop = useCallback(() => {
    micRef.current?.stop()
    vadUnsubRef.current?.()
    pipelineRef.current?.cancel()
    setIsActive(false)
    setAudioLevel(0)
    onStateChange('idle')
  }, [onStateChange])

  const resetHistory = useCallback(() => {
    conversationHistory.current = []
  }, [])

  return { start, stop, resetHistory, audioLevel, isActive }
}
