import streamlit as st

import csv_utils
import prompts
from groq_client import GroqAPIError, generate_chat_completion


def init_session_state() -> None:
    if "csv_text" not in st.session_state:
        st.session_state["csv_text"] = ""
    if "chat_history" not in st.session_state:
        st.session_state["chat_history"] = []


def add_message(role: str, content: str) -> None:
    st.session_state["chat_history"].append({"role": role, "content": content})


def main() -> None:
    st.title("CSV AI Chat (Groq)")

    init_session_state()

    st.sidebar.header("CSV Upload")
    uploaded_file = st.sidebar.file_uploader("Upload a CSV file", type=["csv"])

    if uploaded_file is not None:
        try:
            df = csv_utils.load_csv(uploaded_file)
            csv_text = csv_utils.dataframe_to_text(df)
            st.session_state["csv_text"] = csv_text
            st.success("CSV uploaded and processed.")
            st.write("CSV preview:")
            st.dataframe(df.head())
        except Exception as exc:
            st.error(f"Error while reading CSV: {exc}")
    else:
        st.info("No CSV uploaded yet. Upload a CSV to analyze it.")

    st.markdown("---")
    st.subheader("Chat with AI")

    user_input = st.text_input("Your question or message:", value="", key="user_input")
    send_clicked = st.button("Send")

    if send_clicked:
        if not user_input.strip():
            st.warning("Please enter a question or message before sending.")
        else:
            add_message("user", user_input.strip())

            csv_text = st.session_state.get("csv_text", "")

            if csv_text:
                user_message = prompts.build_csv_user_message(
                    csv_text=csv_text,
                    user_question=user_input,
                )
            else:
                user_message = prompts.build_general_user_message(user_question=user_input)

            try:
                with st.spinner("Thinking..."):
                    response_text = generate_chat_completion(
                        system_message=prompts.SYSTEM_MESSAGE,
                        user_message=user_message,
                    )
                add_message("assistant", response_text)
            except GroqAPIError as api_err:
                st.error(str(api_err))
            except Exception as exc:  # noqa: BLE001
                st.error(f"Unexpected error when contacting Groq API: {exc}")

    st.markdown("---")
    st.subheader("Conversation")

    if not st.session_state["chat_history"]:
        st.write("No messages yet. Ask a question to get started.")
    else:
        for message in st.session_state["chat_history"]:
            role = "You" if message["role"] == "user" else "AI"
            st.markdown(f"**{role}:** {message['content']}")


if __name__ == "__main__":
    main()
