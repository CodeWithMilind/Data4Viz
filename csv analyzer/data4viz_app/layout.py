import streamlit as st

from data4viz_app.chat import render_chat_section
from data4viz_app.dataset import render_dataset_tab


def _inject_custom_style() -> None:
    st.markdown(
        """
        <style>
        .stApp {
            background-color: #0f0f0f;
            color: #f5f5f5;
        }
        h1, h2, h3, h4, h5 {
            color: #f5f5f5;
        }
        [data-testid="stSidebar"] {
            background-color: #111111;
            border-right: 1px solid #2a2a2a;
        }
        .top-bar {
            background-color: #111111;
            border-radius: 12px;
            padding: 10px 14px;
            border: 1px solid #2a2a2a;
            margin-bottom: 8px;
        }
        .top-bar-title {
            font-size: 16px;
            font-weight: 600;
        }
        .top-bar-subtitle {
            font-size: 13px;
            color: #a0a0a0;
        }
        .rounded-box {
            border-radius: 12px;
            border: 1px solid #2a2a2a;
            padding: 12px;
            background-color: #101010;
        }
        .stChatMessage {
            border-radius: 12px;
            margin-bottom: 4px;
        }
        .stChatMessage[data-testid="stChatMessageUser"] {
            background-color: #181818;
        }
        .stChatMessage[data-testid="stChatMessageAssistant"] {
            background-color: #131313;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _render_top_bar() -> None:
    with st.container():
        st.markdown('<div class="top-bar">', unsafe_allow_html=True)
        left, right = st.columns([3, 2])
        with left:
            st.markdown(
                f"""
                <div class="top-bar-title">
                    {st.session_state.current_workspace}
                </div>
                <div class="top-bar-subtitle">
                    Data4Viz workspace • {st.session_state.nav_selection}
                </div>
                """,
                unsafe_allow_html=True,
            )
        with right:
            st.selectbox(
                "Model",
                options=[st.session_state.groq_model, st.session_state.selected_model],
                index=0,
                key="selected_model",
            )
        st.markdown("</div>", unsafe_allow_html=True)


def render_main_area() -> None:
    _inject_custom_style()
    _render_top_bar()

    tabs = st.tabs(["Chat", "Dataset", "Visualization", "Notebook"])

    with tabs[0]:
        render_chat_section()

    with tabs[1]:
        render_dataset_tab()

    with tabs[2]:
        st.markdown('<div class="rounded-box">', unsafe_allow_html=True)
        st.subheader("Visualization")
        st.info("Connect this tab to your plotting logic or backend.")
        st.markdown("</div>", unsafe_allow_html=True)

    with tabs[3]:
        st.markdown('<div class="rounded-box">', unsafe_allow_html=True)
        st.subheader("Notebook")
        notes_key = f"notes-{st.session_state.current_workspace}"
        existing = st.session_state.get(notes_key, "")
        updated = st.text_area(
            "Scratchpad",
            value=existing,
            height=250,
            placeholder="Document your analysis steps and insights...",
        )
        st.session_state[notes_key] = updated
        st.markdown("</div>", unsafe_allow_html=True)
