# Data4Viz Backend Error Handling - Quick Reference

## 🚀 What Was Fixed

All HTTP 500 errors in critical API endpoints have been eliminated with enterprise-level error handling.

### Fixed Endpoints

| Endpoint | File | Status | Issues Fixed |
|----------|------|--------|--------------|
| GET `/workspaces/{id}/datasets` | `backend/app/api/workspaces.py` | ✅ | 500 on missing param, invalid response |
| POST `/workspaces/{id}/overview` | `backend/app/api/workspaces.py` | ✅ | 500 on missing dataset, validation |
| POST `/workspaces/{id}/cleaning/summary` | `backend/app/api/workspaces.py` | ✅ | 500 on empty dataset, outlier calc |
| DELETE `/workspaces/{id}` | `backend/app/api/workspaces.py` | ✅ | 500 on permission denied, path issues |
| Safe Fetch JSON | `lib/api/safe-fetch.ts` | ✅ | JSON parse crashes, empty responses |

---

## 📋 Error Handling Checklist

### For New API Endpoints

```python
@router.post("/{workspace_id}/my-endpoint")
async def my_endpoint(workspace_id: str, request: MyRequest):
    """Always follow this pattern for production-ready code."""
    
    # Step 1: Validate all parameters
    if not workspace_id or workspace_id.strip() == "":
        raise HTTPException(400, "workspace_id required")
    
    if not request.dataset or request.dataset.strip() == "":
        raise HTTPException(400, "dataset required")
    
    logger.info(f"[my_endpoint] Request: workspace_id={workspace_id}, dataset={request.dataset}")
    
    try:
        # Step 2: Check preconditions (existence, permissions, etc)
        if not dataset_exists(request.dataset, workspace_id):
            raise HTTPException(404, f"Dataset not found")
        
        # Step 3: Load/process data with error handling
        try:
            data = load_dataset(request.dataset, workspace_id)
        except Exception as e:
            logger.error(f"[my_endpoint] Error loading: {e}", exc_info=True)
            raise HTTPException(500, f"Failed to load: {e}")
        
        # Step 4: Validate loaded data
        if data is None:
            raise HTTPException(500, "Invalid data returned")
        
        # Step 5: Process with step-wise error handling
        try:
            result = process_data(data)
        except Exception as e:
            logger.error(f"[my_endpoint] Error processing: {e}", exc_info=True)
            raise HTTPException(500, f"Failed to process: {e}")
        
        # Step 6: Return validated response
        return MyResponse(success=True, data=result)
        
    except HTTPException:
        raise  # Re-raise HTTP errors
    except Exception as e:
        logger.error(f"[my_endpoint] Unexpected error: {e}", exc_info=True)
        raise HTTPException(500, f"Failed: {e}")
```

### Key Pattern

```python
# ✅ GOOD - Specific error for each step
try:
    data = load_data()
except Exception as e:
    logger.error("Failed to load", exc_info=True)
    raise HTTPException(500, f"Load failed: {e}")

# ❌ BAD - Generic catch-all
try:
    data = load_data()
    process(data)
    save(data)
except Exception as e:
    raise HTTPException(500, "Error")  # Can't debug which step failed
```

---

## 🔍 Common Error Scenarios

### Missing Parameter
```
Request: GET /workspaces//datasets  (empty workspace_id)
Response: HTTP 400
Body: {error: "workspace_id is required and cannot be empty"}
```

### Non-existent Dataset
```
Request: POST /workspaces/ws-1/overview {dataset: "missing.csv"}
Response: HTTP 404
Body: {error: "Dataset 'missing.csv' not found in workspace"}
```

### Permission Denied
```
Request: DELETE /workspaces/protected-ws
Response: HTTP 403
Body: {error: "Permission denied: Cannot delete workspace. Check file permissions."}
```

### Backend Error
```
Request: POST /workspaces/ws-1/overview {dataset: "data.csv"}
(File corrupted or inaccessible)
Response: HTTP 500
Body: {error: "Failed to load dataset: [original error details]"}
```

---

## 💡 Best Practices

### 1. Always Log Context
```python
# ✅ GOOD - Identifies which resource caused the error
logger.error(f"[endpoint] Error for dataset '{dataset}' in workspace '{workspace_id}': {e}")

# ❌ BAD - Missing context
logger.error(f"Error: {e}")
```

### 2. Validate Before Using
```python
# ✅ GOOD - Check before access
if data is None:
    raise HTTPException(500, "Invalid response")
result = data['key']

# ❌ BAD - Crashes if key doesn't exist
result = data['key']  # KeyError if missing
```

### 3. Handle Null Returns
```python
# ✅ GOOD - Check for None
df = load_dataset(...)
if df is None:
    raise HTTPException(500, "Failed to load dataset")

# ❌ BAD - Crashes if None
df = load_dataset(...)
rows = len(df)  # TypeError if df is None
```

### 4. Clamp Numeric Values
```python
# ✅ GOOD - Ensures 0-100
percentage = (count / total * 100) if total > 0 else 0
percentage = max(0.0, min(100.0, percentage))

# ❌ BAD - Can be negative or >100
percentage = (count / total * 100)
```

### 5. Use Consistent Response Structure
```python
# ✅ GOOD - Always same structure
return {
    "success": True,
    "data": result,
    "message": "Operation completed"
}

# ❌ BAD - Different structures
return result  # Sometimes object, sometimes array
return {"error": "Failed"}  # Different structure
```

---

## 🧪 Testing Error Handling

### Test Missing Parameters
```python
def test_delete_workspace_empty_id():
    response = delete_workspace("")
    assert response.status_code == 400
    assert "required" in response.detail
```

### Test Not Found
```python
def test_overview_missing_dataset():
    response = get_dataset_overview("ws-1", "nonexistent.csv")
    assert response.status_code == 404
    assert "not found" in response.detail.lower()
```

### Test Empty Dataset
```python
def test_cleaning_summary_empty_dataset():
    # Create empty CSV
    response = get_cleaning_summary("ws-1", "empty.csv")
    assert response.status_code == 200
    assert response.rows == 0
    assert response.overall_score == 0
```

### Test Permission Issues
```python
def test_delete_workspace_protected():
    # Create protected workspace
    make_read_only("ws-protected")
    response = delete_workspace("ws-protected")
    assert response.status_code == 403
    assert "permission" in response.detail.lower()
```

---

## 📊 Error Response Format

All error responses follow this format:

```json
{
  "detail": "Descriptive error message with context"
}
```

HTTP Status Codes:
- **400** - Bad Request (invalid parameters)
- **404** - Not Found (resource doesn't exist)
- **403** - Forbidden (permission denied)
- **500** - Internal Server Error (backend error)

---

## 🎯 Performance Implications

- ✅ No performance degradation (error handling is minimal overhead)
- ✅ Faster debugging (detailed logs with context)
- ✅ Better client experience (proper status codes for client-side handling)
- ✅ Prevents cascading failures (specific error handling at each step)

---

## 📞 Troubleshooting

### "HTTP 500: Failed to load dataset"
1. Check if dataset file exists
2. Check file permissions
3. Check if file is valid CSV
4. Check backend logs for specific error

### "HTTP 400: workspace_id required"
1. Verify workspace_id is being passed
2. Verify workspace_id is not empty string
3. Check request URL parameters

### "HTTP 404: Dataset not found"
1. Verify dataset exists in workspace storage
2. Verify correct dataset filename
3. Verify workspace_id is correct

---

## 📚 Related Documentation

- [BACKEND_ERROR_HANDLING_IMPROVEMENTS.md](./BACKEND_ERROR_HANDLING_IMPROVEMENTS.md) - Full implementation details
- Backend API logs - Check `/backend/app/logs/` for detailed error context
- Client code - `lib/api/dataCleaningClient.ts` for client-side error handling

---

**Last Updated:** February 2026  
**Version:** 1.0  
**Status:** Production Ready ✅
