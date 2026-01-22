export interface CachedWorkspaceFile {
  id: string
  name: string
  size?: number
  type: string
  created_at?: string
  updated_at?: string
}

const cache = new Map<string, CachedWorkspaceFile[]>()

export function getFiles(workspaceId: string): CachedWorkspaceFile[] | undefined {
  return cache.get(workspaceId)
}

export function setFiles(workspaceId: string, files: CachedWorkspaceFile[]): void {
  cache.set(workspaceId, files)
}

export function invalidateForWorkspace(workspaceId: string): void {
  cache.delete(workspaceId)
}
