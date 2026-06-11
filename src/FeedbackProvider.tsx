import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { FeedbackWidget } from './FeedbackWidget'
import { FeedbackErrorBoundary } from './FeedbackErrorBoundary'
import { parseNotifyUsers } from './parseNotifyUsers'
import type { FeedbackContextValue, FeedbackProviderProps, FeedbackWidgetHandle } from './types'

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within a <FeedbackProvider>')
  return ctx
}

export function FeedbackProvider({
  projectId,
  projectsMsToken,
  projectsMsBaseUrl,
  filesMsApiBaseUrl,
  filesMsToken,
  fabBackground,
  showFab,
  teamsUrl,
  userName,
  userEmail,
  notifyUsers,
  children,
}: FeedbackProviderProps) {
  const widgetRef = useRef<FeedbackWidgetHandle>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)

  const open  = useCallback(() => widgetRef.current?.open(),  [])
  const close = useCallback(() => widgetRef.current?.close(), [])

  // `notifyUsers` may arrive as a NotifyUser[] or as a raw env string (JSON,
  // base64, or a mangled/escaped variant). Normalize defensively — a malformed
  // value must never crash the host app.
  const safeNotifyUsers = useMemo(() => parseNotifyUsers(notifyUsers as unknown), [notifyUsers])

  const value = useMemo<FeedbackContextValue>(
    () => ({ open, close, isOpen, isCapturing }),
    [open, close, isOpen, isCapturing],
  )

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackErrorBoundary>
        <FeedbackWidget
          ref={widgetRef}
          projectId={projectId}
          projectsMsToken={projectsMsToken}
          projectsMsBaseUrl={projectsMsBaseUrl}
          filesMsApiBaseUrl={filesMsApiBaseUrl}
          filesMsToken={filesMsToken}
          fabBackground={fabBackground}
          showFab={showFab}
          teamsUrl={teamsUrl}
          userName={userName}
          userEmail={userEmail}
          notifyUsers={safeNotifyUsers}
          onOpenChange={setIsOpen}
          onCapturingChange={setIsCapturing}
        />
      </FeedbackErrorBoundary>
    </FeedbackContext.Provider>
  )
}
