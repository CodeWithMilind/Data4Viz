import streamlit as st
import pandas as pd
import requests


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL_NAME = "llama-3.1-8b-instant"
SYSTEM_MESSAGE = "You are a data analyst. Answer clearly and simply."


def init_session_state() -> None:
    if "messages" not in st.session_state:
        st.session_state["messages"] = []
    if "df" not in st.session_state:
        st.session_state["df"] = None
    if "groq_api_key" not in st.session_state:
        st.session_state["groq_api_key"] = ""


def add_message(role: str, content: str) -> None:
    st.session_state["messages"].append({"role": role, "content": content})


def dataframe_summary(df: pd.DataFrame) -> str:
    cols = list(map(str, df.columns))
    dtypes = {str(k): str(v) for k, v in df.dtypes.items()}
    rows, cols_count = df.shape
    summary_lines = [
        f"Shape: ({rows}, {cols_count})",
        "Columns: " + ", ".join(cols),
        "Dtypes: " + ", ".join([f"{k}: {v}" for k, v in dtypes.items()]),
    ]
    return "\n".join(summary_lines)


def groq_chat_completion(messages: list, api_key: str, max_tokens: int = 500) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": max_tokens,
    }
    response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=60)
    if response.status_code != 200:
        try:
            error_info = response.json()
        except ValueError:
            error_info = response.text
        raise RuntimeError(f"Groq API error {response.status_code}: {error_info}")
    data = response.json()
    choices = data.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0]
        message = first.get("message") if isinstance(first, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, str):
            return content.strip()
    raise RuntimeError("Unexpected response format from Groq API.")


def main() -> None:
    st.title("CSV AI Chat (Groq)")

    init_session_state()

    with st.sidebar:
        api_key = st.text_input("Enter your Groq API Key", type="password", value=st.session_state.get("groq_api_key", ""))
        st.session_state["groq_api_key"] = api_key
        uploaded_file = st.file_uploader("Upload a CSV file", type=["csv"])
        if uploaded_file is not None:
            try:
                content = uploaded_file.read()
                if isinstance(content, bytes):
                    content = content.decode("utf-8", errors="ignore")
                df = pd.read_csv(pd.io.common.StringIO(content))
                st.session_state["df"] = df
                st.success(f"Uploaded: {uploaded_file.name}")
                st.write(f"Shape: {df.shape}")
            except Exception as exc:
                st.session_state["df"] = None
                st.error(f"Error reading CSV: {exc}")

    for m in st.session_state["messages"]:
        with st.chat_message(m["role"]):
            st.markdown(m["content"])

    if not st.session_state["groq_api_key"]:
        st.warning("Enter your Groq API Key in the sidebar to start chatting.")
        return

    user_prompt = st.chat_input("Type your message")
    if user_prompt:
        add_message("user", user_prompt)
        with st.chat_message("user"):
            st.markdown(user_prompt)
        df = st.session_state.get("df")
        if df is None:
            add_message("assistant", "Please upload a CSV file first.")
            with st.chat_message("assistant"):
                st.markdown("Please upload a CSV file first.")
        else:
            summary = dataframe_summary(df)
            history = [{"role": msg["role"], "content": msg["content"]} for msg in st.session_state["messages"][:-1]]
            latest = {"role": "user", "content": f"Use this CSV summary:\n{summary}\n\nQuestion:\n{user_prompt}"}
            messages_payload = [{"role": "system", "content": SYSTEM_MESSAGE}] + history + [latest]
            try:
                with st.spinner("Thinking..."):
                    reply = groq_chat_completion(messages_payload, st.session_state["groq_api_key"])
                add_message("assistant", reply)
                with st.chat_message("assistant"):
                    st.markdown(reply)
            except Exception as exc:
                add_message("assistant", f"Error: {exc}")
                with st.chat_message("assistant"):
                    st.markdown(f"Error: {exc}")


if __name__ == "__main__":
    main()
