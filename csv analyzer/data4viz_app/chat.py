from typing import List, Dict

import pandas as pd
import streamlit as st
from groq import Groq


def _build_dataset_metadata(df: pd.DataFrame) -> str:
    rows, cols = df.shape
    column_info = ", ".join(
        [f"{name} ({dtype})" for name, dtype in df.dtypes.items()]
    )
    head_str = df.head(5).to_markdown(index=False)
    meta = (
        f"Number of rows: {rows}\n"
        f"Number of columns: {cols}\n"
        f"Columns (name and dtype): {column_info}\n"
        f"Sample data (first 5 rows):\n{head_str}\n"
    )
    return meta


def _build_system_prompt(metadata: str) -> str:
    return (
        "You are a professional data analyst AI working inside a CSV Analyzer.\n"
        "You must ALWAYS answer the user, even if the question is vague, short, or a simple greeting.\n"
        "\n"
        "If the user greets you (e.g. 'hi', 'hello'), greet them back and briefly "
        "explain your capabilities: you can summarize the dataset, describe "
        "columns, find patterns, and suggest simple plots.\n"
        "\n"
        "If dataset information is provided, ALWAYS use it to ground your answer. "
        "Respect the actual columns and dtypes and do not invent extra fields. "
        "Use the number of rows, columns, and sample rows to support your answer.\n"
        "If NO dataset information is provided, explicitly say that no dataset is "
        "available and answer in general terms.\n"
        "\n"
        "Answer in clear, simple English. Be concise and specific. "
        "Do NOT output code unless the user explicitly asks for code.\n"
        f"\nDataset info:\n{metadata}\n"
    )


def _call_groq_stream(messages: List[Dict[str, str]]):
    api_key = st.session_state.get("groq_api_key", "")
    model = st.session_state.get("groq_model", "")

    if not api_key:
        yield "Groq API key is not set. Please add it in the sidebar."
        return

    if not model:
        yield "Groq model name is not set. Please add it in the sidebar."
        return

    try:
        client = Groq(api_key=api_key)
        stream = client.chat.completions.create(
            messages=messages,
            model=model,
            stream=True,
        )
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as exc:
        yield f"Groq call failed: {exc}"


def render_chat_section() -> None:
    workspace = st.session_state.current_workspace
    message_store = st.session_state.messages.setdefault(workspace, [])

    for message in message_store:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    prompt = st.chat_input(
        "Ask a question about your dataset or general analysis..."
    )
    if not prompt:
        return

    message_store.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    df = st.session_state.datasets.get(workspace)
    if df is not None:
        metadata = _build_dataset_metadata(df)
    else:
        metadata = (
            "No dataset is currently loaded. "
            "Answer in general terms without referencing specific columns."
        )

    system_prompt = _build_system_prompt(metadata)
    conversation: List[Dict[str, str]] = [
        {"role": "system", "content": system_prompt}
    ]
    for message in message_store:
        conversation.append(
            {"role": message["role"], "content": message["content"]}
        )

    full_response = ""
    with st.chat_message("assistant"):
        placeholder = st.empty()
        for chunk in _call_groq_stream(conversation):
            full_response += chunk
            placeholder.markdown(full_response + "▌")
        placeholder.markdown(full_response or "No answer was returned by the AI.")

    message_store.append(
        {"role": "assistant", "content": full_response or "No answer was returned by the AI."}
    )
