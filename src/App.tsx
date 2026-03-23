import { useState, useCallback } from 'react'
import { ModelLoader } from './components/ModelLoader'
import { JournalPage } from './pages/JournalPage'
import { HistoryPage } from './pages/HistoryPage'
import { SessionDetailPage } from './pages/SessionDetailPage'
import './styles/global.css'

type View =
  | { name: 'loader' }
  | { name: 'journal' }
  | { name: 'history' }
  | { name: 'detail'; sessionId: string }

export default function App() {
  const [view, setView] = useState<View>({ name: 'loader' })

  const handleModelsReady = useCallback(() => {
    setView({ name: 'history' })
  }, [])

  const handleStartNew = useCallback(() => {
    setView({ name: 'journal' })
  }, [])

  const handleSessionEnd = useCallback(() => {
    setView({ name: 'history' })
  }, [])

  const handleViewSession = useCallback((sessionId: string) => {
    setView({ name: 'detail', sessionId })
  }, [])

  const handleBack = useCallback(() => {
    setView({ name: 'history' })
  }, [])

  return (
    <div className="app-root">
      {view.name === 'loader' && <ModelLoader onReady={handleModelsReady} />}
      {view.name === 'journal' && <JournalPage onSessionEnd={handleSessionEnd} />}
      {view.name === 'history' && (
        <HistoryPage onStartNew={handleStartNew} onViewSession={handleViewSession} />
      )}
      {view.name === 'detail' && (
        <SessionDetailPage sessionId={view.sessionId} onBack={handleBack} />
      )}
    </div>
  )
}
