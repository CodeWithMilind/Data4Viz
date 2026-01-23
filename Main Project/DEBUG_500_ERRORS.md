# HTTP 500 Error Debug Report

## Root Cause Analysis

### API Routes Traced

1. **getDatasetSchema()** → `/dataset/{dataset_id}/schema?workspace_id=...&use_current=...`
   - Backend route: `GET /dataset/{dataset_id}/schema` (line 71 in schema.py)
   - Router prefix: `/dataset` (line 26)
   - Full path: `/dataset/{dataset_id}/schema`

2. **getDatasetOverviewFromFile()** → `/api/overview/file?workspace_id=...&dataset_id=...`
   - Backend route: `GET /overview/file` (line 256 in overview.py)
   - Router prefix: `/overview` (line 25)
   - Mounted with prefix `/api` in main.py (line 36)
   - Full path: `/api/overview/file`

### Potential Root Causes

1. **Empty CSV Files**: Dataset file exists but is 0 bytes
2. **Invalid CSV Format**: Corrupted or malformed CSV files
3. **Encoding Issues**: Non-UTF-8 encoding causing decode errors
4. **Empty DataFrame**: CSV loads but has 0 rows or 0 columns
5. **JSON Parse Errors**: Overview file exists but is corrupted/invalid JSON
6. **Windows Path Issues**: Path resolution problems on Windows
7. **Schema Validation**: SchemaResponse validation fails due to missing fields

## Fixes Applied

### 1. Enhanced Error Handling in `schema.py`

**Location**: `backend/app/api/schema.py` (lines 71-129)

**Changes**:
- Added detailed logging at each step
- Log request payload (dataset_id, workspace_id, use_current)
- Log dataset existence check result
- Log schema computation result and type
- Validate schema structure before returning
- Enhanced error messages with context

**Key Logging Points**:
```python
logger.info(f"[SCHEMA] Request payload - dataset_id='{dataset_id}', workspace_id='{workspace_id}', use_current={use_current}")
logger.info(f"[SCHEMA] dataset_exists returned: {dataset_exists_result}")
logger.info(f"[SCHEMA] Schema computed, schema is None: {schema is None}, schema type: {type(schema)}")
```

### 2. Enhanced Error Handling in `overview.py`

**Location**: `backend/app/api/overview.py` (lines 166-184, 256-290)

**Changes**:
- Added file existence and size logging
- Added JSON parsing error handling with line/column info
- Added file content validation
- Added required field validation
- Enhanced error messages

**Key Logging Points**:
```python
logger.info(f"[load_overview_from_file] File exists: {overview_path.exists()}")
logger.info(f"[load_overview_from_file] File size: {file_size} bytes")
logger.error(f"[load_overview_from_file] JSON decode error: {e}, file: {overview_path}")
```

### 3. Enhanced Dataset Loading in `dataset_loader.py`

**Location**: `backend/app/services/dataset_loader.py` (lines 16-61)

**Changes**:
- Added logging import
- Log file path and existence
- Check file size (reject 0-byte files)
- Validate DataFrame after loading (check rows/columns)
- Specific error handling for:
  - `pd.errors.EmptyDataError` - Empty CSV files
  - `pd.errors.ParserError` - CSV parsing errors
  - `UnicodeDecodeError` - Encoding issues
- Log final DataFrame shape

**Key Logging Points**:
```python
logger.info(f"[load_dataset] Dataset path: {dataset_path}")
logger.info(f"[load_dataset] File size: {file_size} bytes")
logger.info(f"[load_dataset] CSV read successful - rows: {len(df)}, columns: {len(df.columns)}")
```

### 4. Enhanced Schema Computation in `schema_service.py`

**Location**: `backend/app/services/schema_service.py` (lines 211-279)

**Changes**:
- Added detailed logging throughout computation
- Log DataFrame retrieval results
- Log cache loading attempts
- Validate DataFrame before processing (check for 0 columns)
- Wrap column processing in try/catch
- Log schema computation success/failure

**Key Logging Points**:
```python
logger.info(f"[compute_schema] get_current_df returned: {df is not None}, shape: {df.shape if df is not None else 'N/A'}")
logger.info(f"[compute_schema] Computing schema for {len(df.columns)} columns...")
logger.error(f"[compute_schema] Error computing schema for column: {e}", exc_info=True)
```

## Preventive Guards Added

### 1. Empty File Detection
```python
if file_size == 0:
    error_msg = f"Dataset '{dataset_id}' is empty (0 bytes)"
    logger.error(f"[load_dataset] {error_msg}")
    raise ValueError(error_msg)
```

### 2. Empty DataFrame Validation
```python
if len(df.columns) == 0:
    error_msg = f"Dataset '{dataset_id}' has 0 columns - file may be corrupted"
    logger.error(f"[load_dataset] {error_msg}")
    raise ValueError(error_msg)
```

### 3. Schema Structure Validation
```python
if not isinstance(schema, dict):
    logger.error(f"[SCHEMA] Schema is not a dict, got {type(schema)}")
    raise HTTPException(status_code=500, detail=f"Invalid schema format")
```

### 4. JSON Validation
```python
required_fields = ["total_rows", "total_columns", "columns"]
missing_fields = [field for field in required_fields if field not in data]
if missing_fields:
    logger.error(f"[load_overview_from_file] Missing required fields: {missing_fields}")
    return None
```

## How to Debug

1. **Check Backend Logs**: Look for `[SCHEMA]`, `[OVERVIEW_FILE]`, `[load_dataset]`, `[compute_schema]` prefixes
2. **Check File Sizes**: Logs will show file sizes - 0 bytes indicates empty files
3. **Check DataFrame Shapes**: Logs show rows/columns after loading
4. **Check JSON Parse Errors**: Look for `JSONDecodeError` with line/column numbers
5. **Check Exception Types**: All errors log exception type and message

## Next Steps

1. Run the backend and check logs when 500 errors occur
2. Look for the specific error message in logs
3. Common issues to check:
   - Empty CSV files (0 bytes)
   - CSV files with only headers (0 rows)
   - Corrupted JSON overview files
   - Windows path issues (backslashes vs forward slashes)
   - Encoding issues (non-UTF-8 files)

## Expected Log Output

When working correctly:
```
[API START] get_dataset_schema - dataset_id=sample.csv, workspace_id=workspace-123, use_current=True
[SCHEMA] Request payload - dataset_id='sample.csv', workspace_id='workspace-123', use_current=True
[SCHEMA] Checking if dataset exists...
[SCHEMA] dataset_exists returned: True
[SCHEMA] Dataset exists, computing schema...
[load_dataset] Loading dataset - dataset_id='sample.csv', workspace_id='workspace-123'
[load_dataset] Dataset path: C:\...\workspaces\workspace-123\datasets\sample.csv
[load_dataset] File size: 12345 bytes
[load_dataset] CSV read successful - rows: 1000, columns: 5
[compute_schema] Computing schema for 5 columns...
[SCHEMA] Schema computed successfully - 5 columns
[RESPONSE SENT] Returning schema for dataset 'sample.csv'
```

When errors occur, logs will show the exact failure point and exception details.
