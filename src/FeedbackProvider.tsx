import React, { createContext, useContext } from 'react'
import { FeedbackWidget } from './FeedbackWidget'
import type { FeedbackContextValue, FeedbackProviderProps } from './types'

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function useFeedback() {
  return useContext(FeedbackContext)
}

export function FeedbackProvider({ projectId, appId, projectsMsToken, projectsMsBaseUrl, filesMsApiBaseUrl, filesMsToken, fabBackground, children }: FeedbackProviderProps) {
  return (
    <FeedbackContext.Provider value={{ projectId, appId, projectsMsToken, projectsMsBaseUrl }}>
      {children}
      <FeedbackWidget
        projectId={projectId}
        appId={appId}
        projectsMsToken={projectsMsToken}
        projectsMsBaseUrl={projectsMsBaseUrl}
        filesMsApiBaseUrl={filesMsApiBaseUrl}
        filesMsToken={filesMsToken}
        fabBackground={fabBackground}
      />
    </FeedbackContext.Provider>
  )
}
