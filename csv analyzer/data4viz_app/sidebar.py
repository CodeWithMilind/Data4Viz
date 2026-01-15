import streamlit as st

from data4viz_app.config import DEFAULT_GROQ_MODEL


def _create_new_workspace() -> None:
    base_name = "Workspace"
    existing = [
        ws for ws in st.session_state.workspaces if ws.startswith(base_name)
    ]
    next_index = len(existing) + 1
    new_name = f"{base_name} {next_index}"

    st.session_state.workspaces.append(new_name)
    st.session_state.messages.setdefault(new_name, [])
    st.session_state.datasets.setdefault(new_name, None)
    st.session_state.current_workspace = new_name


def render_sidebar() -> None:
    with st.sidebar:
        st.markdown("### Data4Viz")

        new_ws_col, _ = st.columns([1, 2])
        with new_ws_col:
            if st.button("+ New Workspace", use_container_width=True):
                _create_new_workspace()

        st.session_state.workspace_search = st.text_input(
            "Search workspaces",
            value=st.session_state.workspace_search,
            placeholder="Search...",
        )

        query = st.session_state.workspace_search.lower().strip()
        workspaces = st.session_state.workspaces
        if query:
            workspaces = [ws for ws in workspaces if query in ws.lower()]

        for ws in workspaces:
            is_active = ws == st.session_state.current_workspace
            label = f"🗂️ {ws}" if is_active else ws
            if st.button(
                label,
                key=f"workspace-{ws}",
                use_container_width=True,
            ):
                st.session_state.current_workspace = ws

        st.markdown("---")

        nav_labels = {
            "Chat": "💬 Chat",
            "Dataset": "🗂️ Dataset",
            "Data Cleaning": "🧹 Data Cleaning",
            "Feature Engineering": "🧬 Feature Engineering",
            "Visualization": "📊 Visualization",
            "Notebook": "📓 Notebook",
            "Insights": "💡 Insights",
        }

        selection = st.radio(
            "Navigation",
            list(nav_labels.keys()),
            index=list(nav_labels.keys()).index(
                st.session_state.get("nav_selection", "Chat")
            ),
            format_func=lambda x: nav_labels[x],
        )
        st.session_state.nav_selection = selection
        st.session_state.current_section = selection

        st.markdown("---")
        st.markdown("**Settings**")

        api_key_input = st.text_input(
            "Groq API Key",
            type="password",
            value=st.session_state.get("groq_api_key", ""),
        )
        model_input = st.text_input(
            "Model name",
            value=st.session_state.get("groq_model", DEFAULT_GROQ_MODEL),
        )

        if st.button("Save API Settings"):
            st.session_state.groq_api_key = api_key_input.strip()
            cleaned_model = model_input.strip()
            model_value = cleaned_model or DEFAULT_GROQ_MODEL
            st.session_state.groq_model = model_value
            st.session_state.selected_model = model_value

        if st.session_state.get("groq_api_key"):
            st.caption("API key loaded")
        else:
            st.caption("API key not set")

        st.markdown("**Account**")
        st.write("🙂 Milind")
        st.write("Logout")
