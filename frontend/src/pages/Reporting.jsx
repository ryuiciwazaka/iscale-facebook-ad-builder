import React, { useEffect, useMemo, useState } from 'react';
import {
    BarChart, Download, DollarSign, Eye, MousePointer, TrendingUp,
    Target, RefreshCw, AlertCircle,
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

// FB returns `actions` as [{action_type, value}]. Pull the ones we care about.
const pickAction = (actions, type) => {
    if (!Array.isArray(actions)) return 0;
    const row = actions.find(a => a.action_type === type);
    return row ? Number(row.value || 0) : 0;
};
const pickRoas = (arr) => {
    if (!Array.isArray(arr) || !arr.length) return 0;
    const row = arr.find(a => a.action_type === 'omni_purchase') || arr[0];
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

const Reporting = () => {
    const [accounts, setAccounts] = useState([]);
    const [accountId, setAccountId] = useState('');
    const [currency, setCurrency] = useState('TRY');
    const [level, setLevel] = useState('campaign');
    const [datePreset, setDatePreset] = useState('last_30d');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // initial load — accounts
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API_BASE}/facebook/accounts`, { headers: authHeaders() });
                if (!r.ok) throw new Error((await r.json()).detail || 'Failed to load accounts');
                const accs = await r.json();
                setAccounts(accs);
                // default: SHEROE REKLAM, else first
                const preferred = accs.find(a => /sheroe/i.test(a.name)) || accs[0];
                if (preferred) {
                    setAccountId(preferred.id);
                    setCurrency(preferred.currency || 'TRY');
                }
            } catch (e) {
                setError(e.message);
            }
        })();
    }, []);

    // load insights when account / level / date changes
    useEffect(() => {
        if (!accountId) return;
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
            ad_account_id: accountId,
            level,
            date_preset: datePreset,
        });
        fetch(`${API_BASE}/facebook/insights?${params}`, { headers: authHeaders() })
            .then(async r => {
                if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                return r.json();
            })
            .then(data => setRows(Array.isArray(data) ? data : []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [accountId, level, datePreset]);

    // aggregate stats
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

    // sort rows by spend desc
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
            lines.push([
                JSON.stringify(name), r.spend || 0, r.impressions || 0, r.clicks || 0,
                r.ctr || 0, r.cpm || 0, r.cpc || 0, purchases, pvalue, roas.toFixed(2),
            ].join(','));
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
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-1 flex items-center gap-3">
                        <BarChart size={32} className="text-amber-600" />
                        Reklam Performansı
                    </h1>
                    <p className="text-gray-600">Facebook Ads gerçek zamanlı veriler — Marketing API</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <select
                        value={accountId}
                        onChange={e => {
                            setAccountId(e.target.value);
                            const a = accounts.find(x => x.id === e.target.value);
                            if (a) setCurrency(a.currency || 'TRY');
                        }}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    <select
                        value={level}
                        onChange={e => setLevel(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                        {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                    <select
                        value={datePreset}
                        onChange={e => setDatePreset(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                    >
                        {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <button
                        onClick={() => { setDatePreset(d => d); setRows([]); setAccountId(id => id); }}
                        className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                        title="Yenile"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={exportCsv}
                        disabled={!rows.length}
                        className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-40"
                        title="CSV indir"
                    >
                        <Download size={18} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex gap-2">
                    <AlertCircle size={20} className="flex-shrink-0" />
                    <div className="text-sm">{error}</div>
                </div>
            )}

            {/* Stat Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="Harcama" value={formatMoney(totals.spend, currency)} Icon={DollarSign} tone="amber" />
                <StatCard title="Gösterim" value={formatNumber(totals.impressions)} Icon={Eye} tone="blue" />
                <StatCard title="Tıklama" value={formatNumber(totals.clicks)} sub={`CTR ${formatPct(totals.ctr)}`} Icon={MousePointer} tone="green" />
                <StatCard
                    title="ROAS"
                    value={totals.roas.toFixed(2) + 'x'}
                    sub={`${formatNumber(totals.purchases)} satın alma • ${formatMoney(totals.purchaseValue, currency)}`}
                    Icon={TrendingUp}
                    tone="purple"
                />
                <StatCard title="CPM" value={formatMoney(totals.cpm, currency)} Icon={Target} tone="indigo" />
                <StatCard title="CPC" value={formatMoney(totals.cpc, currency)} Icon={MousePointer} tone="teal" />
                <StatCard
                    title="Satın Alma Başına Maliyet"
                    value={totals.purchases ? formatMoney(totals.costPerPurchase, currency) : '—'}
                    Icon={DollarSign}
                    tone="rose"
                />
                <StatCard title="Satır Sayısı" value={formatNumber(rows.length)} sub={LEVELS.find(l => l.value === level)?.label} Icon={BarChart} tone="gray" />
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between">
                    <h3 className="font-semibold">Detaylar ({LEVELS.find(l => l.value === level)?.label})</h3>
                    {loading && <span className="text-sm text-gray-400">yükleniyor…</span>}
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
        </div>
    );
};

export default Reporting;
