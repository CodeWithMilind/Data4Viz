import os
from typing import Literal

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import seaborn as sns  # noqa: E402

import pandas as pd

PLOTS_DIR = os.path.join(os.path.dirname(__file__), "plots")
os.makedirs(PLOTS_DIR, exist_ok=True)


def create_plot(
    df: pd.DataFrame,
    x: str,
    y: str,
    kind: Literal["scatter", "line", "bar"] = "scatter",
) -> str:
    plt.clf()
    plt.figure(figsize=(6, 4))

    if kind == "scatter":
        sns.scatterplot(data=df, x=x, y=y)
    elif kind == "line":
        sns.lineplot(data=df, x=x, y=y)
    elif kind == "bar":
        sns.barplot(data=df, x=x, y=y)
    else:
        sns.scatterplot(data=df, x=x, y=y)

    plt.tight_layout()

    filename = f"plot_{x}_vs_{y}.png"
    path = os.path.join(PLOTS_DIR, filename)
    plt.savefig(path)
    return filename


def get_plot_path(image_name: str) -> str:
    return os.path.join(PLOTS_DIR, image_name)

