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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  // Workspace management removed - handled by WorkspaceSelector in header

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
