import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart, Download, DollarSign, Eye, MousePointer, TrendingUp,
    Target, AlertCircle, HelpCircle, Sparkles, Zap, Flame, X,
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1');

const DATE_PRESETS = [
    { value: 'today', label: 'Bugün' },
    { value: 'yesterday', label: 'Dün' },
    { value: 'last_7d', label: 'Son 7 gün' },
    { value: 'last_14d', label: 'Son 14 gün' },
    { value: 'last_30d', label: 'Son 30 gün' },
    { value: 'last_90d', label: 'Son 90 gün' },
    { value: 'maximum', label: 'Tüm zamanlar' },
];

const LEVELS = [
    { value: 'campaign', label: 'Kampanya' },
    { value: 'adset', label: 'Ad Set' },
    { value: 'ad', label: 'Reklam' },
];

const TABS = [
    { id: 'overview', label: 'Özet', Icon: BarChart },
    { id: 'winners', label: 'Kazanan Yaratıcılar', Icon: Sparkles },
    { id: 'segments', label: 'Segment Skoru', Icon: Target },
];

const authHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatMoney = (v, currency = 'TRY') => {
    const n = Number(v || 0);
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
};
const formatNumber = (v) => new Intl.NumberFormat('tr-TR').format(Number(v || 0));
const formatPct = (v) => `${Number(v || 0).toFixed(2)}%`;

const pickAction = (actions, type) => {
    if (!Array.isArray(actions)) return 0;
    const row = actions.find(a => a.action_type === type);
    return row ? Number(row.value || 0) : 0;
};

const StatCard = ({ title, value, sub, Icon, tone = 'amber' }) => (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex justify-between items-start mb-4">
            <div className={`p-3 rounded-lg bg-${tone}-50`}>
                <Icon className={`text-${tone}-600`} size={24} />
            </div>
        </div>
        <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
);

const MetricsGuideDrawer = ({ open, onClose }) => {
    if (!open) return null;
    const Section = ({ title, children }) => (
        <div className="mb-6">
            <h4 className="font-bold text-gray-900 mb-2">{title}</h4>
            <div className="text-sm text-gray-700 space-y-1">{children}</div>
        </div>
    );
    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={onClose} />
            <div className="w-full max-w-md bg-white shadow-xl overflow-y-auto">
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
                    <h3 className="text-lg font-bold">Metrikleri nasıl yorumlarım?</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X size={18} />
                    </button>
                </div>
                <div className="p-6">
                    <Section title="ROAS (Reklam Harcamasının Geri Dönüşü)">
                        <p><b>&gt; 2x</b> → Kazanan. Bütçeyi her 3 günde %20 artır.</p>
                        <p><b>1-2x</b> → Marjinal. Kitle daralt, creative'i yenile. 5 gün içinde 2x üstüne çıkmazsa dur.</p>
                        <p><b>&lt; 1x</b> → Para yakıyor. <b>DERHAL KAPAT.</b></p>
                    </Section>
                    <Section title="Frekans">
                        <p><b>&lt; 2</b> → Sağlıklı.</p>
                        <p><b>2-3</b> → Gözlem. CTR düşmeye başlıyorsa yenile.</p>
                        <p><b>&gt; 3</b> → Fatigue. Creative yenile veya kitle genişlet.</p>
                    </Section>
                    <Section title="CTR">
                        <p><b>&lt; %1</b> → Hook zayıf. Başlığı ve ilk saniyeyi değiştir.</p>
                        <p><b>%1-2</b> → Normal.</p>
                        <p><b>&gt; %3</b> → Çok iyi — ama ROAS'a bak. Tıklayan almıyorsa kitle yanlış.</p>
                    </Section>
                    <Section title="CTR yüksek + ROAS düşük">
                        <p>Reklam ilgi çekici ama kitle satın alıcı değil. İlgi/hobi targeting'i gevşet, lookalike dene.</p>
                    </Section>
                    <Section title="LPV / ATC oranı">
                        <p>Landing Page View'den Add-to-Cart'a düşüş %10'un altındaysa <b>ürün sayfası sorunu</b>, reklam değil. Fiyat, görsel, beden seçimi kontrol et.</p>
                    </Section>
                    <Section title="ATC → Purchase">
                        <p><b>&lt; %25</b> → Checkout'ta friction var. Kargo ücreti, ödeme yöntemi, form uzunluğu.</p>
                        <p><b>%25-40</b> → Normal e-ticaret.</p>
                        <p><b>&gt; %40</b> → Çok iyi; indirim kodu etkili.</p>
                    </Section>
                    <Section title="CPM">
                        <p>Tek başına anlamsız. ROAS ile birlikte değerlendir. Yüksek CPM + yüksek ROAS = premium kitle, sorun değil.</p>
                    </Section>
                    <Section title="CPP (Satın Alma Başına Maliyet)">
                        <p>Ürün marjına göre değerlendir. SHEROE ortalama sepet değeri yüksek olduğu için CPP 700-1000 TL aralığı kabul edilebilir.</p>
                    </Section>
                </div>
            </div>
        </div>
    );
};

const OverviewTab = ({ accountId, level, datePreset, currency }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!accountId) return;
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ ad_account_id: accountId, level, date_preset: datePreset });
        fetch(`${API_BASE}/facebook/insights?${params}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                return r.json();
            })
            .then(data => setRows(Array.isArray(data) ? data : []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [accountId, level, datePreset]);

    const totals = useMemo(() => {
        let spend = 0, impressions = 0, clicks = 0, purchases = 0, purchaseValue = 0;
        rows.forEach(r => {
            spend += Number(r.spend || 0);
            impressions += Number(r.impressions || 0);
            clicks += Number(r.clicks || 0);
            purchases += pickAction(r.actions, 'omni_purchase') || pickAction(r.actions, 'purchase');
            purchaseValue += pickAction(r.action_values, 'omni_purchase') || pickAction(r.action_values, 'purchase');
        });
        const ctr = impressions ? (clicks / impressions) * 100 : 0;
        const cpm = impressions ? (spend / impressions) * 1000 : 0;
        const cpc = clicks ? spend / clicks : 0;
        const roas = spend ? purchaseValue / spend : 0;
        const costPerPurchase = purchases ? spend / purchases : 0;
        return { spend, impressions, clicks, ctr, cpm, cpc, purchases, purchaseValue, roas, costPerPurchase };
    }, [rows]);

    const sortedRows = useMemo(() => [...rows].sort((a, b) => Number(b.spend || 0) - Number(a.spend || 0)), [rows]);

    const exportCsv = () => {
        if (!sortedRows.length) return;
        const headers = ['name', 'spend', 'impressions', 'clicks', 'ctr', 'cpm', 'cpc', 'purchases', 'purchase_value', 'roas'];
        const lines = [headers.join(',')];
        sortedRows.forEach(r => {
            const name = r.campaign_name || r.adset_name || r.ad_name || '';
            const purchases = pickAction(r.actions, 'omni_purchase') || pickAction(r.actions, 'purchase');
            const pvalue = pickAction(r.action_values, 'omni_purchase') || pickAction(r.action_values, 'purchase');
            const roas = Number(r.spend) ? pvalue / Number(r.spend) : 0;
            lines.push([JSON.stringify(name), r.spend || 0, r.impressions || 0, r.clicks || 0, r.ctr || 0, r.cpm || 0, r.cpc || 0, purchases, pvalue, roas.toFixed(2)].join(','));
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `insights-${level}-${datePreset}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex gap-2 mb-4">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <div className="text-sm">{error}</div>
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Harcama" value={formatMoney(totals.spend, currency)} Icon={DollarSign} tone="amber" />
                <StatCard title="Gösterim" value={formatNumber(totals.impressions)} Icon={Eye} tone="blue" />
                <StatCard title="Tıklama" value={formatNumber(totals.clicks)} sub={`CTR ${formatPct(totals.ctr)}`} Icon={MousePointer} tone="green" />
                <StatCard title="ROAS" value={totals.roas.toFixed(2) + 'x'} sub={`${formatNumber(totals.purchases)} satın alma • ${formatMoney(totals.purchaseValue, currency)}`} Icon={TrendingUp} tone="purple" />
                <StatCard title="CPM" value={formatMoney(totals.cpm, currency)} Icon={Target} tone="indigo" />
                <StatCard title="CPC" value={formatMoney(totals.cpc, currency)} Icon={MousePointer} tone="teal" />
                <StatCard title="CPP" value={totals.purchases ? formatMoney(totals.costPerPurchase, currency) : '—'} Icon={DollarSign} tone="rose" />
                <StatCard title="Satır" value={formatNumber(rows.length)} sub={LEVELS.find(l => l.value === level)?.label} Icon={BarChart} tone="gray" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mt-4">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
                    <h3 className="font-semibold">Detaylar ({LEVELS.find(l => l.value === level)?.label})</h3>
                    <div className="flex items-center gap-2">
                        {loading && <span className="text-sm text-gray-400">yükleniyor…</span>}
                        <button onClick={exportCsv} disabled={!rows.length} className="p-1 text-gray-500 hover:text-amber-600 disabled:opacity-40">
                            <Download size={16} />
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                            <tr>
                                <th className="px-4 py-3 text-left">İsim</th>
                                <th className="px-4 py-3 text-right">Harcama</th>
                                <th className="px-4 py-3 text-right">Gösterim</th>
                                <th className="px-4 py-3 text-right">Tıklama</th>
                                <th className="px-4 py-3 text-right">CTR</th>
                                <th className="px-4 py-3 text-right">CPM</th>
                                <th className="px-4 py-3 text-right">CPC</th>
                                <th className="px-4 py-3 text-right">Satın Alma</th>
                                <th className="px-4 py-3 text-right">ROAS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.length === 0 && !loading && (
                                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Veri yok</td></tr>
                            )}
                            {sortedRows.map((r, i) => {
                                const name = r.campaign_name || r.adset_name || r.ad_name || r.account_name || '—';
                                const purchases = pickAction(r.actions, 'omni_purchase') || pickAction(r.actions, 'purchase');
                                const pvalue = pickAction(r.action_values, 'omni_purchase') || pickAction(r.action_values, 'purchase');
                                const spendN = Number(r.spend || 0);
                                const roas = spendN ? pvalue / spendN : 0;
                                return (
                                    <tr key={i} className="border-t border-gray-100 hover:bg-amber-50/30">
                                        <td className="px-4 py-3 text-left font-medium text-gray-900 truncate max-w-sm">{name}</td>
                                        <td className="px-4 py-3 text-right">{formatMoney(spendN, currency)}</td>
                                        <td className="px-4 py-3 text-right">{formatNumber(r.impressions)}</td>
                                        <td className="px-4 py-3 text-right">{formatNumber(r.clicks)}</td>
                                        <td className="px-4 py-3 text-right">{formatPct(r.ctr)}</td>
                                        <td className="px-4 py-3 text-right">{formatMoney(r.cpm, currency)}</td>
                                        <td className="px-4 py-3 text-right">{formatMoney(r.cpc, currency)}</td>
                                        <td className="px-4 py-3 text-right">{formatNumber(purchases)}</td>
                                        <td className={`px-4 py-3 text-right font-semibold ${roas >= 1 ? 'text-green-600' : 'text-red-500'}`}>
                                            {roas ? roas.toFixed(2) + 'x' : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
};

const WinnersTab = ({ accountId, datePreset, currency }) => {
    const navigate = useNavigate();
    const [data, setData] = useState({ ads: [], pattern_profile: null });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fatigue, setFatigue] = useState([]);

    useEffect(() => {
        if (!accountId) return;
        setLoading(true);
        setError(null);
        const p = new URLSearchParams({ ad_account_id: accountId, date_preset: datePreset, min_spend: '50', top_n: '20' });
        fetch(`${API_BASE}/winning-creatives/live?${p}`, { headers: authHeaders() })
            .then(async r => r.ok ? r.json() : Promise.reject(new Error((await r.json()).detail || `HTTP ${r.status}`)))
            .then(d => setData(d || { ads: [], pattern_profile: null }))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));

        const fp = new URLSearchParams({ ad_account_id: accountId, date_preset: 'last_14d', min_spend: '50', severity: 'warn' });
        fetch(`${API_BASE}/winning-creatives/fatigue?${fp}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(arr => setFatigue(Array.isArray(arr) ? arr : []))
            .catch(() => setFatigue([]));
    }, [accountId, datePreset]);

    const useThisPattern = (ad) => {
        const payload = {
            winningAds: [{
                body: ad.creative?.body,
                title: ad.creative?.title,
                cta: ad.creative?.cta_type,
                roas: ad.kpis?.roas,
                ctr: ad.kpis?.ctr,
            }],
            patternProfile: data.pattern_profile,
        };
        sessionStorage.setItem('winningSeed', JSON.stringify(payload));
        navigate('/image-ads');
    };

    return (
        <>
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex gap-2 mb-4">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <div className="text-sm">{error}</div>
                </div>
            )}
            {fatigue.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg p-4 mb-4 flex items-start gap-3">
                    <Flame size={22} className="flex-shrink-0 text-orange-600" />
                    <div className="flex-1">
                        <div className="font-semibold mb-1">{fatigue.length} reklamınızda fatigue tespit edildi</div>
                        <div className="text-sm">
                            {fatigue.slice(0, 3).map(f => f.name).filter(Boolean).join(', ')}
                            {fatigue.length > 3 ? ` ve ${fatigue.length - 3} tane daha` : ''} — creative yenilemesi gerekiyor.
                        </div>
                    </div>
                    <button onClick={() => navigate('/ad-remix')} className="text-orange-700 font-semibold text-sm hover:underline">Yenile →</button>
                </div>
            )}
            {data.pattern_profile && data.pattern_profile.sample_size > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
                    <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <Zap size={18} className="text-amber-600" />
                        Kazanan Kalıp Profili
                        <span className="text-xs font-normal text-gray-400">(son 30 gün, {data.pattern_profile.sample_size} reklam)</span>
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <div className="text-gray-500">Ortalama uzunluk</div>
                            <div className="font-semibold">{data.pattern_profile.body?.avg_word_count} kelime / {data.pattern_profile.body?.avg_char_count} karakter</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Emoji yoğunluğu</div>
                            <div className="font-semibold">%{data.pattern_profile.emoji_rate_pct}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">Hook tipleri</div>
                            <div className="font-semibold text-xs">{Object.entries(data.pattern_profile.hook_types || {}).map(([k, v]) => `${k}(${v})`).join(', ') || '—'}</div>
                        </div>
                        <div>
                            <div className="text-gray-500">CTA</div>
                            <div className="font-semibold text-xs">{Object.entries(data.pattern_profile.cta_mix || {}).map(([k, v]) => `${k}×${v}`).join(', ') || '—'}</div>
                        </div>
                    </div>
                    {data.pattern_profile.power_words_present && Object.keys(data.pattern_profile.power_words_present).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {Object.entries(data.pattern_profile.power_words_present).map(([w, n]) => (
                                <span key={w} className="text-xs bg-amber-50 text-amber-800 px-2 py-1 rounded">{w} ×{n}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {loading && <div className="text-center text-gray-400 py-10">yükleniyor…</div>}
            {!loading && data.ads.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
                    Bu tarih aralığında min 50 TL harcama + en az 1 satış şartını karşılayan reklam bulunamadı.
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.ads.map(ad => {
                    const k = ad.kpis || {};
                    const c = ad.creative || {};
                    const img = c.image_url;
                    return (
                        <div key={ad.ad_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
                            {img ? (
                                <img src={img} alt="" className="w-full h-48 object-cover bg-gray-50" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            ) : (
                                <div className="w-full h-48 bg-gray-50 flex items-center justify-center text-gray-300">
                                    <Eye size={32} />
                                </div>
                            )}
                            <div className="p-4 flex-1 flex flex-col">
                                {c.title && <div className="font-semibold text-sm mb-1 line-clamp-2">{c.title}</div>}
                                <div className="text-xs text-gray-600 mb-3 line-clamp-3 flex-1">{c.body || ad.name || '(metin yok)'}</div>
                                <div className="flex flex-wrap gap-1 mb-3">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${k.roas >= 2 ? 'bg-green-100 text-green-700' : k.roas >= 1 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                                        ROAS {Number(k.roas).toFixed(2)}x
                                    </span>
                                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">CTR {Number(k.ctr).toFixed(2)}%</span>
                                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{formatMoney(k.spend, currency)}</span>
                                    {k.frequency > 2.5 && (
                                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded" title={`Frekans ${k.frequency.toFixed(2)}`}>
                                            <Flame size={10} className="inline" /> {k.frequency.toFixed(1)}
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => useThisPattern(ad)} className="w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold py-2 rounded-lg flex items-center justify-center gap-2">
                                    <Sparkles size={14} /> Bu kalıpla üret
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
};

const SegmentsTab = ({ accountId, datePreset, currency }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!accountId) return;
        setLoading(true);
        setError(null);
        const p = new URLSearchParams({ ad_account_id: accountId, date_preset: datePreset });
        fetch(`${API_BASE}/winning-creatives/segments?${p}`, { headers: authHeaders() })
            .then(async r => r.ok ? r.json() : Promise.reject(new Error((await r.json()).detail || `HTTP ${r.status}`)))
            .then(d => setData(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [accountId, datePreset]);

    const copyTargeting = () => {
        if (!data?.best) return;
        const t = {
            age_gender: data.best.age_gender?.segment,
            placement: data.best.placement?.segment,
            device: data.best.device?.segment,
        };
        navigator.clipboard.writeText(JSON.stringify(t, null, 2));
    };

    const SegTable = ({ title, rows, cols }) => (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 font-semibold text-sm">{title}</div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500">
                        <tr>
                            {cols.map(c => <th key={c} className="px-3 py-2 text-left">{c}</th>)}
                            <th className="px-3 py-2 text-right">Harcama</th>
                            <th className="px-3 py-2 text-right">Satın Alma</th>
                            <th className="px-3 py-2 text-right">CTR</th>
                            <th className="px-3 py-2 text-right">ROAS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(rows || []).slice(0, 10).map((r, i) => (
                            <tr key={i} className="border-t border-gray-100">
                                {cols.map(c => <td key={c} className="px-3 py-2">{r.segment?.[c] || '—'}</td>)}
                                <td className="px-3 py-2 text-right">{formatMoney(r.spend, currency)}</td>
                                <td className="px-3 py-2 text-right">{formatNumber(r.purchases)}</td>
                                <td className="px-3 py-2 text-right">{formatPct(r.ctr)}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${r.roas >= 1 ? 'text-green-600' : 'text-red-500'}`}>
                                    {r.roas ? r.roas.toFixed(2) + 'x' : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4 text-sm">{error}</div>}
            {loading && <div className="text-center text-gray-400 py-10">yükleniyor…</div>}
            {data?.best && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-6 mb-4">
                    <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                        <Target size={18} className="text-amber-600" /> Sıradaki adset şunu hedeflesin
                    </h3>
                    <div className="text-sm text-gray-700 space-y-1">
                        {data.best.age_gender?.segment && (
                            <div><b>Kitle:</b> {Object.values(data.best.age_gender.segment).filter(Boolean).join(' / ')} • ROAS {data.best.age_gender.roas?.toFixed(2)}x</div>
                        )}
                        {data.best.placement?.segment && (
                            <div><b>Placement:</b> {Object.values(data.best.placement.segment).filter(Boolean).join(' / ')} • ROAS {data.best.placement.roas?.toFixed(2)}x</div>
                        )}
                        {data.best.device?.segment && (
                            <div><b>Cihaz:</b> {Object.values(data.best.device.segment).filter(Boolean).join(' / ')} • ROAS {data.best.device.roas?.toFixed(2)}x</div>
                        )}
                    </div>
                    <button onClick={copyTargeting} className="mt-3 text-xs bg-white border border-amber-300 text-amber-700 font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-50">
                        Targeting'i panoya kopyala
                    </button>
                </div>
            )}
            {data && (
                <div className="space-y-4">
                    <SegTable title="Yaş & Cinsiyet" rows={data.by_age_gender} cols={['age', 'gender']} />
                    <SegTable title="Placement" rows={data.by_placement} cols={['publisher_platform', 'platform_position']} />
                    <SegTable title="Cihaz" rows={data.by_device} cols={['impression_device']} />
                </div>
            )}
        </>
    );
};

const Reporting = () => {
    const [accounts, setAccounts] = useState([]);
    const [accountId, setAccountId] = useState('');
    const [currency, setCurrency] = useState('TRY');
    const [level, setLevel] = useState('campaign');
    const [datePreset, setDatePreset] = useState('last_30d');
    const [tab, setTab] = useState('overview');
    const [guideOpen, setGuideOpen] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/facebook/accounts`, { headers: authHeaders() });
                if (!r.ok) return;
                const accs = await r.json();
                setAccounts(accs);
                const preferred = accs.find(a => /sheroe/i.test(a.name)) || accs[0];
                if (preferred) {
                    setAccountId(preferred.id);
                    setCurrency(preferred.currency || 'TRY');
                }
            } catch (e) { /* ignore */ }
        })();
    }, []);

    return (
        <div className="max-w-7xl mx-auto space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-1 flex items-center gap-3">
                        <BarChart size={32} className="text-amber-600" />
                        Reklam Performansı
                        <button onClick={() => setGuideOpen(true)} className="text-gray-400 hover:text-amber-600" title="Yorumlama rehberi">
                            <HelpCircle size={22} />
                        </button>
                    </h1>
                    <p className="text-gray-600">Gerçek zamanlı Marketing API • kazanan kalıp analizi • segment skoru</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <select value={accountId} onChange={e => { setAccountId(e.target.value); const a = accounts.find(x => x.id === e.target.value); if (a) setCurrency(a.currency || 'TRY'); }} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    {tab === 'overview' && (
                        <select value={level} onChange={e => setLevel(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                            {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                    )}
                    <select value={datePreset} onChange={e => setDatePreset(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                        {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex border-b border-gray-200">
                {TABS.map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px ${tab === id ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
                        <Icon size={16} /> {label}
                    </button>
                ))}
            </div>

            {tab === 'overview' && <OverviewTab accountId={accountId} level={level} datePreset={datePreset} currency={currency} />}
            {tab === 'winners' && <WinnersTab accountId={accountId} datePreset={datePreset} currency={currency} />}
            {tab === 'segments' && <SegmentsTab accountId={accountId} datePreset={datePreset} currency={currency} />}

            <MetricsGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
        </div>
    );
};

export default Reporting;
