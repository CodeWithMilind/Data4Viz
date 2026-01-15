import streamlit as st

from data4viz_app.layout import render_main_area
from data4viz_app.sidebar import render_sidebar
from data4viz_app.state import init_session_state


def main() -> None:
    st.set_page_config(page_title="Data4Viz CSV Analyzer", layout="wide")
    init_session_state()
    render_sidebar()
    render_main_area()


if __name__ == "__main__":
    main()
