/**
 * Demo Mode Configuration
 * 
 * When DEMO_MODE is true:
 * - No backend API calls are made
 * - Mock data is returned instead
 * - App runs without backend server
 */

export const DEMO_MODE = true;

/**
 * Mock Dataset Schema
 */
export function getMockSchema(): import("@/lib/api/dataCleaningClient").SchemaResponse {
  return {
    workspace_id: "demo-workspace",
    dataset_id: "demo-dataset.csv",
    total_rows: 1000,
    total_columns: 5,
    columns: [
      {
        name: "category",
        canonical_type: "categorical",
        pandas_dtype: "object",
        total_rows: 1000,
        missing_count: 0,
        missing_percentage: 0,
        unique_count: 5,
      },
      {
        name: "value",
        canonical_type: "numeric",
        pandas_dtype: "float64",
        total_rows: 1000,
        missing_count: 10,
        missing_percentage: 1.0,
        unique_count: 850,
        numeric_stats: {
          min: 0,
          max: 1000,
          mean: 500,
          median: 500,
          std: 250,
          q25: 250,
          q75: 750,
        },
      },
      {
        name: "date",
        canonical_type: "datetime",
        pandas_dtype: "datetime64[ns]",
        total_rows: 1000,
        missing_count: 0,
        missing_percentage: 0,
        unique_count: 365,
      },
      {
        name: "region",
        canonical_type: "categorical",
        pandas_dtype: "object",
        total_rows: 1000,
        missing_count: 5,
        missing_percentage: 0.5,
        unique_count: 4,
      },
      {
        name: "score",
        canonical_type: "numeric",
        pandas_dtype: "float64",
        total_rows: 1000,
        missing_count: 0,
        missing_percentage: 0,
        unique_count: 950,
        numeric_stats: {
          min: 0,
          max: 100,
          mean: 50,
          median: 50,
          std: 20,
          q25: 35,
          q75: 65,
        },
      },
    ],
    computed_at: new Date().toISOString(),
    using_current: true,
  };
}

/**
 * Mock Dataset Overview
 */
export function getMockOverview(): import("@/lib/api/dataCleaningClient").OverviewResponse {
  return {
    total_rows: 1000,
    total_columns: 5,
    duplicate_row_count: 5,
    numeric_column_count: 2,
    categorical_column_count: 2,
    datetime_column_count: 1,
    columns: [
      {
        name: "category",
        inferred_type: "categorical",
        nullable: false,
        missing_count: 0,
        missing_percentage: 0,
      },
      {
        name: "value",
        inferred_type: "numeric",
        nullable: true,
        missing_count: 10,
        missing_percentage: 1.0,
      },
      {
        name: "date",
        inferred_type: "datetime",
        nullable: false,
        missing_count: 0,
        missing_percentage: 0,
      },
      {
        name: "region",
        inferred_type: "categorical",
        nullable: true,
        missing_count: 5,
        missing_percentage: 0.5,
      },
      {
        name: "score",
        inferred_type: "numeric",
        nullable: false,
        missing_count: 0,
        missing_percentage: 0,
      },
    ],
    column_insights: {
      category: {
        unique: 5,
        top_values: {
          "A": 200,
          "B": 200,
          "C": 200,
          "D": 200,
          "E": 200,
        },
      },
      region: {
        unique: 4,
        top_values: {
          "North": 250,
          "South": 250,
          "East": 250,
          "West": 245,
        },
      },
    },
  };
}

/**
 * Mock Chart Generation Response
 */
export function getMockChartResponse(
  goal: "compare" | "trend" | "distribution",
  overrides?: import("@/lib/api/dataCleaningClient").ChartOverrides
): import("@/lib/api/dataCleaningClient").ChartGenerationResponse {
  const chartType = overrides?.chart_type || (goal === "compare" ? "bar" : goal === "trend" ? "line" : "histogram");
  const xColumn = overrides?.x || (goal === "compare" ? "category" : goal === "trend" ? "date" : "value");
  const yColumn = overrides?.y || "value";
  const aggregation = overrides?.aggregation || "sum";

  // Generate mock Vega-Lite spec based on chart type
  let vegaLiteSpec: any = {};

  if (chartType === "bar") {
    vegaLiteSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      data: {
        values: [
          { category: "A", value: 200 },
          { category: "B", value: 300 },
          { category: "C", value: 250 },
          { category: "D", value: 400 },
          { category: "E", value: 150 },
        ],
      },
      mark: overrides?.params?.orientation === "horizontal" ? "bar" : "bar",
      encoding: {
        x: { field: xColumn, type: "nominal" },
        y: { field: yColumn, type: "quantitative", aggregate: aggregation },
      },
    };
  } else if (chartType === "line") {
    vegaLiteSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      data: {
        values: Array.from({ length: 30 }, (_, i) => ({
          date: new Date(2024, 0, i + 1).toISOString().split("T")[0],
          value: 100 + Math.sin(i / 5) * 50 + Math.random() * 20,
        })),
      },
      mark: "line",
      encoding: {
        x: { field: xColumn, type: "temporal" },
        y: { field: yColumn, type: "quantitative", aggregate: aggregation },
      },
    };
  } else {
    // histogram
    vegaLiteSpec = {
      $schema: "https://vega.github.io/schema/vega-lite/v5.json",
      data: {
        values: Array.from({ length: 100 }, () => ({
          value: Math.random() * 1000,
        })),
      },
      mark: "bar",
      encoding: {
        x: {
          field: xColumn,
          type: "quantitative",
          bin: { maxbins: overrides?.params?.bins || 30 },
        },
        y: { aggregate: "count", type: "quantitative" },
      },
    };
  }

  return {
    insight_text: `This ${chartType} chart shows ${goal === "compare" ? "comparison" : goal === "trend" ? "trends" : "distribution"} of ${yColumn} by ${xColumn} using ${aggregation} aggregation.`,
    vega_lite_spec: vegaLiteSpec,
    ai_defaults: {
      chart_type: chartType,
      x: xColumn,
      y: yColumn,
      aggregation: aggregation,
      params: overrides?.params || {},
    },
  };
}

