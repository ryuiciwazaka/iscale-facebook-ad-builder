"""Ad strategy — VLM + analytics-driven product strategy recommendation."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional

from app.api.v1.facebook import get_facebook_service
from app.core.deps import get_current_active_user
from app.database import get_db
from app.models import Brand, Product, User
from app.services.ad_strategy_service import AdStrategyService
from app.services.facebook_service import FacebookService

router = APIRouter()


class StrategyRequest(BaseModel):
    product_id: Optional[str] = None
    # Fallback if no product_id: pass product fields directly
    product: Optional[Dict[str, Any]] = None
    ad_account_id: Optional[str] = None
    brand_id: Optional[str] = None


@router.post("/analyze")
async def analyze_strategy(
    request: StrategyRequest,
    db: Session = Depends(get_db),
    service: FacebookService = Depends(get_facebook_service),
    current_user: User = Depends(get_current_active_user),
):
    try:
        product_payload: Dict[str, Any] = {}
        brand_payload: Optional[Dict[str, Any]] = None

        if request.product_id:
            product = db.query(Product).filter(Product.id == request.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {request.product_id} not found")
            product_payload = {
                "id": product.id,
                "name": product.name,
                "description": product.description,
                "product_shots": product.product_shots or [],
                "default_url": product.default_url,
                "brand_id": product.brand_id,
            }
            brand_id = request.brand_id or product.brand_id
        elif request.product:
            product_payload = dict(request.product)
            brand_id = request.brand_id
        else:
            raise HTTPException(status_code=422, detail="Either product_id or product must be provided")

        if brand_id:
            brand = db.query(Brand).filter(Brand.id == brand_id).first()
            if brand:
                brand_payload = {
                    "id": brand.id,
                    "name": brand.name,
                    "voice": brand.voice,
                }

        strategist = AdStrategyService(fb=service)
        report = await strategist.analyze_product(
            product=product_payload,
            ad_account_id=request.ad_account_id,
            brand=brand_payload,
        )
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
