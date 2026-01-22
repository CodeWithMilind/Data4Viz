# Insight System Regression Tests

## Overview

Automated regression tests guarantee insight stability, correctness, and prevent hallucinations in the Decision-Driven EDA system.

## Test Requirements

### 1. Determinism Test
- **Purpose**: Ensure same inputs produce identical outputs
- **Validates**: Same dataset + same decision metric = same insights (features, order, confidence, wording)
- **Location**: `__tests__/decision-eda-validation.test.ts`

### 2. Regeneration Replacement Test
- **Purpose**: Ensure regeneration replaces old insights completely
- **Validates**: v1 file deleted, v2 is only active snapshot, no v1 content in v2
- **Location**: `__tests__/decision-eda.test.ts`

### 3. Feature Hallucination Test
- **Purpose**: Prevent LLM from inventing features
- **Validates**: Every feature name exists in dataset schema, rejects combined/unknown features
- **Location**: `__tests__/decision-eda-validation.test.ts`

### 4. Confidence Consistency Test
- **Purpose**: Ensure confidence is computed from stats, not invented
- **Validates**: Recomputed confidence matches rendered confidence
- **Location**: `__tests__/decision-eda-validation.test.ts`

### 5. Weak Signal Suppression Test
- **Purpose**: Suppress insights with weak statistical evidence
- **Validates**: Features with |corr| < 0.10 are not rendered
- **Location**: `__tests__/decision-eda-validation.test.ts`

### 6. Forbidden Language Test
- **Purpose**: Prevent causal claims in insight text
- **Validates**: No causal words ("causes", "drives", "leads to", etc.) appear
- **Location**: `__tests__/decision-eda-validation.test.ts`

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests in CI mode (for deployment)
npm run test:ci
```

## CI Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

**Any test failure blocks deployment.**

## Test Coverage Requirements

- Minimum 80% coverage for:
  - Branches
  - Functions
  - Lines
  - Statements

## Adding New Tests

When adding new validation rules or features:

1. Add test case to appropriate test file
2. Ensure test follows existing patterns
3. Update coverage thresholds if needed
4. Verify test fails when rule is violated
5. Verify test passes when rule is followed
