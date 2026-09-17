from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base

# PostgreSQL Configuration
import os

POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "root")
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "customer_mapping")

DATABASE_URL = (
    f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

# Create SQLAlchemy Engine
engine = create_engine(
    DATABASE_URL,
    echo=True,          # Shows SQL queries in the terminal (set False in production)
    pool_pre_ping=True  # Automatically checks if the DB connection is still alive
)

# Session Factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base Class for Models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema_compatibility() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    if not existing_tables:
        return

    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
        "ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_live_store BOOLEAN DEFAULT FALSE",

        "ALTER TABLE shelves ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'General'",
        "ALTER TABLE shelves ADD COLUMN IF NOT EXISTS aisle VARCHAR(50)",
        "ALTER TABLE shelves ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 0",
        "ALTER TABLE shelves ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active'",

        "ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'General'",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id INTEGER",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode VARCHAR(60)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(80)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS description VARCHAR(1000)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS price DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active'",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url VARCHAR(255)",
        "ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",

        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS camera_name VARCHAR(100)",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS location VARCHAR(100)",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Online'",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS camera_type VARCHAR(20) DEFAULT 'rtsp'",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS fps DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS processing_status VARCHAR(30) DEFAULT 'Idle'",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS current_detection_status VARCHAR(30) DEFAULT 'Idle'",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS video_path VARCHAR(255)",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS blueprint_url VARCHAR(255)",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS blueprint_width INTEGER DEFAULT 0",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS blueprint_height INTEGER DEFAULT 0",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS calibration_points JSON DEFAULT '{}'::json",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS homography_matrix JSON DEFAULT '[]'::json",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS blueprint_polygon_zones JSON DEFAULT '[]'::json",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
        "ALTER TABLE cameras ADD COLUMN IF NOT EXISTS installed_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",

        "ALTER TABLE stores ADD COLUMN IF NOT EXISTS blueprint_url VARCHAR(255)",
        "ALTER TABLE stores ADD COLUMN IF NOT EXISTS blueprint_width INTEGER DEFAULT 0",
        "ALTER TABLE stores ADD COLUMN IF NOT EXISTS blueprint_height INTEGER DEFAULT 0",
        "ALTER TABLE stores ADD COLUMN IF NOT EXISTS blueprint_config JSON DEFAULT '{}'::json",

        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS shelf_id INTEGER",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS distance_to_shelf DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS face_direction VARCHAR(50) DEFAULT 'forward'",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS head_angle DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS looking_at_shelf BOOLEAN DEFAULT FALSE",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS looking_at_product BOOLEAN DEFAULT FALSE",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS walking_speed DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE analytics ADD COLUMN IF NOT EXISTS customer_path VARCHAR(500) DEFAULT ''",

        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS shelf_id INTEGER",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS distance_to_shelf DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS face_direction VARCHAR(50) DEFAULT 'forward'",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS head_angle DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS looking_at_shelf BOOLEAN DEFAULT FALSE",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS looking_at_product BOOLEAN DEFAULT FALSE",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS walking_speed DOUBLE PRECISION DEFAULT 0.0",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS customer_path VARCHAR(500) DEFAULT ''",
        "ALTER TABLE customer_tracks ADD COLUMN IF NOT EXISTS attention_score DOUBLE PRECISION DEFAULT 0.0",

        "ALTER TABLE reports ADD COLUMN IF NOT EXISTS report_id VARCHAR(36)",

        "ALTER TABLE shelves ADD COLUMN IF NOT EXISTS zone_id INTEGER",

        "ALTER TABLE detections ADD COLUMN IF NOT EXISTS zone_id INTEGER",
        "ALTER TABLE detections ADD COLUMN IF NOT EXISTS track_id INTEGER",
    ]

    with engine.begin() as conn:

        # ---------------------------------------------------------
        # CAMERA ZONES
        # ---------------------------------------------------------
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS camera_zones (
                id SERIAL PRIMARY KEY,
                camera_id INTEGER NOT NULL
                    REFERENCES cameras(id) ON DELETE CASCADE,
                zone_name VARCHAR(100) NOT NULL,
                zone_code VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE
                    DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE
                    DEFAULT CURRENT_TIMESTAMP
            )
        """))

        # IMPORTANT:
        # camera_zones no longer stores ROI inline.
        # ROI is stored in camera_zone_rois.
        camera_zone_columns = {
            column["name"]
            for column in inspect(conn).get_columns("camera_zones")
        }

        # Only handle the old column if an old database actually has it.
        if "roi" in camera_zone_columns:
            try:
                conn.execute(text(
                    "ALTER TABLE camera_zones "
                    "ALTER COLUMN roi DROP NOT NULL"
                ))
            except Exception as exc:
                print(
                    "WARNING: Could not update legacy camera_zones.roi: "
                    f"{exc}"
                )

        # ---------------------------------------------------------
        # CAMERA ZONE ROIS
        # ---------------------------------------------------------
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS camera_zone_rois (
                id SERIAL PRIMARY KEY,
                camera_id INTEGER NOT NULL
                    REFERENCES cameras(id) ON DELETE CASCADE,
                zone_id INTEGER NOT NULL UNIQUE
                    REFERENCES camera_zones(id) ON DELETE CASCADE,
                polygon_coordinates JSON NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE
                    DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE
                    DEFAULT CURRENT_TIMESTAMP
            )
        """))

        # ---------------------------------------------------------
        # CAMERA SHELF ROIS
        # ---------------------------------------------------------
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS camera_shelf_rois (
                id SERIAL PRIMARY KEY,
                camera_id INTEGER NOT NULL
                    REFERENCES cameras(id) ON DELETE CASCADE,
                shelf_id INTEGER NOT NULL UNIQUE
                    REFERENCES shelves(id) ON DELETE CASCADE,
                polygon_coordinates JSON NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE
                    DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE
                    DEFAULT CURRENT_TIMESTAMP
            )
        """))

        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS "
            "ix_camera_zone_rois_camera_id "
            "ON camera_zone_rois(camera_id)"
        ))

        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS "
            "ix_camera_shelf_rois_camera_id "
            "ON camera_shelf_rois(camera_id)"
        ))

        # ---------------------------------------------------------
        # LEGACY CAMERA ZONE ROI BACKFILL
        # ---------------------------------------------------------
        if "roi" in camera_zone_columns:
            try:
                with conn.begin_nested():
                    conn.execute(text("""
                        INSERT INTO camera_zone_rois (
                            camera_id,
                            zone_id,
                            polygon_coordinates
                        )
                        SELECT
                            camera_id,
                            id,
                            roi
                        FROM camera_zones
                        WHERE roi IS NOT NULL
                        ON CONFLICT (zone_id) DO NOTHING
                    """))
            except Exception as exc:
                print(
                    "WARNING: Legacy camera zone ROI backfill skipped: "
                    f"{exc}"
                )

        # ---------------------------------------------------------
        # LEGACY SHELF ROI BACKFILL
        # ---------------------------------------------------------
        #
        # This is optional legacy migration.
        # A savepoint prevents failure here from aborting the
        # complete database transaction.
        #
        shelf_columns = {
            column["name"]
            for column in inspect(conn).get_columns("shelves")
        } if "shelves" in existing_tables else set()

        if "roi" in shelf_columns:
            try:
                with conn.begin_nested():
                    conn.execute(text("""
                        INSERT INTO camera_shelf_rois (
                            camera_id,
                            shelf_id,
                            polygon_coordinates
                        )
                        SELECT
                            cz.camera_id,
                            s.id,
                            s.roi
                        FROM shelves s
                        JOIN camera_zones cz
                            ON cz.id = s.zone_id
                        WHERE s.roi IS NOT NULL
                        ON CONFLICT (shelf_id) DO NOTHING
                    """))
            except Exception as exc:
                print(
                    "WARNING: Legacy camera shelf ROI backfill skipped: "
                    f"{exc}"
                )

        # ---------------------------------------------------------
        # VIDEO TRAJECTORY EVENTS
        # ---------------------------------------------------------
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS video_trajectory_events (
                id SERIAL PRIMARY KEY,
                video_id VARCHAR(255) NOT NULL,
                frame_number INTEGER NOT NULL,
                timestamp DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                customer_id INTEGER NOT NULL,
                camera_x DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                camera_y DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                blueprint_x DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                blueprint_y DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                zone_id INTEGER,
                created_at TIMESTAMP WITH TIME ZONE
                    DEFAULT CURRENT_TIMESTAMP
            )
        """))

        # ---------------------------------------------------------
        # INDEXES
        # ---------------------------------------------------------
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS "
            "ix_camera_zones_camera_id "
            "ON camera_zones(camera_id)"
        ))

        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS "
            "ix_video_trajectory_events_video_id "
            "ON video_trajectory_events(video_id)"
        ))

        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS "
            "ix_video_trajectory_events_customer_id "
            "ON video_trajectory_events(customer_id)"
        ))

        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS "
            "ix_video_trajectory_events_frame_number "
            "ON video_trajectory_events(frame_number)"
        ))

        # ---------------------------------------------------------
        # COMPATIBILITY COLUMNS
        # ---------------------------------------------------------
        for statement in statements:
            table_name = statement.split(" ", 3)[2]

            if table_name not in existing_tables:
                continue

            try:
                with conn.begin_nested():
                    conn.execute(text(statement))
            except Exception as exc:
                print(
                    f"WARNING: Compatibility statement skipped "
                    f"for {table_name}: {exc}"
                )

        # ---------------------------------------------------------
        # REPORTS
        # ---------------------------------------------------------
        if "reports" in existing_tables:

            try:
                with conn.begin_nested():
                    conn.execute(text("""
                        CREATE UNIQUE INDEX IF NOT EXISTS
                        ix_reports_report_id
                        ON reports (report_id)
                    """))
            except Exception as exc:
                print(
                    "WARNING: Could not create reports.report_id index: "
                    f"{exc}"
                )

            try:
                with conn.begin_nested():

                    conn.execute(text("""
                        ALTER TABLE reports
                        DROP CONSTRAINT IF EXISTS
                        ck_reports_supported_report_type
                    """))

                    conn.execute(text("""
                        DELETE FROM reports
                        WHERE report_type NOT IN (
                            'consumer_attention',
                            'product_engagement',
                            'shelf_performance'
                        )
                    """))

                    conn.execute(text("""
                        ALTER TABLE reports
                        ADD CONSTRAINT ck_reports_supported_report_type
                        CHECK (
                            report_type IN (
                                'consumer_attention',
                                'product_engagement',
                                'shelf_performance'
                            )
                        )
                    """))

            except Exception as exc:
                print(
                    "WARNING: Reports compatibility update skipped: "
                    f"{exc}"
                )