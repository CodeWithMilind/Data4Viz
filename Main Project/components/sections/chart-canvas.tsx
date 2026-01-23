"use client"

import { useEffect, useRef } from "react"

interface ChartCanvasProps {
  vegaLiteSpec: Record<string, any> | null
  isLoading?: boolean
}

/**
 * ChartCanvas component
 * 
 * Renders Vega-Lite specifications using vega-embed.
 * Backend generates the spec, frontend only renders it.
 */
export function ChartCanvas({ vegaLiteSpec, isLoading }: ChartCanvasProps) {
  const chartRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!vegaLiteSpec || !chartRef.current) {
      return
    }

    // Dynamically import vega-embed for client-side only
    const loadAndRender = async () => {
      try {
        const vegaEmbed = await import("vega-embed")
        
        // Clear previous chart
        chartRef.current!.innerHTML = ""

        // Render Vega-Lite spec
        await vegaEmbed.default(chartRef.current!, vegaLiteSpec, {
          actions: false, // Hide export actions for cleaner UI
          renderer: "svg",
          theme: "default",
        })
      } catch (error) {
        console.error("Error rendering Vega-Lite chart:", error)
        if (chartRef.current) {
          chartRef.current.innerHTML = `<div class="text-muted-foreground text-sm p-4">Error rendering chart: ${error instanceof Error ? error.message : "Unknown error"}</div>`
        }
      }
    }

    loadAndRender()
  }, [vegaLiteSpec])

  if (isLoading) {
    return (
      <div className="h-80 flex items-center justify-center border border-dashed border-border rounded-lg">
        <div className="text-center space-y-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <span className="text-muted-foreground text-sm">Generating chart...</span>
        </div>
      </div>
    )
  }

  if (!vegaLiteSpec) {
    return (
      <div className="h-80 flex items-center justify-center border border-dashed border-border rounded-lg">
        <span className="text-muted-foreground">No chart to display</span>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div ref={chartRef} className="w-full" />
    </div>
  )
}
