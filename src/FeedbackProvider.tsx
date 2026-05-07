import React, { createContext, useContext } from 'react'
import { FeedbackWidget } from './FeedbackWidget'
import type { FeedbackContextValue, FeedbackProviderProps } from './types'

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function useFeedback() {
  return useContext(FeedbackContext)
}

export function FeedbackProvider({ projectId, appId, token, apiBaseUrl, filesApiBaseUrl, filesToken, fabBackground, children }: FeedbackProviderProps) {
  return (
    <FeedbackContext.Provider value={{ projectId, appId, token, apiBaseUrl }}>
      {children}
      <FeedbackWidget
        projectId={projectId}
        appId={appId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        filesApiBaseUrl={filesApiBaseUrl}
        filesToken={filesToken}
        fabBackground={fabBackground}
      />
    </FeedbackContext.Provider>
  )
}
