from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from database.database import get_db
from app.auth import SECRET_KEY, ALGORITHM
from app import model


# ============================================================
# BEARER AUTHENTICATION
# ============================================================

security = HTTPBearer(auto_error=False)


# ============================================================
# CURRENT USER
# ============================================================

def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> model.User:

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is not None:
        if credentials.scheme.lower() != "bearer":
            raise credentials_exception
        token = credentials.credentials
    else:
        # Browser document navigation cannot attach an Authorization header.
        # The login flow mirrors the same JWT in this same-site cookie.
        token = request.cookies.get("access_token")
        if not token:
            raise credentials_exception

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        email = payload.get("sub")

        if not email:
            raise credentials_exception

    except JWTError:
        raise credentials_exception

    user = (
        db.query(model.User)
        .filter(model.User.email == email)
        .first()
    )

    if user is None:
        raise credentials_exception

    return user


# ============================================================
# ADMIN
# ============================================================

def require_admin(
    current_user: model.User = Depends(get_current_user),
) -> model.User:

    if current_user.role != model.UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Admin role required for this action.",
        )

    return current_user


# ============================================================
# ANALYTICS READ ACCESS
# ============================================================

def require_analytics_reader(
    current_user: model.User = Depends(get_current_user),
) -> model.User:
    """Allow authenticated dashboard roles to read analytics."""
    if current_user.role not in {
        model.UserRole.ADMIN,
        model.UserRole.RETAIL_ANALYST,
        model.UserRole.STORE_MANAGER,
        model.UserRole.MARKETING_ANALYST,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Admin, Retail Analyst, Store Manager, or Marketing Analyst role required for analytics.",
        )

    return current_user


def require_role(required_role: model.UserRole):
    """Create an exact-role guard for a role-specific HTML dashboard."""
    def role_guard(
        current_user: model.User = Depends(get_current_user),
    ) -> model.User:
        if current_user.role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access Denied: this dashboard is assigned to another role.",
            )
        return current_user

    role_guard.__name__ = f"require_{required_role.value}_dashboard"
    return role_guard


# ============================================================
# REPORTS READ ACCESS
# ============================================================

def require_report_reader(
    current_user: model.User = Depends(get_current_user),
) -> model.User:
    """Allow dashboard roles to list stored reports without mutation access."""
    if current_user.role not in {
        model.UserRole.ADMIN,
        model.UserRole.RETAIL_ANALYST,
        model.UserRole.STORE_MANAGER,
        model.UserRole.MARKETING_ANALYST,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: report viewing permission is required.",
        )

    return current_user


# ============================================================
# HEATMAP READ ACCESS
# ============================================================

def require_heatmap_reader(
    current_user: model.User = Depends(get_current_user),
) -> model.User:
    """Allow dashboard roles to view generated heatmap data without mutation access."""
    if current_user.role not in {
        model.UserRole.ADMIN,
        model.UserRole.RETAIL_ANALYST,
        model.UserRole.STORE_MANAGER,
        model.UserRole.MARKETING_ANALYST,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: heatmap viewing permission is required.",
        )

    return current_user


# ============================================================
# STORE MANAGER / ADMIN
# ============================================================

def require_store_manager(
    current_user: model.User = Depends(get_current_user),
) -> model.User:

    if current_user.role not in {
        model.UserRole.STORE_MANAGER,
        model.UserRole.ADMIN,
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access Denied: Store manager role required for this action.",
        )

    return current_user
