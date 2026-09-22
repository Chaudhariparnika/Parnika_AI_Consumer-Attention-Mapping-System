from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app import model
from app.dependencies import require_admin
from database.database import get_db

router = APIRouter(prefix="/api/blueprint", tags=["Blueprint"])


def _to_upload_url(path_value: str | None) -> str | None:
    if not path_value:
        return None
    if path_value.startswith("http://") or path_value.startswith("https://"):
        return path_value
    return f"/uploads/{Path(path_value).name}"


@router.get("/stores/{store_id}")
def get_store_blueprint(store_id: int, db: Session = Depends(get_db), admin_user: model.User = Depends(require_admin)):
    store = db.query(model.Store).filter(model.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    cameras = db.query(model.Camera).filter(model.Camera.store_id == store_id).all()
    return {
        "store_id": store.id,
        "store_name": store.store_name,
        "blueprint_url": _to_upload_url(store.blueprint_url),
        "blueprint_width": store.blueprint_width or 0,
        "blueprint_height": store.blueprint_height or 0,
        "blueprint_config": store.blueprint_config or {},
        "cameras": [
            {
                "id": camera.id,
                "camera_name": camera.camera_name,
                "camera_type": camera.camera_type,
                "video_path": camera.video_path,
                "rtsp_url": camera.rtsp_url,
                "blueprint_url": _to_upload_url(camera.blueprint_url),
                "blueprint_width": camera.blueprint_width or 0,
                "blueprint_height": camera.blueprint_height or 0,
                "calibration_points": camera.calibration_points or {},
                "homography_matrix": camera.homography_matrix or [],
                "blueprint_polygon_zones": camera.blueprint_polygon_zones or [],
            }
            for camera in cameras
        ],
    }


@router.post("/stores/{store_id}/upload")
async def upload_store_blueprint(
    store_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin_user: model.User = Depends(require_admin),
):
    store = db.query(model.Store).filter(model.Store.id == store_id).first()
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")

    suffix = Path(file.filename or "blueprint.png").suffix.lower() or ".png"
    if suffix not in {".png", ".jpg", ".jpeg", ".svg"}:
        raise HTTPException(status_code=400, detail="Unsupported blueprint image format")

    uploads_dir = Path(__file__).resolve().parents[2] / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    saved_name = f"blueprint_{store_id}_{uuid4().hex[:8]}{suffix}"
    saved_path = uploads_dir / saved_name

    with saved_path.open("wb") as output:
        output.write(await file.read())

    store.blueprint_url = str(saved_path)
    store.blueprint_config = {"uploaded_at": str(__import__("datetime").datetime.utcnow().isoformat())}
    db.commit()
    db.refresh(store)

    return {"store_id": store.id, "blueprint_url": _to_upload_url(store.blueprint_url)}


@router.post("/cameras/{camera_id}/calibrate")
def save_camera_calibration(
    camera_id: int,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin_user: model.User = Depends(require_admin),
):
    camera = db.query(model.Camera).filter(model.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    calibration = payload.get("calibration_points") or {}
    blueprint_zones = payload.get("blueprint_polygon_zones") or []
    matrix = payload.get("homography_matrix") or []
    store = db.query(model.Store).filter(model.Store.id == camera.store_id).first()

    camera.calibration_points = calibration
    camera.homography_matrix = matrix
    camera.blueprint_polygon_zones = blueprint_zones
    if store and payload.get("blueprint_url"):
        store.blueprint_url = payload["blueprint_url"]
    if payload.get("blueprint_width") is not None:
        camera.blueprint_width = int(payload["blueprint_width"])
        if store:
            store.blueprint_width = int(payload["blueprint_width"])
    if payload.get("blueprint_height") is not None:
        camera.blueprint_height = int(payload["blueprint_height"])
        if store:
            store.blueprint_height = int(payload["blueprint_height"])

    db.commit()
    db.refresh(camera)
    return {"camera_id": camera.id, "calibration_points": camera.calibration_points, "homography_matrix": camera.homography_matrix}


@router.post("/cameras/{camera_id}/zones")
def save_blueprint_zone(
    camera_id: int,
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    admin_user: model.User = Depends(require_admin),
):
    camera = db.query(model.Camera).filter(model.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    current_zones = list(camera.blueprint_polygon_zones or [])
    current_zones.append(payload)
    camera.blueprint_polygon_zones = current_zones
    db.commit()
    return {"camera_id": camera.id, "blueprint_polygon_zones": camera.blueprint_polygon_zones}


@router.get("/cameras/{camera_id}/tracks")
def get_blueprint_tracks(camera_id: int, db: Session = Depends(get_db), admin_user: model.User = Depends(require_admin)):
    camera = db.query(model.Camera).filter(model.Camera.id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")

    tracks = (
        db.query(model.CustomerTrack)
        .filter(model.CustomerTrack.camera_id == camera_id)
        .order_by(model.CustomerTrack.created_at.desc())
        .limit(200)
        .all()
    )
    results = []
    for track in tracks:
        results.append({
            "customer_id": track.customer_id,
            "shelf_id": track.shelf_id,
            "attention_score": float(track.attention_score or 0.0),
            "dwell_time": float(track.dwell_time or 0.0),
            "customer_path": track.customer_path or "",
            "camera_id": track.camera_id,
            "store_id": track.store_id,
        })
    return {"camera_id": camera.id, "tracks": results}


@router.get("/videos/trajectory")
@router.get("/videos/{video_id}/trajectory")
def get_video_trajectory(video_id: str | None = None, db: Session = Depends(get_db), admin_user: model.User = Depends(require_admin)):
    video_id = video_id or (db.query(model.VideoTrajectoryEvent.video_id).first()[0] if False else None)
    if video_id is None:
        raise HTTPException(status_code=400, detail="video_id is required")

    rows = (
        db.query(model.VideoTrajectoryEvent)
        .filter(model.VideoTrajectoryEvent.video_id == video_id)
        .order_by(model.VideoTrajectoryEvent.frame_number.asc(), model.VideoTrajectoryEvent.customer_id.asc())
        .all()
    )
    return {
        "video_id": video_id,
        "events": [
            {
                "frame_number": row.frame_number,
                "timestamp": row.timestamp,
                "customer_id": row.customer_id,
                "camera_x": row.camera_x,
                "camera_y": row.camera_y,
                "blueprint_x": row.blueprint_x,
                "blueprint_y": row.blueprint_y,
                "zone_id": row.zone_id,
            }
            for row in rows
        ],
    }
