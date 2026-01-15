"use client"

import type React from "react"

import { useState } from "react"
import {
  Plus,
  Search,
  Database,
  LayoutGrid,
  BarChart3,
  Settings,
  ChevronDown,
  PanelLeftClose,
  Pencil,
  Trash2,
  Check,
  X,
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Workspace {
  id: string
  name: string
  datasets: number
}

const initialWorkspaces: Workspace[] = [
  { id: "1", name: "Sales Analysis Q4", datasets: 1 },
  { id: "2", name: "Customer Segmentation", datasets: 3 },
  { id: "3", name: "Marketing ROI", datasets: 2 },
]

interface SidebarProps {
  activeNav: string
  setActiveNav: (id: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  activeWorkspace: string
  setActiveWorkspace: (name: string) => void
}

const navItems = [
  { id: "welcome", icon: Home, label: "Dashboard" }, // Added Dashboard as first item
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
  { id: "logs", icon: History, label: "Logs" }, // Added Logs menu item after Insights
]

export function Sidebar({
  activeNav,
  setActiveNav,
  sidebarOpen,
  setSidebarOpen,
  activeWorkspace,
  setActiveWorkspace,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [workspacesOpen, setWorkspacesOpen] = useState(true)
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")

  const handleCreateWorkspace = () => {
    const newId = Date.now().toString()
    const newWorkspace: Workspace = {
      id: newId,
      name: `New Workspace ${workspaces.length + 1}`,
      datasets: 0,
    }
    setWorkspaces((prev) => [newWorkspace, ...prev])
    setActiveWorkspace(newWorkspace.name)
    setEditingId(newId)
    setEditingName(newWorkspace.name)
    setWorkspacesOpen(true)
  }

  const handleStartEdit = (workspace: Workspace, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(workspace.id)
    setEditingName(workspace.name)
  }

  const handleSaveEdit = (id: string) => {
    if (editingName.trim()) {
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, name: editingName.trim() } : w)))
      const workspace = workspaces.find((w) => w.id === id)
      if (workspace && workspace.name === activeWorkspace) {
        setActiveWorkspace(editingName.trim())
      }
    }
    setEditingId(null)
    setEditingName("")
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingName("")
  }

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const workspaceToDelete = workspaces.find((w) => w.id === id)
    setWorkspaces((prev) => prev.filter((w) => w.id !== id))
    if (workspaceToDelete && workspaceToDelete.name === activeWorkspace && workspaces.length > 1) {
      const remaining = workspaces.filter((w) => w.id !== id)
      setActiveWorkspace(remaining[0]?.name || "")
    }
  }

  const handleSelectWorkspace = (workspace: Workspace) => {
    if (editingId !== workspace.id) {
      setActiveWorkspace(workspace.name)
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

        {/* New Workspace Button */}
        <Button
          onClick={handleCreateWorkspace}
          className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          New Workspace
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-secondary border-0 placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={() => setWorkspacesOpen(!workspacesOpen)}
          className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground mb-2 tracking-wider hover:text-sidebar-foreground transition-colors"
        >
          <span>WORKSPACES</span>
          <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", !workspacesOpen && "-rotate-90")} />
        </button>
        <div
          className={cn(
            "space-y-1 overflow-hidden transition-all duration-200",
            workspacesOpen ? "max-h-[200px] overflow-y-auto" : "max-h-0",
          )}
        >
          {workspaces
            .filter((w) => w.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .map((workspace) => (
              <div
                key={workspace.id}
                onClick={() => handleSelectWorkspace(workspace)}
                className={cn(
                  "group w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 cursor-pointer",
                  "hover:bg-sidebar-accent",
                  activeWorkspace === workspace.name ? "bg-sidebar-accent" : "bg-transparent",
                )}
              >
                {editingId === workspace.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-7 text-sm bg-background"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveEdit(workspace.id)
                        if (e.key === "Escape") handleCancelEdit()
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-green-600 hover:text-green-700"
                      onClick={() => handleSaveEdit(workspace.id)}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 text-muted-foreground hover:text-foreground"
                      onClick={handleCancelEdit}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-sidebar-foreground truncate">{workspace.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {workspace.datasets} dataset{workspace.datasets !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-muted-foreground hover:text-sidebar-foreground"
                        onClick={(e) => handleStartEdit(workspace, e)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDelete(workspace.id, e)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
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
    </aside>
  )
}
