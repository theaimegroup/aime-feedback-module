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
  projectsMsToken: string
  projectsMsBaseUrl: string
  filesMsApiBaseUrl: string
  filesMsToken: string
  fabBackground?: string
  /** Render the built-in floating action button. Set to `false` if you'll trigger the widget from a custom UI via `useFeedback()`. Defaults to `true`. */
  showFab?: boolean
  /** Optional URL of the AIME teams app (e.g. `https://teams.aime.works`). When provided, the modal header renders an "AIME Teams" link that deep-links to the project's feedback inbox. An env badge (DEV/BETA) is auto-derived from this URL. */
  teamsUrl?: string
  /** Name shown as the comment author when the user submits feedback with annotations */
  userName?: string
  children: ReactNode
}

export interface FeedbackContextValue {
  /** Open the feedback widget (triggers screenshot capture then renders the modal). */
  open: () => void
  /** Close the feedback widget. */
  close: () => void
  /** Whether the widget modal is currently open. */
  isOpen: boolean
  /** Whether a screenshot capture is in progress. */
  isCapturing: boolean
}

export interface FeedbackWidgetHandle {
  open: () => void
  close: () => void
}
