/**
 * Settings Page Component
 *
 * UI-ONLY: This component is purely for demonstration purposes.
 * - No authentication
 * - No backend integration
 * - No data persistence
 * - All interactions are simulated
 */

"use client"

import { useState, useEffect } from "react"
import { Settings, Sun, Globe, User, Shield, LogOut, Bot, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { WorkspaceNotes } from "@/components/workspace/workspace-notes"
import { useAIConfigStore } from "@/lib/ai-config-store"
import { GROQ_MODELS, GROQ_DEFAULT_MODEL } from "@/lib/groq-models"
import { AlertTriangle } from "lucide-react"

export function SettingsPage() {
  const [sidebarVisibleByDefault, setSidebarVisibleByDefault] = useState(true)
  const [uiAnimations, setUiAnimations] = useState(true)
  const [keyInput, setKeyInput] = useState("")
  const [keySaved, setKeySaved] = useState(false)
  const [theme, setTheme] = useState<"light" | "gray">("light")
  const [displayName, setDisplayName] = useState("John Doe")

  const { provider, model, setProvider, setModel, setApiKey, apiKey, modelAutoUpdated } = useAIConfigStore()

  const providerModels: Record<string, { id: string; name: string }[]> = {
    groq: [...GROQ_MODELS],
    openai: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ],
    anthropic: [
      { id: "claude-3-opus", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
      { id: "claude-3-haiku", name: "Claude 3 Haiku" },
      { id: "claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
    ],
    google: [
      { id: "gemini-pro", name: "Gemini Pro" },
      { id: "gemini-ultra", name: "Gemini Ultra" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    ],
    meta: [
      { id: "llama-3-70b", name: "Llama 3 70B" },
      { id: "llama-3-8b", name: "Llama 3 8B" },
      { id: "llama-2-70b", name: "Llama 2 70B" },
    ],
    mistral: [
      { id: "mistral-large", name: "Mistral Large" },
      { id: "mistral-medium", name: "Mistral Medium" },
      { id: "mistral-small", name: "Mistral Small" },
    ],
  }

  const models = providerModels[provider] || providerModels.groq

  useEffect(() => {
    const list = providerModels[provider] || providerModels.groq
    if (!list.some((m) => m.id === model)) {
      setModel(provider === "groq" ? GROQ_DEFAULT_MODEL : list[0].id)
    }
  }, [provider, model, setModel])

  // Apply theme on mount
  useEffect(() => {
    if (typeof document !== "undefined") {
      if (theme === "gray") {
        document.documentElement.classList.add("theme-gray")
      } else {
        document.documentElement.classList.remove("theme-gray")
      }
    }
  }, [theme])

  const handleProviderChange = (p: string) => {
    setProvider(p as "groq" | "openai" | "anthropic" | "google" | "meta" | "mistral")
    setModel(p === "groq" ? GROQ_DEFAULT_MODEL : providerModels[p][0].id)
  }

  const handleSaveKey = () => {
    setApiKey(keyInput)
    setKeyInput("")
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 2000)
  }

  const handleThemeChange = (newTheme: "light" | "gray") => {
    setTheme(newTheme)
    // UI-only change: apply theme class to document root
    if (typeof document !== "undefined") {
      if (newTheme === "gray") {
        document.documentElement.classList.add("theme-gray")
      } else {
        document.documentElement.classList.remove("theme-gray")
      }
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your account and preferences</p>
          </div>
        </div>

        <div className="space-y-8">
          {/* General Section */}
          <section>
            <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Sun className="w-4 h-4" />
              General
            </h2>
            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              {/* Theme - Light/Gray Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Theme</Label>
                  <p className="text-xs text-muted-foreground">Application color theme</p>
                </div>
                <Select value={theme} onValueChange={(value) => handleThemeChange(value as "light" | "gray")}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="gray">Gray</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Language - Fixed to English (Disabled) */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Language</Label>
                  <p className="text-xs text-muted-foreground">Select your preferred language</p>
                </div>
                <Select value="en" disabled>
                  <SelectTrigger className="w-[140px] opacity-60 cursor-not-allowed">
                    <Globe className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Account Section */}
          <section>
            <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <User className="w-4 h-4" />
              Account
            </h2>
            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              {/* Name - Editable Input */}
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <p className="text-xs text-muted-foreground">Your display name</p>
                </div>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your display name"
                  className="max-w-[280px]"
                />
              </div>

              <Separator />

              {/* Username - Read-only (Disabled) */}
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-medium">Username</Label>
                  <p className="text-xs text-muted-foreground">Your unique identifier (cannot be changed)</p>
                </div>
                <Input
                  value="@johndoe"
                  disabled
                  className="max-w-[280px] opacity-60 cursor-not-allowed"
                />
              </div>
            </div>
          </section>

          {/* Preferences Section */}
          <section>
            <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Preferences
            </h2>
            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              {/* Sidebar Visible by Default */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Sidebar visible by default</Label>
                  <p className="text-xs text-muted-foreground">Show sidebar when opening the app</p>
                </div>
                <Switch checked={sidebarVisibleByDefault} onCheckedChange={setSidebarVisibleByDefault} />
              </div>

              <Separator />

              {/* UI Animations */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">UI animations</Label>
                  <p className="text-xs text-muted-foreground">Enable smooth transitions and animations</p>
                </div>
                <Switch checked={uiAnimations} onCheckedChange={setUiAnimations} />
              </div>
            </div>
          </section>

          {/* AI Model Selection Section */}
          <section>
            <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <Bot className="w-4 h-4" />
              AI Model
            </h2>
            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
              {/* Provider Selection */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">AI Provider</Label>
                  <p className="text-xs text-muted-foreground">Select your preferred AI platform</p>
                </div>
                <Select value={provider} onValueChange={handleProviderChange}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="groq">Groq</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="google">Google AI</SelectItem>
                    <SelectItem value="meta">Meta AI</SelectItem>
                    <SelectItem value="mistral">Mistral AI</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Model Selection */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Model</Label>
                    {modelAutoUpdated && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        Auto-updated
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Choose the specific model to use</p>
                </div>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* API Key */}
              <div className="space-y-2">
                <div>
                  <Label className="text-sm font-medium">API Key</Label>
                  <p className="text-xs text-muted-foreground">Stored in env or localStorage</p>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={apiKey ? "••••••••" : "Enter API key"}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={handleSaveKey}>
                    {keySaved ? "Saved" : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Workspace Section */}
          <section>
            <h2 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Workspace
            </h2>
            <WorkspaceNotes />
          </section>

          {/* Danger Zone */}
          <section>
            <h2 className="text-lg font-medium text-destructive mb-4 flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              Danger Zone
            </h2>
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium text-destructive">Log out</Label>
                  <p className="text-xs text-muted-foreground">Sign out of your account</p>
                </div>
                <Button variant="destructive" size="sm">
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </Button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer Note */}
        <p className="text-xs text-muted-foreground text-center mt-8">
          AI provider, model, and API key are stored in localStorage.
        </p>
      </div>
    </div>
  )
}
