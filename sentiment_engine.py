"""
sentiment_engine.py — Live news sentiment via RSS feeds + VADER analysis.

Provides:
  - RSS headline fetching from Google News / Yahoo Finance
  - VADER compound sentiment scoring
  - Macro/political catalyst keyword scanning with sector impact mapping
"""

import re
from datetime import datetime

import feedparser
import threading
from cachetools import TTLCache
from functools import wraps

# ---------------------------------------------------------------------------
# FastAPI-compatible TTL cache (replaces @st.cache_data)
# ---------------------------------------------------------------------------
def _ttl_cache(ttl: int):
    """Thread-safe TTL cache decorator compatible with FastAPI."""
    def decorator(fn):
        cache: TTLCache = TTLCache(maxsize=128, ttl=ttl)
        lock = threading.Lock()
        @wraps(fn)
        def wrapper(*args, **kwargs):
            key = (args, tuple(sorted(kwargs.items())))
            with lock:
                if key in cache:
                    return cache[key]
            result = fn(*args, **kwargs)
            with lock:
                cache[key] = result
            return result
        return wrapper
    return decorator

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# ---------------------------------------------------------------------------
# VADER Analyzer (singleton)
# ---------------------------------------------------------------------------
_analyzer = SentimentIntensityAnalyzer()

# ---------------------------------------------------------------------------
# Macro Keyword → Sector Impact Mapping
# ---------------------------------------------------------------------------
MACRO_KEYWORDS: dict[str, dict] = {
    "tariff": {
        "sector": "Industrials / Automotive",
        "direction": -1,
        "weight": 0.8,
        "description": "Trade tariffs increase import costs for manufacturers",
    },
    "tariffs": {
        "sector": "Industrials / Automotive",
        "direction": -1,
        "weight": 0.8,
        "description": "Trade tariffs increase import costs for manufacturers",
    },
    "trade war": {
        "sector": "Industrials / Technology",
        "direction": -1,
        "weight": 0.9,
        "description": "Escalating trade tensions disrupt global supply chains",
    },
    "tax cut": {
        "sector": "Small-Cap Equities",
        "direction": 1,
        "weight": 0.7,
        "description": "Corporate tax cuts boost domestic small-cap earnings",
    },
    "tax cuts": {
        "sector": "Small-Cap Equities",
        "direction": 1,
        "weight": 0.7,
        "description": "Corporate tax cuts boost domestic small-cap earnings",
    },
    "interest rate": {
        "sector": "Financials / Real Estate",
        "direction": -1,
        "weight": 0.9,
        "description": "Rising rates pressure rate-sensitive sectors",
    },
    "rate hike": {
        "sector": "Real Estate / Utilities",
        "direction": -1,
        "weight": 0.85,
        "description": "Rate hikes increase borrowing costs for REITs and utilities",
    },
    "rate cut": {
        "sector": "Real Estate / Growth Tech",
        "direction": 1,
        "weight": 0.85,
        "description": "Rate cuts lower discount rates, boosting growth valuations",
    },
    "fed rate": {
        "sector": "Financials / Real Estate",
        "direction": -1,
        "weight": 0.85,
        "description": "Federal Reserve rate actions affect lending margins",
    },
    "federal reserve": {
        "sector": "Financials / Bonds",
        "direction": -1,
        "weight": 0.7,
        "description": "Fed policy signals impact broad fixed-income and bank sectors",
    },
    "regulation": {
        "sector": "Technology / Crypto",
        "direction": -1,
        "weight": 0.6,
        "description": "New regulations increase compliance costs for tech firms",
    },
    "regulations": {
        "sector": "Technology / Crypto",
        "direction": -1,
        "weight": 0.6,
        "description": "Regulatory tightening constrains tech sector growth",
    },
    "deregulation": {
        "sector": "Financials / Energy",
        "direction": 1,
        "weight": 0.7,
        "description": "Deregulation lowers compliance costs and barriers to entry",
    },
    "stimulus": {
        "sector": "Consumer Discretionary",
        "direction": 1,
        "weight": 0.75,
        "description": "Fiscal stimulus increases consumer spending power",
    },
    "infrastructure": {
        "sector": "Materials / Industrials",
        "direction": 1,
        "weight": 0.7,
        "description": "Infrastructure spending benefits construction and materials",
    },
    "sanctions": {
        "sector": "Energy / Defense",
        "direction": -1,
        "weight": 0.8,
        "description": "Sanctions disrupt energy supply chains and trade flows",
    },
    "inflation": {
        "sector": "Consumer Staples / Gold",
        "direction": -1,
        "weight": 0.75,
        "description": "Rising inflation erodes purchasing power and profit margins",
    },
    "recession": {
        "sector": "Broad Market",
        "direction": -1,
        "weight": 0.95,
        "description": "Recession fears trigger broad risk-off selling",
    },
    "earnings beat": {
        "sector": "Broad Market",
        "direction": 1,
        "weight": 0.5,
        "description": "Strong earnings signal healthy corporate profits",
    },
    "layoffs": {
        "sector": "Technology / Labor",
        "direction": -1,
        "weight": 0.6,
        "description": "Mass layoffs signal sector contraction or restructuring",
    },
    "ipo": {
        "sector": "Growth / Venture",
        "direction": 1,
        "weight": 0.4,
        "description": "IPO activity reflects market appetite for new growth",
    },
    "antitrust": {
        "sector": "Big Tech",
        "direction": -1,
        "weight": 0.7,
        "description": "Antitrust actions threaten large-cap tech monopolies",
    },
    "oil price": {
        "sector": "Energy / Airlines",
        "direction": -1,
        "weight": 0.65,
        "description": "Oil price spikes increase costs for transport-heavy sectors",
    },
    "chip ban": {
        "sector": "Semiconductors",
        "direction": -1,
        "weight": 0.85,
        "description": "Chip export bans constrain semiconductor revenue",
    },
    "defense spending": {
        "sector": "Defense / Aerospace",
        "direction": 1,
        "weight": 0.75,
        "description": "Increased defense budgets benefit aerospace contractors",
    },
}


# ---------------------------------------------------------------------------
# RSS Feed Fetching
# ---------------------------------------------------------------------------
@_ttl_cache(ttl=600)
def fetch_news_headlines(query: str, max_items: int = 15) -> list[dict]:
    """
    Fetch news headlines from Google News RSS for the given query.

    Returns a list of dicts with keys: title, link, published.
    """
    headlines: list[dict] = []

    # Google News RSS
    google_url = (
        f"https://news.google.com/rss/search?q={query.replace(' ', '+')}&hl=en-US&gl=US&ceid=US:en"
    )
    try:
        feed = feedparser.parse(google_url)
        for entry in feed.entries[:max_items]:
            headlines.append(
                {
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "source": "Google News",
                }
            )
    except Exception:
        pass

    # Yahoo Finance RSS (fallback / supplement)
    yahoo_url = f"https://finance.yahoo.com/rss/headline?s={query}"
    try:
        feed = feedparser.parse(yahoo_url)
        for entry in feed.entries[:max_items]:
            headlines.append(
                {
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "published": entry.get("published", ""),
                    "source": "Yahoo Finance",
                }
            )
    except Exception:
        pass

    return headlines


# ---------------------------------------------------------------------------
# VADER Sentiment Scoring
# ---------------------------------------------------------------------------
def compute_vader_sentiment(headlines: list[str]) -> float:
    """
    Compute the mean VADER compound sentiment score from a list of headline strings.

    Returns a float in [-1.0, 1.0]. Returns 0.0 if no headlines are provided.
    """
    if not headlines:
        return 0.0

    scores = []
    for h in headlines:
        if h and h.strip():
            compound = _analyzer.polarity_scores(h)["compound"]
            scores.append(compound)

    return sum(scores) / len(scores) if scores else 0.0


def get_ticker_sentiment(symbol: str) -> float:
    """Convenience: fetch headlines for a ticker and return VADER compound score."""
    headlines = fetch_news_headlines(symbol, max_items=10)
    title_list = [h["title"] for h in headlines if h.get("title")]
    return compute_vader_sentiment(title_list)


# ---------------------------------------------------------------------------
# Macro Catalyst Scanner
# ---------------------------------------------------------------------------
@_ttl_cache(ttl=600)
def scan_macro_catalysts() -> list[dict]:
    """
    Scan macro/political news feeds for keyword-matched catalysts.

    Queries Google News for broad macro terms and matches headlines
    against MACRO_KEYWORDS. Returns a list of catalyst dicts:
      {headline, keyword, sector, direction, weight, description, sentiment, source}
    """
    macro_queries = [
        "US economy tariffs trade",
        "Federal Reserve interest rate",
        "tax policy regulation",
        "infrastructure stimulus spending",
        "sanctions oil price inflation",
        "tech layoffs antitrust",
    ]

    all_headlines: list[dict] = []
    for q in macro_queries:
        fetched = fetch_news_headlines(q, max_items=8)
        all_headlines.extend(fetched)

    # Deduplicate by title
    seen_titles = set()
    unique: list[dict] = []
    for h in all_headlines:
        t = h.get("title", "").strip().lower()
        if t and t not in seen_titles:
            seen_titles.add(t)
            unique.append(h)

    # Match against keywords
    catalysts: list[dict] = []
    for h in unique:
        title_lower = h.get("title", "").lower()
        for keyword, meta in MACRO_KEYWORDS.items():
            if keyword in title_lower:
                sentiment = _analyzer.polarity_scores(h["title"])["compound"]
                catalysts.append(
                    {
                        "headline": h["title"],
                        "keyword": keyword,
                        "sector": meta["sector"],
                        "direction": "▲ Positive" if meta["direction"] > 0 else "▼ Negative",
                        "weight": meta["weight"],
                        "description": meta["description"],
                        "sentiment": round(sentiment, 3),
                        "source": h.get("source", ""),
                    }
                )
                break  # One keyword match per headline

    # Sort by weight descending
    catalysts.sort(key=lambda c: c["weight"], reverse=True)
    return catalysts
