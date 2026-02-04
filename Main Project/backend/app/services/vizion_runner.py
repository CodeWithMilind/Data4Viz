from typing import Any, Dict, Optional
import pandas as pd
import logging

logger = logging.getLogger(__name__)


def _normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize DataFrame for deterministic behavior: reset index and ensure consistent column order."""
    if not isinstance(df, pd.DataFrame):
        df = pd.DataFrame(df)
    # Ensure deterministic column order
    cols = list(df.columns)
    cols_sorted = sorted(cols)
    if cols_sorted != cols:
        df = df[cols_sorted]
    # Reset index to avoid non-deterministic indices
    df = df.reset_index(drop=True)
    return df


def run_vizion(params: Dict[str, Any], df: pd.DataFrame) -> Dict[str, Any]:
    """
    Run Vizion with provided parameters and dataframe.

    - params: expects keys like chart_type, x_column, y_column, aggregation, binning
    - df: pandas DataFrame with real dataset

    Returns Vizion's raw output as a dictionary.
    Raises RuntimeError on failure.
    """
    try:
        import vizon as _vizon
    except Exception as e:
        logger.exception("Vizion import failed")
        raise RuntimeError("Vizion library not available") from e

    df_norm = _normalize_dataframe(df)

    # Try common Vizion invocation patterns defensively.
    # Do not implement visualization logic here; pass through params and dataframe.
    # Accept both function and object styles.
    try:
        # If vizon exposes a top-level run or generate function
        if hasattr(_vizon, "run") and callable(getattr(_vizon, "run")):
            return _vizon.run(params, df_norm)

        if hasattr(_vizon, "generate") and callable(getattr(_vizon, "generate")):
            return _vizon.generate(params, df_norm)

        # If vizon exposes a Vizion class
        if hasattr(_vizon, "Vizion"):
            Vizion = getattr(_vizon, "Vizion")
            try:
                runner = Vizion()
                if hasattr(runner, "run") and callable(getattr(runner, "run")):
                    return runner.run(params, df_norm)
                if hasattr(runner, "generate") and callable(getattr(runner, "generate")):
                    return runner.generate(params, df_norm)
            except Exception:
                # Fall through to next attempt
                pass

        # As a last resort, if vizon exposes a callable object itself
        if callable(_vizon):
            return _vizon(params, df_norm)

    except Exception as e:
        logger.exception("Vizion execution failed")
        raise RuntimeError(f"Vizion execution failed: {str(e)}") from e

    raise RuntimeError("Unsupported Vizion API surface; unable to invoke visualization")


def extract_vega_spec(vizion_output: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract a Vega-Lite spec from Vizion output if present.

    The function looks for common keys and returns the spec dict or None.
    """
    if not isinstance(vizion_output, dict):
        return None
    for key in ("vega_lite_spec", "vega_spec", "spec", "visualization"):
        if key in vizion_output and isinstance(vizion_output[key], dict):
            return vizion_output[key]
    return None
