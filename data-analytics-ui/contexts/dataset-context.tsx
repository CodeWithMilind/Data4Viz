"use client"

import React, { createContext, useContext, useState, ReactNode } from "react"

export interface Dataset {
  id: string
  name: string
  data: Record<string, any>[]
  headers: string[]
  rowCount: number
  columnCount: number
  source: "file" | "url"
  sourceUrl?: string
  uploadedAt: Date
}

interface DatasetContextType {
  datasets: Dataset[]
  currentDataset: Dataset | null
  setCurrentDataset: (dataset: Dataset | null) => void
  addDataset: (dataset: Omit<Dataset, "id" | "uploadedAt">) => Dataset
  removeDataset: (id: string) => void
  clearDatasets: () => void
}

const DatasetContext = createContext<DatasetContextType | undefined>(undefined)

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [currentDataset, setCurrentDataset] = useState<Dataset | null>(null)

  const addDataset = (datasetData: Omit<Dataset, "id" | "uploadedAt">): Dataset => {
    const newDataset: Dataset = {
      ...datasetData,
      id: `dataset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      uploadedAt: new Date(),
    }

    setDatasets((prev) => [...prev, newDataset])
    setCurrentDataset(newDataset)
    return newDataset
  }

  const removeDataset = (id: string) => {
    setDatasets((prev) => prev.filter((d) => d.id !== id))
    if (currentDataset?.id === id) {
      setCurrentDataset(null)
    }
  }

  const clearDatasets = () => {
    setDatasets([])
    setCurrentDataset(null)
  }

  return (
    <DatasetContext.Provider
      value={{
        datasets,
        currentDataset,
        setCurrentDataset,
        addDataset,
        removeDataset,
        clearDatasets,
      }}
    >
      {children}
    </DatasetContext.Provider>
  )
}

export function useDataset() {
  const context = useContext(DatasetContext)
  if (context === undefined) {
    throw new Error("useDataset must be used within a DatasetProvider")
  }
  return context
}
