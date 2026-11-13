const DB_NAME = 'aime-feedback'
const DB_VERSION = 1
const STORE = 'draft-screenshots'

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function saveDraftScreenshot(key: string, dataUrl: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(dataUrl, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
}

export async function getDraftScreenshot(key: string): Promise<string | null> {
  const db = await openDb()
  if (!db) return null
  const value = await new Promise<string | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(key)
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  db.close()
  return value
}

export async function deleteDraftScreenshot(key: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
  db.close()
}
