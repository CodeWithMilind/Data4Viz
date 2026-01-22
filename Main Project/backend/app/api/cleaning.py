"""API endpoints for data cleaning operations.

IMPORTANT: Workspace is the single source of truth.
- All datasets belong to a workspace
- Data Cleaning reads datasets ONLY from workspace storage
- Cleaned datasets are saved BACK into the same workspace as new files
- Cleaning logs are stored per workspace
"""

from fastapi import APIRouter, HTTPException
from app.models.requests import CleaningRequest
from app.models.responses import CleaningResponse, ErrorResponse
from app.services.dataset_loader import load_dataset, save_dataset, dataset_exists
from app.services.missing_values import handle_missing_values
from app.services.duplicates import handle_duplicates
from app.services.invalid_formats import handle_invalid_formats
from app.services.outliers import handle_outliers
from app.services.cleaning_logs import save_cleaning_log, CleaningLog
from app.utils.preview import get_preview_samples, get_affected_rows_info, get_changed_rows_info
from app.utils.validators import validate_action_for_operation, validate_parameters

router = APIRouter(prefix="/cleaning", tags=["cleaning"])


@router.post("/preview", response_model=CleaningResponse)
@router.post("/apply", response_model=CleaningResponse)
async def cleaning_endpoint(request: CleaningRequest):
    """
    Preview or apply a cleaning operation.
    
    IMPORTANT: Workspace-aware operation.
    - Input dataset MUST belong to the specified workspace
    - Cleaning happens on that dataset only
    - Preview does NOT create files
    - Apply DOES create a new dataset file (does not overwrite original)

    - **preview**: If True, returns preview without saving. If False, applies and saves.
    """
    try:
        # Validate dataset exists in workspace
        if not dataset_exists(request.dataset_id, request.workspace_id):
            raise HTTPException(
                status_code=404, 
                detail=f"Dataset '{request.dataset_id}' not found in workspace '{request.workspace_id}'"
            )

        # Load dataset from workspace storage
        df = load_dataset(request.dataset_id, request.workspace_id)
        df_before = df.copy()

        # Validate request
        if request.operation.value == "missing_values":
            if not request.column:
                raise HTTPException(status_code=400, detail="Column name is required for missing_values operation")
            validate_action_for_operation(request.operation.value, request.action, df[request.column].dtype)
            validate_parameters(request.operation.value, request.action, request.parameters)

        elif request.operation.value == "duplicates":
            validate_action_for_operation(request.operation.value, request.action)
            if request.columns:
                from app.utils.validators import validate_columns_exist
                validate_columns_exist(df, request.columns)

        elif request.operation.value == "invalid_format":
            if not request.column:
                raise HTTPException(status_code=400, detail="Column name is required for invalid_format operation")
            validate_action_for_operation(request.operation.value, request.action)
            validate_parameters(request.operation.value, request.action, request.parameters)
            if not request.parameters or "expected_type" not in request.parameters:
                raise HTTPException(
                    status_code=400, detail="expected_type parameter is required for invalid_format operation"
                )

        elif request.operation.value == "outliers":
            if not request.column:
                raise HTTPException(status_code=400, detail="Column name is required for outliers operation")
            validate_action_for_operation(request.operation.value, request.action)
            if not request.parameters or "method" not in request.parameters:
                raise HTTPException(status_code=400, detail="method parameter is required for outliers operation")

        # Perform cleaning operation
        affected_rows = 0
        affected_percentage = 0.0
        affected_indices = []
        warning = None
        summary = ""

        if request.operation.value == "missing_values":
            df_after, affected_rows, affected_percentage, affected_indices = handle_missing_values(
                df, request.column, request.action, request.parameters or {}
            )
            summary = f"Applied '{request.action}' to column '{request.column}'. "
            if request.action == "drop_rows":
                summary += f"Removed {affected_rows} rows with missing values."
                warning = f"This operation removed {affected_rows} rows ({affected_percentage:.1f}% of dataset)."
            else:
                summary += f"Filled {affected_rows} missing values."
            if affected_percentage > 20:
                warning = (
                    warning or ""
                ) + f" High percentage of affected rows ({affected_percentage:.1f}%). Review carefully."

        elif request.operation.value == "duplicates":
            df_after, affected_rows, affected_percentage, affected_indices = handle_duplicates(
                df, request.action, request.columns
            )
            columns_str = ", ".join(request.columns) if request.columns else "all columns"
            summary = f"Applied '{request.action}' for duplicates on {columns_str}. "
            if request.action == "remove_all":
                summary += f"Removed {affected_rows} duplicate rows."
                warning = (
                    f"This operation removed ALL duplicate rows ({affected_rows} rows, "
                    f"{affected_percentage:.1f}% of dataset). This may result in significant data loss."
                )
            else:
                summary += f"Removed {affected_rows} duplicate rows."
                warning = f"This operation removed {affected_rows} rows ({affected_percentage:.1f}% of dataset)."

        elif request.operation.value == "invalid_format":
            expected_type = request.parameters.get("expected_type")
            df_after, affected_rows, affected_percentage, affected_indices = handle_invalid_formats(
                df, request.column, expected_type, request.action, request.parameters or {}
            )
            summary = f"Applied '{request.action}' to column '{request.column}' (expected: {expected_type}). "
            if request.action == "remove_invalid":
                summary += f"Removed {affected_rows} rows with invalid values."
                warning = f"This operation removed {affected_rows} rows ({affected_percentage:.1f}% of dataset)."
            elif request.action == "safe_convert":
                summary += f"Converted {affected_rows} invalid values."
            else:
                summary += f"Replaced {affected_rows} invalid values."
            if affected_percentage > 20:
                warning = (
                    warning or ""
                ) + f" High percentage of affected rows ({affected_percentage:.1f}%). Review carefully."

        elif request.operation.value == "outliers":
            method = request.parameters.get("method")
            df_after, affected_rows, affected_percentage, affected_indices = handle_outliers(
                df, request.column, method, request.action
            )
            summary = f"Applied '{request.action}' to outliers in column '{request.column}' (method: {method}). "
            if request.action == "remove":
                summary += f"Removed {affected_rows} rows with outliers."
                warning = f"This operation removed {affected_rows} rows ({affected_percentage:.1f}% of dataset)."
            elif request.action == "cap":
                summary += f"Capped {affected_rows} outlier values."
            else:
                summary += "No changes applied (ignored)."

        # Get preview samples
        before_sample, after_sample = get_preview_samples(df_before, df_after, affected_indices)

        # Save dataset if not preview
        # IMPORTANT: Create new file with timestamp to preserve original
        # Cleaned datasets are saved as new versions, not overwriting originals
        new_filename = request.dataset_id
        if not request.preview:
            new_filename = save_dataset(
                df_after, 
                request.dataset_id, 
                workspace_id=request.workspace_id,
                create_new_file=True  # Create new file instead of overwriting
            )
            summary += f" Changes have been saved as '{new_filename}'."
            
            # Save cleaning log to workspace
            log = CleaningLog(
                dataset_name=request.dataset_id,
                operation=request.operation.value,
                action=request.action,
                rows_affected=affected_rows,
                parameters=request.parameters or {}
            )
            save_cleaning_log(request.workspace_id, log)

        return CleaningResponse(
            affected_rows=affected_rows,
            affected_percentage=round(affected_percentage, 2),
            before_sample=before_sample,
            after_sample=after_sample,
            warning=warning,
            summary=summary,
            success=True,
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
