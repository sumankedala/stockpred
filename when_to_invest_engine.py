"""
when_to_invest_engine.py — Technical Analysis and Simulation Engine.

Computes:
1. Trend Line (linear regression)
2. Bollinger Bands (20-day SMA, 2-std envelope)
3. RSI (14-day Wilder's)
4. MACD (12, 26, 9)
5. Volume trend ratio
Provides final verdict (INVEST, BOOK PROFIT, HOLD) and detailed technical summary.
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, List
from data_engine import fetch_ohlcv, resolve_symbol

def compute_technical_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Computes Trend Line, Bollinger Bands, RSI, MACD, and Volume MA.
    Modifies the input DataFrame or returns a new one with indicators.
    """
    df = df.copy()
    if df.empty or len(df) == 0:
        return df

    # Ensure index is datetime and sorted
    df.index = pd.to_datetime(df.index)
    df = df.sort_index()

    # 1. Primary Trend Line (Linear Regression of Close price)
    n = len(df)
    x = np.arange(n)
    y = df['Close'].values
    
    # Protect against single value or flat arrays
    if n > 1 and not np.all(y == y[0]):
        slope, intercept = np.polyfit(x, y, 1)
        df['Trend_Line'] = slope * x + intercept
    else:
        df['Trend_Line'] = y

    # 2. Bollinger Bands (20-day SMA, 2-std bands)
    window = min(20, n)
    if window > 1:
        df['Middle_Band'] = df['Close'].rolling(window=window).mean()
        df['STD'] = df['Close'].rolling(window=window).std()
        df['Upper_Band'] = df['Middle_Band'] + 2 * df['STD']
        df['Lower_Band'] = df['Middle_Band'] - 2 * df['STD']
    else:
        df['Middle_Band'] = df['Close']
        df['STD'] = 0.0
        df['Upper_Band'] = df['Close']
        df['Lower_Band'] = df['Close']

    # Handle NaNs for the initial window rows by setting them to the Close price
    df['Middle_Band'] = df['Middle_Band'].fillna(df['Close'])
    df['Upper_Band'] = df['Upper_Band'].fillna(df['Close'])
    df['Lower_Band'] = df['Lower_Band'].fillna(df['Close'])

    # 3. RSI (14-day EMA Wilder's style)
    delta = df['Close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    avg_gain = gain.ewm(alpha=1/14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, adjust=False).mean()
    
    rs = avg_gain / (avg_loss + 1e-9)
    df['RSI'] = 100 - (100 / (1 + rs))
    df['RSI'] = df['RSI'].fillna(50)  # Neutral default

    # 4. MACD (12, 26, 9)
    df['EMA12'] = df['Close'].ewm(span=min(12, n), adjust=False).mean()
    df['EMA26'] = df['Close'].ewm(span=min(26, n), adjust=False).mean()
    df['MACD'] = df['EMA12'] - df['EMA26']
    df['MACD_Signal'] = df['MACD'].ewm(span=min(9, n), adjust=False).mean()
    df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']

    # 5. Volume Moving Average & Volume Ratio
    vol_window = min(20, n)
    if vol_window > 0:
        df['Volume_MA'] = df['Volume'].rolling(window=vol_window).mean()
    else:
        df['Volume_MA'] = df['Volume']
    df['Volume_MA'] = df['Volume_MA'].fillna(df['Volume']).replace(0, 1)
    df['Volume_Ratio'] = df['Volume'] / df['Volume_MA']
    
    # Replace any nan/inf with safe values
    df = df.replace([np.inf, -np.inf], np.nan).fillna(0)
    
    return df

def generate_recommendation(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Analyzes the technical setup and returns a recommendation structure.
    """
    if df.empty or len(df) == 0:
        return {
            "verdict": "HOLD",
            "rsi_status": "N/A",
            "macd_status": "N/A",
            "volume_status": "N/A",
            "summary": "Insufficient price data to generate technical analysis recommendations."
        }
        
    latest = df.iloc[-1]
    price = float(latest['Close'])
    upper = float(latest['Upper_Band'])
    lower = float(latest['Lower_Band'])
    rsi = float(latest['RSI'])
    macd_hist = float(latest['MACD_Hist'])
    macd = float(latest['MACD'])
    macd_sig = float(latest['MACD_Signal'])
    vol_ratio = float(latest['Volume_Ratio'])
    
    # Analyze RSI Condition
    if rsi < 30:
        rsi_status = f"Oversold ({rsi:.1f})"
        rsi_signal = "BUY"
    elif rsi > 70:
        rsi_status = f"Overbought ({rsi:.1f})"
        rsi_signal = "SELL"
    else:
        rsi_status = f"Neutral ({rsi:.1f})"
        rsi_signal = "HOLD"

    # Analyze MACD Crossover Condition
    prev_macd_hist = float(df['MACD_Hist'].iloc[-2]) if len(df) > 1 else 0.0
    if prev_macd_hist <= 0 and macd_hist > 0:
        macd_status = "Bullish Crossover"
        macd_signal = "BUY"
    elif prev_macd_hist >= 0 and macd_hist < 0:
        macd_status = "Bearish Crossover"
        macd_signal = "SELL"
    else:
        macd_status = "Bullish Momentum" if macd > macd_sig else "Bearish Momentum"
        macd_signal = "BUY" if macd > macd_sig else "SELL"
        
    # Analyze Volume trend
    if vol_ratio > 1.5:
        volume_status = f"High Volume ({vol_ratio:.1f}x)"
        vol_strong = True
    elif vol_ratio > 1.2:
        volume_status = f"Above Avg Volume ({vol_ratio:.1f}x)"
        vol_strong = True
    else:
        volume_status = f"Normal Volume ({vol_ratio:.1f}x)"
        vol_strong = False
        
    # Determine the Final Verdict
    buy_score = 0
    sell_score = 0
    
    # Position relative to Bollinger Bands
    if price <= lower:
        band_signal = "BUY"
        buy_score += 3
    elif price >= upper:
        band_signal = "SELL"
        sell_score += 3
    else:
        band_signal = "HOLD"
        
    if rsi_signal == "BUY":
        buy_score += 2
    elif rsi_signal == "SELL":
        sell_score += 2
        
    if macd_signal == "BUY":
        buy_score += 1
    elif macd_signal == "SELL":
        sell_score += 1
        
    if buy_score >= 4:
        verdict = "INVEST"
    elif sell_score >= 4:
        verdict = "BOOK PROFIT"
    elif price <= lower:
        verdict = "INVEST"
    elif price >= upper:
        verdict = "BOOK PROFIT"
    else:
        # Mid-range indicators crossover
        if rsi < 35 and macd > macd_sig:
            verdict = "INVEST"
        elif rsi > 65 and macd < macd_sig:
            verdict = "BOOK PROFIT"
        else:
            verdict = "HOLD"
            
    # Compile text summary
    summary_parts = []
    
    if verdict == "INVEST":
        summary_parts.append(
            f"RECOMMENDATION: INVEST. The stock is currently in an accumulation zone. "
            f"The price is trading near or below the lower circuit simulation band of ${lower:.2f}."
        )
        if rsi < 35:
            summary_parts.append(f"RSI is oversold at {rsi:.1f}, confirming significant value.")
        if macd_status == "Bullish Crossover" or macd > macd_sig:
            summary_parts.append("MACD shows bullish momentum/crossover confirmation.")
        if vol_strong:
            summary_parts.append(f"This breakout is backed by heavy institutional activity with volume at {vol_ratio:.1f}x the 20-day average.")
        else:
            summary_parts.append("Volume remains moderate; accumulation should be spread across multiple sessions.")
    elif verdict == "BOOK PROFIT":
        summary_parts.append(
            f"RECOMMENDATION: BOOK PROFIT. The stock is currently in a profit-booking/exit zone. "
            f"The price is trading near or above the upper circuit simulation band of ${upper:.2f}."
        )
        if rsi > 65:
            summary_parts.append(f"RSI is overbought at {rsi:.1f}, highlighting an overextended valuation.")
        if macd_status == "Bearish Crossover" or macd < macd_sig:
            summary_parts.append("MACD indicates bearish trend crossover.")
        if vol_strong:
            summary_parts.append(f"High distribution volume ({vol_ratio:.1f}x average) confirms institutional profit booking.")
    else:
        summary_parts.append(
            f"RECOMMENDATION: HOLD. The stock is currently consolidating within the simulated bands (${lower:.2f} - ${upper:.2f})."
        )
        summary_parts.append(f"RSI is stable at {rsi:.1f} (Neutral zone).")
        if macd > macd_sig:
            summary_parts.append("MACD exhibits mild upward momentum, but lacks breakout volume.")
        else:
            summary_parts.append("MACD shows mild downward consolidation within standard trading parameters.")
            
    summary = " ".join(summary_parts)
    
    return {
        "verdict": verdict,
        "rsi_status": rsi_status,
        "macd_status": macd_status,
        "volume_status": volume_status,
        "summary": summary
    }

def get_invest_analysis(symbol: str) -> dict:
    """
    Main entry point for fetching data, running technical indicators and recommendations.
    """
    resolved_symbol = resolve_symbol(symbol) or symbol.upper()
    df = fetch_ohlcv(resolved_symbol, period="2y")
    
    if df.empty or len(df) == 0:
        return {
            "symbol": resolved_symbol,
            "chart_data": [],
            "recommendation": {
                "verdict": "HOLD",
                "rsi_status": "N/A",
                "macd_status": "N/A",
                "volume_status": "N/A",
                "summary": "No historical data available for this ticker."
            }
        }
        
    df_indicators = compute_technical_indicators(df)
    recommendation = generate_recommendation(df_indicators)
    
    # Format chart data for Recharts (limit to last 250 trading days or so for readability, say 1 year)
    df_chart = df_indicators.tail(250)
    chart_data = []
    for idx, row in df_chart.iterrows():
        chart_data.append({
            "time": idx.strftime("%Y-%m-%d"),
            "close": float(row["Close"]),
            "trend": float(row["Trend_Line"]),
            "upper_band": float(row["Upper_Band"]),
            "lower_band": float(row["Lower_Band"]),
            "rsi": float(row["RSI"]),
            "macd": float(row["MACD"]),
            "macd_signal": float(row["MACD_Signal"]),
            "macd_hist": float(row["MACD_Hist"]),
            "volume": int(row["Volume"]),
            "volume_ma": float(row["Volume_MA"]),
            "buy_zone": bool(row["Close"] <= row["Lower_Band"]),
            "sell_zone": bool(row["Close"] >= row["Upper_Band"])
        })
        
    return {
        "symbol": resolved_symbol,
        "chart_data": chart_data,
        "recommendation": recommendation
    }
