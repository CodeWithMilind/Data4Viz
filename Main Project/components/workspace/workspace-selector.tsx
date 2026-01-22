"use client"

import { useState, useRef } from "react"
import { useWorkspace } from "@/contexts/workspace-context"
import { Database, Plus, Upload, Download, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useToast } from "@/hooks/use-toast"

/**
 * Workspace Selector
 * 
 * Provides UI for:
 * - Creating new workspaces
 * - Selecting/loading existing workspaces
 * - Exporting current workspace
 * - Importing workspace from .d4v file
 * - Deleting workspaces
 */
export function WorkspaceSelector() {
  const {
    currentWorkspace,
    workspaces,
    isLoading,
    createWorkspace,
    loadWorkspace,
    deleteWorkspace,
    exportCurrentWorkspace,
    importWorkspaceFromFile,
  } = useWorkspace()
  const { toast } = useToast()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) {
      toast({
        title: "Error",
        description: "Workspace name cannot be empty",
        variant: "destructive",
      })
      return
    }

    setIsCreating(true)
    try {
      await createWorkspace(newWorkspaceName.trim())
      setNewWorkspaceName("")
      setCreateDialogOpen(false)
      toast({
        title: "Success",
        description: "Workspace created successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create workspace",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const handleLoadWorkspace = async (id: string) => {
    try {
      await loadWorkspace(id)
      toast({
        title: "Success",
        description: "Workspace loaded",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load workspace",
        variant: "destructive",
      })
    }
  }

  const handleExport = async () => {
    try {
      await exportCurrentWorkspace()
      toast({
        title: "Success",
        description: "Workspace exported successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export workspace",
        variant: "destructive",
      })
    }
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith(".d4v")) {
      toast({
        title: "Error",
        description: "Please select a .d4v file",
        variant: "destructive",
      })
      return
    }

    try {
      await importWorkspaceFromFile(file)
      toast({
        title: "Success",
        description: "Workspace imported successfully",
      })
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to import workspace",
        variant: "destructive",
      })
    }
  }

  const handleDeleteClick = (id: string) => {
    setWorkspaceToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!workspaceToDelete) return

    try {
      await deleteWorkspace(workspaceToDelete)
      toast({
        title: "Success",
        description: "Workspace deleted",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete workspace",
        variant: "destructive",
      })
    } finally {
      setDeleteDialogOpen(false)
      setWorkspaceToDelete(null)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Database className="w-4 h-4 text-muted-foreground" />
        <Select
          value={currentWorkspace?.id || ""}
          onValueChange={handleLoadWorkspace}
          disabled={isLoading}
        >
          <SelectTrigger className="w-64 h-8 text-sm">
            <SelectValue placeholder={isLoading ? "Loading..." : "Select workspace..."} />
          </SelectTrigger>
          <SelectContent>
            {workspaces.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">No workspaces</div>
            ) : (
              workspaces.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>{workspace.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteClick(workspace.id)
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Workspace</DialogTitle>
              <DialogDescription>Create a new analysis workspace to organize your data work.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace Name</Label>
                <Input
                  id="workspace-name"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="My Analysis Workspace"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateWorkspace()
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateWorkspace} disabled={isCreating}>
                {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={handleExport}
          disabled={!currentWorkspace}
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".d4v"
          onChange={handleImport}
          className="hidden"
          id="workspace-import"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-3.5 h-3.5" />
          Import
        </Button>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the workspace and all its data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
