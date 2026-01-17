"use client"

/**
 * Files Page
 * 
 * IMPORTANT: Workspace is the single source of truth.
 * Shows files from workspace storage (original datasets + cleaned datasets).
 * No fake or sample data - all files come from backend workspace storage.
 */

import { useState, useEffect, useCallback } from "react"
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileCode,
  Download,
  Trash2,
  Eye,
  Search,
  Grid,
  List,
  MoreVertical,
  Loader2,
  Database,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useWorkspace } from "@/contexts/workspace-context"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { getFiles, setFiles as setFilesCache, invalidateForWorkspace } from "@/lib/files-cache"

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface WorkspaceFile {
  id: string
  name: string
  size?: number
  type: string
  created_at?: string
  updated_at?: string
}

interface WorkspaceFilesResponse {
  workspace_id: string
  files: WorkspaceFile[]
}

const getFileIcon = (type: string) => {
  switch (type.toUpperCase()) {
    case "CSV":
      return FileSpreadsheet
    case "JSON":
    case "OVERVIEW":
    case "CLEANING":
      return FileCode
    case "LOG":
      return FileText
    case "PNG":
    case "JPG":
    case "JPEG":
      return FileImage
    default:
      return FileText
  }
}

const getFileColor = (type: string) => {
  switch (type.toUpperCase()) {
    case "CSV":
      return "text-green-600"
    case "JSON":
      return "text-amber-600"
    case "OVERVIEW":
      return "text-blue-600"
    case "CLEANING":
      return "text-orange-600"
    case "LOG":
      return "text-gray-600"
    case "PNG":
    case "JPG":
    case "JPEG":
      return "text-purple-600"
    default:
      return "text-muted-foreground"
  }
}

const getFileTypeLabel = (type: string): string => {
  switch (type.toUpperCase()) {
    case "CSV":
      return "CSV Dataset"
    case "OVERVIEW":
      return "Overview Snapshot"
    case "CLEANING":
      return "Cleaning Result"
    case "JSON":
      return "JSON Data"
    case "LOG":
      return "Log File"
    default:
      return type.toUpperCase()
  }
}

/**
 * Determine if a file is deletable.
 * 
 * Rules:
 * - User uploaded files (CSV, JSON) are deletable
 * - Generated outputs (overview snapshots, cleaning results) are deletable
 * - System/audit files (logs) are NOT deletable
 */
const isFileDeletable = (file: WorkspaceFile): boolean => {
  const type = file.type?.toUpperCase() || ""
  // LOG files are system files and should not be deletable
  if (type === "LOG") {
    return false
  }
  // All other files (CSV, JSON, OVERVIEW, CLEANING) are deletable
  return true
}

export function FilesPage() {
  const { activeWorkspaceId } = useWorkspace()
  const { toast } = useToast()
  const [files, setFiles] = useState<WorkspaceFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  
  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<WorkspaceFile | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchFiles = useCallback(async (forceRefresh: boolean = false) => {
    if (!activeWorkspaceId) {
      setFiles([])
      setLoading(false)
      return
    }

    if (!forceRefresh) {
      const cached = getFiles(activeWorkspaceId)
      if (cached !== undefined) {
        setFiles(cached)
        setLoading(false)
        setError(null)
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${BASE_URL}/workspaces/${activeWorkspaceId}/files`)
      if (!response.ok) {
        throw new Error(`Failed to fetch workspace files: ${response.statusText}`)
      }
      const data: WorkspaceFilesResponse = await response.json()
      
      const fileMap = new Map<string, WorkspaceFile>()
      for (const file of data.files) {
        const existing = fileMap.get(file.name)
        if (!existing || (file.updated_at && existing.updated_at && file.updated_at > existing.updated_at)) {
          fileMap.set(file.name, file)
        }
      }
      const deduplicatedFiles = Array.from(fileMap.values())
      
      setFilesCache(activeWorkspaceId, deduplicatedFiles)
      setFiles(deduplicatedFiles)
      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch files"
      setError(errorMessage)
      setFiles([])
      invalidateForWorkspace(activeWorkspaceId)
      console.error("Error fetching workspace files:", err)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspaceId])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // Listen for refresh events from other components (e.g., after cleaning operations)
  // Force refresh when files are modified
  useEffect(() => {
    const handleRefresh = () => {
      fetchFiles(true) // Force refresh to get latest files
    }
    window.addEventListener("refreshFiles", handleRefresh)
    return () => {
      window.removeEventListener("refreshFiles", handleRefresh)
    }
  }, [fetchFiles])

  const filteredFiles = files.filter((file) => file.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return "0 B"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (isoString?: string): string => {
    if (!isoString) return "Unknown"
    try {
      const date = new Date(isoString)
      if (isNaN(date.getTime())) return "Invalid date"
      return date.toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return "Invalid date"
    }
  }

  const handleDownload = async (file: WorkspaceFile, e?: React.MouseEvent) => {
    e?.stopPropagation()
    
    if (!activeWorkspaceId || !file.id) {
      toast({
        title: "Error",
        description: "Cannot download file: missing workspace or file ID",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch(`${BASE_URL}/workspaces/${activeWorkspaceId}/files/${file.id}/download`)
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`File "${file.name}" not found in workspace. It may have been deleted or moved.`)
        }
        const errorText = await response.text().catch(() => response.statusText)
        throw new Error(`Failed to download file: ${errorText || response.statusText}`)
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name || "download"
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: "Success",
        description: `Downloaded ${file.name}`,
      })
    } catch (err) {
      console.error("Error downloading file:", err)
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Failed to download file. Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteClick = (file: WorkspaceFile, e?: React.MouseEvent) => {
    e?.stopPropagation()
    
    if (!isFileDeletable(file)) {
      toast({
        title: "Cannot delete",
        description: "System files cannot be deleted",
        variant: "destructive",
      })
      return
    }

    setFileToDelete(file)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!fileToDelete || !activeWorkspaceId || !fileToDelete.id) {
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      return
    }

    setIsDeleting(true)

    try {
      const response = await fetch(
        `${BASE_URL}/workspaces/${activeWorkspaceId}/files/${fileToDelete.id}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to delete file: ${response.statusText}`)
      }

      const updatedFiles = files.filter((f) => f.id !== fileToDelete.id)
      setFiles(updatedFiles)
      if (activeWorkspaceId) setFilesCache(activeWorkspaceId, updatedFiles)
      
      // Remove from selected files if it was selected
      setSelectedFiles((prev) => {
        const next = new Set(prev)
        next.delete(fileToDelete.id)
        return next
      })

      toast({
        title: "Success",
        description: `Deleted ${fileToDelete.name}`,
      })

      setDeleteDialogOpen(false)
      setFileToDelete(null)
    } catch (err) {
      console.error("Error deleting file:", err)
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to delete file",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const toggleFileSelection = (id: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Empty state when no workspace selected
  if (!activeWorkspaceId) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Workspace Selected</CardTitle>
            <CardDescription>
              Please create or select a workspace to view files
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  // Loading state
  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading workspace files...</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-foreground">Files</h1>
          <span className="text-sm text-muted-foreground">
            {files.length} {files.length === 1 ? "file" : "files"} in workspace
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedFiles.size > 0 && (
            <Button variant="outline" size="sm" className="gap-2 bg-transparent">
              <Download className="w-4 h-4" />
              Download ({selectedFiles.size})
            </Button>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <div className="h-12 border-b border-border flex items-center justify-between px-6 bg-muted/30">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8 bg-background"
          />
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="w-7 h-7"
            onClick={() => setViewMode("list")}
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="w-7 h-7"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Files List */}
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === "list" ? (
          <div className="space-y-2">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <div className="col-span-5">Name</div>
              <div className="col-span-2">Size</div>
              <div className="col-span-3">Generated By</div>
              <div className="col-span-2">Date</div>
            </div>

            {/* File Rows */}
            {filteredFiles.map((file) => {
              const Icon = getFileIcon(file.type)
              return (
                <div
                  key={file.id}
                  onClick={() => toggleFileSelection(file.id)}
                  className={cn(
                    "grid grid-cols-12 gap-4 px-4 py-3 rounded-lg cursor-pointer transition-all duration-200",
                    selectedFiles.has(file.id)
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-card border border-border hover:bg-muted/50",
                  )}
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <Icon className={cn("w-5 h-5", getFileColor(file.type))} />
                    <span className="font-medium text-sm text-foreground truncate">{file.name}</span>
                  </div>
                  <div className="col-span-2 flex items-center text-sm text-muted-foreground">
                    {formatFileSize(file.size ?? 0)}
                  </div>
                  <div className="col-span-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="truncate">
                      {getFileTypeLabel(file.type)}
                    </span>
                  </div>
                  <div className="col-span-2 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{formatDate(file.created_at)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleDownload(file, e)}>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        {isFileDeletable(file) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => handleDeleteClick(file, e)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredFiles.map((file) => {
              const Icon = getFileIcon(file.type)
              return (
                <div
                  key={file.id}
                  onClick={() => toggleFileSelection(file.id)}
                  className={cn(
                    "p-4 rounded-lg cursor-pointer transition-all duration-200 border",
                    selectedFiles.has(file.id)
                      ? "bg-primary/10 border-primary/20"
                      : "bg-card border-border hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center bg-muted")}>
                      <Icon className={cn("w-5 h-5", getFileColor(file.type))} />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => handleDownload(file, e)}>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        {isFileDeletable(file) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => handleDeleteClick(file, e)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-medium text-sm text-foreground truncate mb-1">{file.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-xs">
                      {getFileTypeLabel(file.type)}
                    </span>
                    <span>{formatFileSize(file.size ?? 0)}</span>
                    {file.created_at && (
                      <>
                        <span>•</span>
                        <span>{formatDate(file.created_at).split(",")[0]}</span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {filteredFiles.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">No files found</h3>
            <p className="text-sm text-muted-foreground">
              {searchQuery ? "No files match your search." : "This workspace has no files. Upload datasets or apply cleaning operations to generate files."}
            </p>
          </div>
        )}
        
        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Database className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-foreground mb-1">Error loading files</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{fileToDelete?.name}</strong> from the workspace.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
