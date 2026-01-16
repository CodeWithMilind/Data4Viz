"use client"

import { useState, useEffect, useRef } from "react"
import { useWorkspace } from "@/contexts/workspace-context"
import { FileText, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

/**
 * Workspace Notes Editor
 * 
 * Simple markdown-capable notes editor for workspace.
 * Auto-saves on change with debounce.
 */
export function WorkspaceNotes() {
  const { currentWorkspace, updateNotes } = useWorkspace()
  const [notes, setNotes] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load notes when workspace changes
  useEffect(() => {
    if (currentWorkspace) {
      setNotes(currentWorkspace.notes || "")
    } else {
      setNotes("")
    }
  }, [currentWorkspace])

  // Auto-save with debounce
  useEffect(() => {
    if (!currentWorkspace) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(async () => {
      if (currentWorkspace.notes !== notes) {
        setIsSaving(true)
        try {
          await updateNotes(notes)
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to save notes",
            variant: "destructive",
          })
        } finally {
          setIsSaving(false)
        }
      }
    }, 1000) // 1 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [notes, currentWorkspace, updateNotes, toast])

  if (!currentWorkspace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Workspace Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Create or load a workspace to add notes</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Workspace Notes
          </CardTitle>
          {isSaving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Save className="w-3 h-3" />
              Saving...
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes about your analysis... (Markdown supported)"
          className="min-h-[200px] font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground mt-2">
          Notes are automatically saved. Markdown formatting is supported.
        </p>
      </CardContent>
    </Card>
  )
}
