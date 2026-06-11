import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Last line of defense: if anything inside the feedback widget throws while
 * rendering — a malformed env var, bad config, an unexpected runtime error —
 * this boundary swallows it and renders nothing instead of taking down the
 * entire host app. The feedback tool failing should never crash the app it's
 * embedded in.
 */
export class FeedbackErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    if (typeof console !== 'undefined') {
      console.warn('[aime-feedback] Widget disabled after a runtime error:', error)
    }
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
