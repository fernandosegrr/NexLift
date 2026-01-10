import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Scale, Camera, TrendingUp, Plus, X, Check, Activity, Droplet, Dumbbell, ChevronDown, ChevronUp, Flame, Waves, Heart, Bone } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

// Compress image to max 1200px and 85% quality
async function compressImage(file, maxSize = 1200, quality = 0.85) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = (height / width) * maxSize;
                        width = maxSize;
                    } else {
                        width = (width / height) * maxSize;
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Helper: Get BMI range with color
function getBMIRange(bmi) {
    if (!bmi) return null;
    if (bmi < 18.5) return { label: 'Bajo peso', color: 'text-blue-400', bg: 'bg-blue-500/20' };
    if (bmi < 25) return { label: 'Normal', color: 'text-green-400', bg: 'bg-green-500/20' };
    if (bmi < 30) return { label: 'Sobrepeso', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
    return { label: 'Obesidad', color: 'text-red-400', bg: 'bg-red-500/20' };
}

// Helper: Calculate change over period
function calculateChange(logs, field, days = 30) {
    const filtered = logs.filter(l => l[field] != null);
    if (filtered.length < 2) return null;

    const latest = filtered[0][field];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const oldest = filtered.find(l => new Date(l.date) <= cutoffDate);
    if (!oldest) {
        // Use the oldest available if no data within cutoff
        const oldestAvailable = filtered[filtered.length - 1];
        if (oldestAvailable && oldestAvailable.id !== filtered[0].id) {
            return (latest - oldestAvailable[field]).toFixed(1);
        }
        return null;
    }
    return (latest - oldest[field]).toFixed(1);
}

// Fix timezone: parse date string as local, not UTC
function formatLocalDate(dateStr, options = { day: 'numeric', month: 'short' }) {
    if (!dateStr) return '';
    // Extract just the date part (YYYY-MM-DD) and parse as local
    const dateOnly = dateStr.split('T')[0];
    const [year, month, day] = dateOnly.split('-').map(Number);
    // Create date using local timezone (month is 0-indexed)
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('es-ES', options);
}

export default function BodyTracking() {
    const toast = useToast();
    const fileInputRef = useRef(null);

    // Consolidated data state
    const [logs, setLogs] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form state - basic fields
    const [weight, setWeight] = useState('');
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoData, setPhotoData] = useState(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    // Form state - advanced composition
    const [bmi, setBmi] = useState('');
    const [bodyFat, setBodyFat] = useState('');
    const [muscleMass, setMuscleMass] = useState('');
    const [bmr, setBmr] = useState('');
    const [bodyWater, setBodyWater] = useState('');
    const [visceralFat, setVisceralFat] = useState('');
    const [boneMass, setBoneMass] = useState('');
    const [protein, setProtein] = useState('');

    // UI state
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [activeChart, setActiveChart] = useState('weight'); // 'weight' | 'bodyFat' | 'muscleMass'

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        try {
            const [logsData, photosData] = await Promise.all([
                api.getBodyLogs(90),
                api.getBodyPhotos()
            ]);
            setLogs(logsData);
            setPhotos(photosData);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    }

    async function handlePhotoSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const compressed = await compressImage(file);
            setPhotoPreview(URL.createObjectURL(file));
            setPhotoData(compressed);
            toast.success('Foto cargada');
        } catch (error) {
            toast.error('Error al procesar imagen');
        }
    }

    const clearPhoto = useCallback(() => {
        setPhotoPreview(null);
        setPhotoData(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    const clearForm = useCallback(() => {
        setWeight('');
        clearPhoto();
        setNote('');
        setBmi('');
        setBodyFat('');
        setMuscleMass('');
        setBmr('');
        setBodyWater('');
        setVisceralFat('');
        setBoneMass('');
        setProtein('');
    }, [clearPhoto]);

    async function handleSubmit() {
        if (!weight && !photoData) {
            toast.error('Ingresa peso o sube una foto');
            return;
        }

        setSaving(true);
        try {
            await api.logBodyData({
                weight: weight ? parseFloat(weight) : null,
                photo: photoData,
                note: note || null,
                bmi: bmi ? parseFloat(bmi) : null,
                bodyFat: bodyFat ? parseFloat(bodyFat) : null,
                muscleMass: muscleMass ? parseFloat(muscleMass) : null,
                bmr: bmr ? parseFloat(bmr) : null,
                bodyWater: bodyWater ? parseFloat(bodyWater) : null,
                visceralFat: visceralFat ? parseFloat(visceralFat) : null,
                boneMass: boneMass ? parseFloat(boneMass) : null,
                protein: protein ? parseFloat(protein) : null
            });

            toast.success('¡Datos guardados!');
            clearForm();
            fetchData();
        } catch (error) {
            toast.error('Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    // Memoized chart data
    const chartData = useMemo(() => {
        return logs
            .filter(l => l.weight || l.bodyFat || l.muscleMass)
            .slice(0, 30)
            .reverse()
            .map(l => ({
                date: formatLocalDate(l.date, { day: 'numeric', month: 'short' }),
                weight: l.weight,
                bodyFat: l.bodyFat,
                muscleMass: l.muscleMass
            }));
    }, [logs]);

    // Memoized latest stats
    const stats = useMemo(() => {
        const latestWithWeight = logs.find(l => l.weight);
        const latestWithBMI = logs.find(l => l.bmi);
        const latestWithFat = logs.find(l => l.bodyFat);
        const latestWithMuscle = logs.find(l => l.muscleMass);

        return {
            weight: latestWithWeight?.weight,
            bmi: latestWithBMI?.bmi,
            bodyFat: latestWithFat?.bodyFat,
            muscleMass: latestWithMuscle?.muscleMass,
            weightChange: calculateChange(logs, 'weight', 30),
            bmiRange: getBMIRange(latestWithBMI?.bmi)
        };
    }, [logs]);

    // Chart config based on active tab
    const chartConfig = useMemo(() => {
        const configs = {
            weight: { key: 'weight', color: '#8b5cf6', label: 'Peso', unit: 'kg' },
            bodyFat: { key: 'bodyFat', color: '#f97316', label: 'Grasa', unit: '%' },
            muscleMass: { key: 'muscleMass', color: '#22c55e', label: 'Músculo', unit: 'kg' }
        };
        return configs[activeChart];
    }, [activeChart]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto pb-20">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Scale className="text-[var(--primary)]" />
                    Seguimiento Corporal
                </h1>
                <p className="text-[var(--text-secondary)] text-sm">Composición corporal y progreso</p>
            </div>

            {/* Quick Stats - 4 Cards */}
            <div className="grid grid-cols-2 gap-3">
                {/* Weight Card */}
                <div className="bg-gradient-to-br from-[var(--bg-card)] to-[#1a1a2e] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                            <Scale size={16} className="text-purple-400" />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">Peso Actual</span>
                    </div>
                    <p className="text-2xl font-bold">
                        {stats.weight?.toFixed(1) || '--'}
                        <span className="text-sm font-normal text-[var(--text-secondary)] ml-1">kg</span>
                    </p>
                    {stats.weightChange && (
                        <p className={`text-xs mt-1 ${parseFloat(stats.weightChange) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {parseFloat(stats.weightChange) > 0 ? '+' : ''}{stats.weightChange} kg (30d)
                        </p>
                    )}
                </div>

                {/* BMI Card */}
                <div className="bg-gradient-to-br from-[var(--bg-card)] to-[#1a1a2e] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <Activity size={16} className="text-blue-400" />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">IMC</span>
                    </div>
                    <p className="text-2xl font-bold">{stats.bmi?.toFixed(1) || '--'}</p>
                    {stats.bmiRange && (
                        <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full ${stats.bmiRange.bg} ${stats.bmiRange.color}`}>
                            {stats.bmiRange.label}
                        </span>
                    )}
                </div>

                {/* Body Fat Card */}
                <div className="bg-gradient-to-br from-[var(--bg-card)] to-[#1a1a2e] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <Droplet size={16} className="text-orange-400" />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">Grasa Corporal</span>
                    </div>
                    <p className="text-2xl font-bold">
                        {stats.bodyFat?.toFixed(1) || '--'}
                        <span className="text-sm font-normal text-[var(--text-secondary)] ml-1">%</span>
                    </p>
                </div>

                {/* Muscle Mass Card */}
                <div className="bg-gradient-to-br from-[var(--bg-card)] to-[#1a1a2e] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <Dumbbell size={16} className="text-green-400" />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">Masa Muscular</span>
                    </div>
                    <p className="text-2xl font-bold">
                        {stats.muscleMass?.toFixed(1) || '--'}
                        <span className="text-sm font-normal text-[var(--text-secondary)] ml-1">kg</span>
                    </p>
                </div>
            </div>

            {/* Log Form Card */}
            <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Plus size={16} className="text-[var(--primary)]" />
                    Registrar Hoy
                </h3>

                <div className="space-y-3">
                    {/* Weight Input */}
                    <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">Peso (kg)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={weight}
                            onChange={(e) => setWeight(e.target.value)}
                            placeholder="Ej: 75.5"
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-3 text-lg font-semibold focus:border-[var(--primary)] outline-none transition-colors"
                        />
                    </div>

                    {/* Photo Upload */}
                    <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">Foto de progreso</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoSelect}
                            className="hidden"
                        />

                        {photoPreview ? (
                            <div className="relative">
                                <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                                <button
                                    onClick={clearPhoto}
                                    className="absolute top-2 right-2 p-2 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full border-2 border-dashed border-[var(--border)] rounded-lg p-6 text-center hover:border-[var(--primary)] transition-colors"
                            >
                                <Camera size={24} className="mx-auto text-[var(--text-secondary)] mb-2" />
                                <p className="text-sm text-[var(--text-secondary)]">Toca para subir foto</p>
                            </button>
                        )}
                    </div>

                    {/* Note */}
                    <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">Nota (opcional)</label>
                        <input
                            type="text"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Ej: Después de desayunar"
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                        />
                    </div>

                    {/* Advanced Section Toggle */}
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
                    >
                        {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        Datos de báscula inteligente
                    </button>

                    {/* Advanced Fields */}
                    {showAdvanced && (
                        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border)] animate-fade-in">
                            {/* BMI */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Activity size={12} /> IMC
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={bmi}
                                    onChange={(e) => setBmi(e.target.value)}
                                    placeholder="Ej: 23.5"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>

                            {/* Body Fat */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Droplet size={12} /> Grasa %
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={bodyFat}
                                    onChange={(e) => setBodyFat(e.target.value)}
                                    placeholder="Ej: 18.5"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>

                            {/* Muscle Mass */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Dumbbell size={12} /> Músculo (kg)
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={muscleMass}
                                    onChange={(e) => setMuscleMass(e.target.value)}
                                    placeholder="Ej: 35.2"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>

                            {/* BMR */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Flame size={12} /> Metab. (kcal)
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    value={bmr}
                                    onChange={(e) => setBmr(e.target.value)}
                                    placeholder="Ej: 1850"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>

                            {/* Body Water */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Waves size={12} /> Agua %
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={bodyWater}
                                    onChange={(e) => setBodyWater(e.target.value)}
                                    placeholder="Ej: 55.0"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>

                            {/* Visceral Fat */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Heart size={12} /> G. Visceral
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    value={visceralFat}
                                    onChange={(e) => setVisceralFat(e.target.value)}
                                    placeholder="1-59"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>

                            {/* Bone Mass */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Bone size={12} /> Hueso (kg)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={boneMass}
                                    onChange={(e) => setBoneMass(e.target.value)}
                                    placeholder="Ej: 3.2"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>

                            {/* Protein */}
                            <div>
                                <label className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mb-1">
                                    <Droplet size={12} /> Proteína %
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={protein}
                                    onChange={(e) => setProtein(e.target.value)}
                                    placeholder="Ej: 18.5"
                                    className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none transition-colors"
                                />
                            </div>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={saving || (!weight && !photoData)}
                        className="w-full bg-gradient-to-r from-[var(--primary)] to-purple-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all shadow-lg shadow-purple-500/20"
                    >
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Check size={18} />
                                Guardar
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Charts with Tabs */}
            {chartData.length > 1 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                    {/* Chart Tabs */}
                    <div className="flex gap-1 mb-4 bg-[var(--bg-dark)] p-1 rounded-lg">
                        {[
                            { key: 'weight', label: 'Peso', icon: Scale },
                            { key: 'bodyFat', label: 'Grasa', icon: Droplet },
                            { key: 'muscleMass', label: 'Músculo', icon: Dumbbell }
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveChart(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs rounded-md transition-all ${activeChart === tab.key
                                    ? 'bg-[var(--primary)] text-white'
                                    : 'text-[var(--text-secondary)] hover:text-white'
                                    }`}
                            >
                                <tab.icon size={12} />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Chart */}
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a1a1aa' }} />
                                <YAxis
                                    tick={{ fontSize: 10, fill: '#a1a1aa' }}
                                    domain={['dataMin - 1', 'dataMax + 1']}
                                    width={35}
                                />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                                    formatter={(value) => value ? [`${value} ${chartConfig.unit}`, chartConfig.label] : ['--', chartConfig.label]}
                                />
                                <Line
                                    type="monotone"
                                    dataKey={chartConfig.key}
                                    stroke={chartConfig.color}
                                    strokeWidth={2}
                                    dot={{ fill: chartConfig.color, r: 4 }}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* History Table */}
            {logs.length > 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                    <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                        <TrendingUp size={16} className="text-[var(--primary)]" />
                        Historial Reciente
                    </h3>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-[var(--text-secondary)] border-b border-[var(--border)]">
                                    <th className="text-left pb-2 font-medium">Fecha</th>
                                    <th className="text-right pb-2 font-medium">Peso</th>
                                    <th className="text-right pb-2 font-medium">IMC</th>
                                    <th className="text-right pb-2 font-medium">Grasa</th>
                                    <th className="text-right pb-2 font-medium">Músculo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.slice(0, 10).map((log, idx) => (
                                    <tr
                                        key={log.id}
                                        className={`border-b border-[var(--border)]/50 ${idx % 2 === 0 ? 'bg-[var(--bg-dark)]/30' : ''}`}
                                    >
                                        <td className="py-2 text-[var(--text-secondary)]">
                                            {formatLocalDate(log.date, { day: 'numeric', month: 'short' })}
                                        </td>
                                        <td className="py-2 text-right font-medium">
                                            {log.weight ? `${log.weight.toFixed(1)}` : '--'}
                                        </td>
                                        <td className="py-2 text-right">
                                            {log.bmi ? log.bmi.toFixed(1) : '--'}
                                        </td>
                                        <td className="py-2 text-right text-orange-400">
                                            {log.bodyFat ? `${log.bodyFat.toFixed(1)}%` : '--'}
                                        </td>
                                        <td className="py-2 text-right text-green-400">
                                            {log.muscleMass ? `${log.muscleMass.toFixed(1)}` : '--'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Progress Photos Grid */}
            {photos.length > 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                    <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                        <Camera size={16} className="text-[var(--primary)]" />
                        Fotos de Progreso
                    </h3>
                    <div className="grid grid-cols-3 gap-2">
                        {photos.map((photo) => (
                            <button
                                key={photo.id}
                                onClick={() => { setSelectedPhoto(photo); setShowPhotoModal(true); }}
                                className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
                            >
                                <img src={photo.photo} alt="Progreso" className="w-full h-full object-cover" />
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                    <p className="text-[10px] text-white text-center">
                                        {formatLocalDate(photo.date, { day: 'numeric', month: 'short' })}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Photo Modal */}
            {showPhotoModal && selectedPhoto && (
                <div
                    className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setShowPhotoModal(false)}
                >
                    <div className="max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <img
                            src={selectedPhoto.photo}
                            alt="Progreso"
                            className="w-full rounded-xl"
                        />
                        <div className="text-center mt-3">
                            <p className="text-white font-medium">
                                {formatLocalDate(selectedPhoto.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            {selectedPhoto.weight && (
                                <p className="text-[var(--primary)] text-lg font-bold mt-1">{selectedPhoto.weight.toFixed(1)} kg</p>
                            )}
                            {selectedPhoto.note && (
                                <p className="text-[var(--text-secondary)] text-sm mt-1">{selectedPhoto.note}</p>
                            )}
                        </div>
                        <button
                            onClick={() => setShowPhotoModal(false)}
                            className="w-full mt-4 bg-[var(--bg-card)] text-white py-3 rounded-xl font-medium hover:bg-[var(--border)] transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
