#!/usr/bin/env python
"""
when_to_invest_script.py

Standalone Quantitative Stock Analysis Script.
Fetches historical stock prices using yfinance, calculates technical indicator envelopes
(Bollinger Bands, Trend Line, RSI, MACD, Volume ratio) and presents:
1. An interactive Plotly visualization showing price bands, shaded buy/sell zones and oscillators.
2. A detailed text summary of the current day's trading recommendation.

Usage:
  python when_to_invest_script.py [TICKER]
  e.g. python when_to_invest_script.py AAPL
"""

import sys
import numpy as np
import pandas as pd
import yfinance as yf
import plotly.graph_objects as go
from plotly.subplots import make_subplots

def compute_indicators(df):
    df = df.copy()
    n = len(df)
    
    # 1. Trend Line (Linear regression of close price)
    x = np.arange(n)
    y = df['Close'].values
    slope, intercept = np.polyfit(x, y, 1)
    df['Trend_Line'] = slope * x + intercept
    
    # 2. Bollinger Bands (20-day SMA, 2-std dev)
    df['Middle_Band'] = df['Close'].rolling(window=20).mean()
    df['STD'] = df['Close'].rolling(window=20).std()
    df['Upper_Band'] = df['Middle_Band'] + (2 * df['STD'])
    df['Lower_Band'] = df['Middle_Band'] - (2 * df['STD'])
    
    df['Middle_Band'] = df['Middle_Band'].fillna(df['Close'])
    df['Upper_Band'] = df['Upper_Band'].fillna(df['Close'])
    df['Lower_Band'] = df['Lower_Band'].fillna(df['Close'])
    
    # 3. RSI (14-day Wilder's EMA)
    delta = df['Close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1/14, adjust=False).mean()
    rs = avg_gain / (avg_loss + 1e-9)
    df['RSI'] = 100 - (100 / (1 + rs))
    df['RSI'] = df['RSI'].fillna(50)
    
    # 4. MACD (12, 26, 9)
    df['EMA12'] = df['Close'].ewm(span=12, adjust=False).mean()
    df['EMA26'] = df['Close'].ewm(span=26, adjust=False).mean()
    df['MACD'] = df['EMA12'] - df['EMA26']
    df['MACD_Signal'] = df['MACD'].ewm(span=9, adjust=False).mean()
    df['MACD_Hist'] = df['MACD'] - df['MACD_Signal']
    
    # 5. Volume Trend MA
    df['Volume_MA'] = df['Volume'].rolling(window=20).mean()
    df['Volume_MA'] = df['Volume_MA'].fillna(df['Volume']).replace(0, 1)
    df['Volume_Ratio'] = df['Volume'] / df['Volume_MA']
    
    return df

def get_recommendation(df):
    latest = df.iloc[-1]
    price = latest['Close']
    upper = latest['Upper_Band']
    lower = latest['Lower_Band']
    rsi = latest['RSI']
    macd_hist = latest['MACD_Hist']
    macd = latest['MACD']
    macd_sig = latest['MACD_Signal']
    vol_ratio = latest['Volume_Ratio']
    
    # Buy/Sell zones
    is_buy = price <= lower
    is_sell = price >= upper
    
    # RSI Setup
    if rsi < 30:
        rsi_status = f"Oversold ({rsi:.1f})"
        rsi_sig = "BUY"
    elif rsi > 70:
        rsi_status = f"Overbought ({rsi:.1f})"
        rsi_sig = "SELL"
    else:
        rsi_status = f"Neutral ({rsi:.1f})"
        rsi_sig = "HOLD"
        
    # MACD Setup
    prev_macd_hist = df['MACD_Hist'].iloc[-2] if len(df) > 1 else 0.0
    if prev_macd_hist <= 0 and macd_hist > 0:
        macd_status = "Bullish Crossover"
        macd_sig = "BUY"
    elif prev_macd_hist >= 0 and macd_hist < 0:
        macd_status = "Bearish Crossover"
        macd_sig = "SELL"
    else:
        macd_status = "Bullish Momentum" if macd > macd_sig else "Bearish Momentum"
        macd_sig = "BUY" if macd > macd_sig else "SELL"
        
    # Volume activity
    vol_strong = vol_ratio > 1.3
    vol_status = f"High Volume ({vol_ratio:.1f}x)" if vol_strong else f"Normal Volume ({vol_ratio:.1f}x)"
    
    # Decision scores
    buy_score = (3 if is_buy else 0) + (2 if rsi_sig == "BUY" else 0) + (1 if macd_sig == "BUY" else 0)
    sell_score = (3 if is_sell else 0) + (2 if rsi_sig == "SELL" else 0) + (1 if macd_sig == "SELL" else 0)
    
    if buy_score >= 4 or is_buy:
        verdict = "INVEST"
        summary = (f"The stock is currently trading in a potential accumulation zone (Close: ${price:.2f} <= Lower Band: ${lower:.2f}). "
                   f"RSI is {rsi_status} and MACD is showing a {macd_status}. ")
        if vol_strong:
            summary += f"This breakout is supported by strong institutional volume ({vol_ratio:.1f}x the 20-day MA)."
        else:
            summary += "Breakout volume is moderate. We suggest scaling into position."
    elif sell_score >= 4 or is_sell:
        verdict = "BOOK PROFIT"
        summary = (f"The stock is currently trading in a profit-booking/exit zone (Close: ${price:.2f} >= Upper Band: ${upper:.2f}). "
                   f"RSI is {rsi_status} and MACD is showing a {macd_status}. ")
        if vol_strong:
            summary += f"Breakout is supported by heavy distribution volume ({vol_ratio:.1f}x the 20-day MA)."
    else:
        verdict = "HOLD"
        summary = (f"The stock is consolidating inside the volatility envelopes (${lower:.2f} to ${upper:.2f}). "
                   f"RSI is neutral at {rsi:.1f} and MACD shows {macd_status}. No immediate breakout triggers detected.")
                   
    return {
        "verdict": verdict,
        "rsi_status": rsi_status,
        "macd_status": macd_status,
        "volume_status": vol_status,
        "summary": summary
    }

def main():
    ticker_symbol = "AAPL"
    if len(sys.argv) > 1:
        ticker_symbol = sys.argv[1].upper()
        
    print(f"Fetching historical data for {ticker_symbol} from yfinance...")
    ticker = yf.Ticker(ticker_symbol)
    df = ticker.history(period="2y")
    
    if df.empty:
        print(f"Error: Could not retrieve price data for {ticker_symbol} using yfinance.")
        sys.exit(1)
        
    print(f"Calculating technical envelopes, trend lines and indicators...")
    df = compute_indicators(df)
    rec = get_recommendation(df)
    
    print("\n" + "="*50)
    print(f"TECHNICAL ANALYSIS SUMMARY FOR {ticker_symbol}")
    print("="*50)
    print(f"Current Day's Close:  ${df['Close'].iloc[-1]:.2f}")
    print(f"Verdict Suggestion:   {rec['verdict']}")
    print(f"RSI Status:           {rec['rsi_status']}")
    print(f"MACD Status:          {rec['macd_status']}")
    print(f"Volume Status:        {rec['volume_status']}")
    print("-"*50)
    print("Recommendation Summary:")
    print(rec['summary'])
    print("="*50 + "\n")
    
    # Limit chart to last 250 trading days (1 year) for visibility
    df_chart = df.tail(250)
    
    fig = make_subplots(
        rows=4, cols=1, 
        shared_xaxes=True, 
        vertical_spacing=0.05,
        row_heights=[0.5, 0.15, 0.15, 0.2],
        subplot_titles=(
            f"{ticker_symbol} Price & Dynamic Bands", 
            "RSI (14)", 
            "MACD Oscillator", 
            "Volume Confirmation"
        )
    )
    
    # 1. Price, Bollinger Bands, and Trend
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['Close'], name='Stock Price', line=dict(color='#3B82F6', width=2.5)), row=1, col=1)
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['Trend_Line'], name='Primary Trend Line', line=dict(color='#94A3B8', width=1.5)), row=1, col=1)
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['Upper_Band'], name='Upper Circuit Band (Resistance)', line=dict(color='#EF4444', width=1.2, dash='dash')), row=1, col=1)
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['Lower_Band'], name='Lower Circuit Band (Support)', line=dict(color='#10B981', width=1.2, dash='dash')), row=1, col=1)
    
    # Shaded Buy / Sell zones
    # Plot buy signals (crosses below lower band)
    buy_signals = df_chart[df_chart['Close'] <= df_chart['Lower_Band']]
    fig.add_trace(go.Scatter(
        x=buy_signals.index, y=buy_signals['Close'], 
        mode='markers', name='Accumulation Zone (Buy)',
        marker=dict(color='#10B981', size=8, symbol='triangle-up', line=dict(color='white', width=1))
    ), row=1, col=1)
    
    # Plot profit booking signals (crosses above upper band)
    sell_signals = df_chart[df_chart['Close'] >= df_chart['Upper_Band']]
    fig.add_trace(go.Scatter(
        x=sell_signals.index, y=sell_signals['Close'], 
        mode='markers', name='Profit-Booking Zone (Sell)',
        marker=dict(color='#EF4444', size=8, symbol='triangle-down', line=dict(color='white', width=1))
    ), row=1, col=1)

    # 2. RSI Subplot
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['RSI'], name='RSI (14)', line=dict(color='#A855F7', width=1.5)), row=2, col=1)
    fig.add_hline(y=70, line_dash="dash", line_color="#EF4444", row=2, col=1, annotation_text="Overbought", annotation_position="top right")
    fig.add_hline(y=30, line_dash="dash", line_color="#10B981", row=2, col=1, annotation_text="Oversold", annotation_position="bottom right")
    fig.add_hline(y=50, line_dash="dot", line_color="#475569", row=2, col=1)
    
    # 3. MACD Subplot
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['MACD'], name='MACD', line=dict(color='#3B82F6', width=1.5)), row=3, col=1)
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['MACD_Signal'], name='Signal Line', line=dict(color='#F59E0B', width=1.5)), row=3, col=1)
    
    # MACD Histogram bars
    hist_colors = ['rgba(16, 185, 129, 0.6)' if val >= 0 else 'rgba(239, 68, 68, 0.6)' for val in df_chart['MACD_Hist']]
    fig.add_trace(go.Bar(x=df_chart.index, y=df_chart['MACD_Hist'], name='MACD Histogram', marker_color=hist_colors), row=3, col=1)

    # 4. Volume Subplot
    fig.add_trace(go.Bar(x=df_chart.index, y=df_chart['Volume'], name='Volume', marker_color='rgba(59, 130, 246, 0.3)'), row=4, col=1)
    fig.add_trace(go.Scatter(x=df_chart.index, y=df_chart['Volume_MA'], name='Volume 20d MA', line=dict(color='#3B82F6', width=1.5)), row=4, col=1)

    # Layout enhancements
    fig.update_layout(
        title=f"Technical Indicators Simulation Suite: {ticker_symbol}",
        template="plotly_dark",
        height=800,
        showlegend=True,
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        )
    )
    
    # Share X-axis configuration
    fig.update_xaxes(showgrid=True, gridcolor="#1E293B")
    fig.update_yaxes(showgrid=True, gridcolor="#1E293B")
    fig.update_yaxes(title_text="Price ($)", row=1, col=1)
    fig.update_yaxes(title_text="RSI Value", row=2, col=1)
    fig.update_yaxes(title_text="MACD Value", row=3, col=1)
    fig.update_yaxes(title_text="Volume", row=4, col=1)
    
    # Render chart in browser
    fig.show()

if __name__ == "__main__":
    main()
