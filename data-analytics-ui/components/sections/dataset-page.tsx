"use client"

import { useState, useRef } from "react"
import { Database, Upload, FileSpreadsheet, Table, Trash2, MoreVertical, Eye, Download, Edit, Link2, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { useDataset } from "@/contexts/dataset-context"
import { fetchAndParseCSV, parseCSVFromFile, isValidURL } from "@/lib/csv-parser"
import type { Dataset } from "@/contexts/dataset-context"

export function DatasetPage() {
  const { datasets, currentDataset, addDataset, removeDataset } = useDataset()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [datasetToDelete, setDatasetToDelete] = useState<Dataset | null>(null)
  
  // URL loading state
  const [csvUrl, setCsvUrl] = useState("")
  const [isLoadingUrl, setIsLoadingUrl] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  
  // File upload state
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDeleteClick = (dataset: Dataset) => {
    setDatasetToDelete(dataset)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (datasetToDelete) {
      removeDataset(datasetToDelete.id)
      setDatasetToDelete(null)
      setDeleteDialogOpen(false)
    }
  }

  // Handle CSV URL loading
  const handleLoadFromUrl = async () => {
    setUrlError(null)
    
    if (!csvUrl || csvUrl.trim() === "") {
      setUrlError("Please enter a URL")
      return
    }

    if (!isValidURL(csvUrl)) {
      setUrlError("Invalid URL. Please provide a valid http:// or https:// URL.")
      return
    }

    setIsLoadingUrl(true)
    try {
      const parsed = await fetchAndParseCSV(csvUrl)
      
      // Extract filename from URL or use default
      const urlObj = new URL(csvUrl)
      const pathParts = urlObj.pathname.split("/")
      const filename = pathParts[pathParts.length - 1] || "dataset.csv"
      const name = filename.endsWith(".csv") ? filename : `${filename}.csv`

      addDataset({
        name,
        data: parsed.data,
        headers: parsed.headers,
        rowCount: parsed.rowCount,
        columnCount: parsed.columnCount,
        source: "url",
        sourceUrl: csvUrl,
      })

      setCsvUrl("") // Clear input on success
    } catch (error) {
      setUrlError(error instanceof Error ? error.message : "Failed to load CSV from URL")
    } finally {
      setIsLoadingUrl(false)
    }
  }

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const file = event.target.files?.[0]
    
    if (!file) {
      return
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Please upload a CSV file")
      return
    }

    setIsLoadingFile(true)
    try {
      const parsed = await parseCSVFromFile(file)
      
      addDataset({
        name: file.name,
        data: parsed.data,
        headers: parsed.headers,
        rowCount: parsed.rowCount,
        columnCount: parsed.columnCount,
        source: "file",
      })
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Failed to parse CSV file")
    } finally {
      setIsLoadingFile(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <main className="flex-1 flex flex-col h-screen bg-background overflow-auto">
      <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Dataset Management</span>
        </div>
        <Button className="gap-2" onClick={handleUploadClick} disabled={isLoadingFile}>
          {isLoadingFile ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload Dataset
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
        />
      </header>

      <div className="flex-1 p-6 space-y-6">
        {/* URL Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Load from Public URL</CardTitle>
            <CardDescription>
              Paste a public CSV link (Google Drive, GitHub raw, Dropbox).<br />
              Your data is fetched and processed locally in your browser.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com/data.csv"
                value={csvUrl}
                onChange={(e) => {
                  setCsvUrl(e.target.value)
                  setUrlError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoadingUrl) {
                    handleLoadFromUrl()
                  }
                }}
                disabled={isLoadingUrl}
                className="flex-1"
              />
              <Button
                onClick={handleLoadFromUrl}
                disabled={isLoadingUrl || !csvUrl.trim()}
                className="gap-2"
              >
                {isLoadingUrl ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Load
                  </>
                )}
              </Button>
            </div>
            {urlError && (
              <Alert variant="destructive">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>{urlError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* File Upload Error Display */}
        {fileError && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{fileError}</AlertDescription>
          </Alert>
        )}

        {/* Datasets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((dataset) => (
            <Card key={dataset.id} className="hover:shadow-md transition-shadow group">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5 text-primary" />
                    </div>
                    <CardTitle className="text-sm font-medium truncate">{dataset.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>
                        <Eye className="w-4 h-4 mr-2" />
                        View
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Edit className="w-4 h-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDeleteClick(dataset)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Table className="w-3 h-3" />
                    {dataset.rowCount.toLocaleString()} rows
                  </span>
                  <span>{dataset.columnCount} columns</span>
                  {dataset.source === "url" && (
                    <span className="flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      URL
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {datasets.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Upload className="w-12 h-12 text-muted-foreground mb-4" />
              <CardDescription className="text-center">Drag and drop your files here, or click to browse</CardDescription>
              <p className="text-xs text-muted-foreground mt-2">Supports CSV files</p>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dataset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">{datasetToDelete?.name}</span>? This action cannot be
              undone.
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
    </main>
  )
}
