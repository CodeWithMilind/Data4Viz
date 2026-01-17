import type { OverviewResponse } from "@/lib/api/dataCleaningClient"

const cache = new Map<string, OverviewResponse>()

function key(w: string, d: string) {
  return `${w}:${d}`
}

export function getOverview(workspaceId: string, datasetId: string): OverviewResponse | undefined {
  return cache.get(key(workspaceId, datasetId))
}

export function setOverview(workspaceId: string, datasetId: string, data: OverviewResponse): void {
  cache.set(key(workspaceId, datasetId), data)
}

export function invalidateForWorkspace(workspaceId: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(workspaceId + ":")) cache.delete(k)
  }
}
