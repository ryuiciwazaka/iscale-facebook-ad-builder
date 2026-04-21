"""Ad strategy service — VLM-powered product analysis + strategy recommendation.

Combines Gemini Vision for visual analysis of product media with winning-pattern
and segment signals from CreativeAnalyticsService to produce a concrete ad
strategy: angle, audience, placement, budget tier, copy suggestions.
"""
from __future__ import annotations

import json
import mimetypes
import os
import re
from typing import Any, Dict, List, Optional

import httpx
import google.generativeai as genai

from app.services.creative_analytics_service import CreativeAnalyticsService
from app.services.facebook_service import FacebookService

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

_VLM_PROMPT = """You analyze a product photo for a Turkish women's boutique e-commerce brand.
Return ONLY valid JSON. No commentary. Examine the visuals and fill in:

{
  "category": "elbise|pantolon|bluz|takım|etek|ceket|gömlek|aksesuar|...",
  "dominant_colors": ["hex1","hex2"],
  "style_descriptors": ["minimalist","romantic","edgy","casual","elegant","sporty","boho","streetwear","office","evening","other"],
  "silhouette": "fitted|loose|oversized|a-line|bodycon|straight|flared|cropped|other",
  "mood": "playful|serious|sensual|confident|dreamy|bold|soft|other",
  "selling_hooks": ["kısa, reklamda kullanılacak 3-5 satış noktası"],
  "target_archetype": {
    "age_range": "18-24|25-34|35-44|45+",
    "lifestyle": "öğrenci|çalışan|anne|sosyal hayatı aktif|romantic|edgy|other",
    "occasion": "günlük|iş|davet|tatil|düğün|özel gün|other"
  },
  "weaknesses": ["reklamda avantaja çevrilmesi zor yönler, en fazla 2 tane"],
  "confidence": 0.0
}

Her alanı mutlaka doldur. Bilemediğin yerde "other" yaz. confidence 0-1 arası reel tahmin."""


class AdStrategyService:
    def __init__(self, fb: Optional[FacebookService] = None):
        self.fb = fb
        self._analytics: Optional[CreativeAnalyticsService] = None
        if fb:
            self._analytics = CreativeAnalyticsService(fb)

    # ------------------------------------------------------------------
    # VLM analysis
    # ------------------------------------------------------------------
    def analyze_media(self, image_urls: List[str], max_images: int = 3) -> Dict[str, Any]:
        """Call Gemini Vision on up to `max_images` product shots."""
        if not GEMINI_API_KEY:
            return {"error": "Gemini API key not configured"}
        urls = [u for u in (image_urls or []) if u][:max_images]
        if not urls:
            return {"error": "no_images"}

        parts: List[Any] = [_VLM_PROMPT]
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            for u in urls:
                try:
                    r = client.get(u)
                    if r.status_code != 200:
                        continue
                    mime = r.headers.get("content-type") or mimetypes.guess_type(u)[0] or "image/jpeg"
                    # Strip charset/etc.
                    mime = mime.split(";")[0].strip()
                    parts.append({"mime_type": mime, "data": r.content})
                except Exception as e:
                    print(f"VLM image fetch failed for {u}: {e}")

        if len(parts) < 2:
            return {"error": "no_images_fetched"}

        try:
            model = genai.GenerativeModel("gemini-flash-latest")
            resp = model.generate_content(parts)
            text = (resp.text or "").strip()
            # Strip markdown fences if present
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            return json.loads(text)
        except json.JSONDecodeError as e:
            return {"error": f"invalid_json: {e}", "raw": text[:500] if 'text' in locals() else ""}
        except Exception as e:
            return {"error": f"vlm_failed: {e}"}

    # ------------------------------------------------------------------
    # strategy rules
    # ------------------------------------------------------------------
    def _choose_angle(self, vlm: Dict[str, Any], pattern_profile: Dict[str, Any]) -> Dict[str, str]:
        """Pick a primary creative angle from visual cues + brand pattern."""
        vlm = vlm or {}
        pattern_profile = pattern_profile or {}
        mood = (vlm.get("mood") or "").lower()
        style = set([(s or "").lower() for s in (vlm.get("style_descriptors") or [])])
        archetype = vlm.get("target_archetype") or {}
        occasion = (archetype.get("occasion") or "").lower()
        hook_types = pattern_profile.get("hook_types") or {}

        # Rule-based angle selection
        if "davet" in occasion or "evening" in style or mood in ("sensual", "confident", "bold"):
            angle = "Lifestyle storytelling"
            reason = "Ürün özel gün/davet temalı — duygusal hikaye satar, ürün listesi değil."
        elif "minimalist" in style or "office" in style:
            angle = "Product hero"
            reason = "Sade, temiz ürün — kesim/kumaş detayını öne çıkar, abartıdan kaçın."
        elif "bold" in style or "edgy" in style or "streetwear" in style:
            angle = "Social proof / trend"
            reason = "Cesur parça — 'herkes giyiyor' trend cephesinden sat."
        elif hook_types.get("number_offer", 0) >= hook_types.get("descriptive", 0):
            angle = "Discount-driven"
            reason = "Markanın kazanan reklamlarında sayısal teklif hook'u baskın — aynı formülü kullan."
        else:
            angle = "Lifestyle storytelling"
            reason = "Default — marka voice'uyla uyumlu duygusal storytelling."
        return {"angle": angle, "reason": reason}

    def _recommend_budget(self, segments: Dict[str, Any]) -> Dict[str, Any]:
        """Starter budget suggestion. Accounts with strong historical ROAS → higher."""
        best = (segments or {}).get("best") or {}
        best_ag = best.get("age_gender") or {}
        best_roas = float(best_ag.get("roas") or 0)
        if best_roas >= 2.5:
            return {"tier": "scale", "daily_try": 1500,
                    "note": "Hesabın kazanan kitlesi ROAS ≥2.5x. Daha agresif başla."}
        if best_roas >= 1.5:
            return {"tier": "starter+", "daily_try": 800,
                    "note": "Sağlıklı ROAS geçmişi. Orta bütçeyle başla, 3 gün izle."}
        return {"tier": "starter", "daily_try": 500,
                "note": "Yeni ürün + kısıtlı ROAS geçmişi. Düşük bütçeyle test et, ROAS>1.5 sonrası ölçekle."}

    def _build_audience(self, vlm: Dict[str, Any], segments: Dict[str, Any]) -> Dict[str, Any]:
        vlm = vlm or {}
        segments = segments or {}
        archetype = vlm.get("target_archetype") or {}
        vlm_age = archetype.get("age_range")
        best = segments.get("best") or {}
        best_ag_seg = best.get("age_gender") or {}
        best_pl_seg = best.get("placement") or {}
        best_dev_seg = best.get("device") or {}
        best_ag = best_ag_seg.get("segment") or {}
        best_pl = best_pl_seg.get("segment") or {}
        best_dev = best_dev_seg.get("segment") or {}
        # Prefer VLM archetype when it lines up with historical winner; else historical winner.
        age = vlm_age or best_ag.get("age") or "25-34"
        gender = best_ag.get("gender") or "female"
        return {
            "age": age,
            "gender": gender,
            "lifestyle_tag": archetype.get("lifestyle") or "other",
            "occasion_tag": archetype.get("occasion") or "günlük",
            "placement": best_pl or {"publisher_platform": "instagram", "platform_position": "feed"},
            "device": best_dev or {"impression_device": "iphone"},
            "rationale": (
                f"VLM ürünün kitlesini {vlm_age or '?'} olarak okudu. "
                f"Hesap geçmişinde en iyi ROAS {best_ag.get('age') or '?'} {best_ag.get('gender') or '?'} — "
                "ikisi kesişiyorsa orayı hedefle, değilse ikisini paralel adset'e böl."
            ),
        }

    def _build_copy_seeds(self, vlm: Dict[str, Any], pattern_profile: Dict[str, Any]) -> List[str]:
        """Return 3-5 headline seed suggestions reflecting winning pattern + VLM hooks."""
        hooks = (vlm.get("selling_hooks") or [])[:3]
        mood = (vlm.get("mood") or "").lower()
        has_emoji = ((pattern_profile or {}).get("emoji_rate_pct") or 0) > 0.5
        power = (pattern_profile or {}).get("power_words_present") or {}
        seeds: List[str] = []
        if hooks:
            seeds.append(f"{hooks[0]} — {'Kendin gibi parla' if mood in ('confident','bold') else 'Seni sen yap'} ✨" if has_emoji
                         else f"{hooks[0]} — Kendin gibi parla")
        if len(hooks) >= 2:
            seeds.append(f"{hooks[1]}. Stokta son beden fırsatı" + (" 🔥" if has_emoji else ""))
        if "indirim" in power or "kod" in power:
            seeds.append("İlk siparişe %15 — " + (hooks[0] if hooks else "Yeni koleksiyon"))
        if "yeni" in power or len(seeds) < 3:
            seeds.append("Yeni gelenler: " + (hooks[0] if hooks else "bu kombini kaçırma"))
        if mood in ("sensual", "confident") and len(seeds) < 5:
            seeds.append("Durdurulamaz hisset" + (" ✨" if has_emoji else ""))
        return seeds[:5]

    # ------------------------------------------------------------------
    # public
    # ------------------------------------------------------------------
    async def analyze_product(
        self,
        product: Dict[str, Any],
        ad_account_id: Optional[str] = None,
        brand: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Full strategy report for a single product.

        product: {name, description, product_shots:[url,...], default_url}
        """
        image_urls = product.get("product_shots") or []
        vlm = self.analyze_media(image_urls)

        pattern_profile: Dict[str, Any] = {}
        segments: Dict[str, Any] = {}
        signals = {
            "vlm_ok": False,
            "pattern_ok": False,
            "segments_ok": False,
            "messages": [],
        }
        if self._analytics:
            try:
                live = await self._analytics.build_winning_creatives(
                    ad_account_id=ad_account_id,
                    date_preset="last_30d",
                    min_spend=50.0,
                    top_n=5,
                )
                pattern_profile = live.get("pattern_profile") or {}
                if pattern_profile.get("sample_size", 0) > 0:
                    signals["pattern_ok"] = True
                else:
                    signals["messages"].append("Pattern profile boş — yeterli kazanan reklam yok")
            except Exception as e:
                signals["messages"].append(f"Pattern profile çekilemedi: {e}")
                print(f"pattern_profile fetch failed: {e}")
            try:
                segments = self._analytics.compute_segment_roas(
                    ad_account_id=ad_account_id, date_preset="last_30d",
                )
                best = (segments or {}).get("best") or {}
                if best.get("age_gender") or best.get("placement"):
                    signals["segments_ok"] = True
                else:
                    signals["messages"].append("Segments verisi boş döndü")
            except Exception as e:
                signals["messages"].append(f"Segments çekilemedi: {e}")
                print(f"segments fetch failed: {e}")
        else:
            signals["messages"].append("FB servisi bağlı değil — historical data yok")

        # If VLM failed, fall back to product text so strategy still returns something.
        if not vlm or vlm.get("error"):
            vlm = {
                "error": vlm.get("error") if vlm else "no_vlm",
                "category": "unknown",
                "style_descriptors": [],
                "mood": "other",
                "selling_hooks": [product.get("name") or ""],
                "target_archetype": {"age_range": "25-34", "lifestyle": "other", "occasion": "günlük"},
                "weaknesses": [],
                "confidence": 0.0,
            }
        else:
            signals["vlm_ok"] = True

        signals["ready"] = signals["vlm_ok"] and signals["pattern_ok"] and signals["segments_ok"]

        angle = self._choose_angle(vlm, pattern_profile)
        audience = self._build_audience(vlm, segments)
        budget = self._recommend_budget(segments)
        copy_seeds = self._build_copy_seeds(vlm, pattern_profile)

        return {
            "product": {"id": product.get("id"), "name": product.get("name")},
            "visual_insight": vlm,
            "angle": angle,
            "audience": audience,
            "budget": budget,
            "copy_seeds": copy_seeds,
            "pattern_profile": pattern_profile,
            "best_segments": (segments or {}).get("best"),
            "signals": signals,
        }
