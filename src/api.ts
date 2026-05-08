import type { FeedbackPayload } from './types'

export async function submitFeedback(
  projectsMsBaseUrl: string,
  projectId: string,
  projectsMsToken: string,
  payload: FeedbackPayload,
): Promise<void> {
  const res = await fetch(`${projectsMsBaseUrl}/api/projects/${projectId}/model-feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${projectsMsToken}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    let msg = 'Failed to submit feedback. Please try again.'
    try {
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) {
        const json = await res.json()
        msg = json?.message || json?.error || msg
      }
    } catch {}
    throw new Error(msg)
  }
}
