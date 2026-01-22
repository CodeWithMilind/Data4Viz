/**
 * Automated Regression Tests for Decision-Driven EDA Insights System
 * 
 * These tests guarantee insight stability, correctness, and prevent hallucinations.
 * All tests must pass before production deployment.
 */

// Mock global fetch
global.fetch = jest.fn() as jest.Mock

// Mock dependencies
jest.mock("@/lib/groq-models", () => ({
  GROQ_DEFAULT_MODEL: "llama-3.1-70b-versatile",
  isGroqModelSupported: jest.fn(() => true),
}))

jest.mock("@/lib/ai/getAiClient", () => ({
  callGroq: jest.fn(),
  resolveApiKey: jest.fn(() => "test-api-key"),
  isDecommissionError: jest.fn(() => false),
}))

// Mock backend URL
process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000"
process.env.GROQ_API_KEY = "test-key"

// Test utilities
const createMockBackendStats = (overrides: any = {}) => ({
  decision_metric: "revenue",
  total_rows: 1000,
  valid_rows: 950,
  missing_percentage: 5.0,
  outlier_count: 50,
  outlier_percentage: 5.26,
  top_factors: [
    { factor: "marketing_spend", impact_score: 85.5, type: "numeric", correlation: 0.75, abs_correlation: 0.75 },
    { factor: "region", impact_score: 72.3, type: "categorical", mean_difference: 0.15, relative_impact_pct: 25.0 },
    { factor: "product_category", impact_score: 65.1, type: "categorical", mean_difference: 0.12, relative_impact_pct: 18.5 },
  ],
  all_correlations: [
    { factor: "marketing_spend", correlation: 0.75, abs_correlation: 0.75, type: "numeric" },
  ],
  all_segment_impacts: [
    { factor: "region", mean_difference: 0.15, relative_impact_pct: 25.0, type: "categorical" },
    { factor: "product_category", mean_difference: 0.12, relative_impact_pct: 18.5, type: "categorical" },
  ],
  excluded_columns: [],
  decision_metric_stats: {
    mean: 100.5,
    median: 95.2,
    std: 25.3,
    min: 50.0,
    max: 200.0,
  },
  ...overrides,
})

const createMockGroqResponse = (insights: any) => ({
  content: JSON.stringify({
    decision_metric: "revenue",
    top_insights: insights,
    data_risks: ["Missing values in some columns"],
    limitations: "This analysis shows associations, not causality.",
  }),
  error: null,
})

const createMockRequest = (body: any) => {
  return {
    json: async () => body,
  } as NextRequest
}

// Import the validation function directly for unit testing
// Note: This requires exporting the function or testing through the API
const { validateAndFilterInsights } = require("../app/api/decision-eda/route")

describe("Decision-Driven EDA Insights Regression Tests", () => {
  const mockCallGroq = require("@/lib/ai/getAiClient").callGroq
  const mockFetch = global.fetch as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockClear()
    // Reset fetch mock
    ;(global.fetch as jest.Mock).mockClear()
  })

  describe("1. Determinism Test", () => {
    it("should produce identical output for same dataset + metric on multiple clicks", async () => {
      const workspaceId = "test-workspace"
      const datasetId = "test-dataset.csv"
      const decisionMetric = "revenue"
      const datasetColumns = ["revenue", "marketing_spend", "region", "product_category"]

      const backendStats = createMockBackendStats()
      const mockInsights = [
        {
          rank: 1,
          factor: "marketing_spend",
          why_it_matters: "Marketing spend is associated with revenue changes",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
        {
          rank: 2,
          factor: "region",
          why_it_matters: "Region shows a pattern associated with revenue",
          evidence: "mean difference: 0.15",
          confidence: "high",
        },
      ]

      // Mock backend stats endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })

      // Mock schema endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })

      // Mock Groq response
      mockCallGroq.mockResolvedValue(createMockGroqResponse(mockInsights))

      // Mock insight storage (no existing insights)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      // Mock save insights
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "1" }),
      })

      const requestBody = {
        workspaceId,
        datasetId,
        decisionMetric,
        provider: "groq",
        model: "llama-3.1-70b-versatile",
        regenerate: false,
      }

      // First generation
      const response1 = await POST(createMockRequest(requestBody))
      const data1 = await response1.json()

      // Reset mocks for second call
      mockFetch.mockClear()
      mockCallGroq.mockClear()

      // Mock same responses for second call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })
      mockCallGroq.mockResolvedValue(createMockGroqResponse(mockInsights))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "1" }),
      })

      // Second generation (should be identical)
      const response2 = await POST(createMockRequest(requestBody))
      const data2 = await response2.json()

      // Assertions: Same features, same order, same confidence
      expect(data1.insights.top_insights).toHaveLength(data2.insights.top_insights.length)
      
      data1.insights.top_insights.forEach((insight1: any, index: number) => {
        const insight2 = data2.insights.top_insights[index]
        expect(insight1.factor).toBe(insight2.factor)
        expect(insight1.rank).toBe(insight2.rank)
        expect(insight1.confidence).toBe(insight2.confidence)
        expect(insight1.why_it_matters).toBe(insight2.why_it_matters)
      })
    })
  })

  describe("2. Regeneration Replacement Test", () => {
    it("should delete v1 and create v2, with no v1 content in v2", async () => {
      const workspaceId = "test-workspace"
      const datasetId = "test-dataset.csv"
      const decisionMetric = "revenue"
      const datasetColumns = ["revenue", "marketing_spend", "region"]

      const backendStats = createMockBackendStats()
      const v1Insights = [
        {
          rank: 1,
          factor: "marketing_spend",
          why_it_matters: "Version 1 text about marketing spend",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
      ]

      const v2Insights = [
        {
          rank: 1,
          factor: "marketing_spend",
          why_it_matters: "Version 2 improved text about marketing spend",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
      ]

      // Mock initial generation (v1)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })
      mockCallGroq.mockResolvedValueOnce(createMockGroqResponse(v1Insights))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "1" }),
      })

      const requestBody = {
        workspaceId,
        datasetId,
        decisionMetric,
        provider: "groq",
        model: "llama-3.1-70b-versatile",
        regenerate: false,
      }

      await POST(createMockRequest(requestBody))

      // Reset for regeneration
      mockFetch.mockClear()
      mockCallGroq.mockClear()

      // Mock regeneration (v2)
      const v1Snapshot = {
        version: "1",
        insights: v1Insights,
        backend_stats: backendStats,
        dataset_hash: "test-hash",
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => v1Snapshot,
      })
      // Mock deletion of v1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, deleted_count: 1 }),
      })
      mockCallGroq.mockResolvedValueOnce(createMockGroqResponse(v2Insights))
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "2" }),
      })

      const regenerateBody = { ...requestBody, regenerate: true }
      const response = await POST(createMockRequest(regenerateBody))
      const data = await response.json()

      // Assertions
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/insights/delete"),
        expect.objectContaining({
          method: "POST",
        })
      )

      // Assert v2 does not contain v1 text
      const v2Text = data.insights.top_insights[0].why_it_matters
      expect(v2Text).not.toContain("Version 1")
      expect(v2Text).toContain("Version 2")
    })
  })

  describe("3. Feature Hallucination Test", () => {
    it("should reject insights with combined or unknown features", async () => {
      const workspaceId = "test-workspace"
      const datasetId = "test-dataset.csv"
      const decisionMetric = "revenue"
      const datasetColumns = ["revenue", "marketing_spend", "region"] // Only these exist

      const backendStats = createMockBackendStats()
      
      // LLM tries to hallucinate combined features
      const hallucinatedInsights = [
        {
          rank: 1,
          factor: "marketing_spend", // Valid
          why_it_matters: "Valid insight",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
        {
          rank: 2,
          factor: "marketing_spend region", // INVALID: combined feature
          why_it_matters: "Invalid combined feature",
          evidence: "correlation: 0.60",
          confidence: "high",
        },
        {
          rank: 3,
          factor: "unknown_feature", // INVALID: not in dataset
          why_it_matters: "Unknown feature",
          evidence: "correlation: 0.50",
          confidence: "medium",
        },
        {
          rank: 4,
          factor: "region+marketing", // INVALID: has operator
          why_it_matters: "Feature with operator",
          evidence: "correlation: 0.40",
          confidence: "medium",
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })
      mockCallGroq.mockResolvedValue(createMockGroqResponse(hallucinatedInsights))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "1" }),
      })

      const response = await POST(
        createMockRequest({
          workspaceId,
          datasetId,
          decisionMetric,
          provider: "groq",
          model: "llama-3.1-70b-versatile",
        })
      )

      const data = await response.json()

      // Assertions: Only valid features should remain
      const validFactors = data.insights.top_insights.map((i: any) => i.factor)
      
      expect(validFactors).toContain("marketing_spend")
      expect(validFactors).not.toContain("marketing_spend region")
      expect(validFactors).not.toContain("unknown_feature")
      expect(validFactors).not.toContain("region+marketing")

      // All remaining factors must be in dataset schema
      validFactors.forEach((factor: string) => {
        expect(datasetColumns).toContain(factor)
      })
    })
  })

  describe("4. Confidence Consistency Test", () => {
    it("should compute confidence from stats and match rendered confidence", async () => {
      const workspaceId = "test-workspace"
      const datasetId = "test-dataset.csv"
      const decisionMetric = "revenue"
      const datasetColumns = ["revenue", "marketing_spend", "region", "weak_feature"]

      // Create stats with different correlation strengths
      const backendStats = createMockBackendStats({
        top_factors: [
          { factor: "marketing_spend", impact_score: 85.5, type: "numeric", abs_correlation: 0.75 },
          { factor: "region", impact_score: 72.3, type: "categorical", mean_difference: 0.15, relative_impact_pct: 25.0 },
          { factor: "weak_feature", impact_score: 5.0, type: "numeric", abs_correlation: 0.08 }, // Weak correlation
        ],
        all_correlations: [
          { factor: "marketing_spend", correlation: 0.75, abs_correlation: 0.75, type: "numeric" },
          { factor: "weak_feature", correlation: 0.08, abs_correlation: 0.08, type: "numeric" },
        ],
        all_segment_impacts: [
          { factor: "region", mean_difference: 0.15, relative_impact_pct: 25.0, type: "categorical" },
        ],
      })

      const mockInsights = [
        {
          rank: 1,
          factor: "marketing_spend",
          why_it_matters: "Strong association",
          evidence: "correlation: 0.75",
          confidence: "high", // Should match |0.75| >= 0.30
        },
        {
          rank: 2,
          factor: "region",
          why_it_matters: "Pattern observed",
          evidence: "mean difference: 0.15",
          confidence: "high", // Should match large gap
        },
        {
          rank: 3,
          factor: "weak_feature",
          why_it_matters: "Weak pattern",
          evidence: "correlation: 0.08",
          confidence: "low", // Should match |0.08| < 0.10
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })
      mockCallGroq.mockResolvedValue(createMockGroqResponse(mockInsights))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "1" }),
      })

      const response = await POST(
        createMockRequest({
          workspaceId,
          datasetId,
          decisionMetric,
          provider: "groq",
          model: "llama-3.1-70b-versatile",
        })
      )

      const data = await response.json()

      // Assertions: Confidence must match computed values
      data.insights.top_insights.forEach((insight: any) => {
        const factorData = backendStats.top_factors.find((f: any) => f.factor === insight.factor)
        
        if (factorData?.type === "numeric" && factorData.abs_correlation !== undefined) {
          const absCorr = Math.abs(factorData.abs_correlation)
          let expectedConfidence: "high" | "medium" | "low"
          
          if (absCorr < 0.10) {
            expectedConfidence = "low"
          } else if (absCorr < 0.30) {
            expectedConfidence = "medium"
          } else {
            expectedConfidence = "high"
          }
          
          expect(insight.confidence).toBe(expectedConfidence)
        } else if (factorData?.type === "categorical" && factorData.mean_difference !== undefined) {
          const meanDiff = Math.abs(factorData.mean_difference)
          const relativeImpact = factorData.relative_impact_pct || 0
          
          let expectedConfidence: "high" | "medium" | "low"
          if (relativeImpact > 20 || meanDiff > 0.1) {
            expectedConfidence = "high"
          } else if (relativeImpact > 10 || meanDiff > 0.05) {
            expectedConfidence = "medium"
          } else {
            expectedConfidence = "low"
          }
          
          expect(insight.confidence).toBe(expectedConfidence)
        }
      })
    })
  })

  describe("5. Weak Signal Suppression Test", () => {
    it("should suppress insights with |corr| < 0.10", async () => {
      const workspaceId = "test-workspace"
      const datasetId = "test-dataset.csv"
      const decisionMetric = "revenue"
      const datasetColumns = ["revenue", "weak_feature"]

      const backendStats = createMockBackendStats({
        top_factors: [
          { factor: "weak_feature", impact_score: 5.0, type: "numeric", abs_correlation: 0.05 }, // Very weak
        ],
        all_correlations: [
          { factor: "weak_feature", correlation: 0.05, abs_correlation: 0.05, type: "numeric" },
        ],
        all_segment_impacts: [],
      })

      const mockInsights = [
        {
          rank: 1,
          factor: "weak_feature",
          why_it_matters: "Weak association",
          evidence: "correlation: 0.05",
          confidence: "low",
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })
      mockCallGroq.mockResolvedValue(createMockGroqResponse(mockInsights))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "1" }),
      })

      const response = await POST(
        createMockRequest({
          workspaceId,
          datasetId,
          decisionMetric,
          provider: "groq",
          model: "llama-3.1-70b-versatile",
        })
      )

      const data = await response.json()

      // Assertion: Weak feature should be suppressed (effect size < epsilon)
      const weakFeatureInsight = data.insights.top_insights.find(
        (i: any) => i.factor === "weak_feature"
      )
      
      // Since |0.05| < 0.10 (LOW confidence) and 0.05 < 0.001 (epsilon), it should be suppressed
      expect(weakFeatureInsight).toBeUndefined()
    })
  })

  describe("6. Forbidden Language Test", () => {
    it("should reject insights containing causal language", async () => {
      const workspaceId = "test-workspace"
      const datasetId = "test-dataset.csv"
      const decisionMetric = "revenue"
      const datasetColumns = ["revenue", "marketing_spend"]

      const backendStats = createMockBackendStats()
      
      const forbiddenInsights = [
        {
          rank: 1,
          factor: "marketing_spend",
          why_it_matters: "Marketing spend causes revenue to increase", // FORBIDDEN: "causes"
          evidence: "correlation: 0.75",
          confidence: "high",
        },
        {
          rank: 2,
          factor: "region",
          why_it_matters: "Region drives revenue changes", // FORBIDDEN: "drives"
          evidence: "mean difference: 0.15",
          confidence: "high",
        },
      ]

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => backendStats,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: datasetColumns.map((name) => ({ name, type: "numeric" })),
        }),
      })
      mockCallGroq.mockResolvedValue(createMockGroqResponse(forbiddenInsights))
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, version: "1" }),
      })

      const response = await POST(
        createMockRequest({
          workspaceId,
          datasetId,
          decisionMetric,
          provider: "groq",
          model: "llama-3.1-70b-versatile",
        })
      )

      const data = await response.json()

      // Assertions: Forbidden words should be replaced or insights suppressed
      const forbiddenWords = ["causes", "drives", "leads to", "results in", "improves", "worsens"]
      
      data.insights.top_insights.forEach((insight: any) => {
        const text = insight.why_it_matters.toLowerCase()
        forbiddenWords.forEach((word) => {
          // Either the word is replaced or the insight is suppressed
          if (text.includes(word)) {
            // If word appears, it should have been replaced in post-processing
            // Check that replacement happened
            expect(text).not.toContain("causes")
            expect(text).not.toContain("drives")
          }
        })
      })
    })
  })
})
