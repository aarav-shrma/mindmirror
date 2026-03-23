import {
  RunAnywhere,
  SDKEnvironment,
  ModelManager,
  ModelCategory,
  LLMFramework,
  EventBus,
  type CompactModelDef,
} from '@runanywhere/web'
import { LlamaCPP } from '@runanywhere/web-llamacpp'
import { ONNX } from '@runanywhere/web-onnx'

const MODELS: CompactModelDef[] = [
  {
    id: 'lfm2-350m-q4_k_m',
    name: 'LFM2 350M (Coach)',
    repo: 'LiquidAI/LFM2-350M-GGUF',
    files: ['LFM2-350M-Q4_K_M.gguf'],
    framework: LLMFramework.LlamaCpp,
    modality: ModelCategory.Language,
    memoryRequirement: 250_000_000,
  },
  {
    id: 'sherpa-onnx-whisper-tiny.en',
    name: 'Whisper Tiny (Transcription)',
    url: 'https://huggingface.co/runanywhere/sherpa-onnx-whisper-tiny.en/resolve/main/sherpa-onnx-whisper-tiny.en.tar.gz',
    framework: LLMFramework.ONNX,
    modality: ModelCategory.SpeechRecognition,
    memoryRequirement: 105_000_000,
    artifactType: 'archive' as const,
  },
  {
    id: 'vits-piper-en_US-lessac-medium',
    name: 'Piper TTS (Voice)',
    url: 'https://huggingface.co/runanywhere/vits-piper-en_US-lessac-medium/resolve/main/vits-piper-en_US-lessac-medium.tar.gz',
    framework: LLMFramework.ONNX,
    modality: ModelCategory.SpeechSynthesis,
    memoryRequirement: 65_000_000,
    artifactType: 'archive' as const,
  },
  {
    id: 'silero-vad-v5',
    name: 'Silero VAD (Speech Detection)',
    url: 'https://huggingface.co/runanywhere/silero-vad-v5/resolve/main/silero_vad.onnx',
    files: ['silero_vad.onnx'],
    framework: LLMFramework.ONNX,
    modality: ModelCategory.Audio,
    memoryRequirement: 5_000_000,
  },
]

let _initPromise: Promise<void> | null = null

export async function initSDK(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    await RunAnywhere.initialize({
      environment: SDKEnvironment.Development,
      debug: false,
    })
    await LlamaCPP.register()
    await ONNX.register()
    RunAnywhere.registerModels(MODELS)
  })()
  return _initPromise
}

export type DownloadProgress = { modelId: string; name: string; progress: number }

export async function loadAllVoiceModels(
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  const modelIds = [
    'silero-vad-v5',
    'sherpa-onnx-whisper-tiny.en',
    'lfm2-350m-q4_k_m',
    'vits-piper-en_US-lessac-medium',
  ]

  const unsub = EventBus.shared.on('model.downloadProgress', (evt: any) => {
    const model = MODELS.find((m) => m.id === evt.modelId)
    onProgress({
      modelId: evt.modelId,
      name: model?.name ?? evt.modelId,
      progress: evt.progress ?? 0,
    })
  })

  for (const id of modelIds) {
    const status = ModelManager.getModels().find((m) => m.id === id)?.status
    if (status !== 'downloaded' && status !== 'loaded') {
      await ModelManager.downloadModel(id)
    }
    await ModelManager.loadModel(id, { coexist: true })
  }

  unsub()
}

export function allModelsLoaded(): boolean {
  return (
    !!ModelManager.getLoadedModel(ModelCategory.Audio) &&
    !!ModelManager.getLoadedModel(ModelCategory.SpeechRecognition) &&
    !!ModelManager.getLoadedModel(ModelCategory.Language) &&
    !!ModelManager.getLoadedModel(ModelCategory.SpeechSynthesis)
  )
}

export { ModelManager, ModelCategory }
