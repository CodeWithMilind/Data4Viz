import pandera.pandas as pa
from pandera import Check
from pandera.pandas import Column, DataFrameSchema
from history import HistoryLogger

class DataValidator:
    """
    Validates data against a predefined schema to ensure quality.
    """

    def __init__(self, history: HistoryLogger):
        self.history = history
    
    def validate(self, df):
        """
        Checks if the DataFrame follows the expected rules.
        
        Args:
            df (pd.DataFrame): The data to validate.
            
        Returns:
            bool: True if valid, False otherwise.
        """
        if df is None:
            print("❌ No data to validate.")
            return False

        # WHY: Defining a schema explicitly tells us what 'good' data looks like.
        # We use pandera for readable and powerful validation.
        # Note: numeric columns with missing values are loaded as float in pandas.
        schema = DataFrameSchema({
            "id": Column(int, Check.greater_than(0), nullable=False), # IDs should be positive
            "name": Column(str, nullable=False),
            # WHY: Age cannot be negative. nullable=True allows missing values.
            "age": Column(float, Check.greater_than_or_equal_to(0), nullable=True), 
            # WHY: Salary cannot be negative.
            "salary": Column(float, Check.greater_than_or_equal_to(0), nullable=True),
            "department": Column(str, nullable=True),
        })

        try:
            # WHY: schema.validate() runs all checks and raises an error if any fail.
            # lazy=True allows us to see all errors instead of stopping at the first one.
            schema.validate(df, lazy=True) 
            print("✅ Data validation successful! All checks passed.")
            
            self.history.log(
                module="validator",
                action="validate",
                status="success"
            )
            return True
        except pa.errors.SchemaErrors as err:
            print("❌ Data validation failed!")
            # WHY: We print the failure cases so the user knows exactly what to fix.
            print("Failure cases:")
            print(err.failure_cases)
            
            self.history.log(
                module="validator",
                action="validate",
                status="failed",
                error="SchemaErrors",
                details={"failure_cases": err.failure_cases.to_dict(orient="records")}
            )
            return False
        except Exception as e:
            print(f"❌ Unexpected validation error: {e}")
            self.history.log(
                module="validator",
                action="validate",
                status="failed",
                error=str(e)
            )
            return False
