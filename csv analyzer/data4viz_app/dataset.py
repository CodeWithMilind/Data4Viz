import io

import pandas as pd
import streamlit as st


def render_dataset_tab() -> None:
    workspace = st.session_state.current_workspace

    st.markdown('<div class="rounded-box">', unsafe_allow_html=True)
    st.subheader("Dataset")

    file = st.file_uploader("Upload CSV file", type=["csv"])
    if file is not None:
        content = file.read()
        df = pd.read_csv(io.BytesIO(content))
        st.session_state.datasets[workspace] = df
        st.success("Dataset loaded into this workspace.")

    df = st.session_state.datasets.get(workspace)
    if df is not None:
        st.write("Shape:", df.shape)
        st.dataframe(df.head())
        st.write("Rows:", df.shape[0])
        st.write("Columns:", df.shape[1])
        st.write("Missing values:", int(df.isna().sum().sum()))
    else:
        st.info("No dataset loaded yet.")

    st.markdown("</div>", unsafe_allow_html=True)
