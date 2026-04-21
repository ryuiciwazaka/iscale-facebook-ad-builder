import React, { useEffect, useState } from 'react';
import {
    X, Save, Pause, Play, Wand2, ClipboardCopy, CheckCircle2,
    AlertTriangle, Copy as CopyIcon, Sparkles,
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1');

const authHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
};

// ---------- Edit drawer ----------

export const AdEditDrawer = ({ ad, open, onClose, onSaved }) => {
    const [name, setName] = useState('');
    const [status, setStatus] = useState('ACTIVE');
    const [dailyBudgetTry, setDailyBudgetTry] = useState('');
    const [adsetId, setAdsetId] = useState(null);
    const [currentBudget, setCurrentBudget] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [ok, setOk] = useState(false);

    useEffect(() => {
        if (!open || !ad?.ad_id) return;
        setError(null); setOk(false); setName(ad.name || ''); setStatus('ACTIVE');
        setDailyBudgetTry(''); setCurrentBudget(null); setAdsetId(null);
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/facebook/ads/${ad.ad_id}/full`, { headers: authHeaders() });
                if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                const full = await r.json();
                setStatus(full.status || 'ACTIVE');
                setAdsetId(full.adset_id);
                if (full.adset_id) {
                    // Pull current adset budget for context
                    try {
                        const ar = await fetch(`${API_BASE}/facebook/adsets?campaign_id=${full.campaign_id || ''}`, { headers: authHeaders() });
                        if (ar.ok) {
                            const arr = await ar.json();
                            const match = (arr || []).find(x => x.id === full.adset_id);
                            if (match?.daily_budget) setCurrentBudget(parseFloat(match.daily_budget) / 100);
                        }
                    } catch (_) { /* not critical */ }
                }
            } catch (e) {
                setError(e.message);
            }
        })();
    }, [open, ad?.ad_id]);

    const save = async () => {
        setLoading(true); setError(null); setOk(false);
        try {
            // Patch ad (name, status)
            const body1 = {};
            if (name && name !== ad.name) body1.name = name;
            if (status) body1.status = status;
            if (Object.keys(body1).length > 0) {
                const r = await fetch(`${API_BASE}/facebook/ads/${ad.ad_id}`, {
                    method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body1),
                });
                if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            }
            // Patch adset budget if set
            if (dailyBudgetTry && adsetId) {
                const r2 = await fetch(`${API_BASE}/facebook/adsets/${adsetId}`, {
                    method: 'PATCH', headers: authHeaders(),
                    body: JSON.stringify({ daily_budget_try: parseFloat(dailyBudgetTry) }),
                });
                if (!r2.ok) throw new Error((await r2.json()).detail || `HTTP ${r2.status}`);
            }
            setOk(true);
            onSaved && onSaved();
        } catch (e) {
            setError(e.message);
        } finally { setLoading(false); }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={onClose} />
            <div className="w-full max-w-md bg-white shadow-xl overflow-y-auto">
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">Reklamı Düzenle</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs text-gray-500 uppercase mb-1">Ad İsmi</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 uppercase mb-1">Durum</label>
                        <div className="flex gap-2">
                            <button onClick={() => setStatus('ACTIVE')} className={`flex-1 py-2 rounded-lg border flex items-center justify-center gap-2 text-sm ${status === 'ACTIVE' ? 'bg-green-50 border-green-300 text-green-700' : 'bg-white border-gray-200'}`}>
                                <Play size={14} /> Aktif
                            </button>
                            <button onClick={() => setStatus('PAUSED')} className={`flex-1 py-2 rounded-lg border flex items-center justify-center gap-2 text-sm ${status === 'PAUSED' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200'}`}>
                                <Pause size={14} /> Duraklat
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 uppercase mb-1">
                            Günlük Bütçe (TL) — Ad Set bazında
                        </label>
                        <input
                            type="number"
                            placeholder={currentBudget ? `mevcut: ${currentBudget} TL/gün` : 'boş bırakırsan değişmez'}
                            value={dailyBudgetTry}
                            onChange={e => setDailyBudgetTry(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">Bütçe değişikliği bu reklamın bağlı olduğu tüm ad set'i etkiler.</p>
                    </div>
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex gap-2">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}
                    {ok && (
                        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm flex gap-2">
                            <CheckCircle2 size={16} /> Kaydedildi.
                        </div>
                    )}
                    <button disabled={loading} onClick={save} className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2">
                        <Save size={16} /> {loading ? 'Kaydediliyor…' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------- Improve & Duplicate drawer ----------

export const AdImproveDrawer = ({ ad, open, onClose, onCreated }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);
    const [selected, setSelected] = useState(0);
    const [creating, setCreating] = useState(false);
    const [created, setCreated] = useState(null);

    useEffect(() => {
        if (!open || !ad?.ad_id) return;
        setError(null); setData(null); setCreated(null); setSelected(0);
        setLoading(true);
        fetch(`${API_BASE}/facebook/ads/${ad.ad_id}/diagnose`, { headers: authHeaders() })
            .then(async r => r.ok ? r.json() : Promise.reject(new Error((await r.json()).detail || `HTTP ${r.status}`)))
            .then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
    }, [open, ad?.ad_id]);

    const launchDuplicate = async () => {
        if (!data || !data.variants?.[selected]) return;
        setCreating(true); setError(null);
        try {
            const v = data.variants[selected];
            const r = await fetch(`${API_BASE}/facebook/ads/${ad.ad_id}/duplicate`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    body: v.body, title: v.title, cta: v.cta || 'SHOP_NOW',
                    name_suffix: `[AB-AI ${v.strategy}]`,
                    status: 'PAUSED',
                }),
            });
            if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            const out = await r.json();
            setCreated(out);
            onCreated && onCreated(out);
        } catch (e) {
            setError(e.message);
        } finally { setCreating(false); }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={onClose} />
            <div className="w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Wand2 size={20} className="text-amber-600" /> İyileştir & Kopyala (A/B)
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-6 space-y-5">
                    {loading && <div className="text-center text-gray-500 py-12">Reklam analiz ediliyor…</div>}
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm flex gap-2">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    {data && (
                        <>
                            {/* Source ad */}
                            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                                <div className="text-xs text-gray-500 uppercase mb-2">Mevcut Reklam</div>
                                <div className="font-semibold text-sm mb-1">{data.source?.name}</div>
                                {data.source?.title && <div className="text-sm text-gray-700">{data.source.title}</div>}
                                <div className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{data.source?.body}</div>
                                <div className="flex gap-2 mt-2 text-xs flex-wrap">
                                    <span className="bg-white px-2 py-0.5 rounded border">CTA: {data.source?.cta}</span>
                                    <span className="bg-white px-2 py-0.5 rounded border">ROAS {Number(data.source?.kpis?.roas || 0).toFixed(2)}x</span>
                                    <span className="bg-white px-2 py-0.5 rounded border">CTR {Number(data.source?.kpis?.ctr || 0).toFixed(2)}%</span>
                                    <span className="bg-white px-2 py-0.5 rounded border">{Number(data.source?.kpis?.spend || 0).toFixed(0)} TL</span>
                                </div>
                            </div>

                            {/* Diagnosis */}
                            {(data.diagnosis || []).length > 0 && (
                                <div className="border border-orange-200 rounded-xl p-4 bg-orange-50">
                                    <div className="text-xs text-orange-700 uppercase mb-2 flex items-center gap-1">
                                        <AlertTriangle size={12} /> Teşhis
                                    </div>
                                    <ul className="text-sm text-orange-900 space-y-1 list-disc pl-5">
                                        {data.diagnosis.map((d, i) => <li key={i}>{d}</li>)}
                                    </ul>
                                </div>
                            )}

                            {/* Variants */}
                            <div>
                                <div className="text-xs text-gray-500 uppercase mb-2">Varyantlar — birini seç</div>
                                <div className="space-y-2">
                                    {(data.variants || []).map((v, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setSelected(i)}
                                            className={`w-full text-left border-2 rounded-xl p-4 transition-all ${selected === i ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-bold bg-amber-600 text-white px-2 py-0.5 rounded">V{i + 1}</span>
                                                <span className="text-xs text-gray-500 uppercase">{v.strategy}</span>
                                                {selected === i && <CheckCircle2 size={14} className="text-amber-600 ml-auto" />}
                                            </div>
                                            {v.title && <div className="font-semibold text-sm mb-1">{v.title}</div>}
                                            <div className="text-sm text-gray-700 whitespace-pre-wrap">{v.body}</div>
                                            <div className="text-xs text-gray-500 mt-2">CTA: {v.cta}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Launch */}
                            {!created ? (
                                <div className="sticky bottom-0 -mx-6 px-6 pt-4 pb-6 border-t bg-white">
                                    <button disabled={creating} onClick={launchDuplicate} className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2">
                                        <CopyIcon size={18} /> {creating ? 'Oluşturuluyor…' : 'A/B Testi olarak Kopyala (PAUSED)'}
                                    </button>
                                    <p className="text-xs text-gray-400 text-center mt-2">
                                        Aynı video/görsel + yeni kopya. Yeni reklam PAUSED oluşur — Ads Manager'dan başlat.
                                    </p>
                                </div>
                            ) : (
                                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
                                    <div className="flex items-center gap-2 text-green-700 font-semibold mb-2">
                                        <CheckCircle2 size={18} /> Yeni reklam oluşturuldu
                                    </div>
                                    <div className="text-xs text-gray-700">
                                        <div><b>Ad ID:</b> {created.new_ad?.id}</div>
                                        <div><b>İsim:</b> {created.new_name}</div>
                                        <div className="mt-2">Şu an <b>PAUSED</b>. FB Ads Manager'da bul, original ile aynı adset'te A/B testi için enable et.</div>
                                    </div>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(created.new_ad?.id || '')}
                                        className="mt-3 text-xs bg-white border px-3 py-1 rounded"
                                    >
                                        <ClipboardCopy size={12} className="inline mr-1" /> Ad ID'yi kopyala
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
