import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { DatasetProvider } from "@/contexts/dataset-context"
import { WorkspaceProvider } from "@/contexts/workspace-context"
import "./globals.css"

const _inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Data4Viz - AI-Powered Data Analytics",
  description: "Chat with your data using AI. Analyze, visualize, and gain insights from your datasets.",
    generator: 'v0.app'
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="font-sans antialiased">
        <WorkspaceProvider>
          <DatasetProvider>
            {children}
          </DatasetProvider>
        </WorkspaceProvider>
        <Analytics />
      </body>
    </html>
  )
}
