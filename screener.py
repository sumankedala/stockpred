"""
screener.py — Quantitative Stock Screener & Macro Catalyst Engine.

Provides:
  - Alpha Investment Screener: ranks Dow 30 / Nasdaq 100 tickers by a
    composite score (Forward P/E, EPS growth, RSI value territory).
  - Macro-Political Catalyst Matrix: delegates to sentiment_engine for
    keyword scanning and presents structured catalyst data.
"""

import numpy as np
import pandas as pd
import streamlit as st

from data_engine import DOW_30, fetch_fundamentals, fetch_ohlcv
from feature_engineering import _compute_rsi
from sentiment_engine import scan_macro_catalysts


# ---------------------------------------------------------------------------
# Composite Score Weights
# ---------------------------------------------------------------------------
_W_PE = 0.40       # Low forward P/E contribution
_W_EPS = 0.35      # Positive EPS growth contribution
_W_RSI = 0.25      # RSI in value territory (40–60)


# ---------------------------------------------------------------------------
# RSI Value Score
# ---------------------------------------------------------------------------
def _rsi_value_score(rsi: float) -> float:
    """
    Score RSI for value territory: 1.0 if RSI ∈ [40, 60],
    linear decay to 0.0 outside that range (clamped at RSI 20 and 80).
    """
    if 40 <= rsi <= 60:
        return 1.0
    elif rsi < 40:
        return max(0.0, (rsi - 20) / 20.0)
    else:  # rsi > 60
        return max(0.0, (80 - rsi) / 20.0)


# ---------------------------------------------------------------------------
# Alpha Screener
# ---------------------------------------------------------------------------
@st.cache_data(ttl=900, show_spinner=False)
def run_alpha_screener(
    tickers: list[str] | None = None,
    top_n: int = 15,
) -> pd.DataFrame:
    """
    Screen a basket of tickers and rank by composite alpha score.

    Composite Score = w1 * (1/Forward_PE_norm) + w2 * EPS_Growth_norm + w3 * RSI_Score

    Parameters
    ----------
    tickers : list[str], optional
        List of tickers to screen. Defaults to DOW_30.
    top_n : int
        Number of top-ranked results to return.

    Returns
    -------
    pd.DataFrame with columns:
        Rank, Symbol, Company, Price, Forward_PE, EPS_Growth%, RSI_14,
        RSI_Score, Composite_Score
    """
    if tickers is None:
        tickers = DOW_30

    records: list[dict] = []

    for ticker in tickers:
        try:
            fund = fetch_fundamentals(ticker)
            forward_pe = fund.get("Forward_PE")
            trailing_eps = fund.get("Trailing_EPS")
            forward_eps = fund.get("Forward_EPS")
            price = fund.get("Current_Price") or fund.get("Previous_Close")
            name = fund.get("Company_Name", ticker)

            # EPS growth
            eps_growth = None
            if trailing_eps and forward_eps and trailing_eps != 0:
                eps_growth = (forward_eps - trailing_eps) / abs(trailing_eps) * 100

            # RSI from recent price history
            try:
                ohlcv = fetch_ohlcv(ticker, period="3mo")
                if not ohlcv.empty and len(ohlcv) >= 20:
                    rsi_series = _compute_rsi(ohlcv["Close"], window=14)
                    rsi_val = float(rsi_series.dropna().iloc[-1]) if not rsi_series.dropna().empty else None
                else:
                    rsi_val = None
            except Exception:
                rsi_val = None

            records.append(
                {
                    "Symbol": ticker,
                    "Company": name,
                    "Price": price,
                    "Forward_PE": forward_pe,
                    "EPS_Growth_Pct": eps_growth,
                    "RSI_14": rsi_val,
                }
            )
        except Exception:
            continue

    if not records:
        return pd.DataFrame()

    df = pd.DataFrame(records)

    # --- Normalize and compute composite score ---
    # Forward P/E: lower is better → invert and normalize
    df["Forward_PE_filled"] = df["Forward_PE"].fillna(df["Forward_PE"].median())
    pe_inv = 1.0 / df["Forward_PE_filled"].replace(0, np.nan).fillna(1)
    pe_min, pe_max = pe_inv.min(), pe_inv.max()
    df["PE_Score"] = (pe_inv - pe_min) / (pe_max - pe_min + 1e-9)

    # EPS Growth: higher is better → normalize
    df["EPS_Growth_filled"] = df["EPS_Growth_Pct"].fillna(0)
    eps_min, eps_max = df["EPS_Growth_filled"].min(), df["EPS_Growth_filled"].max()
    df["EPS_Score"] = (df["EPS_Growth_filled"] - eps_min) / (eps_max - eps_min + 1e-9)

    # RSI Value Score
    df["RSI_filled"] = df["RSI_14"].fillna(50)
    df["RSI_Score"] = df["RSI_filled"].apply(_rsi_value_score)

    # Composite
    df["Composite_Score"] = (
        _W_PE * df["PE_Score"]
        + _W_EPS * df["EPS_Score"]
        + _W_RSI * df["RSI_Score"]
    )

    # Sort and rank
    df = df.sort_values("Composite_Score", ascending=False).reset_index(drop=True)
    df.index = df.index + 1
    df.index.name = "Rank"

    # Select display columns
    display_cols = [
        "Symbol",
        "Company",
        "Price",
        "Forward_PE",
        "EPS_Growth_Pct",
        "RSI_14",
        "RSI_Score",
        "Composite_Score",
    ]
    result = df[display_cols].head(top_n).copy()

    # Round for display
    for col in ["Price", "Forward_PE", "EPS_Growth_Pct", "RSI_14", "RSI_Score", "Composite_Score"]:
        if col in result.columns:
            result[col] = result[col].round(2)

    result = result.rename(columns={"EPS_Growth_Pct": "EPS Growth %"})

    return result


# ---------------------------------------------------------------------------
# Macro Catalyst Matrix (delegates to sentiment_engine)
# ---------------------------------------------------------------------------
@st.cache_data(ttl=600, show_spinner=False)
def run_macro_catalyst_matrix() -> pd.DataFrame:
    """
    Scan macro/political news and return a structured catalyst DataFrame.

    Returns
    -------
    pd.DataFrame with columns:
        Headline, Keyword, Impacted Sector, Direction, Confidence, Sentiment, Source
    """
    catalysts = scan_macro_catalysts()

    if not catalysts:
        return pd.DataFrame(
            columns=[
                "Headline",
                "Keyword",
                "Impacted Sector",
                "Direction",
                "Confidence",
                "Sentiment",
                "Source",
            ]
        )

    df = pd.DataFrame(catalysts)
    df = df.rename(
        columns={
            "headline": "Headline",
            "keyword": "Keyword",
            "sector": "Impacted Sector",
            "direction": "Direction",
            "weight": "Confidence",
            "sentiment": "Sentiment",
            "source": "Source",
        }
    )

    # Drop description column (used internally)
    if "description" in df.columns:
        df = df.drop(columns=["description"])

    return df
