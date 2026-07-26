"""
chart_engine.py — Plotly interactive chart builders and export helpers.

Provides:
  - Forecast chart with actuals, backtest fit, and future confidence bands
  - Feature importance bar chart
  - PNG and CSV export utilities
"""

import io

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots


# ---------------------------------------------------------------------------
# Color Palette
# ---------------------------------------------------------------------------
_COLORS = {
    "bg": "#0E1117",
    "paper": "#1A1F2E",
    "grid": "#2D3348",
    "text": "#E0E0E0",
    "actual": "#4FC3F7",       # Electric blue
    "backtest": "#FF9800",     # Orange
    "forecast": "#00E676",     # Green
    "confidence": "rgba(0, 230, 118, 0.15)",
    "confidence_line": "rgba(0, 230, 118, 0.4)",
    "volume": "rgba(79, 195, 247, 0.3)",
    "red": "#FF5252",
    "amber": "#FFD740",
}


# ---------------------------------------------------------------------------
# Primary Forecast Chart
# ---------------------------------------------------------------------------
def build_forecast_chart(
    ohlcv: pd.DataFrame,
    backtest_df: pd.DataFrame,
    predicted_return: float,
    std_error: float,
    horizon_days: int,
    horizon_label: str,
    symbol: str,
) -> go.Figure:
    """
    Build the main interactive forecast chart with three visual layers:
      1. Past Actuals (solid blue line)
      2. Past Predictions / Backtest Fit (dashed orange line)
      3. Future Prediction with confidence bands (green + shaded)

    Parameters
    ----------
    ohlcv : pd.DataFrame
        Full OHLCV history.
    backtest_df : pd.DataFrame
        Walk-forward backtest with Actual / Predicted columns.
    predicted_return : float
        Forecasted forward return (e.g., 0.05 for +5%).
    std_error : float
        Standard error of residuals from backtest.
    horizon_days : int
        Number of trading days for the forecast horizon.
    horizon_label : str
        Human label (e.g., "1M").
    symbol : str
        Ticker symbol.
    """
    fig = go.Figure()

    # --- 1. Historical Actuals ---
    fig.add_trace(
        go.Scatter(
            x=ohlcv.index,
            y=ohlcv["Close"],
            mode="lines",
            name="Historical Close",
            line=dict(color=_COLORS["actual"], width=2),
            hovertemplate="Date: %{x|%Y-%m-%d}<br>Close: $%{y:.2f}<extra></extra>",
        )
    )

    # --- 2. Backtest Predictions (convert returns to prices for overlay) ---
    if not backtest_df.empty:
        # Map backtest dates to actual close prices, then compute predicted prices
        bt_dates = backtest_df.index
        bt_actual_prices = ohlcv["Close"].reindex(bt_dates, method="nearest")

        # Predicted return applied to get predicted price level
        # predicted_price = actual_price_at_origin * (1 + predicted_return)
        # But for backtest, we need the origin prices (shifted back by horizon)
        bt_origin_prices = ohlcv["Close"].shift(horizon_days).reindex(bt_dates, method="nearest")
        bt_predicted_prices = bt_origin_prices * (1 + backtest_df["Predicted"].values)

        # Filter valid entries
        valid_mask = bt_predicted_prices.notna() & bt_actual_prices.notna()
        if valid_mask.any():
            fig.add_trace(
                go.Scatter(
                    x=bt_dates[valid_mask],
                    y=bt_predicted_prices[valid_mask],
                    mode="lines",
                    name="Backtest Predictions",
                    line=dict(color=_COLORS["backtest"], width=2, dash="dash"),
                    hovertemplate="Date: %{x|%Y-%m-%d}<br>Predicted: $%{y:.2f}<extra></extra>",
                )
            )

    # --- 3. Future Forecast ---
    last_date = ohlcv.index[-1]
    last_price = float(ohlcv["Close"].iloc[-1])

    # Generate future dates (approximate business days)
    future_dates = pd.bdate_range(
        start=last_date + pd.Timedelta(days=1),
        periods=max(horizon_days, 5),
    )

    # Linear interpolation of the predicted return over the horizon
    n_points = len(future_dates)
    daily_return_step = predicted_return / n_points
    cumulative_returns = np.array(
        [(i + 1) * daily_return_step for i in range(n_points)]
    )
    forecast_prices = last_price * (1 + cumulative_returns)

    # Confidence bands: ± std_error scaled over time
    time_scale = np.sqrt(np.arange(1, n_points + 1) / n_points)
    upper_band = last_price * (1 + cumulative_returns + 1.96 * std_error * time_scale)
    lower_band = last_price * (1 + cumulative_returns - 1.96 * std_error * time_scale)

    # Upper confidence boundary
    fig.add_trace(
        go.Scatter(
            x=future_dates,
            y=upper_band,
            mode="lines",
            name="95% Confidence Upper",
            line=dict(color=_COLORS["confidence_line"], width=1),
            showlegend=False,
            hoverinfo="skip",
        )
    )

    # Lower confidence boundary (fill between)
    fig.add_trace(
        go.Scatter(
            x=future_dates,
            y=lower_band,
            mode="lines",
            name="95% Confidence Band",
            line=dict(color=_COLORS["confidence_line"], width=1),
            fill="tonexty",
            fillcolor=_COLORS["confidence"],
            hoverinfo="skip",
        )
    )

    # Forecast center line
    fig.add_trace(
        go.Scatter(
            x=future_dates,
            y=forecast_prices,
            mode="lines",
            name=f"Forecast ({horizon_label})",
            line=dict(color=_COLORS["forecast"], width=2.5),
            hovertemplate="Date: %{x|%Y-%m-%d}<br>Forecast: $%{y:.2f}<extra></extra>",
        )
    )

    # Connecting line from last actual to first forecast
    fig.add_trace(
        go.Scatter(
            x=[last_date, future_dates[0]],
            y=[last_price, forecast_prices[0]],
            mode="lines",
            line=dict(color=_COLORS["forecast"], width=1.5, dash="dot"),
            showlegend=False,
            hoverinfo="skip",
        )
    )

    # --- Layout ---
    target_price = last_price * (1 + predicted_return)
    direction = "▲" if predicted_return >= 0 else "▼"
    color_tag = _COLORS["forecast"] if predicted_return >= 0 else _COLORS["red"]

    fig.update_layout(
        title=dict(
            text=(
                f"<b>{symbol}</b> — {horizon_label} Forecast &nbsp;"
                f"<span style='color:{color_tag}'>{direction} "
                f"${target_price:,.2f} ({predicted_return:+.2%})</span>"
            ),
            font=dict(size=18, color=_COLORS["text"]),
            x=0.02,
        ),
        xaxis=dict(
            title="Date",
            gridcolor=_COLORS["grid"],
            tickfont=dict(color=_COLORS["text"]),
            rangeslider=dict(visible=False),
        ),
        yaxis=dict(
            title="Price (USD)",
            gridcolor=_COLORS["grid"],
            tickfont=dict(color=_COLORS["text"]),
            tickprefix="$",
        ),
        plot_bgcolor=_COLORS["bg"],
        paper_bgcolor=_COLORS["paper"],
        font=dict(color=_COLORS["text"]),
        legend=dict(
            bgcolor="rgba(26, 31, 46, 0.8)",
            bordercolor=_COLORS["grid"],
            borderwidth=1,
            font=dict(size=11),
        ),
        hovermode="x unified",
        margin=dict(l=60, r=30, t=60, b=40),
        height=520,
    )

    return fig


# ---------------------------------------------------------------------------
# Feature Importance Chart
# ---------------------------------------------------------------------------
def build_feature_importance_chart(
    importance_df: pd.DataFrame,
    model_type: str = "Ensemble",
) -> go.Figure:
    """Horizontal bar chart of feature importances (auto-sizes for 28 features)."""
    df = importance_df.sort_values("Importance", ascending=True)

    # Gradient colors from blue to green based on importance
    max_imp = df["Importance"].max()
    colors = [
        f"rgba({int(79 + (0 - 79) * v / max_imp)}, "
        f"{int(195 + (230 - 195) * v / max_imp)}, "
        f"{int(247 + (118 - 247) * v / max_imp)}, 0.85)"
        for v in df["Importance"]
    ]

    fig = go.Figure(
        go.Bar(
            x=df["Importance"],
            y=df["Feature"],
            orientation="h",
            marker=dict(color=colors, line=dict(color=_COLORS["text"], width=0.5)),
            hovertemplate="%{y}: %{x:.4f}<extra></extra>",
        )
    )

    fig.update_layout(
        title=dict(
            text=f"<b>Feature Importance</b> — {model_type}",
            font=dict(size=15, color=_COLORS["text"]),
            x=0.02,
        ),
        xaxis=dict(
            title="Importance",
            gridcolor=_COLORS["grid"],
            tickfont=dict(color=_COLORS["text"]),
        ),
        yaxis=dict(tickfont=dict(color=_COLORS["text"], size=11)),
        plot_bgcolor=_COLORS["bg"],
        paper_bgcolor=_COLORS["paper"],
        font=dict(color=_COLORS["text"]),
        margin=dict(l=160, r=30, t=50, b=40),
        height=max(420, len(importance_df) * 22 + 80),
    )

    return fig


# ---------------------------------------------------------------------------
# Backtest Comparison Chart
# ---------------------------------------------------------------------------
def build_backtest_chart(backtest_df: pd.DataFrame, symbol: str) -> go.Figure:
    """Scatter plot comparing actual vs predicted returns from backtest."""
    fig = go.Figure()

    fig.add_trace(
        go.Scatter(
            x=backtest_df.index,
            y=backtest_df["Actual"],
            mode="lines+markers",
            name="Actual Return",
            line=dict(color=_COLORS["actual"], width=1.5),
            marker=dict(size=3),
        )
    )

    fig.add_trace(
        go.Scatter(
            x=backtest_df.index,
            y=backtest_df["Predicted"],
            mode="lines+markers",
            name="Predicted Return",
            line=dict(color=_COLORS["backtest"], width=1.5, dash="dash"),
            marker=dict(size=3),
        )
    )

    fig.update_layout(
        title=dict(
            text=f"<b>{symbol}</b> — Walk-Forward Backtest (Actual vs Predicted Returns)",
            font=dict(size=15, color=_COLORS["text"]),
            x=0.02,
        ),
        xaxis=dict(title="Date", gridcolor=_COLORS["grid"]),
        yaxis=dict(title="Return", gridcolor=_COLORS["grid"], tickformat=".2%"),
        plot_bgcolor=_COLORS["bg"],
        paper_bgcolor=_COLORS["paper"],
        font=dict(color=_COLORS["text"]),
        legend=dict(bgcolor="rgba(26, 31, 46, 0.8)"),
        hovermode="x unified",
        margin=dict(l=60, r=30, t=60, b=40),
        height=360,
    )

    return fig


# ---------------------------------------------------------------------------
# Export Helpers
# ---------------------------------------------------------------------------
def chart_to_png_bytes(fig: go.Figure, width: int = 1600, height: int = 900) -> bytes:
    """Render a Plotly figure to PNG bytes using kaleido."""
    try:
        return fig.to_image(format="png", width=width, height=height, scale=2)
    except Exception:
        # Fallback: return empty bytes if kaleido is not available
        buf = io.BytesIO()
        fig.write_html(buf)
        return buf.getvalue()


def dataframe_to_csv_bytes(df: pd.DataFrame) -> bytes:
    """Serialize a DataFrame to CSV bytes."""
    return df.to_csv(index=True).encode("utf-8")
