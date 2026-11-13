import type { FeedbackPayload, FeedbackStatus, FeedbackSubmission } from './types'

export async function submitFeedback(
  projectsMsBaseUrl: string,
  projectId: string,
  projectsMsToken: string,
  payload: FeedbackPayload,
  signal?: AbortSignal,
): Promise<FeedbackSubmission> {
  const url = `${projectsMsBaseUrl}/${projectId}/model-feedback`
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${projectsMsToken}`,
    },
    body: JSON.stringify(payload),
  }

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Submission cancelled', 'AbortError')
    const attemptController = new AbortController()
    const relayAbort = () => attemptController.abort()
    signal?.addEventListener('abort', relayAbort)
    const timeout = setTimeout(() => attemptController.abort(), 12000)
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: attemptController.signal })
    } catch {
      if (signal?.aborted) throw new DOMException('Submission cancelled', 'AbortError')
      lastError = new Error("Submission failed. Your draft is saved. Try again when you're ready.")
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt))
        continue
      }
      throw lastError
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', relayAbort)
    }

    if (res.ok) {
      try {
        const json = (await res.json()) as {
          data?: { _id?: string; feedback_number?: number; status?: FeedbackStatus; status_url?: string }
        }
        return {
          id: json.data?._id,
          feedbackNumber: json.data?.feedback_number,
          status: json.data?.status,
          statusUrl: json.data?.status_url,
        }
      } catch {
        return {}
      }
    }

    let message = 'Failed to submit feedback. Please try again.'
    try {
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) {
        const json = await res.json()
        message = json?.message || json?.error || message
      }
    } catch {}

    // Retry transient server failures. The client submission id makes this safe.
    if (res.status >= 500 && attempt < 2) {
      lastError = new Error(message)
      await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt))
      continue
    }
    throw new Error(message)
  }

  throw lastError ?? new Error('Failed to submit feedback. Please try again.')
}
