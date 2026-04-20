"""Creative analytics — joins ad-level insights with creative content, extracts
pattern profiles, computes segment ROAS, detects fatigue. Pure read-side service.
"""
from __future__ import annotations

import asyncio
import re
from collections import Counter
from typing import Any, Dict, List, Optional

from app.services.facebook_service import FacebookService

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U0001F900-\U0001F9FF\u2600-\u27BF]",
    flags=re.UNICODE,
)
TR_POWER_WORDS = [
    "yeni", "özel", "kargo bedava", "indirim", "hemen",
    "kaçırma", "kaçırmayın", "son", "bugün", "kod",
    "ücretsiz", "sınırlı", "fırsat", "%",
]


def _pick_action(items, action_type):
    if not items:
        return 0.0
    for a in items:
        if a.get("action_type") == action_type:
            try:
                return float(a.get("value") or 0)
            except (TypeError, ValueError):
                return 0.0
    return 0.0


def _pick_purchase_value(action_values):
    # Prefer omni_purchase, fall back to purchase
    v = _pick_action(action_values, "omni_purchase")
    if v:
        return v
    return _pick_action(action_values, "purchase")


def _pick_purchase_count(actions):
    v = _pick_action(actions, "omni_purchase")
    if v:
        return v
    return _pick_action(actions, "purchase")


def _classify_hook(text: str) -> str:
    if not text:
        return "unknown"
    t = text.strip()
    if t.startswith("?") or t.endswith("?") or "?" in t[:40]:
        return "question"
    if re.search(r"\d+\s?%|%\s?\d+|\d{2,}\s?TL|\d+ adet", t):
        return "number_offer"
    if re.search(r"^(Yeni|YENİ|yeni)\b", t):
        return "novelty"
    if re.search(r"\b(için|ile|sayesinde)\b", t[:80], re.IGNORECASE):
        return "benefit"
    if re.search(r"\b(sen|sana|senin)\b", t[:80], re.IGNORECASE):
        return "you_focused"
    return "descriptive"


def _word_count(text: str) -> int:
    if not text:
        return 0
    return len([w for w in re.split(r"\s+", text.strip()) if w])


# ---------------------------------------------------------------------------
# service
# ---------------------------------------------------------------------------

class CreativeAnalyticsService:
    """Read-only analytics layered over FacebookService."""

    def __init__(self, fb: FacebookService):
        self.fb = fb

    # ------------------------------------------------------------------
    # winning creatives
    # ------------------------------------------------------------------
    async def build_winning_creatives(
        self,
        ad_account_id: Optional[str] = None,
        date_preset: str = "last_30d",
        min_spend: float = 50.0,
        top_n: int = 20,
    ) -> Dict[str, Any]:
        """Return ranked winning ads + pattern profile."""
        rows = self.fb.get_ad_level_insights(
            ad_account_id=ad_account_id,
            date_preset=date_preset,
            min_spend=min_spend,
        )

        enriched: List[Dict[str, Any]] = []
        # Fetch creatives in parallel (SDK is sync → offload to threads)
        creative_tasks = [
            asyncio.to_thread(self.fb.get_ad_creative, r.get("ad_id"))
            for r in rows if r.get("ad_id")
        ]
        creatives = await asyncio.gather(*creative_tasks, return_exceptions=True)

        for row, creative in zip(rows, creatives):
            if isinstance(creative, Exception):
                creative = {}
            spend = float(row.get("spend") or 0)
            if spend <= 0:
                continue
            purchases = _pick_purchase_count(row.get("actions"))
            if purchases < 1:
                continue
            pvalue = _pick_purchase_value(row.get("action_values"))
            roas = pvalue / spend if spend else 0.0
            enriched.append({
                "ad_id": row.get("ad_id"),
                "name": row.get("ad_name"),
                "campaign_name": row.get("campaign_name"),
                "creative": creative or {},
                "kpis": {
                    "spend": spend,
                    "impressions": int(float(row.get("impressions") or 0)),
                    "clicks": int(float(row.get("clicks") or 0)),
                    "ctr": float(row.get("ctr") or 0),
                    "cpm": float(row.get("cpm") or 0),
                    "cpc": float(row.get("cpc") or 0),
                    "frequency": float(row.get("frequency") or 0),
                    "purchases": int(purchases),
                    "purchase_value": pvalue,
                    "roas": roas,
                    "cpp": spend / purchases if purchases else 0.0,
                },
            })

        enriched.sort(key=lambda r: r["kpis"]["roas"], reverse=True)
        top = enriched[:top_n]
        profile = self.extract_pattern_profile(top)
        return {"ads": top, "pattern_profile": profile, "count": len(enriched)}

    # ------------------------------------------------------------------
    # pattern profile
    # ------------------------------------------------------------------
    @staticmethod
    def extract_pattern_profile(winning_ads: List[Dict[str, Any]]) -> Dict[str, Any]:
        bodies: List[str] = []
        titles: List[str] = []
        ctas: List[str] = []
        for a in winning_ads:
            c = a.get("creative") or {}
            if c.get("body"):
                bodies.append(c["body"])
            if c.get("title"):
                titles.append(c["title"])
            if c.get("cta_type"):
                ctas.append(c["cta_type"])

        def _avg(xs):
            return round(sum(xs) / len(xs), 1) if xs else 0.0

        body_words = [_word_count(b) for b in bodies]
        body_chars = [len(b) for b in bodies]
        title_words = [_word_count(t) for t in titles]
        title_chars = [len(t) for t in titles]

        all_body_text = "\n".join(bodies)
        emoji_count = len(EMOJI_RE.findall(all_body_text))
        emoji_rate = round(emoji_count / max(len(all_body_text), 1) * 100, 2)

        cta_mix = dict(Counter(ctas))
        hook_types = dict(Counter(_classify_hook(b) for b in bodies))
        power_words_present = {
            w: sum(1 for b in bodies if w in b.lower())
            for w in TR_POWER_WORDS
            if any(w in b.lower() for b in bodies)
        }

        # Language detect: crude — TR chars present?
        lang = "tr" if re.search(r"[ğüşıöçĞÜŞİÖÇ]", all_body_text) else "en"

        return {
            "sample_size": len(winning_ads),
            "body": {"avg_word_count": _avg(body_words), "avg_char_count": _avg(body_chars)},
            "title": {"avg_word_count": _avg(title_words), "avg_char_count": _avg(title_chars)},
            "emoji_rate_pct": emoji_rate,
            "cta_mix": cta_mix,
            "hook_types": hook_types,
            "power_words_present": power_words_present,
            "language": lang,
        }

    # ------------------------------------------------------------------
    # segment ROAS
    # ------------------------------------------------------------------
    def compute_segment_roas(
        self,
        ad_account_id: Optional[str] = None,
        date_preset: str = "last_30d",
    ) -> Dict[str, Any]:
        groups = {
            "by_age_gender": ["age", "gender"],
            "by_placement": ["publisher_platform", "platform_position"],
            "by_device": ["impression_device"],
        }
        out: Dict[str, Any] = {}
        for key, breakdowns in groups.items():
            try:
                rows = self.fb.get_ad_level_insights(
                    ad_account_id=ad_account_id,
                    date_preset=date_preset,
                    breakdowns=breakdowns,
                    min_spend=0,
                )
            except Exception as e:
                print(f"segment {key} fetch failed: {e}")
                rows = []
            segments = []
            agg: Dict[str, Dict[str, float]] = {}
            for r in rows:
                seg_key = tuple(str(r.get(b) or "—") for b in breakdowns)
                a = agg.setdefault(seg_key, {
                    "spend": 0.0, "impressions": 0.0, "clicks": 0.0,
                    "purchases": 0.0, "purchase_value": 0.0,
                })
                a["spend"] += float(r.get("spend") or 0)
                a["impressions"] += float(r.get("impressions") or 0)
                a["clicks"] += float(r.get("clicks") or 0)
                a["purchases"] += _pick_purchase_count(r.get("actions"))
                a["purchase_value"] += _pick_purchase_value(r.get("action_values"))
            for seg_key, v in agg.items():
                spend = v["spend"]
                segments.append({
                    "segment": dict(zip(breakdowns, seg_key)),
                    "spend": spend,
                    "impressions": int(v["impressions"]),
                    "clicks": int(v["clicks"]),
                    "ctr": (v["clicks"] / v["impressions"] * 100) if v["impressions"] else 0,
                    "purchases": int(v["purchases"]),
                    "purchase_value": v["purchase_value"],
                    "roas": v["purchase_value"] / spend if spend else 0,
                })
            segments.sort(key=lambda x: x["roas"], reverse=True)
            out[key] = segments

        # Best combo — top scoring segment in each group with spend > 0
        def _best(rows):
            rows = [r for r in rows if r["spend"] > 0 and r["purchases"] > 0]
            return rows[0] if rows else None

        best = {
            "age_gender": _best(out["by_age_gender"]),
            "placement": _best(out["by_placement"]),
            "device": _best(out["by_device"]),
        }
        worst = {
            "age_gender": (out["by_age_gender"] or [None])[-1],
            "placement": (out["by_placement"] or [None])[-1],
            "device": (out["by_device"] or [None])[-1],
        }
        out["best"] = best
        out["worst"] = worst
        return out

    # ------------------------------------------------------------------
    # fatigue
    # ------------------------------------------------------------------
    async def detect_fatigue(
        self,
        ad_account_id: Optional[str] = None,
        date_preset: str = "last_14d",
        min_spend: float = 50.0,
    ) -> List[Dict[str, Any]]:
        # Pull active ads with spend; then per-ad timeseries
        rows = self.fb.get_ad_level_insights(
            ad_account_id=ad_account_id,
            date_preset=date_preset,
            min_spend=min_spend,
        )
        ad_ids = [r.get("ad_id") for r in rows if r.get("ad_id")]
        results: List[Dict[str, Any]] = []

        async def _one(ad_id, row):
            ts = await asyncio.to_thread(self.fb.get_ad_timeseries, ad_id, 14)
            if not ts:
                return None
            ts = sorted(ts, key=lambda x: x.get("date_start") or "")
            if len(ts) < 4:
                return None
            # CTR averages
            first7 = ts[:7]
            last3 = ts[-3:]
            avg = lambda arr, k: (sum(float(x.get(k) or 0) for x in arr) / len(arr)) if arr else 0
            ctr_first = avg(first7, "ctr")
            ctr_last = avg(last3, "ctr")
            cpm_prev = avg(ts[:-7], "cpm") if len(ts) >= 8 else avg(first7, "cpm")
            cpm_last = avg(ts[-7:], "cpm")
            freq_total = float(row.get("frequency") or 0)
            spend = float(row.get("spend") or 0)
            purchases = _pick_purchase_count(row.get("actions"))
            pvalue = _pick_purchase_value(row.get("action_values"))
            roas = pvalue / spend if spend else 0
            ctr_drop = 1 - (ctr_last / ctr_first) if ctr_first else 0
            cpm_rise = (cpm_last / cpm_prev - 1) if cpm_prev else 0
            severity = "healthy"
            reasons: List[str] = []
            if freq_total >= 3 and ctr_drop > 0.3:
                severity = "warn"
                reasons.append(f"CTR son 3 gün %{ctr_drop*100:.0f} düştü, frekans {freq_total:.1f}")
            if severity == "warn" and roas < 1:
                severity = "critical"
                reasons.append(f"ROAS {roas:.2f}x")
            elif freq_total >= 2 and cpm_rise > 0.25:
                severity = "watch"
                reasons.append(f"CPM haftalık %{cpm_rise*100:.0f} arttı")
            if severity == "healthy":
                return None
            return {
                "ad_id": ad_id,
                "name": row.get("ad_name"),
                "severity": severity,
                "reason": "; ".join(reasons),
                "ctr_drop_pct": round(ctr_drop * 100, 1),
                "frequency": round(freq_total, 2),
                "roas": round(roas, 2),
                "spend": round(spend, 2),
            }

        tasks = [
            _one(aid, r) for aid, r in zip(ad_ids, rows)
        ]
        found = await asyncio.gather(*tasks, return_exceptions=True)
        for x in found:
            if isinstance(x, Exception) or x is None:
                continue
            results.append(x)

        # Enrich with creative for critical/warn
        for r in results:
            if r["severity"] in ("warn", "critical"):
                try:
                    r["creative"] = await asyncio.to_thread(self.fb.get_ad_creative, r["ad_id"])
                except Exception:
                    r["creative"] = {}
        severity_rank = {"critical": 0, "warn": 1, "watch": 2, "healthy": 3}
        results.sort(key=lambda x: (severity_rank.get(x["severity"], 9), -x["spend"]))
        return results
