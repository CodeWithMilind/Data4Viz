"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { MainContent } from "@/components/main-content"

export default function Home() {
  const [activeNav, setActiveNav] = useState("welcome")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeWorkspace, setActiveWorkspace] = useState("Sales Analysis Q4")

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeWorkspace={activeWorkspace}
        setActiveWorkspace={setActiveWorkspace}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeWorkspace={activeWorkspace}
          activeNav={activeNav}
        />
        <MainContent activeNav={activeNav} />
      </div>
    </div>
  )
}
