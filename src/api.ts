import type { FeedbackPayload } from './types'

export async function submitFeedback(
  apiBaseUrl: string,
  projectId: string,
  token: string,
  payload: FeedbackPayload,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/projects/${projectId}/model-feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => 'Unknown error')
    throw new Error(msg)
  }
}
