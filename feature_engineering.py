"""
feature_engineering.py — 18-feature matrix construction.

Builds the complete feature matrix X from raw OHLCV data, corporate
fundamentals, VADER sentiment score, sector ETF data, and macro-regime
indicators.

Feature Groups:
  Technical Regime (7):    RSI_14_KF (Kalman-filtered), MACD_Signal,
                            SMA_Ratio, Bollinger_PctB, ATR_14,
                            FracDiff_Close, VWAP_Deviation  [NEW: last 2]
  Fundamental (5):         Trailing_PE, Forward_PE, Debt_to_Equity,
                            Operating_Margin, Beta
  Macro/Sentiment (6):     VADER_Compound, Volume_ZScore, Sector_Momentum,
                            Yield_Spread, Inflation_Proxy, Credit_Stress
                            [NEW: last 3]
"""

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Technical Feature Calculators (Original)
# ---------------------------------------------------------------------------
def _compute_rsi(close: pd.Series, window: int = 14) -> pd.Series:
    """Relative Strength Index using Wilder's exponential smoothing."""
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.ewm(alpha=1.0 / window, min_periods=window, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / window, min_periods=window, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi


def _compute_macd_signal(close: pd.Series) -> pd.Series:
    """
    MACD histogram: (EMA12 - EMA26) - Signal(EMA9 of MACD line).
    """
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    return macd_line - signal_line


def _compute_sma_ratio(close: pd.Series) -> pd.Series:
    """
    Ratio of short-term SMA to long-term SMA.

    Adaptive windows: uses SMA_50/SMA_200 when sufficient data is available,
    falls back to SMA_20/SMA_50 for newer stocks with limited history.
    """
    n = len(close)
    if n >= 250:
        short_w, long_w = 50, 200
    elif n >= 80:
        short_w, long_w = 20, 50
    else:
        short_w, long_w = 10, 20

    sma_short = close.rolling(window=short_w, min_periods=short_w).mean()
    sma_long = close.rolling(window=long_w, min_periods=long_w).mean()
    return sma_short / sma_long.replace(0, np.nan)


def _compute_bollinger_pctb(close: pd.Series, window: int = 20) -> pd.Series:
    """
    Bollinger %B: position of close within the Bollinger Band.

    %B = (Close - Lower Band) / (Upper Band - Lower Band)
    where Lower = SMA - 2*std, Upper = SMA + 2*std
    """
    sma = close.rolling(window=window, min_periods=window).mean()
    std = close.rolling(window=window, min_periods=window).std()
    lower = sma - 2.0 * std
    upper = sma + 2.0 * std
    band_width = upper - lower
    pctb = (close - lower) / band_width.replace(0, np.nan)
    return pctb


def _compute_atr(
    high: pd.Series,
    low: pd.Series,
    close: pd.Series,
    window: int = 14,
) -> pd.Series:
    """Average True Range using Wilder's smoothing (EMA)."""
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = true_range.ewm(alpha=1.0 / window, min_periods=window, adjust=False).mean()
    return atr


# ---------------------------------------------------------------------------
# Volume Z-Score (Original)
# ---------------------------------------------------------------------------
def _compute_volume_zscore(volume: pd.Series, window: int = 20) -> pd.Series:
    """(Volume - SMA_20(Volume)) / rolling_std_20(Volume)"""
    vol_sma = volume.rolling(window=window, min_periods=window).mean()
    vol_std = volume.rolling(window=window, min_periods=window).std()
    return (volume - vol_sma) / vol_std.replace(0, np.nan)


# ---------------------------------------------------------------------------
# Sector Momentum (Original)
# ---------------------------------------------------------------------------
def _compute_sector_momentum(sector_close: pd.Series, window: int = 30) -> pd.Series:
    """Rolling 30-day return of the sector ETF close prices."""
    return sector_close / sector_close.shift(window) - 1.0


# ---------------------------------------------------------------------------
# NEW: Fractional Differentiation (López de Prado)
# ---------------------------------------------------------------------------
def _compute_fracdiff(close: pd.Series, d: float = 0.4, threshold: float = 1e-4) -> pd.Series:
    """
    Fractionally differentiated price series (López de Prado, AFML Chapter 5).

    Standard integer differencing (d=1) removes ALL memory from the series —
    stationarity at the cost of losing long-term trend information.
    Fractional differencing with d in (0,1) achieves stationarity while
    PRESERVING long-term memory, giving the model richer historical context.

    The fractional differencing weights are:
        w_k = ∏_{j=0}^{k-1} (d - j) / (j + 1)

    A fixed-width window is used: weights below `threshold` are truncated.

    Parameters
    ----------
    close : pd.Series
        Raw close price series.
    d : float
        Fractional differencing parameter in (0, 1). Default 0.4 balances
        memory preservation vs. stationarity.
    threshold : float
        Minimum absolute weight to include. Controls window length.

    Returns
    -------
    pd.Series: Fractionally differenced price series, same index as close.
    """
    # Compute weight vector
    weights = [1.0]
    k = 1
    while True:
        w = -weights[-1] * (d - k + 1) / k
        if abs(w) < threshold:
            break
        weights.append(w)
        k += 1

    weights = np.array(weights)
    width = len(weights)

    # Apply fixed-width convolution
    n = len(close)
    values = close.values.astype(float)
    result = np.full(n, np.nan)

    for i in range(width - 1, n):
        result[i] = np.dot(weights, values[i - width + 1: i + 1][::-1])

    series = pd.Series(result, index=close.index, name="FracDiff_Close")
    return series


# ---------------------------------------------------------------------------
# NEW: Kalman Filter (1D scalar, applied to RSI)
# ---------------------------------------------------------------------------
def _compute_kalman_rsi(
    close: pd.Series,
    rsi_window: int = 14,
    Q: float = 1e-3,
    R: float = 1e-1,
) -> pd.Series:
    """
    Kalman-filtered RSI.

    Applies a 1D recursive Kalman filter on top of the standard RSI series
    to remove white noise and provide cleaner directional signals.

    The Kalman filter model:
        x_{t|t-1} = x_{t-1}        (constant state / random walk)
        P_{t|t-1} = P_{t-1} + Q    (process noise)
        K_t = P_{t|t-1} / (P_{t|t-1} + R)   (Kalman gain)
        x_t = x_{t|t-1} + K_t * (z_t - x_{t|t-1})  (update)
        P_t = (1 - K_t) * P_{t|t-1}

    Parameters
    ----------
    close : pd.Series
        Close price series.
    rsi_window : int
        RSI calculation window (default 14).
    Q : float
        Process noise covariance (state transition uncertainty).
    R : float
        Measurement noise covariance (observation uncertainty).

    Returns
    -------
    pd.Series: Kalman-smoothed RSI in [0, 100], same index as close.
    """
    raw_rsi = _compute_rsi(close, window=rsi_window)
    values = raw_rsi.values.astype(float)
    filtered = np.full(len(values), np.nan)

    # Initialise Kalman filter state at first valid observation
    x_state = 50.0  # prior: neutral RSI
    P = 1.0

    for i, z in enumerate(values):
        if np.isnan(z):
            filtered[i] = np.nan
            continue
        # Predict
        x_pred = x_state
        P_pred = P + Q
        # Update
        K = P_pred / (P_pred + R)
        x_state = x_pred + K * (z - x_pred)
        P = (1.0 - K) * P_pred
        filtered[i] = x_state

    return pd.Series(filtered, index=close.index, name="RSI_14_KF")


# ---------------------------------------------------------------------------
# NEW: VWAP Deviation (Microstructure)
# ---------------------------------------------------------------------------
def _compute_vwap_deviation(close: pd.Series, vwap: pd.Series) -> pd.Series:
    """
    VWAP Deviation: (Close - VWAP) / VWAP

    Measures short-term order-flow microstructure pressure.
    - Positive: price trading above VWAP → buying pressure / momentum.
    - Negative: price below VWAP → selling pressure / mean-reversion signal.

    Highly predictive for short-horizon (1D) predictions.

    Parameters
    ----------
    close : pd.Series
        Close price series.
    vwap : pd.Series
        Rolling 20-day VWAP series (from data_engine.fetch_vwap_series).

    Returns
    -------
    pd.Series: VWAP deviation ratio, same index as close.
    """
    deviation = (close - vwap) / vwap.replace(0, np.nan)
    deviation.name = "VWAP_Deviation"
    return deviation


# ---------------------------------------------------------------------------
# Public API: Build the Full 18-Feature Matrix
# ---------------------------------------------------------------------------
def build_feature_matrix(
    ohlcv: pd.DataFrame,
    fundamentals: dict,
    sentiment_score: float,
    sector_ohlcv: pd.DataFrame | None = None,
    macro_features: pd.DataFrame | None = None,
) -> pd.DataFrame:
    """
    Construct the 18-column feature matrix aligned to the OHLCV DatetimeIndex.

    Parameters
    ----------
    ohlcv : pd.DataFrame
        OHLCV data with columns [Open, High, Low, Close, Volume].
    fundamentals : dict
        Dict with keys: Trailing_PE, Forward_PE, Debt_to_Equity,
        Operating_Margin, Beta. Values can be None (filled with 0).
    sentiment_score : float
        VADER compound score in [-1, 1].
    sector_ohlcv : pd.DataFrame, optional
        OHLCV of the sector ETF (needs at least a 'Close' column).
    macro_features : pd.DataFrame, optional
        DataFrame with macro-regime columns: Yield_Spread, Inflation_Proxy,
        Credit_Stress. Produced by data_engine.fetch_macro_regime_features().

    Returns
    -------
    pd.DataFrame with 18 feature columns. NaN rows from warm-up are dropped.

    Feature Groups
    --------------
    Technical (7):    RSI_14_KF, MACD_Signal, SMA_Ratio, Bollinger_PctB,
                      ATR_14, FracDiff_Close, VWAP_Deviation
    Fundamental (5):  Trailing_PE, Forward_PE, Debt_to_Equity,
                      Operating_Margin, Beta
    Macro/Sent (6):   VADER_Compound, Volume_ZScore, Sector_Momentum,
                      Yield_Spread, Inflation_Proxy, Credit_Stress
    """
    df = pd.DataFrame(index=ohlcv.index)

    # --- Technical Regime (7) ---
    # Kalman-filtered RSI replaces raw RSI (cleaner directional signal)
    df["RSI_14_KF"]       = _compute_kalman_rsi(ohlcv["Close"])
    df["MACD_Signal"]     = _compute_macd_signal(ohlcv["Close"])
    df["SMA_Ratio"]       = _compute_sma_ratio(ohlcv["Close"])
    df["Bollinger_PctB"]  = _compute_bollinger_pctb(ohlcv["Close"])
    df["ATR_14"]          = _compute_atr(ohlcv["High"], ohlcv["Low"], ohlcv["Close"])
    df["FracDiff_Close"]  = _compute_fracdiff(ohlcv["Close"], d=0.4)

    # VWAP deviation — uses rolling VWAP from typical price × volume
    vwap = _compute_rolling_vwap(ohlcv)
    df["VWAP_Deviation"]  = _compute_vwap_deviation(ohlcv["Close"], vwap)

    # --- Fundamental Regime (5) — scalar broadcast ---
    df["Trailing_PE"]      = float(fundamentals.get("Trailing_PE") or 0.0)
    df["Forward_PE"]       = float(fundamentals.get("Forward_PE") or 0.0)
    df["Debt_to_Equity"]   = float(fundamentals.get("Debt_to_Equity") or 0.0)
    df["Operating_Margin"] = float(fundamentals.get("Operating_Margin") or 0.0)
    df["Beta"]             = float(fundamentals.get("Beta") or 1.0)

    # --- Macro & Sentiment Regime (6) ---
    df["VADER_Compound"] = sentiment_score
    df["Volume_ZScore"]  = _compute_volume_zscore(ohlcv["Volume"])

    if sector_ohlcv is not None and not sector_ohlcv.empty and "Close" in sector_ohlcv.columns:
        sector_mom = _compute_sector_momentum(sector_ohlcv["Close"])
        sector_mom = sector_mom.reindex(ohlcv.index, method="ffill")
        df["Sector_Momentum"] = sector_mom
    else:
        df["Sector_Momentum"] = 0.0

    # --- NEW: Macro-Regime Features (3) ---
    if macro_features is not None and not macro_features.empty:
        for col in ["Yield_Spread", "Inflation_Proxy", "Credit_Stress"]:
            if col in macro_features.columns:
                aligned = macro_features[col].reindex(ohlcv.index, method="ffill")
                df[col] = aligned
            else:
                df[col] = 0.0
    else:
        # Provide zero-fill fallback so shape is always 18
        df["Yield_Spread"]    = 0.0
        df["Inflation_Proxy"] = 0.0
        df["Credit_Stress"]   = 0.0

    # Drop rows with NaN from warm-up periods (FracDiff has the longest warmup)
    df = df.dropna()

    return df


# ---------------------------------------------------------------------------
# Internal: Rolling VWAP (used only within this module)
# ---------------------------------------------------------------------------
def _compute_rolling_vwap(ohlcv: pd.DataFrame, window: int = 20) -> pd.Series:
    """Rolling 20-day VWAP from OHLCV. Used internally by build_feature_matrix."""
    typical_price = (ohlcv["High"] + ohlcv["Low"] + ohlcv["Close"]) / 3.0
    tp_vol = typical_price * ohlcv["Volume"]
    rolling_tp_vol = tp_vol.rolling(window=window, min_periods=window).sum()
    rolling_vol    = ohlcv["Volume"].rolling(window=window, min_periods=window).sum()
    return rolling_tp_vol / rolling_vol.replace(0, float("nan"))


# ---------------------------------------------------------------------------
# Feature Names (constant, for display / importance charts) — 18 features
# ---------------------------------------------------------------------------
FEATURE_NAMES: list[str] = [
    # Technical (7)
    "RSI_14_KF",
    "MACD_Signal",
    "SMA_Ratio",
    "Bollinger_PctB",
    "ATR_14",
    "FracDiff_Close",
    "VWAP_Deviation",
    # Fundamental (5)
    "Trailing_PE",
    "Forward_PE",
    "Debt_to_Equity",
    "Operating_Margin",
    "Beta",
    # Macro / Sentiment (6)
    "VADER_Compound",
    "Volume_ZScore",
    "Sector_Momentum",
    "Yield_Spread",
    "Inflation_Proxy",
    "Credit_Stress",
]
