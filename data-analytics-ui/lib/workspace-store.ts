/**
 * Workspace Store
 * 
 * Local-first storage layer for workspaces.
 * Uses IndexedDB with localStorage fallback.
 * 
 * All operations are async to support IndexedDB.
 * Falls back to localStorage if IndexedDB is unavailable.
 */

import { create } from "zustand"
import type { Workspace } from "@/types/workspace"

const DB_NAME = "data4viz_workspaces"
const DB_VERSION = 1
const STORE_NAME = "workspaces"
const ACTIVE_WORKSPACE_KEY = "data4viz_active_workspace"

/**
 * Check if IndexedDB is available
 */
function isIndexedDBAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window
}

/**
 * Initialize IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB not available"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
    }
  })
}

/**
 * Workspace Store Implementation
 */
class WorkspaceStore {
  private useIndexedDB: boolean = false
  private db: IDBDatabase | null = null

  /**
   * Initialize store (detect storage method)
   */
  async init(): Promise<void> {
    if (isIndexedDBAvailable()) {
      try {
        this.db = await openDB()
        this.useIndexedDB = true
      } catch (error) {
        console.warn("IndexedDB initialization failed, falling back to localStorage", error)
        this.useIndexedDB = false
      }
    } else {
      this.useIndexedDB = false
    }
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(name: string): Promise<Workspace> {
    const workspace: Workspace = {
      id: `workspace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      datasets: [],
      state: {
        datasetAttached: false,
        overviewReady: false,
        cleaningStarted: false,
      },
      notes: "",
      steps: {
        cleaningSteps: [],
      },
      version: "1.0",
    }

    await this.saveWorkspace(workspace)
    return workspace
  }

  /**
   * Load a workspace by ID
   */
  async loadWorkspace(id: string): Promise<Workspace | null> {
    if (this.useIndexedDB && this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], "readonly")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(id)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const result = request.result
          resolve(result || null)
        }
      })
    } else {
      // localStorage fallback
      const key = `workspace_${id}`
      const data = localStorage.getItem(key)
      if (!data) return null

      try {
        return JSON.parse(data) as Workspace
      } catch {
        return null
      }
    }
  }

  /**
   * Save a workspace
   */
  async saveWorkspace(workspace: Workspace): Promise<void> {
    const updatedWorkspace: Workspace = {
      ...workspace,
      updatedAt: Date.now(),
    }

    if (this.useIndexedDB && this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(updatedWorkspace)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    } else {
      // localStorage fallback
      const key = `workspace_${updatedWorkspace.id}`
      localStorage.setItem(key, JSON.stringify(updatedWorkspace))

      // Also maintain a list of workspace IDs
      const workspaceList = this.getWorkspaceList()
      if (!workspaceList.includes(updatedWorkspace.id)) {
        workspaceList.push(updatedWorkspace.id)
        localStorage.setItem("workspace_list", JSON.stringify(workspaceList))
      }
    }
  }

  /**
   * List all workspaces
   */
  async listWorkspaces(): Promise<Workspace[]> {
    if (this.useIndexedDB && this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], "readonly")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.getAll()

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result || [])
      })
    } else {
      // localStorage fallback
      const workspaceList = this.getWorkspaceList()
      const workspaces: Workspace[] = []

      for (const id of workspaceList) {
        const key = `workspace_${id}`
        const data = localStorage.getItem(key)
        if (data) {
          try {
            workspaces.push(JSON.parse(data) as Workspace)
          } catch {
            // Skip invalid entries
          }
        }
      }

      return workspaces.sort((a, b) => b.updatedAt - a.updatedAt)
    }
  }

  /**
   * Delete a workspace
   */
  async deleteWorkspace(id: string): Promise<void> {
    if (this.useIndexedDB && this.db) {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.delete(id)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve()
      })
    } else {
      // localStorage fallback
      const key = `workspace_${id}`
      localStorage.removeItem(key)

      const workspaceList = this.getWorkspaceList()
      const filtered = workspaceList.filter((wid) => wid !== id)
      localStorage.setItem("workspace_list", JSON.stringify(filtered))
    }
  }

  /**
   * Set active workspace ID
   */
  setActiveWorkspace(id: string | null): void {
    if (id) {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
    }
  }

  /**
   * Get active workspace ID
   */
  getActiveWorkspace(): string | null {
    return localStorage.getItem(ACTIVE_WORKSPACE_KEY)
  }

  /**
   * Get workspace list from localStorage (helper for fallback)
   */
  private getWorkspaceList(): string[] {
    const data = localStorage.getItem("workspace_list")
    if (!data) return []
    try {
      return JSON.parse(data) as string[]
    } catch {
      return []
    }
  }
}

// Singleton instance
export const workspaceStore = new WorkspaceStore()

/**
 * Zustand store for workspace state
 * Provides reactive hook interface for components
 */
interface WorkspaceState {
  currentWorkspace: Workspace | null
  setCurrentWorkspace: (workspace: Workspace | null) => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  currentWorkspace: null,
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
}))
