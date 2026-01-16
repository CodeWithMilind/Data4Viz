"use client"

import type React from "react"

import { useState } from "react"
import {
  Database,
  LayoutGrid,
  BarChart3,
  Settings,
  ChevronDown,
  PanelLeftClose,
  Crown,
  User,
  HelpCircle,
  LogOut,
  Bot,
  Sparkles,
  AlertTriangle,
  FileCode,
  FolderOpen,
  Lightbulb,
  Wrench,
  Home,
  History,
  Plus,
  Trash2,
  FolderOpen as FolderIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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

interface SidebarProps {
  activeNav: string
  setActiveNav: (id: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

const navItems = [
  { id: "welcome", icon: Home, label: "Dashboard" },
  { id: "dataset", icon: Database, label: "Dataset" },
  { id: "overview", icon: LayoutGrid, label: "Overview" },
  { id: "cleaning", icon: Wrench, label: "Data Cleaning" },
  { id: "feature", icon: Sparkles, label: "Feature Engineering" },
  { id: "outlier", icon: AlertTriangle, label: "Outlier Handling" },
  { id: "agent", icon: Bot, label: "AI Agent" },
  { id: "visualization", icon: BarChart3, label: "Data Visualization" },
  { id: "notebook", icon: FileCode, label: "Jupyter Notebook" },
  { id: "files", icon: FolderOpen, label: "Files" },
  { id: "insights", icon: Lightbulb, label: "Insights" },
  { id: "logs", icon: History, label: "Logs" },
]

export function Sidebar({
  activeNav,
  setActiveNav,
  sidebarOpen,
  setSidebarOpen,
}: SidebarProps) {
  const {
    currentWorkspace,
    workspaces,
    isLoading,
    createWorkspace,
    loadWorkspace,
    deleteWorkspace,
    setActiveWorkspace,
  } = useWorkspace()
  const { toast } = useToast()

  const [workspacesOpen, setWorkspacesOpen] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [workspaceToDelete, setWorkspaceToDelete] = useState<string | null>(null)

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

  const handleSwitchWorkspace = async (id: string) => {
    try {
      await loadWorkspace(id)
      toast({
        title: "Success",
        description: "Workspace switched",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to switch workspace",
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

  if (!sidebarOpen) {
    return null
  }

  return (
    <aside className="w-[280px] h-screen flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300">
      {/* Logo and Toggle */}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg text-sidebar-foreground">Data4Viz</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 text-muted-foreground hover:text-sidebar-foreground"
          >
            <PanelLeftClose className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Workspace Section */}
      <div className="px-4 pb-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setWorkspacesOpen(!workspacesOpen)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground tracking-wider hover:text-sidebar-foreground transition-colors"
          >
            <FolderIcon className="w-3.5 h-3.5" />
            <span>WORKSPACES</span>
            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", !workspacesOpen && "-rotate-90")} />
          </button>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Workspace</DialogTitle>
                <DialogDescription>Create a new analysis workspace to organize your data work.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label htmlFor="workspace-name" className="text-sm font-medium">
                    Workspace Name
                  </label>
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
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div
          className={cn(
            "space-y-1 overflow-hidden transition-all duration-200",
            workspacesOpen ? "max-h-[300px] overflow-y-auto" : "max-h-0",
          )}
        >
          {isLoading ? (
            <div className="p-2 text-xs text-muted-foreground text-center">Loading...</div>
          ) : workspaces.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground text-center">No workspaces</div>
          ) : (
            workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className={cn(
                  "group flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors",
                  currentWorkspace?.id === workspace.id
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <button
                  onClick={() => handleSwitchWorkspace(workspace.id)}
                  className="flex-1 min-w-0 text-left truncate"
                >
                  {workspace.name}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteClick(workspace.id)
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 overflow-y-auto">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
                  activeNav === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent",
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border relative">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
                <span className="text-sm font-semibold text-primary-foreground">JD</span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="font-medium text-sm text-sidebar-foreground truncate">John Doe</div>
                <div className="text-xs text-muted-foreground">Free Plan</div>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-[248px] mb-1">
            <DropdownMenuItem className="gap-3 cursor-pointer py-2.5">
              <Crown className="w-4 h-4" />
              Upgrade Plan
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 cursor-pointer py-2.5">
              <User className="w-4 h-4" />
              Personalization
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-3 cursor-pointer py-2.5" onClick={() => setActiveNav("settings")}>
              <Settings className="w-4 h-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-3 cursor-pointer py-2.5">
              <HelpCircle className="w-4 h-4" />
              Help
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-3 cursor-pointer py-2.5 text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Workspace Confirmation Dialog */}
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
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
