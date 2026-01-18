import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface DataExposureState {
  dataExposurePercentage: number
  setDataExposurePercentage: (percentage: number) => void
}

/**
 * Data Exposure Store
 * 
 * Manages UI-based data exposure percentage configuration for the AI agent.
 * This is the SOURCE OF TRUTH for data exposure percentage in the frontend.
 * 
 * Default: 20% (safe default for demo environments)
 * Range: 1-100
 */
export const useDataExposureStore = create<DataExposureState>()(
  persist(
    (set) => ({
      dataExposurePercentage: 20, // Default: 20% exposure
      setDataExposurePercentage: (percentage: number) =>
        set({
          dataExposurePercentage: Math.max(1, Math.min(100, Math.floor(percentage))),
        }),
    }),
    {
      name: "data-exposure-config",
      partialize: (s) => ({ dataExposurePercentage: s.dataExposurePercentage }),
    },
  ),
)
