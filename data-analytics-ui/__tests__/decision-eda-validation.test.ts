/**
 * Unit Tests for Insight Validation Function
 * 
 * Tests the core validation logic independently of API calls.
 */

import { validateAndFilterInsights } from "@/app/api/decision-eda/route"

describe("Insight Validation Function - Unit Tests", () => {
  describe("1. Determinism Test", () => {
    it("should produce identical output for same inputs", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "marketing_spend", impact_score: 85.5, type: "numeric", abs_correlation: 0.75 },
          { factor: "region", impact_score: 72.3, type: "categorical", mean_difference: 0.15, relative_impact_pct: 25.0 },
        ],
        all_correlations: [
          { factor: "marketing_spend", correlation: 0.75, abs_correlation: 0.75, type: "numeric" },
        ],
        all_segment_impacts: [
          { factor: "region", mean_difference: 0.15, relative_impact_pct: 25.0, type: "categorical" },
        ],
      }

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

      const datasetColumns = ["revenue", "marketing_spend", "region"]

      // First call
      const result1 = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Second call (should be identical)
      const result2 = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Assertions
      expect(result1).toHaveLength(result2.length)
      expect(result1).toEqual(result2)
      
      result1.forEach((insight, index) => {
        expect(insight.factor).toBe(result2[index].factor)
        expect(insight.rank).toBe(result2[index].rank)
        expect(insight.confidence).toBe(result2[index].confidence)
      })
    })
  })

  describe("3. Feature Hallucination Test", () => {
    it("should reject combined feature names", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "marketing_spend", impact_score: 85.5, type: "numeric", abs_correlation: 0.75 },
        ],
        all_correlations: [
          { factor: "marketing_spend", correlation: 0.75, abs_correlation: 0.75, type: "numeric" },
        ],
        all_segment_impacts: [],
      }

      const datasetColumns = ["revenue", "marketing_spend", "region"]

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
          factor: "marketing_spend region", // INVALID: contains space
          why_it_matters: "Combined feature",
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

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Assertions
      const validFactors = result.map((i) => i.factor)
      
      expect(validFactors).toContain("marketing_spend")
      expect(validFactors).not.toContain("marketing_spend region")
      expect(validFactors).not.toContain("unknown_feature")
      expect(validFactors).not.toContain("region+marketing")

      // All remaining factors must be in dataset schema
      validFactors.forEach((factor) => {
        expect(datasetColumns).toContain(factor)
      })
    })
  })

  describe("4. Confidence Consistency Test", () => {
    it("should compute confidence from stats correctly", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "strong_corr", impact_score: 90.0, type: "numeric", abs_correlation: 0.75 },
          { factor: "medium_corr", impact_score: 50.0, type: "numeric", abs_correlation: 0.20 },
          { factor: "weak_corr", impact_score: 8.0, type: "numeric", abs_correlation: 0.08 },
          { factor: "strong_cat", impact_score: 85.0, type: "categorical", mean_difference: 0.15, relative_impact_pct: 25.0 },
          { factor: "medium_cat", impact_score: 60.0, type: "categorical", mean_difference: 0.08, relative_impact_pct: 12.0 },
          { factor: "weak_cat", impact_score: 5.0, type: "categorical", mean_difference: 0.02, relative_impact_pct: 3.0 },
        ],
        all_correlations: [
          { factor: "strong_corr", correlation: 0.75, abs_correlation: 0.75, type: "numeric" },
          { factor: "medium_corr", correlation: 0.20, abs_correlation: 0.20, type: "numeric" },
          { factor: "weak_corr", correlation: 0.08, abs_correlation: 0.08, type: "numeric" },
        ],
        all_segment_impacts: [
          { factor: "strong_cat", mean_difference: 0.15, relative_impact_pct: 25.0, type: "categorical" },
          { factor: "medium_cat", mean_difference: 0.08, relative_impact_pct: 12.0, type: "categorical" },
          { factor: "weak_cat", mean_difference: 0.02, relative_impact_pct: 3.0, type: "categorical" },
        ],
      }

      const datasetColumns = ["revenue", "strong_corr", "medium_corr", "weak_corr", "strong_cat", "medium_cat", "weak_cat"]

      const rawInsights = [
        { rank: 1, factor: "strong_corr", why_it_matters: "Strong", evidence: "0.75", confidence: "high" },
        { rank: 2, factor: "medium_corr", why_it_matters: "Medium", evidence: "0.20", confidence: "medium" },
        { rank: 3, factor: "weak_corr", why_it_matters: "Weak", evidence: "0.08", confidence: "low" },
        { rank: 4, factor: "strong_cat", why_it_matters: "Strong", evidence: "0.15", confidence: "high" },
        { rank: 5, factor: "medium_cat", why_it_matters: "Medium", evidence: "0.08", confidence: "medium" },
        { rank: 6, factor: "weak_cat", why_it_matters: "Weak", evidence: "0.02", confidence: "low" },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Assertions: Confidence must match computed values
      const strongCorr = result.find((i) => i.factor === "strong_corr")
      expect(strongCorr?.confidence).toBe("high") // |0.75| >= 0.30

      const mediumCorr = result.find((i) => i.factor === "medium_corr")
      expect(mediumCorr?.confidence).toBe("medium") // 0.10 <= |0.20| < 0.30

      const weakCorr = result.find((i) => i.factor === "weak_corr")
      expect(weakCorr?.confidence).toBe("low") // |0.08| < 0.10

      const strongCat = result.find((i) => i.factor === "strong_cat")
      expect(strongCat?.confidence).toBe("high") // relativeImpact > 20

      const mediumCat = result.find((i) => i.factor === "medium_cat")
      expect(mediumCat?.confidence).toBe("medium") // 10 < relativeImpact <= 20

      const weakCat = result.find((i) => i.factor === "weak_cat")
      expect(weakCat?.confidence).toBe("low") // relativeImpact <= 10
    })
  })

  describe("5. Weak Signal Suppression Test", () => {
    it("should suppress insights with |corr| < 0.10 and effect size < epsilon", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "weak_feature", impact_score: 5.0, type: "numeric", abs_correlation: 0.05 },
        ],
        all_correlations: [
          { factor: "weak_feature", correlation: 0.05, abs_correlation: 0.05, type: "numeric" },
        ],
        all_segment_impacts: [],
      }

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

      // Assertion: Weak feature should be suppressed (LOW confidence + effect < epsilon)
      const weakFeatureInsight = result.find((i) => i.factor === "weak_feature")
      expect(weakFeatureInsight).toBeUndefined()
    })

    it("should suppress categorical insights with weak effect", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "weak_cat", impact_score: 2.0, type: "categorical", mean_difference: 0.0005, relative_impact_pct: 0.5 },
        ],
        all_correlations: [],
        all_segment_impacts: [
          { factor: "weak_cat", mean_difference: 0.0005, relative_impact_pct: 0.5, type: "categorical" },
        ],
      }

      const datasetColumns = ["revenue", "weak_cat"]

      const rawInsights = [
        {
          rank: 1,
          factor: "weak_cat",
          why_it_matters: "Weak pattern",
          evidence: "mean difference: 0.0005",
          confidence: "low",
        },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Assertion: Weak categorical feature should be suppressed
      const weakCatInsight = result.find((i) => i.factor === "weak_cat")
      expect(weakCatInsight).toBeUndefined()
    })
  })

  describe("6. Forbidden Language Test", () => {
    it("should reject insights containing causal language", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "marketing_spend", impact_score: 85.5, type: "numeric", abs_correlation: 0.75 },
        ],
        all_correlations: [
          { factor: "marketing_spend", correlation: 0.75, abs_correlation: 0.75, type: "numeric" },
        ],
        all_segment_impacts: [],
      }

      const datasetColumns = ["revenue", "marketing_spend"]

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
          factor: "marketing_spend",
          why_it_matters: "Marketing spend drives revenue changes", // FORBIDDEN: "drives"
          evidence: "correlation: 0.75",
          confidence: "high",
        },
      ]

      const result1 = validateAndFilterInsights([forbiddenInsights[0]], backendStats, datasetColumns)
      const result2 = validateAndFilterInsights([forbiddenInsights[1]], backendStats, datasetColumns)

      // Assertions: Insights with forbidden language should be suppressed
      expect(result1).toHaveLength(0)
      expect(result2).toHaveLength(0)
    })
  })

  describe("2. Statistical Evidence Gate", () => {
    it("should reject insights without valid statistical evidence", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "no_evidence", impact_score: 50.0, type: "numeric" }, // No correlation data
        ],
        all_correlations: [],
        all_segment_impacts: [],
      }

      const datasetColumns = ["revenue", "no_evidence"]

      const rawInsights = [
        {
          rank: 1,
          factor: "no_evidence",
          why_it_matters: "No evidence insight",
          evidence: "No data",
          confidence: "high",
        },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Assertion: Insight without evidence should be suppressed
      expect(result).toHaveLength(0)
    })

    it("should reject insights with invalid (NaN/null) evidence", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "invalid_corr", impact_score: 50.0, type: "numeric", abs_correlation: NaN },
        ],
        all_correlations: [
          { factor: "invalid_corr", correlation: NaN, abs_correlation: NaN, type: "numeric" },
        ],
        all_segment_impacts: [],
      }

      const datasetColumns = ["revenue", "invalid_corr"]

      const rawInsights = [
        {
          rank: 1,
          factor: "invalid_corr",
          why_it_matters: "Invalid correlation",
          evidence: "correlation: NaN",
          confidence: "high",
        },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Assertion: Insight with NaN correlation should be suppressed
      expect(result).toHaveLength(0)
    })
  })

  describe("5. Ordering Gate", () => {
    it("should rank insights by impact score only", () => {
      const backendStats = {
        total_rows: 1000,
        valid_rows: 950,
        top_factors: [
          { factor: "high_impact", impact_score: 90.0, type: "numeric", abs_correlation: 0.80 },
          { factor: "medium_impact", impact_score: 60.0, type: "numeric", abs_correlation: 0.50 },
          { factor: "low_impact", impact_score: 30.0, type: "numeric", abs_correlation: 0.25 },
        ],
        all_correlations: [
          { factor: "high_impact", correlation: 0.80, abs_correlation: 0.80, type: "numeric" },
          { factor: "medium_impact", correlation: 0.50, abs_correlation: 0.50, type: "numeric" },
          { factor: "low_impact", correlation: 0.25, abs_correlation: 0.25, type: "numeric" },
        ],
        all_segment_impacts: [],
      }

      const datasetColumns = ["revenue", "high_impact", "medium_impact", "low_impact"]

      // LLM might return in wrong order
      const rawInsights = [
        { rank: 1, factor: "low_impact", why_it_matters: "Low", evidence: "0.25", confidence: "medium" },
        { rank: 2, factor: "high_impact", why_it_matters: "High", evidence: "0.80", confidence: "high" },
        { rank: 3, factor: "medium_impact", why_it_matters: "Medium", evidence: "0.50", confidence: "high" },
      ]

      const result = validateAndFilterInsights(rawInsights, backendStats, datasetColumns)

      // Assertions: Should be sorted by impact score (descending)
      expect(result[0].factor).toBe("high_impact")
      expect(result[0].rank).toBe(1)
      expect(result[1].factor).toBe("medium_impact")
      expect(result[1].rank).toBe(2)
      expect(result[2].factor).toBe("low_impact")
      expect(result[2].rank).toBe(3)
    })
  })
})
