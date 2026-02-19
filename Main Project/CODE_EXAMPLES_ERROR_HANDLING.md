# Code Examples: Error Handling Patterns

## Before & After Comparison

### Example 1: Missing Parameter Handling

#### ❌ BEFORE (Crashes with 500)
```python
@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: str):
    try:
        workspace_dir = get_workspace_dir(workspace_id)  # ← workspace_id could be empty!
        shutil.rmtree(workspace_dir)
        return {"message": "Deleted"}
    except Exception as e:
        raise HTTPException(500, f"Failed to delete: {e}")
```

**Problem:** If workspace_id is empty, get_workspace_dir() might fail with cryptic error

#### ✅ AFTER (Returns 400)
```python
@router.delete("/{workspace_id}")
async def delete_workspace(workspace_id: str):
    # Step 1: Validate required parameters
    if not workspace_id or workspace_id.strip() == "":
        logger.warning(f"[delete_workspace] Invalid request: workspace_id is missing or empty")
        raise HTTPException(
            status_code=400,
            detail="workspace_id is required and cannot be empty"
        )
    
    logger.info(f"[delete_workspace] Request received - workspace_id={workspace_id}")
    
    try:
        # ... rest of logic ...
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[delete_workspace] Unexpected error: {e}", exc_info=True)
        raise HTTPException(500, f"Failed: {e}")
```

**Result:** 
- ✅ Clear HTTP 400 error immediately if parameter invalid
- ✅ Logged with context for debugging
- ✅ Client knows to check parameter, not server error

---

### Example 2: JSON Parsing Error

#### ❌ BEFORE (Silent crash)
```typescript
export async function safeFetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return await response.json();  // ← Crashes silently if invalid JSON
}
```

**Problem:** If server returns HTML error page instead of JSON, crashes with unclear error

#### ✅ AFTER (Detailed error with context)
```typescript
export async function safeFetchJson<T = any>(
  url: string,
  options: SafeFetchOptions = {},
  baseUrl?: string
): Promise<T> {
  const response = await safeFetch(url, options, baseUrl);
  
  try {
    // Check for empty response body
    const contentLength = response.headers?.get('content-length');
    const contentType = response.headers?.get('content-type') || 'unknown';
    
    // If no content, return appropriate error
    if (response.status === 204 || contentLength === '0') {
      console.warn(
        `[safeFetchJson] Empty response body (HTTP ${response.status}). ` +
        `This may indicate a server error or incomplete response.`
      );
      throw new FetchError(
        `Unexpected empty response from server (HTTP ${response.status})`,
        'HTTP_ERROR',
        response.status
      );
    }

    // Validate content type
    if (!contentType.includes('application/json')) {
      const bodyPreview = await response.text().catch(() => '<unable to read>');
      console.error(
        `[safeFetchJson] Invalid Content-Type for JSON endpoint (HTTP ${response.status}): ` +
        `got "${contentType}", expected "application/json". ` +
        `Response body preview: ${bodyPreview.substring(0, 200)}`
      );
      throw new FetchError(
        `Invalid Content-Type: expected application/json, got ${contentType}.`,
        'HTTP_ERROR',
        response.status
      );
    }

    // Try to parse JSON
    const data = await response.json();
    
    // Validate parsed data
    if (data === null || data === undefined) {
      throw new FetchError(
        `Server returned null/undefined JSON response`,
        'HTTP_ERROR',
        response.status
      );
    }
    
    if (typeof data !== 'object' && !Array.isArray(data)) {
      throw new FetchError(
        `Expected JSON object or array, got ${typeof data}`,
        'HTTP_ERROR',
        response.status
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof FetchError) throw error;
    throw new FetchError(
      `Unexpected error parsing JSON: ${error instanceof Error ? error.message : String(error)}`,
      'NETWORK_ERROR',
      response.status,
      error
    );
  }
}
```

**Result:**
- ✅ Specific error for each failure point
- ✅ Response body logged for debugging
- ✅ Clear message about what went wrong
- ✅ Never silently crashes

---

### Example 3: Missing Dataset Handling

#### ❌ BEFORE (500 error)
```python
@router.post("/{workspace_id}/overview")
async def get_dataset_overview(workspace_id: str, request: OverviewRequest):
    try:
        df = load_dataset(request.dataset, workspace_id)  # ← Could return None!
        # ❌ This crashes if df is None
        total_rows = len(df)
        # ... rest of code ...
    except Exception as e:
        raise HTTPException(500, f"Error: {e}")  # Generic error!
```

**Problem:** No validation of dataset existence, confusing error message

#### ✅ AFTER (Returns 404)
```python
@router.post("/{workspace_id}/overview", response_model=OverviewResponse)
async def get_dataset_overview(workspace_id: str, request: OverviewRequest):
    # Step 1: Validate parameters
    if not workspace_id or workspace_id.strip() == "":
        raise HTTPException(400, "workspace_id is required")
    
    if not request.dataset or request.dataset.strip() == "":
        raise HTTPException(400, "dataset name is required")
    
    logger.info(f"[get_dataset_overview] workspace_id={workspace_id}, dataset={request.dataset}")
    
    try:
        # Step 2: Check dataset exists (404 if not)
        if not dataset_exists(request.dataset, workspace_id):
            logger.warning(f"[get_dataset_overview] Dataset not found: {request.dataset}")
            raise HTTPException(
                status_code=404,
                detail=f"Dataset '{request.dataset}' not found in workspace"
            )
        
        # Step 3: Load dataset with error handling
        try:
            df = load_dataset(request.dataset, workspace_id)
        except Exception as e:
            logger.error(f"[get_dataset_overview] Error loading: {e}", exc_info=True)
            raise HTTPException(500, f"Failed to load: {e}")
        
        # Step 4: Validate loaded data
        if df is None:
            logger.error(f"[get_dataset_overview] load_dataset returned None")
            raise HTTPException(500, "Invalid data returned")
        
        # Step 5: Safe processing
        total_rows = len(df)
        
        # ... rest of code ...
        
        return response
        
    except HTTPException:
        raise  # Re-raise HTTP errors
    except Exception as e:
        logger.error(f"[get_dataset_overview] Unexpected: {e}", exc_info=True)
        raise HTTPException(500, f"Failed: {e}")
```

**Result:**
- ✅ Returns 404 (not found) before attempting to load
- ✅ Clear error message if dataset doesn't exist
- ✅ Prevents null pointer exceptions
- ✅ All steps logged with context

---

### Example 4: Empty Dataset Handling

#### ❌ BEFORE (Crashes on calculations)
```python
@router.post("/{workspace_id}/cleaning/summary")
async def get_cleaning_summary(workspace_id: str, request: SummaryRequest):
    try:
        df = load_dataset(request.dataset, workspace_id)
        
        for col in df.columns:
            # ❌ If dataset is empty, these calculations fail
            Q1 = col_data.quantile(0.25)  # Fails if empty
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            # ...
        
        overall_score = total_health / len(columns)  # Could divide by zero
        
    except Exception as e:
        raise HTTPException(500, f"Error: {e}")
```

**Problem:** No validation for empty datasets, calculations fail unexpectedly

#### ✅ AFTER (Graceful handling)
```python
@router.post("/{workspace_id}/cleaning/summary", response_model=CleaningSummaryResponse)
async def get_cleaning_summary(workspace_id: str, request: SummaryRequest):
    # ... validation steps ...
    
    try:
        df = load_dataset(request.dataset, workspace_id)
        
        if df is None:
            raise HTTPException(500, "Invalid data")
        
        total_rows = len(df)
        
        # Handle empty dataset gracefully
        if total_rows == 0:
            logger.warning(f"[get_cleaning_summary] Empty dataset")
            return CleaningSummaryResponse(
                rows=0,
                columns=[],
                overall_score=0.0
            )
        
        # Safe column analysis with error recovery
        try:
            for col in df.columns:
                col_data = df[col]
                
                # Safe outlier detection
                outliers = None
                if col_type == "numeric" and not col_data.isna().all():
                    try:
                        Q1 = col_data.quantile(0.25)
                        Q3 = col_data.quantile(0.75)
                        IQR = Q3 - Q1
                        if IQR > 0:
                            outliers = int(((col_data < lower) | (col_data > upper)).sum())
                        else:
                            outliers = 0
                    except Exception as e:
                        logger.warning(f"Error calculating outliers for {col}: {e}")
                        outliers = None  # Skip this column, don't crash
                
                # Safe health score calculation
                health_score = 100.0
                health_score -= min(missing_pct * 2, 40)
                health_score -= min(duplicates_pct * 1, 20)
                if outliers:
                    outlier_pct = (outliers / total_rows * 100) if total_rows > 0 else 0
                    health_score -= min(outlier_pct * 0.5, 20)
                health_score = max(0.0, min(100.0, health_score))  # Clamp to 0-100
                
                column_summaries.append(...)
        
        except Exception as e:
            logger.error(f"Error analyzing columns: {e}", exc_info=True)
            raise HTTPException(500, f"Failed to analyze: {e}")
        
        # Safe overall score (with zero-division protection)
        overall_score = (total_health_score / len(column_summaries)) if column_summaries else 0.0
        
        return CleaningSummaryResponse(
            rows=total_rows,
            columns=column_summaries,
            overall_score=round(overall_score, 1)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(500, f"Failed: {e}")
```

**Result:**
- ✅ Empty datasets return valid response (not error)
- ✅ Single column error doesn't crash entire response
- ✅ All calculations protected from edge cases
- ✅ Detailed logging for debugging

---

### Example 5: Network Error Logging

#### ❌ BEFORE (Silent failure)
```typescript
export async function safeFetch(url: string, options: SafeFetchOptions): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const error = await response.text().catch(() => response.statusText);
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return response;
  } catch (error) {
    throw new Error(error.message);  // Lost context!
  }
}
```

**Problem:** No logging of error bodies, difficult to debug backend issues

#### ✅ AFTER (Detailed logging)
```typescript
export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {},
  baseUrl?: string
): Promise<Response> {
  // ... setup ...
  
  try {
    const response = await fetch(fullUrl, fetchOptions);
    clearTimeout(timeoutId);

    // Check for HTTP errors
    if (!response.ok) {
      let errorText = response.statusText;
      let errorBody = '';
      
      try {
        // Try to get error body for detailed logging
        errorBody = await response.text();
        if (errorBody) {
          const preview = errorBody.substring(0, 500);
          console.error(
            `[safeFetch] HTTP ${response.status} error response body: ${preview}`,
            errorBody.length > 500 ? `(truncated, full length: ${errorBody.length})` : ''
          );
          errorText = errorBody;
        }
      } catch (readError) {
        console.warn(`[safeFetch] Could not read error body: ${readError.message}`);
        errorText = response.statusText || `HTTP ${response.status}`;
      }

      throw new FetchError(
        `HTTP ${response.status}: ${errorText || response.statusText}`,
        'HTTP_ERROR',
        response.status
      );
    }

    return response;
  } catch (error) {
    // ... error handling with detailed logging ...
  }
}
```

**Result:**
- ✅ Error response bodies logged for debugging
- ✅ Preview limited to 500 chars (prevents log flooding)
- ✅ Backend error messages visible in logs
- ✅ Easy to identify root cause

---

## Summary of Patterns

### 1. Parameter Validation
```python
if not param or param.strip() == "":
    raise HTTPException(400, "param is required")
```

### 2. Precondition Check
```python
if not exists(resource):
    raise HTTPException(404, f"Resource not found")
```

### 3. Safe Data Loading
```python
try:
    data = load(resource)
except Exception as e:
    logger.error(f"Error loading: {e}", exc_info=True)
    raise HTTPException(500, f"Failed to load: {e}")
```

### 4. Data Validation
```python
if data is None:
    raise HTTPException(500, "Invalid data returned")
```

### 5. Safe Calculation with Error Recovery
```python
try:
    result = calculate(value)
except Exception as e:
    logger.warning(f"Error calculating: {e}")
    result = default_value  # Fallback
```

### 6. Edge Case Protection
```python
# Protect from division by zero
overall = (total / count) if count > 0 else 0

# Clamp to valid range
percentage = max(0.0, min(100.0, percentage))
```

---

## Testing These Patterns

```python
# Test missing parameter
def test_missing_param():
    response = delete_workspace("")
    assert response.status_code == 400

# Test not found
def test_not_found():
    response = get_overview("ws-1", "missing.csv")
    assert response.status_code == 404

# Test empty dataset
def test_empty_dataset():
    response = get_summary("ws-1", "empty.csv")
    assert response.status_code == 200
    assert response.rows == 0

# Test permission error
def test_permission():
    make_readonly("ws-1")
    response = delete_workspace("ws-1")
    assert response.status_code == 403
```

---

These patterns are now implemented in all 5 critical API endpoints and should be used as templates for any future endpoint development.
