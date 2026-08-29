"""
data_engine.py — Market data acquisition layer using yfinance.

Provides:
  - Automatic symbol resolution (company name → ticker)
  - OHLCV historical data fetching
  - Corporate fundamental metrics extraction
  - Sector ETF mapping for momentum calculations
"""

import os
import threading
from cachetools import TTLCache
from functools import wraps

def _make_hashable(arg):
    if isinstance(arg, (pd.DataFrame, pd.Series, pd.Index)):
        return (len(arg), str(arg.index[-1]) if hasattr(arg, 'index') and len(arg) > 0 else "")
    if isinstance(arg, (list, tuple)):
        return tuple(_make_hashable(x) for x in arg)
    if isinstance(arg, dict):
        return tuple(sorted((k, _make_hashable(v)) for k, v in arg.items()))
    return arg

# ---------------------------------------------------------------------------
# FastAPI-compatible TTL cache decorator (replaces @st.cache_data)
# ---------------------------------------------------------------------------
def _ttl_cache(ttl: int):
    """Thread-safe TTL cache decorator compatible with FastAPI (no Streamlit needed)."""
    def decorator(fn):
        cache: TTLCache = TTLCache(maxsize=256, ttl=ttl)
        lock = threading.Lock()
        @wraps(fn)
        def wrapper(*args, **kwargs):
            try:
                hashable_args = tuple(_make_hashable(a) for a in args)
                hashable_kwargs = tuple(sorted((k, _make_hashable(v)) for k, v in kwargs.items()))
                key = (hashable_args, hashable_kwargs)
            except Exception:
                key = None

            if key is not None:
                with lock:
                    if key in cache:
                        return cache[key]

            result = fn(*args, **kwargs)

            if key is not None:
                with lock:
                    cache[key] = result

            return result
        return wrapper
    return decorator

import yfinance as yf
import pandas as pd
import socket

import time

_last_offline_check = 0.0
_cached_offline_status = False

def _is_offline() -> bool:
    global _last_offline_check, _cached_offline_status
    now = time.time()
    cache_ttl = 5.0 if _cached_offline_status else 30.0
    if _last_offline_check > 0 and (now - _last_offline_check < cache_ttl):
        return _cached_offline_status
    
    try:
        socket.setdefaulttimeout(3.0)
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect(("8.8.8.8", 53))
        s.close()
        _cached_offline_status = False
    except Exception:
        _cached_offline_status = True
    _last_offline_check = now
    return _cached_offline_status

class _OfflineModeProxy:
    def __bool__(self):
        return _is_offline()

OFFLINE_MODE = _OfflineModeProxy()

# ---------------------------------------------------------------------------
# Company Name → Ticker Lookup (top ~120 US equities)
# ---------------------------------------------------------------------------
_NAME_TO_TICKER: dict[str, str] = {
    "apple": "AAPL", "microsoft": "MSFT", "google": "GOOGL",
    "alphabet": "GOOGL", "amazon": "AMZN", "meta": "META",
    "facebook": "META", "tesla": "TSLA", "nvidia": "NVDA",
    "netflix": "NFLX", "adobe": "ADBE", "salesforce": "CRM",
    "intel": "INTC", "amd": "AMD", "qualcomm": "QCOM",
    "ibm": "IBM", "oracle": "ORCL", "cisco": "CSCO",
    "paypal": "PYPL", "uber": "UBER", "airbnb": "ABNB",
    "snap": "SNAP", "snapchat": "SNAP", "spotify": "SPOT",
    "shopify": "SHOP", "palantir": "PLTR", "snowflake": "SNOW",
    "crowdstrike": "CRWD", "datadog": "DDOG", "zoom": "ZM",
    "disney": "DIS", "walmart": "WMT", "costco": "COST",
    "target": "TGT", "home depot": "HD", "lowes": "LOW",
    "nike": "NKE", "starbucks": "SBUX", "mcdonalds": "MCD",
    "coca cola": "KO", "pepsi": "PEP", "procter gamble": "PG",
    "johnson johnson": "JNJ", "pfizer": "PFE", "merck": "MRK",
    "abbvie": "ABBV", "unitedhealth": "UNH", "eli lilly": "LLY",
    "jpmorgan": "JPM", "jp morgan": "JPM", "bank of america": "BAC",
    "goldman sachs": "GS", "morgan stanley": "MS", "wells fargo": "WFC",
    "citigroup": "C", "visa": "V", "mastercard": "MA",
    "american express": "AXP", "berkshire hathaway": "BRK-B",
    "boeing": "BA", "lockheed martin": "LMT", "raytheon": "RTX",
    "general electric": "GE", "honeywell": "HON", "caterpillar": "CAT",
    "3m": "MMM", "deere": "DE", "john deere": "DE",
    "exxon": "XOM", "exxon mobil": "XOM", "chevron": "CVX",
    "conocophillips": "COP", "schlumberger": "SLB",
    "at&t": "T", "att": "T", "verizon": "VZ", "t-mobile": "TMUS",
    "comcast": "CMCSA", "ups": "UPS", "fedex": "FDX",
    "ford": "F", "general motors": "GM", "rivian": "RIVN",
    "lucid": "LCID", "nio": "NIO",
    "coinbase": "COIN", "block": "SQ", "square": "SQ",
    "robinhood": "HOOD", "sofi": "SOFI",
    "moderna": "MRNA", "biontech": "BNTX",
    "advanced micro devices": "AMD", "broadcom": "AVGO",
    "texas instruments": "TXN", "micron": "MU",
    "applied materials": "AMAT", "lam research": "LRCX",
    "asml": "ASML", "synopsys": "SNPS",
    "servicenow": "NOW", "workday": "WDAY", "twilio": "TWLO",
    "palo alto": "PANW", "fortinet": "FTNT", "zscaler": "ZS",
    "arista networks": "ANET", "cloudflare": "NET",
    "draft kings": "DKNG", "roblox": "RBLX",
    "trade desk": "TTD", "the trade desk": "TTD",
    "united airlines": "UAL", "delta airlines": "DAL",
    "southwest airlines": "LUV", "american airlines": "AAL",
    "marathon petroleum": "MPC", "valero": "VLO",
    "duke energy": "DUK", "nextera energy": "NEE",
    "southern company": "SO", "dominion energy": "D",
    "realty income": "O", "prologis": "PLD",
    "american tower": "AMT", "crown castle": "CCI",
    "dow": "DOW", "dupont": "DD",
    "linde": "LIN", "air products": "APD",
    "corning": "GLW", "emerson": "EMR",
    "parker hannifin": "PH", "illinois tool works": "ITW",
    "travelers": "TRV", "chubb": "CB", "aflac": "AFL",
    "progressive": "PGR", "allstate": "ALL",
    "charles schwab": "SCHW", "blackrock": "BLK",
    "s&p global": "SPGI", "moody's": "MCO", "moodys": "MCO",
}

# ---------------------------------------------------------------------------
# Sector → ETF Mapping
# ---------------------------------------------------------------------------
_SECTOR_ETF_MAP: dict[str, str] = {
    "Technology": "XLK",
    "Communication Services": "XLC",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Healthcare": "XLV",
    "Financial Services": "XLF",
    "Financials": "XLF",
    "Industrials": "XLI",
    "Energy": "XLE",
    "Utilities": "XLU",
    "Real Estate": "XLRE",
    "Basic Materials": "XLB",
    "Materials": "XLB",
}

# Default fallback ETF (S&P 500)
_DEFAULT_SECTOR_ETF = "SPY"


# ---------------------------------------------------------------------------
# Symbol Resolution — robust validation for ANY US stock
# ---------------------------------------------------------------------------
def _validate_ticker(symbol: str) -> bool:
    """
    Definitively validate a ticker by attempting to fetch recent price history.
    This is the only reliable test — ticker.info fields vary unpredictably.
    """
    if OFFLINE_MODE:
        import re
        return bool(re.match(r"^[A-Z1-9.-]{1,7}$", symbol.upper()))
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="5d")
        return hist is not None and not hist.empty and len(hist) > 0
    except Exception:
        return False


@_ttl_cache(ttl=3600)
def resolve_symbol(query: str) -> str | None:
    """
    Resolve a user query (company name or ticker) to a valid yfinance symbol.

    Resolution strategy (ordered):
      1. Hardcoded name → ticker map (~120 common US equities)
      2. Direct ticker validation (try the input as-is via price history fetch)
      3. yfinance search API (for company names not in the hardcoded map)

    Returns the uppercase ticker string, or None if unresolvable.
    """
    if not query or not query.strip():
        return None

    cleaned = query.strip()

    # 1) Check the hardcoded name map (instant, no network)
    lookup_key = cleaned.lower()
    if lookup_key in _NAME_TO_TICKER:
        return _NAME_TO_TICKER[lookup_key]

    # 2) Try as a raw ticker symbol — validate by fetching price history
    candidate = cleaned.upper()
    if _validate_ticker(candidate):
        return candidate

    # 3) Search via yfinance for company name → ticker resolution
    #    This handles any stock not in our hardcoded map
    if OFFLINE_MODE:
        return None

    try:
        results = yf.search(cleaned, max_results=5)
        # results may be a dict with 'quotes' key or similar structure
        quotes = []
        if isinstance(results, dict):
            quotes = results.get("quotes", [])
        elif isinstance(results, list):
            quotes = results

        for quote in quotes:
            symbol_candidate = None
            if isinstance(quote, dict):
                symbol_candidate = (
                    quote.get("symbol")
                    or quote.get("ticker")
                    or quote.get("Symbol")
                )
            elif isinstance(quote, str):
                symbol_candidate = quote

            if symbol_candidate:
                symbol_candidate = symbol_candidate.upper()
                if _validate_ticker(symbol_candidate):
                    return symbol_candidate
    except Exception:
        pass

    # 4) Last resort: try common suffixes / variations
    for variation in [cleaned.upper(), cleaned.upper().replace(" ", "-"), cleaned.upper().replace(" ", ".")]:
        if variation != candidate and _validate_ticker(variation):
            return variation

    return None


# ---------------------------------------------------------------------------
# Robust Offline & Mock Data Engine Fallbacks
# ---------------------------------------------------------------------------
_MOCK_FUNDAMENTALS = {
    "AAPL": {
        "trailingPE": 28.5,
        "forwardPE": 25.2,
        "debtToEquity": 1.45,
        "operatingMargins": 0.307,
        "beta": 1.15,
        "marketCap": 2950000000000,
        "sector": "Technology",
        "industry": "Consumer Electronics",
        "shortName": "Apple Inc.",
        "currentPrice": 172.54,
        "previousClose": 171.05,
        "preMarketPrice": 173.20,
        "fiftyTwoWeekHigh": 199.62,
        "fiftyTwoWeekLow": 164.08,
        "trailingEps": 6.13,
        "forwardEps": 6.85,
        "dividendYield": 0.0055,
        "revenueGrowth": 0.085,
        "earningsGrowth": 0.12,
        "grossMargins": 0.443,
        "profitMargins": 0.258,
        "totalDebt": 108000000000,
        "totalRevenue": 383000000000,
        "netIncomeToCommon": 97000000000,
        "freeCashflow": 99500000000,
        "returnOnEquity": 1.485
    },
    "GOOGL": {
        "trailingPE": 25.4,
        "forwardPE": 22.1,
        "debtToEquity": 0.06,
        "operatingMargins": 0.265,
        "beta": 1.05,
        "marketCap": 1880000000000,
        "sector": "Communication Services",
        "industry": "Internet Content & Information",
        "shortName": "Alphabet Inc.",
        "currentPrice": 151.60,
        "previousClose": 150.10,
        "preMarketPrice": 152.40,
        "fiftyTwoWeekHigh": 160.22,
        "fiftyTwoWeekLow": 103.11,
        "trailingEps": 5.80,
        "forwardEps": 6.90,
        "dividendYield": 0.0,
        "revenueGrowth": 0.138,
        "earningsGrowth": 0.21,
        "grossMargins": 0.568,
        "profitMargins": 0.240,
        "totalDebt": 28000000000,
        "totalRevenue": 307000000000,
        "netIncomeToCommon": 73700000000,
        "freeCashflow": 69000000000,
        "returnOnEquity": 0.273
    },
    "MSFT": {
        "trailingPE": 35.8,
        "forwardPE": 32.5,
        "debtToEquity": 0.42,
        "operatingMargins": 0.446,
        "beta": 0.90,
        "marketCap": 3100000000000,
        "sector": "Technology",
        "industry": "Software - Infrastructure",
        "shortName": "Microsoft Corp.",
        "currentPrice": 415.60,
        "previousClose": 417.80,
        "preMarketPrice": 416.10,
        "fiftyTwoWeekHigh": 430.82,
        "fiftyTwoWeekLow": 315.18,
        "trailingEps": 11.07,
        "forwardEps": 12.80,
        "dividendYield": 0.0072,
        "revenueGrowth": 0.176,
        "earningsGrowth": 0.26,
        "grossMargins": 0.697,
        "profitMargins": 0.362,
        "totalDebt": 72000000000,
        "totalRevenue": 227000000000,
        "netIncomeToCommon": 82000000000,
        "freeCashflow": 67000000000,
        "returnOnEquity": 0.385
    },
    "NVDA": {
        "trailingPE": 75.2,
        "forwardPE": 35.1,
        "debtToEquity": 0.12,
        "operatingMargins": 0.541,
        "beta": 1.85,
        "marketCap": 2180000000000,
        "sector": "Technology",
        "industry": "Semiconductors",
        "shortName": "NVIDIA Corp.",
        "currentPrice": 875.12,
        "previousClose": 860.20,
        "preMarketPrice": 880.40,
        "fiftyTwoWeekHigh": 974.00,
        "fiftyTwoWeekLow": 262.20,
        "trailingEps": 11.93,
        "forwardEps": 24.80,
        "dividendYield": 0.0002,
        "revenueGrowth": 2.65,
        "earningsGrowth": 4.92,
        "grossMargins": 0.727,
        "profitMargins": 0.488,
        "totalDebt": 9700000000,
        "totalRevenue": 60900000000,
        "netIncomeToCommon": 29700000000,
        "freeCashflow": 26900000000,
        "returnOnEquity": 0.915
    },
    "TSLA": {
        "trailingPE": 40.5,
        "forwardPE": 34.2,
        "debtToEquity": 0.08,
        "operatingMargins": 0.092,
        "beta": 2.05,
        "marketCap": 550000000000,
        "sector": "Consumer Cyclical",
        "industry": "Auto Manufacturers",
        "shortName": "Tesla Inc.",
        "currentPrice": 175.34,
        "previousClose": 179.20,
        "preMarketPrice": 174.50,
        "fiftyTwoWeekHigh": 299.29,
        "fiftyTwoWeekLow": 138.80,
        "trailingEps": 4.30,
        "forwardEps": 5.12,
        "dividendYield": 0.0,
        "revenueGrowth": 0.035,
        "earningsGrowth": -0.15,
        "grossMargins": 0.182,
        "profitMargins": 0.155,
        "totalDebt": 5300000000,
        "totalRevenue": 96700000000,
        "netIncomeToCommon": 15000000000,
        "freeCashflow": 4300000000,
        "returnOnEquity": 0.224
    }
}

def _generate_mock_fundamentals(symbol: str) -> dict:
    import random
    # Seed based on symbol hash for consistency
    h = abs(hash(symbol))
    random.seed(h)
    
    current_price = 10.0 + random.uniform(5.0, 500.0)
    prev_close = current_price * random.uniform(0.95, 1.05)
    premarket = current_price * random.uniform(0.98, 1.02)
    
    trailing_pe = random.uniform(10.0, 60.0)
    forward_pe = trailing_pe * random.uniform(0.8, 1.0)
    
    debt_equity = random.uniform(0.05, 2.5)
    op_margin = random.uniform(0.02, 0.45)
    beta = random.uniform(0.4, 2.2)
    market_cap = random.randint(10, 2000) * 1000000000
    
    rev_growth = random.uniform(-0.1, 0.45)
    earn_growth = rev_growth * random.uniform(0.9, 1.5)
    
    gross_margin = op_margin * random.uniform(1.2, 2.0)
    profit_margin = op_margin * random.uniform(0.6, 0.9)
    total_debt = market_cap * debt_equity * 0.1
    total_revenue = market_cap * random.uniform(0.05, 0.3)
    net_income = total_revenue * profit_margin
    fcf = net_income * random.uniform(0.7, 0.98)
    roe = profit_margin / max(0.1, (1.0 - debt_equity * 0.3))
    
    sectors = ["Technology", "Communication Services", "Consumer Cyclical", "Consumer Defensive", "Healthcare", "Financial Services", "Industrials", "Energy"]
    sector = sectors[h % len(sectors)]
    
    industries = ["Software - Infrastructure", "Internet Content & Information", "Consumer Electronics", "Auto Manufacturers", "Biotechnology", "Capital Markets", "Specialty Retail", "Oil & Gas Integration"]
    industry = industries[h % len(industries)]
    
    return {
        "trailingPE": round(trailing_pe, 1),
        "forwardPE": round(forward_pe, 1),
        "debtToEquity": round(debt_equity, 2),
        "operatingMargins": round(op_margin, 3),
        "beta": round(beta, 2),
        "marketCap": int(market_cap),
        "sector": sector,
        "industry": industry,
        "shortName": f"{symbol.upper()} Inc.",
        "currentPrice": round(current_price, 2),
        "previousClose": round(prev_close, 2),
        "preMarketPrice": round(premarket, 2),
        "fiftyTwoWeekHigh": round(max(current_price, prev_close) * 1.25, 2),
        "fiftyTwoWeekLow": round(min(current_price, prev_close) * 0.75, 2),
        "trailingEps": round(current_price / trailing_pe, 2),
        "forwardEps": round(current_price / forward_pe, 2),
        "dividendYield": round(random.choice([0.0, 0.015, 0.024, 0.008]), 4),
        "revenueGrowth": round(rev_growth, 3),
        "earningsGrowth": round(earn_growth, 3),
        "grossMargins": round(min(0.95, gross_margin), 3),
        "profitMargins": round(profit_margin, 3),
        "totalDebt": int(total_debt),
        "totalRevenue": int(total_revenue),
        "netIncomeToCommon": int(net_income),
        "freeCashflow": int(fcf),
        "returnOnEquity": round(roe, 3)
    }

# ---------------------------------------------------------------------------
# OHLCV Data
# ---------------------------------------------------------------------------
@_ttl_cache(ttl=900)
def fetch_ohlcv(symbol: str, period: str = "10y") -> pd.DataFrame:
    """
    Fetch daily OHLCV data for a symbol.
    """
    df = pd.DataFrame()
    if not OFFLINE_MODE:
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, auto_adjust=True)
        except Exception:
            pass
        
    if df.empty or len(df) == 0:
        # Only generate synthetic fallback data when explicitly enabled.
        # On the deployed server (Render) this env var should NOT be set,
        # so an empty DataFrame is returned and the caller gets a proper error.
        if os.environ.get("ALLOW_MOCK_DATA", "").lower() == "true":
            import numpy as np
            from datetime import datetime
            
            upper_symbol = symbol.upper()
            h = abs(hash(upper_symbol))
            
            days = 30
            if period == "5y" or period == "10y" or period == "max":
                days = 5 * 365
            elif period == "1y" or period == "2y":
                days = 365
            elif period == "6mo":
                days = 180
            elif period == "1mo":
                days = 30
            elif period == "5d":
                days = 5
                
            dates = pd.bdate_range(end=datetime.now(), periods=days)
            
            if upper_symbol in _MOCK_FUNDAMENTALS:
                curr_price = _MOCK_FUNDAMENTALS[upper_symbol]["currentPrice"]
            else:
                curr_price = 10.0 + (h % 300)
                
            np.random.seed(h % 1000)
            returns = np.random.normal(0.0003, 0.015, len(dates))
            price_series = curr_price * np.exp(np.cumsum(returns) - np.sum(returns))
            
            df = pd.DataFrame(index=dates)
            df["Close"] = price_series
            df["Open"] = price_series * (1.0 + np.random.normal(0, 0.005, len(dates)))
            df["High"] = df[["Open", "Close"]].max(axis=1) * (1.0 + np.random.uniform(0, 0.01, len(dates)))
            df["Low"] = df[["Open", "Close"]].min(axis=1) * (1.0 - np.random.uniform(0, 0.01, len(dates)))
            df["Volume"] = np.random.randint(1000000, 10000000, len(dates))
            df.index.name = "Date"
            return df
        return pd.DataFrame()


    # Keep only OHLCV, drop Dividends/Stock Splits if present
    cols_keep = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in df.columns]
    df = df[cols_keep].copy()
    df = df.ffill().bfill()
    if "Close" in df.columns:
        df = df[df["Close"] > 0]
    df.index = pd.to_datetime(df.index)
    df.index = df.index.tz_localize(None)  # Remove timezone for consistency
    return df


# ---------------------------------------------------------------------------
# Fundamentals
# ---------------------------------------------------------------------------
@_ttl_cache(ttl=900)
def fetch_fundamentals(symbol: str) -> dict:
    """
    Extract key fundamental metrics from yfinance ticker.info.
    """
    info = {}
    if not OFFLINE_MODE:
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}
        except Exception:
            pass

    if not info or not isinstance(info, dict) or not info.get("trailingPE") and not info.get("forwardPE"):
        upper_symbol = symbol.upper()
        if upper_symbol in _MOCK_FUNDAMENTALS:
            info = _MOCK_FUNDAMENTALS[upper_symbol]
        else:
            info = _generate_mock_fundamentals(upper_symbol)

    return {
        "Trailing_PE": info.get("trailingPE"),
        "Forward_PE": info.get("forwardPE"),
        "Debt_to_Equity": info.get("debtToEquity"),
        "Operating_Margin": info.get("operatingMargins"),
        "Beta": info.get("beta"),
        # Extra fields for screener / display
        "Market_Cap": info.get("marketCap"),
        "Sector": info.get("sector"),
        "Industry": info.get("industry"),
        "Company_Name": info.get("shortName") or info.get("longName") or symbol,
        "Current_Price": info.get("currentPrice") or info.get("regularMarketPrice"),
        "Previous_Close": info.get("previousClose"),
        "Premarket_Price": info.get("preMarketPrice") or info.get("premarketPrice"),
        "52W_High": info.get("fiftyTwoWeekHigh"),
        "52W_Low": info.get("fiftyTwoWeekLow"),
        "Trailing_EPS": info.get("trailingEps"),
        "Forward_EPS": info.get("forwardEps"),
        "Dividend_Yield": info.get("dividendYield"),
        "Revenue_Growth": info.get("revenueGrowth"),
        "Earnings_Growth": info.get("earningsGrowth"),
        "Gross_Margins": info.get("grossMargins"),
        "Profit_Margins": info.get("profitMargins"),
        "Total_Debt": info.get("totalDebt"),
        "Total_Revenue": info.get("totalRevenue"),
        "Net_Income": info.get("netIncomeToCommon") or info.get("netIncome"),
        "Free_Cashflow": info.get("freeCashflow"),
        "ROE": info.get("returnOnEquity"),
    }


# ---------------------------------------------------------------------------
# Sector ETF
# ---------------------------------------------------------------------------
@_ttl_cache(ttl=3600)
def get_sector_etf(symbol: str) -> str:
    """Map a ticker's sector to the corresponding SPDR sector ETF."""
    sector = ""
    if not OFFLINE_MODE:
        try:
            info = yf.Ticker(symbol).info or {}
            sector = info.get("sector", "")
        except Exception:
            pass
        
    if not sector:
        upper_symbol = symbol.upper()
        if upper_symbol in _MOCK_FUNDAMENTALS:
            sector = _MOCK_FUNDAMENTALS[upper_symbol]["sector"]
        else:
            sector = _generate_mock_fundamentals(upper_symbol)["sector"]

    return _SECTOR_ETF_MAP.get(sector, _DEFAULT_SECTOR_ETF)


@_ttl_cache(ttl=900)
def fetch_sector_ohlcv(sector_etf: str, period: str = "2y") -> pd.DataFrame:
    """Fetch OHLCV for a sector ETF (used for Sector_Momentum calculation)."""
    return fetch_ohlcv(sector_etf, period=period)


# ---------------------------------------------------------------------------
# Macro-Regime Data Layer (NEW)
# ---------------------------------------------------------------------------

@_ttl_cache(ttl=3600)
def fetch_treasury_yield_spread(period: str = "2y") -> pd.Series:
    """
    Fetch the 10Y - 2Y US Treasury yield curve spread.

    A positive spread signals economic expansion; negative (inverted) signals
    recession risk. Uses ^TNX (10Y) and ^IRX (13-week/proxy 2Y) from yfinance.

    Returns
    -------
    pd.Series indexed by date with daily spread values.
    """
    import numpy as np
    from datetime import datetime

    if not OFFLINE_MODE:
        try:
            t10 = yf.Ticker("^TNX").history(period=period, auto_adjust=True)
            t2  = yf.Ticker("^IRX").history(period=period, auto_adjust=True)

            if not t10.empty and not t2.empty:
                t10_close = t10["Close"].tz_localize(None)
                t2_close  = t2["Close"].tz_localize(None)
                spread = (t10_close - t2_close).dropna()
                spread.name = "Yield_Spread"
                return spread
        except Exception:
            pass

    # --- Offline / fallback mock ---
    days_map = {"5d": 5, "1mo": 30, "6mo": 180, "1y": 365, "2y": 730, "3y": 1095, "5y": 1825}
    n_days = days_map.get(period, 730)
    dates = pd.bdate_range(end=datetime.now(), periods=n_days)
    np.random.seed(42)
    # Mock: yield spread oscillating around 0 with slight upward bias
    raw = np.cumsum(np.random.normal(0.001, 0.05, len(dates)))
    spread = pd.Series(raw - raw.mean(), index=dates, name="Yield_Spread")
    return spread


@_ttl_cache(ttl=3600)
def fetch_macro_regime_features(_date_index: pd.DatetimeIndex, period: str = "2y") -> pd.DataFrame:
    """
    Build a DataFrame of macro-regime features aligned to a given _date_index.

    Features
    --------
    Yield_Spread    : 10Y - 2Y Treasury spread (expansion/recession indicator).
    Inflation_Proxy : 252-day rolling return of TIP ETF (TIPS inflation signal).
    Credit_Stress   : Rolling 30-day return spread of HYG (junk) vs LQD (IG)
                      — captures risk-on/risk-off credit market sentiment.

    All series are forward-filled and aligned to _date_index.

    Parameters
    ----------
    _date_index : pd.DatetimeIndex
        The OHLCV date index to align macro features to.
    period : str
        yfinance period string for historical fetch depth.

    Returns
    -------
    pd.DataFrame with columns [Yield_Spread, Inflation_Proxy, Credit_Stress].
    """
    import numpy as np
    from datetime import datetime

    result = pd.DataFrame(index=_date_index)

    # --- 1. Yield Spread ---
    try:
        spread = fetch_treasury_yield_spread(period=period)
        spread.index = pd.to_datetime(spread.index).tz_localize(None)
        result["Yield_Spread"] = spread.reindex(_date_index, method="ffill")
    except Exception:
        result["Yield_Spread"] = 0.0

    # --- 2. Inflation Proxy (TIP ETF 252-day rolling return) ---
    if not OFFLINE_MODE:
        try:
            tip = fetch_ohlcv("TIP", period=period)
            if not tip.empty:
                inflation_proxy = tip["Close"] / tip["Close"].shift(252) - 1.0
                inflation_proxy.index = pd.to_datetime(inflation_proxy.index).tz_localize(None)
                result["Inflation_Proxy"] = inflation_proxy.reindex(_date_index, method="ffill")
        except Exception:
            pass

    if "Inflation_Proxy" not in result.columns or result["Inflation_Proxy"].isna().all():
        # Mock: slow-mean-reverting inflation proxy
        np.random.seed(7)
        n = len(_date_index)
        mock_inf = 0.03 + 0.02 * np.sin(np.linspace(0, 4 * np.pi, n)) + np.random.normal(0, 0.005, n)
        result["Inflation_Proxy"] = mock_inf

    # --- 3. Credit Stress (HYG 30-day return − LQD 30-day return) ---
    if not OFFLINE_MODE:
        try:
            hyg = fetch_ohlcv("HYG", period=period)
            lqd = fetch_ohlcv("LQD", period=period)
            if not hyg.empty and not lqd.empty:
                hyg_ret = hyg["Close"] / hyg["Close"].shift(30) - 1.0
                lqd_ret = lqd["Close"] / lqd["Close"].shift(30) - 1.0
                credit_stress = hyg_ret - lqd_ret
                credit_stress.index = pd.to_datetime(credit_stress.index).tz_localize(None)
                result["Credit_Stress"] = credit_stress.reindex(_date_index, method="ffill")
        except Exception:
            pass

    if "Credit_Stress" not in result.columns or result["Credit_Stress"].isna().all():
        # Mock: mild negative credit stress (high yield slightly underperforming IG)
        np.random.seed(13)
        n = len(_date_index)
        mock_cs = np.random.normal(-0.003, 0.008, n)
        result["Credit_Stress"] = mock_cs

    # Forward-fill any remaining NaNs, then fill with 0
    result = result.ffill().fillna(0.0)
    return result


def fetch_vwap_series(ohlcv: pd.DataFrame) -> pd.Series:
    """
    Compute the intraday-style VWAP from daily OHLCV data.

    For daily bars, VWAP is approximated as:
        typical_price = (High + Low + Close) / 3
        VWAP_t = cumulative_sum(typical_price * volume) / cumulative_sum(volume)

    To make this useful for ML features, we compute a rolling 20-day VWAP
    instead of session-cumulative, which is more stationary and comparable
    across different price regimes.

    Parameters
    ----------
    ohlcv : pd.DataFrame
        OHLCV with columns [High, Low, Close, Volume].

    Returns
    -------
    pd.Series: Rolling 20-day VWAP, indexed like ohlcv.
    """
    window = 20
    typical_price = (ohlcv["High"] + ohlcv["Low"] + ohlcv["Close"]) / 3.0
    tp_vol = typical_price * ohlcv["Volume"]

    rolling_tp_vol = tp_vol.rolling(window=window, min_periods=window).sum()
    rolling_vol    = ohlcv["Volume"].rolling(window=window, min_periods=window).sum()

    vwap = rolling_tp_vol / rolling_vol.replace(0, float("nan"))
    vwap.name = "VWAP"
    return vwap


# ---------------------------------------------------------------------------
# Curated Ticker Baskets
# ---------------------------------------------------------------------------
DOW_30: list[str] = [
    "AAPL", "MSFT", "AMZN", "NVDA", "UNH", "JNJ", "V", "JPM",
    "WMT", "PG", "HD", "MA", "DIS", "MRK", "CSCO", "INTC",
    "VZ", "KO", "NKE", "MCD", "BA", "CAT", "GS", "AXP",
    "IBM", "DOW", "TRV", "MMM", "CRM", "HON",
]

NASDAQ_SELECT: list[str] = [
    "AAPL", "MSFT", "AMZN", "NVDA", "META", "GOOGL", "TSLA",
    "AVGO", "ADBE", "CRM", "AMD", "NFLX", "QCOM", "INTC",
    "PYPL", "COST", "SBUX", "ABNB", "UBER", "COIN",
]
