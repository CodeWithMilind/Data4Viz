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

import { useState } from "react"
import { Settings, Sun, Globe, User, Shield, LogOut, Bot } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

export function SettingsPage() {
  // UI-only state - no persistence
  const [sidebarVisibleByDefault, setSidebarVisibleByDefault] = useState(true)
  const [uiAnimations, setUiAnimations] = useState(true)
  const [selectedProvider, setSelectedProvider] = useState("openai")
  const [selectedModel, setSelectedModel] = useState("gpt-4o")

  const providerModels: Record<string, { id: string; name: string }[]> = {
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

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider)
    setSelectedModel(providerModels[provider][0].id)
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
              {/* Theme - Display Only */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Theme</Label>
                  <p className="text-xs text-muted-foreground">Application color theme</p>
                </div>
                <div className="px-3 py-1.5 bg-secondary rounded-md text-sm text-muted-foreground">Light</div>
              </div>

              <Separator />

              {/* Language - Static Dropdown */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Language</Label>
                  <p className="text-xs text-muted-foreground">Select your preferred language</p>
                </div>
                <Select defaultValue="en">
                  <SelectTrigger className="w-[140px]">
                    <Globe className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
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
              {/* Name - Static Text */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Name</Label>
                  <p className="text-xs text-muted-foreground">Your display name</p>
                </div>
                <span className="text-sm text-foreground">John Doe</span>
              </div>

              <Separator />

              {/* Username - Static Text */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Username</Label>
                  <p className="text-xs text-muted-foreground">Your unique identifier</p>
                </div>
                <span className="text-sm text-muted-foreground">@johndoe</span>
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
                <Select value={selectedProvider} onValueChange={handleProviderChange}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                <div>
                  <Label className="text-sm font-medium">Model</Label>
                  <p className="text-xs text-muted-foreground">Choose the specific model to use</p>
                </div>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providerModels[selectedProvider].map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* API Key Placeholder */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">API Key</Label>
                  <p className="text-xs text-muted-foreground">Your API key is securely stored</p>
                </div>
                <Button variant="outline" size="sm">
                  Configure
                </Button>
              </div>
            </div>
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
          This is a UI demonstration. No data is saved or persisted.
        </p>
      </div>
    </div>
  )
}
