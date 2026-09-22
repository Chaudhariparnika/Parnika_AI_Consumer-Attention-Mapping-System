import os
import sys
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from database.database import Base, SessionLocal, engine, ensure_schema_compatibility
from app.routers import analytics, blueprint, camera, dashboard, google_auth, login, production, register, store, consumer_analysis, shelves, product
from app import model
from app.dependencies import require_role
from app.middleware.request_logging import RequestLoggingMiddleware
from app.services.production_service import ProductionAnalyticsService

# Create DB tables and ensure compatibility with older database schemas
Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()

ROOT_DIR = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT_DIR))


BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent.parent / "frontend"
UPLOADS_DIR = BASE_DIR.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


app = FastAPI(
    title="AI Consumer Attention Mapping",
    version="1.0.0",
    swagger_ui_parameters={"persistAuthorization": True},
)


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )
    openapi_schema.setdefault("components", {})
    openapi_schema["components"]["securitySchemes"] = {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
    }
    for path in openapi_schema.get("paths", {}).values():
        for operation in path.values():
            if isinstance(operation, dict):
                operation.setdefault("security", [{"bearerAuth": []}])

    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi

app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SECRET_KEY", "SUPER_SECRET_GLASSMORPHISM_KEY_CHANGE_IN_PROD"),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

# API Routers
app.include_router(login.router)
app.include_router(register.router)
app.include_router(dashboard.router)
app.include_router(camera.router)
app.include_router(analytics.router)
app.include_router(google_auth.router)
app.include_router(store.router)
app.include_router(production.router)
app.include_router(blueprint.router)
app.include_router(consumer_analysis.router)
app.include_router(shelves.router)
app.include_router(product.router)



app.mount(
    "/static",
    StaticFiles(directory=FRONTEND_DIR / "static"),
    name="static"
)

app.mount(
    "/uploads",
    StaticFiles(directory=UPLOADS_DIR),
    name="uploads"
)

dashboard_service = ProductionAnalyticsService()

templates = Jinja2Templates(
    directory=FRONTEND_DIR / "templates"
)

# Home Page
@app.get("/", response_class=HTMLResponse)
@app.get("/login", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        "auth/login.html",
        {"request": request}
    )
    

# ---------------- USER ----------------

@app.get("/register", response_class=HTMLResponse)
async def user_register_page(request: Request):
    return templates.TemplateResponse(
        "auth/register.html",
        {"request": request}
    )


@app.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard(
    request: Request,
    current_user: model.User = Depends(require_role(model.UserRole.ADMIN)),
):
    db = SessionLocal()
    try:
        dashboard_summary = dashboard_service.get_dashboard_summary(db)
    except Exception:
        dashboard_summary = {}
    finally:
        db.close()

    return templates.TemplateResponse(
        "admin/admin_dashboard.html",
        {
            "request": request,
            "dashboard_summary": dashboard_summary,
        }
    )


@app.get("/store/dashboard", response_class=HTMLResponse)
async def store_dashboard(
    request: Request,
    current_user: model.User = Depends(require_role(model.UserRole.STORE_MANAGER)),
):
    return templates.TemplateResponse(
        "store_manager/executive_dashboard.html",
        {"request": request}
    )


@app.get("/retail/dashboard", response_class=HTMLResponse)
async def retail_dashboard(
    request: Request,
    current_user: model.User = Depends(require_role(model.UserRole.RETAIL_ANALYST)),
):
    return templates.TemplateResponse(
        "retail_analysts/retail_analysts_dashboard.html",
        {"request": request}
    )

@app.get("/admin/retail-intelligence", response_class=HTMLResponse)
async def retail_intelligence(request: Request):
    return templates.TemplateResponse(
        "admin/Retail_Intelligence.html",
        {"request": request}
    )

@app.get("/marketing/dashboard", response_class=HTMLResponse)
async def marketing_dashboard(
    request: Request,
    current_user: model.User = Depends(require_role(model.UserRole.MARKETING_ANALYST)),
):
    return templates.TemplateResponse(
        "marketing_analysts/marketing_dashboard.html",
        {"request": request}
    )


@app.get("/live-insights", response_class=HTMLResponse)
@app.get("/live_insights.html", response_class=HTMLResponse)
async def live_insights_dashboard(request: Request):
    return templates.TemplateResponse(
        "admin/live_insights.html",
        {"request": request}
    )


@app.get("/store-management", response_class=HTMLResponse)
@app.get("/store_management.html", response_class=HTMLResponse)
async def store_management_page(request: Request):
    return templates.TemplateResponse(
        "admin/store_management.html",
        {"request": request}
    )


@app.get("/camera_management", response_class=HTMLResponse)
async def camera_management_page(request: Request):
    return templates.TemplateResponse(
        "admin/camera_management.html",
        {"request": request}
    )
    
@app.get("/shelves_management", response_class=HTMLResponse)
@app.get("/shelves_management.html", response_class=HTMLResponse)
async def shelves_management_page(request: Request):
    return templates.TemplateResponse(
        "admin/shelves_management.html",
        {"request": request}
    )
    
@app.get("/project_management", response_class=HTMLResponse)
async def project_management_page(request: Request):
    return templates.TemplateResponse(
        "project_management.html",
        {"request": request}
    )


@app.get("/product-management", response_class=HTMLResponse)
@app.get("/product_management.html", response_class=HTMLResponse)
async def product_management_page(request: Request):
    return templates.TemplateResponse(
        "admin/product_management.html",
        {"request": request}
    )


@app.get("/video-analytics-upload", response_class=HTMLResponse)
async def video_analytics_upload_page(request: Request):
    return templates.TemplateResponse(
        "admin/video_upload.html",
        {"request": request}
    )


@app.get("/video_analytics_upload.html")
async def video_analytics_upload_legacy_redirect():
    return RedirectResponse(url="/video-upload", status_code=307)


@app.get("/video-upload", response_class=HTMLResponse)
async def video_upload_page(request: Request):
    return templates.TemplateResponse(
        "admin/video_upload.html",
        {"request": request}
    )


@app.get("/video_upload.html")
async def video_upload_legacy_redirect():
    return RedirectResponse(url="/video-upload", status_code=307)





@app.get("/reports", response_class=HTMLResponse)
@app.get("/reports.html", response_class=HTMLResponse)
async def reports_page(request: Request):
    return templates.TemplateResponse(
        "admin/reports.html",
        {"request": request}
    )


@app.get("/heatmap", response_class=HTMLResponse)
async def heatmap_page(request: Request):
    return templates.TemplateResponse(
        "admin/heatmap.html",
        {"request": request}
    )
    
