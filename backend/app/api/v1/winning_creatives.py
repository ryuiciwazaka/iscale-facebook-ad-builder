"""Winning creatives / segment ROAS / fatigue — read-only endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from app.api.v1.facebook import get_facebook_service
from app.core.deps import get_current_active_user
from app.models import User
from app.services.creative_analytics_service import CreativeAnalyticsService
from app.services.facebook_service import FacebookService

router = APIRouter()


def _analytics(fb: FacebookService) -> CreativeAnalyticsService:
    return CreativeAnalyticsService(fb)


@router.get("/live")
async def get_winning_creatives(
    ad_account_id: Optional[str] = None,
    date_preset: str = "last_30d",
    min_spend: float = 50.0,
    top_n: int = 20,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return await _analytics(service).build_winning_creatives(
            ad_account_id=ad_account_id,
            date_preset=date_preset,
            min_spend=min_spend,
            top_n=top_n,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/segments")
def get_segment_roas(
    ad_account_id: Optional[str] = None,
    date_preset: str = "last_30d",
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user),
):
    try:
        return _analytics(service).compute_segment_roas(
            ad_account_id=ad_account_id,
            date_preset=date_preset,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fatigue")
async def get_fatigue(
    ad_account_id: Optional[str] = None,
    date_preset: str = "last_14d",
    min_spend: float = 50.0,
    severity: Optional[str] = None,
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user),
):
    try:
        rows = await _analytics(service).detect_fatigue(
            ad_account_id=ad_account_id,
            date_preset=date_preset,
            min_spend=min_spend,
        )
        if severity:
            allow = {"watch", "warn", "critical"}
            if severity in allow:
                # include the requested tier and anything stricter
                tiers = {"watch": {"watch", "warn", "critical"},
                         "warn": {"warn", "critical"},
                         "critical": {"critical"}}
                rows = [r for r in rows if r["severity"] in tiers[severity]]
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
