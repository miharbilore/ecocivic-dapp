"""
Database Connection & Session Management Module
PostgreSQL ve Kurulumsuz Yerel SQLite Fallback Desteği
"""
from contextlib import contextmanager
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from config import DATABASE_URL

is_sqlite = DATABASE_URL.startswith("sqlite")

if is_sqlite:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
        pool_recycle=3600,
        echo=False,
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
)

Base = declarative_base()


@contextmanager
def get_db():
    """Database session context manager"""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db():
    """Veritabanı tablolarını otomatik oluşturur ve eksik kolonları tamamlar."""
    import database.models  # noqa: F401
    from sqlalchemy import text

    Base.metadata.create_all(bind=engine)
    if is_sqlite:
        with engine.begin() as conn:
            cols = [
                row[1]
                for row in conn.execute(text("PRAGMA table_info(citizen_profiles)")).fetchall()
            ]
            if "card_balance_try" not in cols:
                conn.execute(
                    text("ALTER TABLE citizen_profiles ADD COLUMN card_balance_try FLOAT NOT NULL DEFAULT 225.0")
                )
            if "total_burned_belt" not in cols:
                conn.execute(
                    text("ALTER TABLE citizen_profiles ADD COLUMN total_burned_belt FLOAT NOT NULL DEFAULT 0.0")
                )
