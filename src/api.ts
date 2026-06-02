import type { FeedbackPayload } from './types'

/**
 * AWS API Gateway URLs for projects-ms expect path `/projects/{id}/model-feedback`
 * under stage `projects`, so the consumer must pass `…/projects/projects` as the base.
 * Some platform-fe deployments only set `…/projects` (stage only). If we detect that
 * shape, transparently append the missing `/projects` resource segment so the widget
 * works against both correctly and mis-configured deployments.
 *
 * Non-API-Gateway URLs (localhost, custom domains, etc.) are returned untouched.
 */
function normalizeProjectsMsUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    if (!/\.execute-api\..+\.amazonaws\.com$/i.test(url.hostname)) return rawUrl
    const cleanPath = url.pathname.replace(/\/+$/, '')
    if (cleanPath === '/projects') {
      return rawUrl.replace(/\/+$/, '') + '/projects'
    }
    return rawUrl
  } catch {
    return rawUrl
  }
}

export async function submitFeedback(
  projectsMsBaseUrl: string,
  projectId: string,
  projectsMsToken: string,
  payload: FeedbackPayload,
): Promise<void> {
  const baseUrl = normalizeProjectsMsUrl(projectsMsBaseUrl)
  const res = await fetch(`${baseUrl}/${projectId}/model-feedback`, {
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
