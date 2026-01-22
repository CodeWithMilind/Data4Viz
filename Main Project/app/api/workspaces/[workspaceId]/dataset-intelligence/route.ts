import { NextRequest, NextResponse } from "next/server"
import type { OverviewResponse } from "@/lib/api/dataCleaningClient"
import {
  generateDatasetIntelligence,
  saveDatasetIntelligence,
  getDatasetIntelligence,
  loadDatasetOverviewFromFile,
} from "@/lib/workspace-files"

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> | { workspaceId: string } },
) {
  try {
    const params = await Promise.resolve(context.params)
    const { workspaceId } = params
    const body = await req.json()
    const { datasetId } = body as { datasetId?: string }

    if (!datasetId) {
      return NextResponse.json({ error: "datasetId required" }, { status: 400 })
    }

    // Get overview from file (SERVER-SIDE: reads from filesystem, not fetch)
    const overview = await loadDatasetOverviewFromFile(workspaceId, datasetId)
    if (!overview) {
      return NextResponse.json({ error: "Dataset overview not found. Please generate overview first." }, { status: 404 })
    }

    // Generate intelligence snapshot
    const snapshot = await generateDatasetIntelligence(workspaceId, overview, datasetId)
    
    // Save to workspace
    await saveDatasetIntelligence(workspaceId, snapshot)

    return NextResponse.json({ success: true, snapshot })
  } catch (e: any) {
    console.error("Error generating dataset intelligence:", e)
    return NextResponse.json({ error: e?.message || "Failed to generate dataset intelligence" }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> | { workspaceId: string } },
) {
  try {
    const params = await Promise.resolve(context.params)
    const { workspaceId } = params

    const snapshot = await getDatasetIntelligence(workspaceId)
    if (!snapshot) {
      return NextResponse.json({ error: "Dataset intelligence not found" }, { status: 404 })
    }

    return NextResponse.json({ snapshot })
  } catch (e: any) {
    console.error("Error fetching dataset intelligence:", e)
    return NextResponse.json({ error: e?.message || "Failed to fetch dataset intelligence" }, { status: 500 })
  }
}
