import type { ReactNode } from 'react'

export type FeedbackType = 'bug' | 'feature_request' | 'improvement' | 'question'
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical'

export interface FeedbackImage {
  id: string
  url: string
  name: string
  type: string
}

export interface FeedbackComment {
  text: string
  author_name: string
  source: 'user' | 'annotation'
  metadata?: { note_color?: string }
}

export interface FeedbackMeta {
  url: string
  page_title?: string
  browser?: string
  os?: string
  screen?: string
}

export interface FeedbackPayload {
  title: string
  description: string
  type: FeedbackType
  priority: FeedbackPriority
  tags: string[]
  images: FeedbackImage[]
  comments: FeedbackComment[]
  metadata?: FeedbackMeta
}

export interface FeedbackProviderProps {
  projectId: string
  appId: string
  projectsMsToken: string
  projectsMsBaseUrl: string
  filesMsApiBaseUrl: string
  filesMsToken: string
  fabBackground?: string
  /** Name shown as the comment author when the user submits feedback with annotations */
  userName?: string
  children: ReactNode
}

export interface FeedbackContextValue {
  projectId: string
  appId: string
  projectsMsToken: string
  projectsMsBaseUrl: string
}
