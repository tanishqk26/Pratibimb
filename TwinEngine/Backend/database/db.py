from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from core.config import settings

@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

if settings.database_url.startswith("sqlite"):
    engine = create_engine(
        settings.database_url, connect_args={"check_same_thread": False}
    )
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    from database import models  # noqa
    from sqlalchemy import text
    
    # 1. Try to create vector extension if PostgreSQL
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
        except Exception:
            pass # Skip if not postgres or no permission
            
    # 2. Create tables
    Base.metadata.create_all(bind=engine)

    # 3. Add columns to memories table if not exist (lightweight migration)
    with engine.connect() as conn:
        is_sqlite = engine.dialect.name == "sqlite"
        
        # Add embedding column
        try:
            col_type = "VECTOR" if is_sqlite else "VECTOR(1536)"
            conn.execute(text(f"ALTER TABLE memories ADD COLUMN embedding {col_type}"))
            conn.commit()
        except Exception:
            pass
            
        # Add is_indexed column
        try:
            conn.execute(text("ALTER TABLE memories ADD COLUMN is_indexed BOOLEAN DEFAULT FALSE"))
            conn.commit()
            conn.execute(text("UPDATE memories SET is_indexed = FALSE WHERE is_indexed IS NULL"))
            conn.commit()
        except Exception:
            pass
            
        # Add indexing_status column
        try:
            conn.execute(text("ALTER TABLE memories ADD COLUMN indexing_status VARCHAR(50) DEFAULT 'not_synced'"))
            conn.commit()
            conn.execute(text("UPDATE memories SET indexing_status = 'not_synced' WHERE indexing_status IS NULL"))
            conn.commit()
        except Exception:
            pass
