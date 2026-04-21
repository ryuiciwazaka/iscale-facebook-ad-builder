import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Sparkles, Target, Wallet, Palette, AlertTriangle, Zap, Eye } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1');

const authHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
};

const AdStrategyDrawer = ({ product, open, onClose }) => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [report, setReport] = useState(null);

    useEffect(() => {
        if (!open || !product?.id) return;
        setLoading(true);
        setError(null);
        setReport(null);

        (async () => {
            try {
                // Resolve SHEROE ad_account_id if available so strategy uses real segments.
                let ad_account_id = null;
                try {
                    const accR = await fetch(`${API_BASE}/facebook/accounts`, { headers: authHeaders() });
                    if (accR.ok) {
                        const accs = await accR.json();
                        const preferred = accs.find(a => /sheroe/i.test(a.name)) || accs[0];
                        ad_account_id = preferred?.id || null;
                    }
                } catch (_) { /* fine, strategy works without */ }

                const r = await fetch(`${API_BASE}/ad-strategy/analyze`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        product_id: product.id,
                        brand_id: product.brandId || product.brand_id,
                        ad_account_id,
                    }),
                });
                if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                setReport(await r.json());
            } catch (e) {
                setError(e.message || String(e));
            } finally {
                setLoading(false);
            }
        })();
    }, [open, product?.id]);

    const useStrategy = () => {
        if (!report) return;
        sessionStorage.setItem('winningSeed', JSON.stringify({
            winningAds: (report.copy_seeds || []).map(s => ({ body: s, title: null, cta: null })),
            patternProfile: report.pattern_profile || null,
            audienceSignals: {
                top_segment: report.audience?.age && report.audience?.gender
                    ? `${report.audience.age} ${report.audience.gender}`
                    : null,
                top_placement: report.audience?.placement
                    ? Object.values(report.audience.placement).filter(Boolean).join(' / ')
                    : null,
                fatigue_note: `Angle: ${report.angle?.angle}. Bütçe: ${report.budget?.daily_try} TL/gün.`,
            },
            strategy: report,
            productId: product.id,
        }));
        navigate('/image-ads');
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/40" onClick={onClose} />
            <div className="w-full max-w-2xl bg-white shadow-xl overflow-y-auto">
                <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Sparkles size={20} className="text-amber-600" />
                        Reklam Stratejisi — {product?.name}
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
                </div>

                <div className="p-6">
                    {loading && (
                        <div className="text-center text-gray-500 py-12">
                            <div className="animate-pulse">Görseller analiz ediliyor…</div>
                            <div className="text-xs text-gray-400 mt-2">VLM + kazanan kalıp + segment verisi birleştiriliyor</div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
                            {error}
                        </div>
                    )}

                    {report && (
                        <div className="space-y-5">
                            {/* Readiness banner */}
                            {report.signals && (
                                <div className={`rounded-xl p-4 border flex items-start gap-3 ${report.signals.ready ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                    <Sparkles size={20} className="flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 text-sm">
                                        <div className="font-semibold mb-1">
                                            {report.signals.ready ? 'Tam veri — sistem hazır' : 'Kısmi veri — öneriler sınırlı'}
                                        </div>
                                        <div className="flex gap-3 flex-wrap text-xs">
                                            <span className={`px-2 py-0.5 rounded ${report.signals.vlm_ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>VLM {report.signals.vlm_ok ? '✓' : '✗'}</span>
                                            <span className={`px-2 py-0.5 rounded ${report.signals.pattern_ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>Kazanan kalıp {report.signals.pattern_ok ? '✓' : '✗'}</span>
                                            <span className={`px-2 py-0.5 rounded ${report.signals.segments_ok ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>Segments {report.signals.segments_ok ? '✓' : '✗'}</span>
                                        </div>
                                        {(report.signals.messages || []).length > 0 && (
                                            <ul className="mt-2 text-xs opacity-75 list-disc pl-4">
                                                {report.signals.messages.map((m, i) => <li key={i}>{m}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Visual insight */}
                            <Section Icon={Eye} title="Görsel Analiz (VLM)" tone="blue">
                                {report.visual_insight?.error ? (
                                    <div className="text-sm text-orange-600">
                                        VLM analizi başarısız: {report.visual_insight.error} — yine de strateji oluşturuldu (metin tabanlı).
                                    </div>
                                ) : (
                                    <dl className="grid grid-cols-2 gap-3 text-sm">
                                        <Field label="Kategori" value={report.visual_insight?.category} />
                                        <Field label="Silüet" value={report.visual_insight?.silhouette} />
                                        <Field label="Mood" value={report.visual_insight?.mood} />
                                        <Field label="Confidence" value={report.visual_insight?.confidence?.toFixed(2)} />
                                        <Field label="Stil" value={(report.visual_insight?.style_descriptors || []).join(', ')} span />
                                        <Field label="Satış noktaları" value={(report.visual_insight?.selling_hooks || []).join(' • ')} span />
                                        {report.visual_insight?.dominant_colors?.length > 0 && (
                                            <div className="col-span-2 flex items-center gap-2">
                                                <span className="text-xs text-gray-500">Renkler:</span>
                                                {report.visual_insight.dominant_colors.map((c, i) => (
                                                    <div key={i} className="flex items-center gap-1">
                                                        <div className="w-5 h-5 rounded border border-gray-300" style={{ background: c }} />
                                                        <span className="text-xs font-mono">{c}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </dl>
                                )}
                            </Section>

                            {/* Angle */}
                            <Section Icon={Zap} title="Önerilen Angle" tone="amber">
                                <div className="font-bold text-lg text-amber-900">{report.angle?.angle}</div>
                                <div className="text-sm text-gray-700 mt-1">{report.angle?.reason}</div>
                            </Section>

                            {/* Audience */}
                            <Section Icon={Target} title="Hedef Kitle" tone="purple">
                                <dl className="grid grid-cols-2 gap-3 text-sm">
                                    <Field label="Yaş" value={report.audience?.age} />
                                    <Field label="Cinsiyet" value={report.audience?.gender} />
                                    <Field label="Lifestyle" value={report.audience?.lifestyle_tag} />
                                    <Field label="Occasion" value={report.audience?.occasion_tag} />
                                    <Field label="Placement" value={Object.values(report.audience?.placement || {}).filter(Boolean).join(' / ')} span />
                                    <Field label="Cihaz" value={Object.values(report.audience?.device || {}).filter(Boolean).join(' / ')} span />
                                </dl>
                                {report.audience?.rationale && (
                                    <p className="text-xs text-gray-500 mt-3">{report.audience.rationale}</p>
                                )}
                            </Section>

                            {/* Budget */}
                            <Section Icon={Wallet} title="Bütçe Önerisi" tone="green">
                                <div className="flex justify-between items-baseline">
                                    <div>
                                        <div className="text-xs text-gray-500 uppercase">{report.budget?.tier}</div>
                                        <div className="text-2xl font-bold text-gray-900">{report.budget?.daily_try} TL / gün</div>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 mt-2">{report.budget?.note}</p>
                            </Section>

                            {/* Copy seeds */}
                            <Section Icon={Palette} title="Copy Önerileri" tone="rose">
                                <ul className="space-y-2 text-sm">
                                    {(report.copy_seeds || []).map((s, i) => (
                                        <li key={i} className="bg-rose-50 rounded-lg px-3 py-2">
                                            <span className="font-mono text-xs text-rose-700 mr-2">{i + 1}.</span>
                                            {s}
                                        </li>
                                    ))}
                                </ul>
                            </Section>

                            {/* Weaknesses */}
                            {(report.visual_insight?.weaknesses || []).length > 0 && (
                                <Section Icon={AlertTriangle} title="Dikkat Edilmesi Gerekenler" tone="orange">
                                    <ul className="text-sm text-gray-700 space-y-1">
                                        {report.visual_insight.weaknesses.map((w, i) => (
                                            <li key={i}>• {w}</li>
                                        ))}
                                    </ul>
                                </Section>
                            )}

                            {/* Action */}
                            <div className="sticky bottom-0 -mx-6 px-6 pt-4 pb-6 border-t bg-white">
                                <button
                                    onClick={useStrategy}
                                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2"
                                >
                                    <Sparkles size={18} /> Bu stratejiyle reklam üret
                                </button>
                                <p className="text-xs text-gray-400 text-center mt-2">
                                    Copy + pattern + audience sinyalleri ImageAds wizard'ına taşınır. FB Ads Manager'da manuel başlat.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Section = ({ Icon, title, tone = 'amber', children }) => (
    <div className="border border-gray-200 rounded-xl p-4">
        <h4 className={`font-semibold text-${tone}-700 mb-3 flex items-center gap-2`}>
            <Icon size={16} /> {title}
        </h4>
        {children}
    </div>
);

const Field = ({ label, value, span }) => (
    <div className={span ? 'col-span-2' : ''}>
        <dt className="text-xs text-gray-500 uppercase">{label}</dt>
        <dd className="font-medium text-gray-900 text-sm truncate">{value || '—'}</dd>
    </div>
);

export default AdStrategyDrawer;
