export interface UploadedImage {
  id: string
  url: string
  name: string
  type: string
}

export async function uploadImage(
  dataUrl: string,
  projectId: string,
  filesMsApiBaseUrl: string,
  filesMsToken: string,
): Promise<UploadedImage | null> {
  try {
    const blob = await fetch(dataUrl).then((r) => r.blob())

    const form = new FormData()
    form.append('file', blob, 'screenshot.png')
    form.append('project_id', projectId)
    form.append('board_type', 'think_space')
    form.append('board_id', 'feedback')

    const res = await fetch(`${filesMsApiBaseUrl}/model-feedback/image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${filesMsToken}` },
      body: form,
    })

    if (!res.ok) return null

    const json = (await res.json()) as { url?: string }
    if (!json.url) return null

    return {
      id: crypto.randomUUID(),
      url: json.url,
      name: 'screenshot.png',
      type: 'image/png',
    }
  } catch {
    return null
  }
}
