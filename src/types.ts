import type { ReactNode } from 'react'

export type FeedbackType = 'bug' | 'feature_request' | 'improvement' | 'question'
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical'

export interface FeedbackImage {
  id: string
  url: string
  name: string
  type: string
}

export interface FeedbackPayload {
  title: string
  description: string
  type: FeedbackType
  priority: FeedbackPriority
  tags: string[]
  images: FeedbackImage[]
}

export interface FeedbackProviderProps {
  projectId: string
  appId: string
  projectsMsToken: string
  projectsMsBaseUrl: string
  filesMsApiBaseUrl: string
  filesMsToken: string
  fabBackground?: string
  children: ReactNode
}

export interface FeedbackContextValue {
  projectId: string
  appId: string
  projectsMsToken: string
  projectsMsBaseUrl: string
}
