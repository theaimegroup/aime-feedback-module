export interface UploadedImage {
  id: string
  url: string
  name: string
  type: string
}

export async function uploadImage(
  source: string | File,
  projectId: string,
  filesMsApiBaseUrl: string,
  filesMsToken: string,
  signal?: AbortSignal,
): Promise<UploadedImage | null> {
  try {
    const file = typeof source === 'string' ? null : source
    const blob = file ?? (await fetch(source).then((r) => r.blob()))
    const name = file?.name || 'screenshot.png'
    const type = file?.type || 'image/png'

    const form = new FormData()
    form.append('file', blob, name)
    form.append('project_id', projectId)
    form.append('board_type', 'think_space')
    form.append('board_id', 'feedback')

    const controller = new AbortController()
    const relayAbort = () => controller.abort()
    signal?.addEventListener('abort', relayAbort)
    const timeout = setTimeout(() => controller.abort(), 20000)
    let res: Response
    try {
      res = await fetch(`${filesMsApiBaseUrl}/model-feedback/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${filesMsToken}` },
        body: form,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', relayAbort)
    }

    if (!res.ok) return null

    const json = (await res.json()) as { url?: string }
    if (!json.url) return null

    return {
      id: crypto.randomUUID(),
      url: json.url,
      name,
      type,
    }
  } catch {
    return null
  }
}
