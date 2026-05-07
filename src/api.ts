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
    const msg = await res.text().catch(() => 'Unknown error')
    throw new Error(msg)
  }
}
