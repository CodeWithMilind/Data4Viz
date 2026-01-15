SYSTEM_MESSAGE = "You are a data analyst. Answer clearly and simply."


CSV_USER_TEMPLATE = """Analyze the following CSV data and answer the question.

CSV DATA:
{csv_text}

QUESTION:
{user_question}"""


def build_csv_user_message(csv_text: str, user_question: str) -> str:
    return CSV_USER_TEMPLATE.format(csv_text=csv_text, user_question=user_question)


def build_general_user_message(user_question: str) -> str:
    return user_question
