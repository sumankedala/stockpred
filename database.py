"""
database.py — SQLAlchemy-backed local SQLite persistence layer.

Tables:
  - searched_stocks: Historical user queries with prices and horizons.
  - model_metadata: Trained model performance snapshots (MAPE, MDA).
  - user_watchlist: User-curated ticker watchlist with notes.
"""

import os
import hashlib
import secrets
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# ---------------------------------------------------------------------------
# Database path — co-located with the application
# ---------------------------------------------------------------------------
_DB_DIR = os.path.dirname(os.path.abspath(__file__))
_DB_PATH = os.path.join(_DB_DIR, "stockpred.db")
_ENGINE_URL = f"sqlite:///{_DB_PATH}"

Base = declarative_base()


# ---------------------------------------------------------------------------
# ORM Models
# ---------------------------------------------------------------------------
class SearchedStock(Base):
    """Records every stock analysis query a user performs."""

    __tablename__ = "searched_stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(16), nullable=False, index=True)
    query_text = Column(String(128), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_price = Column(Float, nullable=True)
    prediction_horizon = Column(String(8), nullable=True)


class ModelMetadata(Base):
    """Snapshot of model training metrics per symbol × horizon."""

    __tablename__ = "model_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(16), nullable=False, index=True)
    horizon = Column(String(8), nullable=False)
    mape = Column(Float, nullable=True)
    mda = Column(Float, nullable=True)
    n_features = Column(Integer, nullable=True)
    n_samples = Column(Integer, nullable=True)
    trained_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class UserWatchlist(Base):
    """User-curated watchlist entries with optional notes."""

    __tablename__ = "user_watchlist"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(16), nullable=False, unique=True, index=True)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)


class UserAccount(Base):
    """User account records with hashed passwords and roles."""

    __tablename__ = "user_accounts"

    username = Column(String(64), primary_key=True)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(32), default="user", nullable=False)
    api_keys_json = Column(Text, nullable=True)


class SystemSetting(Base):
    """System-wide configuration settings stored as key-value pairs."""

    __tablename__ = "system_settings"

    key = Column(String(128), primary_key=True)
    value = Column(Text, nullable=False)


# ---------------------------------------------------------------------------
# Engine & Session Factory
# ---------------------------------------------------------------------------
_engine = None
_SessionLocal = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(_ENGINE_URL, echo=False, future=True)
    return _engine


def _get_session() -> Session:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=_get_engine())
    return _SessionLocal()


# ---------------------------------------------------------------------------
# Security & Hashing Helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    """Hash password using SHA-256 with a random salt."""
    salt = secrets.token_hex(8)
    hash_val = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}:{hash_val}"


def verify_password(stored_password: str, provided_password: str) -> bool:
    """Verify a password against the stored salt:hash string."""
    if not stored_password:
        return False
    if ":" not in stored_password:
        # Fallback for plain text default config or legacy accounts
        return stored_password == provided_password
    salt, hash_val = stored_password.split(":", 1)
    test_hash = hashlib.sha256((salt + provided_password).encode()).hexdigest()
    return test_hash == hash_val


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------
def init_db():
    """Create all tables and seed default configurations and users if empty."""
    engine = _get_engine()
    Base.metadata.create_all(engine)

    with _get_session() as session:
        # Seed default configurations
        if session.query(SystemSetting).count() == 0:
            default_settings = {
                "active_llm": "Gemini",
                "gemini_model": "gemini-3.1-flash-lite",
                "api_key_OpenAI": "",
                "api_key_Gemini": "",
                "api_key_AWS": ""
            }
            for k, v in default_settings.items():
                session.add(SystemSetting(key=k, value=v))
            session.commit()

        # Seed default users
        if session.query(UserAccount).count() == 0:
            session.add(UserAccount(
                username="suman",
                password_hash=hash_password("Qualcomm@3828"),
                role="admin"
            ))
            session.commit()

        # Database Migration: Clean up old default users ('admin', and old 'suman')
        admin_user = session.query(UserAccount).filter(UserAccount.username == "admin").first()
        if admin_user:
            session.delete(admin_user)
            print("Migration: Removed old 'admin' user.")
            
        suman_user = session.query(UserAccount).filter(UserAccount.username == "suman").first()
        if not suman_user:
            session.add(UserAccount(
                username="suman",
                password_hash=hash_password("Qualcomm@3828"),
                role="admin"
            ))
            print("Migration: Created 'suman' admin user.")
        else:
            old_hash = hash_password("password")
            if suman_user.role != "admin" or suman_user.password_hash == old_hash:
                suman_user.role = "admin"
                suman_user.password_hash = hash_password("Qualcomm@3828")
                print("Migration: Promoted 'suman' to admin and updated password.")
        session.commit()


# ---------------------------------------------------------------------------
# CRUD — Search History
# ---------------------------------------------------------------------------
def log_search(
    symbol: str,
    query_text: str,
    last_price: float | None,
    horizon: str | None,
):
    """Insert a search record."""
    with _get_session() as session:
        record = SearchedStock(
            symbol=symbol.upper(),
            query_text=query_text,
            last_price=last_price,
            prediction_horizon=horizon,
        )
        session.add(record)
        session.commit()


def get_search_history(limit: int = 50) -> list[dict]:
    """Return the most recent search records as dicts."""
    with _get_session() as session:
        rows = (
            session.query(SearchedStock)
            .order_by(SearchedStock.timestamp.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "symbol": r.symbol,
                "query": r.query_text,
                "time": r.timestamp.strftime("%Y-%m-%d %H:%M"),
                "price": r.last_price,
                "horizon": r.prediction_horizon,
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# CRUD — Model Metadata
# ---------------------------------------------------------------------------
def log_model(
    symbol: str,
    horizon: str,
    mape: float | None,
    mda: float | None,
    n_features: int | None,
    n_samples: int | None,
):
    """Insert a model training metadata record."""
    with _get_session() as session:
        record = ModelMetadata(
            symbol=symbol.upper(),
            horizon=horizon,
            mape=mape,
            mda=mda,
            n_features=n_features,
            n_samples=n_samples,
        )
        session.add(record)
        session.commit()


# ---------------------------------------------------------------------------
# CRUD — Watchlist
# ---------------------------------------------------------------------------
def add_to_watchlist(symbol: str, notes: str | None = None):
    """Add a ticker to the watchlist (upsert on symbol)."""
    with _get_session() as session:
        existing = (
            session.query(UserWatchlist)
            .filter(UserWatchlist.symbol == symbol.upper())
            .first()
        )
        if existing:
            existing.notes = notes
            existing.added_at = datetime.utcnow()
        else:
            session.add(
                UserWatchlist(symbol=symbol.upper(), notes=notes)
            )
        session.commit()


def remove_from_watchlist(symbol: str):
    """Remove a ticker from the watchlist."""
    with _get_session() as session:
        session.query(UserWatchlist).filter(
            UserWatchlist.symbol == symbol.upper()
        ).delete()
        session.commit()


def get_watchlist() -> list[dict]:
    """Return all watchlist entries as dicts."""
    with _get_session() as session:
        rows = (
            session.query(UserWatchlist)
            .order_by(UserWatchlist.added_at.desc())
            .all()
        )
        return [
            {
                "symbol": r.symbol,
                "added": r.added_at.strftime("%Y-%m-%d %H:%M"),
                "notes": r.notes or "",
            }
            for r in rows
        ]


# ---------------------------------------------------------------------------
# CRUD — System Settings
# ---------------------------------------------------------------------------
def save_system_setting(key: str, value: str):
    """Save a system setting key-value pair."""
    with _get_session() as session:
        existing = session.query(SystemSetting).filter(SystemSetting.key == key).first()
        if existing:
            existing.value = value
        else:
            session.add(SystemSetting(key=key, value=value))
        session.commit()


def get_system_setting(key: str, default: str = "") -> str:
    """Retrieve a system setting value."""
    with _get_session() as session:
        setting = session.query(SystemSetting).filter(SystemSetting.key == key).first()
        return setting.value if setting else default


# ---------------------------------------------------------------------------
# CRUD — User Accounts
# ---------------------------------------------------------------------------
def create_or_update_user(username: str, password_hash: str, role: str, api_keys_json: str = None):
    """Create or update a user account."""
    with _get_session() as session:
        user = session.query(UserAccount).filter(UserAccount.username == username.lower()).first()
        if user:
            user.password_hash = password_hash
            user.role = role
            if api_keys_json is not None:
                user.api_keys_json = api_keys_json
        else:
            session.add(UserAccount(
                username=username.lower(),
                password_hash=password_hash,
                role=role,
                api_keys_json=api_keys_json
            ))
        session.commit()


def update_user_keys(username: str, api_keys_json: str):
    """Update only the custom API keys of a user."""
    with _get_session() as session:
        user = session.query(UserAccount).filter(UserAccount.username == username.lower()).first()
        if user:
            user.api_keys_json = api_keys_json
            session.commit()
            return True
        return False


def delete_user(username: str):
    """Delete a user account."""
    with _get_session() as session:
        session.query(UserAccount).filter(UserAccount.username == username.lower()).delete()
        session.commit()


def get_all_users() -> list[dict]:
    """Retrieve all user accounts."""
    with _get_session() as session:
        users = session.query(UserAccount).all()
        return [
            {
                "username": u.username,
                "password": u.password_hash,
                "role": u.role,
                "api_keys_json": u.api_keys_json
            }
            for u in users
        ]


def get_user(username: str) -> dict | None:
    """Retrieve a single user account by username."""
    with _get_session() as session:
        user = session.query(UserAccount).filter(UserAccount.username == username.lower()).first()
        if user:
            return {
                "username": user.username,
                "password": user.password_hash,
                "role": user.role,
                "api_keys_json": user.api_keys_json
            }
        return None
