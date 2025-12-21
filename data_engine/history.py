"""
history.py

This module is responsible for logging every operation
performed by the Data Engine.

Design principles:
- Fully offline
- No external services
- Append-only logs (never overwrite)
- Human-readable JSON
- Simple and reliable
"""

import json
import os
from datetime import datetime
from typing import Optional, Dict


class HistoryLogger:
    """
    HistoryLogger records every step performed by the data engine.

    This class will be used by:
    - loader
    - profiler
    - cleaner
    - transformer
    - validator
    - exporter
    - engine (controller)

    Why a class?
    - Keeps log file path in one place
    - Easy to reuse
    - Clean API for logging
    """

    def __init__(self, log_file: str = "history_log.json"):
        """
        Initialize the logger.

        Parameters:
        log_file (str): Path to the JSON log file.

        WHY:
        - Allow flexibility (user can change log location)
        - Default is simple and local
        """

        self.log_file = log_file

        # If log file does not exist, create it with an empty list
        # WHY: We store logs as a list of operations
        if not os.path.exists(self.log_file):
            with open(self.log_file, "w", encoding="utf-8") as f:
                json.dump([], f, indent=4)

    def log(
        self,
        module: str,
        action: str,
        status: str,
        details: Optional[Dict] = None,
        error: Optional[str] = None
    ):
        """
        Record a single operation into history.

        Parameters:
        module (str): Name of the module (e.g., 'loader', 'cleaner')
        action (str): What operation was performed
        status (str): 'success' or 'failed'
        details (dict): Optional extra information
        error (str): Error message if failed

        WHY:
        - Structured logs are easier to debug
        - Consistent format helps future analysis
        """

        # Create one log entry
        log_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "module": module,
            "action": action,
            "status": status,
            "details": details if details else {},
            "error": error
        }

        # Read existing logs
        with open(self.log_file, "r", encoding="utf-8") as f:
            logs = json.load(f)

        # Append new entry
        logs.append(log_entry)

        # Write back to file
        # WHY: Append-only behavior preserves full history
        with open(self.log_file, "w", encoding="utf-8") as f:
            json.dump(logs, f, indent=4)
