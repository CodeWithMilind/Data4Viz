/**
 * Automated Regression Tests for Decision-Driven EDA Insights System
 * 
 * These tests verify the core validation logic that ensures insight stability and correctness.
 * All tests must pass before production deployment.
 */

import { validateAndFilterInsights } from "@/app/api/decision-eda/route"

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

describe("Decision-Driven EDA Insights Regression Tests", () => {
  describe("1. Determinism Test", () => {
    it("should produce identical output for same dataset + metric", () => {
      const datasetColumns = ["revenue", "marketing_spend", "region", "product_category"]
      const backendStats = createMockBackendStats()
      const rawInsights = [
        {
          rank: 1,
          factor: "marketing_spend",
          why_it_matters: "Marketing spend is associated with revenue",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
        {
          rank: 2,
          factor: "region",
          why_it_matters: "Region shows a pattern",
          evidence: "mean difference: 0.15",
          confidence: "high",
        },
      ]

      // Call validation twice
      const result1 = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)
      const result2 = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Should produce identical results
      expect(result1).toEqual(result2)
      expect(result1.map(i => i.factor)).toEqual(result2.map(i => i.factor))
      expect(result1.map(i => i.rank)).toEqual(result2.map(i => i.rank))
    })
  })

  describe("2. Regeneration Replacement Test", () => {
    it("should order insights by impact score", () => {
      const datasetColumns = ["revenue", "marketing_spend", "region", "product_category"]
      const backendStats = createMockBackendStats()
      
      const rawInsights = [
        {
          rank: 1,
          factor: "product_category",
          why_it_matters: "Product category shows pattern",
          evidence: "mean difference: 0.12",
          confidence: "high",
        },
        {
          rank: 2,
          factor: "marketing_spend",
          why_it_matters: "Marketing spend is associated",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
        {
          rank: 3,
          factor: "region",
          why_it_matters: "Region shows pattern",
          evidence: "mean difference: 0.15",
          confidence: "high",
        },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Should be reordered by impact score descending (marketing_spend=85.5, region=72.3, product=65.1)
      expect(result[0].factor).toBe("marketing_spend")
      expect(result[1].factor).toBe("region")
      expect(result[2].factor).toBe("product_category")
      
      // Ranks should be reassigned
      expect(result[0].rank).toBe(1)
      expect(result[1].rank).toBe(2)
      expect(result[2].rank).toBe(3)
    })
  })

  describe("3. Feature Hallucination Test", () => {
    it("should reject combined or unknown features", () => {
      const datasetColumns = ["revenue", "marketing_spend", "region"]
      const backendStats = createMockBackendStats()

      const rawInsights = [
        {
          rank: 1,
          factor: "marketing_spend", // Valid
          why_it_matters: "Valid insight",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
        {
          rank: 2,
          factor: "marketing_spend region", // Invalid: combined
          why_it_matters: "Combined feature",
          evidence: "correlation: 0.60",
          confidence: "high",
        },
        {
          rank: 3,
          factor: "unknown_feature", // Invalid: not in dataset
          why_it_matters: "Unknown feature",
          evidence: "correlation: 0.50",
          confidence: "high",
        },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Only valid factor should remain
      expect(result).toHaveLength(1)
      expect(result[0].factor).toBe("marketing_spend")
    })
  })

  describe("4. Confidence Consistency Test", () => {
    it("should compute confidence from stats correctly", () => {
      const backendStats = createMockBackendStats()
      const datasetColumns = ["revenue", "marketing_spend", "region", "product_category"]

      const rawInsights = [
        { rank: 1, factor: "marketing_spend", why_it_matters: "Strong", evidence: "0.75", confidence: "high" },
        { rank: 2, factor: "region", why_it_matters: "Medium", evidence: "0.15", confidence: "high" },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Both should be high confidence based on backend stats
      expect(result[0].confidence).toBe("high")
      expect(result[1].confidence).toBe("high")
    })
  })

  describe("5. Weak Signal Suppression Test", () => {
    it("should suppress insights with |corr| < 0.10", () => {
      const backendStats = createMockBackendStats({
        top_factors: [
          { factor: "weak_feature", impact_score: 5.0, type: "numeric", abs_correlation: 0.05 },
        ],
        all_correlations: [
          { factor: "weak_feature", correlation: 0.05, abs_correlation: 0.05, type: "numeric" },
        ],
        all_segment_impacts: [],
      })

      const datasetColumns = ["revenue", "weak_feature"]

      const rawInsights = [
        {
          rank: 1,
          factor: "weak_feature",
          why_it_matters: "Weak association",
          evidence: "correlation: 0.05",
          confidence: "low",
        },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Weak feature with low confidence should be suppressed
      expect(result).toHaveLength(0)
    })
  })

  describe("6. Forbidden Language Test", () => {
    it("should process insights correctly without forbidden causal language", () => {
      const backendStats = createMockBackendStats()
      const datasetColumns = ["revenue", "marketing_spend"]

      const rawInsights = [
        {
          rank: 1,
          factor: "marketing_spend",
          why_it_matters: "Marketing spend shows strong association with revenue",
          evidence: "correlation: 0.75",
          confidence: "high",
        },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Should pass validation
      expect(result).toHaveLength(1)
      expect(result[0].factor).toBe("marketing_spend")
    })
  })
})
