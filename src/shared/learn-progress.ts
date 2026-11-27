export type LearnProgressStage = 'preparing' | 'searching' | 'answering' | 'drawing' | 'tool' | 'checking' | 'saving'

export interface LearnProgressEvent {
  requestId: string
  stage: LearnProgressStage
  text?: string
}

export interface LearnPhaseStatus {
  phase: string
  label: string
  point: string
  canPractice: boolean
}

export interface QueuedLearnMessage {
  id: string
  sessionId: string
  text: string
  at: string
}
