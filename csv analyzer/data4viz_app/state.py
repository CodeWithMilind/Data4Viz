import streamlit as st

from data4viz_app.config import DEFAULT_GROQ_MODEL


def init_session_state() -> None:
    if "workspaces" not in st.session_state:
        st.session_state.workspaces = ["Default Workspace"]

    if "current_workspace" not in st.session_state:
        st.session_state.current_workspace = st.session_state.workspaces[0]

    if "messages" not in st.session_state:
        st.session_state.messages = {
            ws: [] for ws in st.session_state.workspaces
        }

    if st.session_state.current_workspace not in st.session_state.messages:
        st.session_state.messages[st.session_state.current_workspace] = []

    if "datasets" not in st.session_state:
        st.session_state.datasets = {}

    if "workspace_search" not in st.session_state:
        st.session_state.workspace_search = ""

    if "nav_selection" not in st.session_state:
        st.session_state.nav_selection = "Chat"

    if "selected_model" not in st.session_state:
        st.session_state.selected_model = DEFAULT_GROQ_MODEL

    if "groq_api_key" not in st.session_state:
        st.session_state.groq_api_key = ""
    if "groq_model" not in st.session_state:
        st.session_state.groq_model = DEFAULT_GROQ_MODEL

    st.session_state.current_section = st.session_state.nav_selection

    if "project_name" not in st.session_state:
        st.session_state.project_name = "Default project"
