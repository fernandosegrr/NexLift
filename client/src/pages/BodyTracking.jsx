import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Scale, Camera, TrendingUp, Plus, X, Check, Activity, Droplet, Dumbbell, ChevronDown, ChevronUp, Flame, Waves, Heart, Bone, AlertTriangle, ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';
import { mexicoCityDateStr } from '../utils/dates';
import { cloudinaryThumb, cloudinaryDisplay } from '../utils/cloudinary';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024; // 12 MB pre-compresión

// Compress image to max 1200px and 85% quality
async function compressImage(file, maxSize = 1200, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Imagen inválida'));
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

function getBMIRange(bmi) {
    if (!bmi) return null;
    if (bmi < 18.5) return { label: 'Bajo peso', color: 'text-blue-400', bg: 'bg-blue-500/20' };
    if (bmi < 25) return { label: 'Normal', color: 'text-green-400', bg: 'bg-green-500/20' };
    if (bmi < 30) return { label: 'Sobrepeso', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
    return { label: 'Obesidad', color: 'text-red-400', bg: 'bg-red-500/20' };
}

// Delta ~N días: referencia = log más cercano al corte (día calendario CDMX).
// logs se asumen ordenados DESC (más reciente primero), como devuelve la API.
function calculateChange(logs, field, days = 30) {
    const filtered = logs.filter(l => l[field] != null);
    if (filtered.length < 2) return null;

    const latestLog = filtered[0];
    const latest = latestLog[field];
    const cutoffKey = mexicoCityDateStr(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    const cutoffTime = new Date(`${cutoffKey}T12:00:00Z`).getTime();

    let reference = null;
    let bestDiff = Infinity;
    for (let i = 1; i < filtered.length; i++) {
        const t = new Date(filtered[i].date).getTime();
        const diff = Math.abs(t - cutoffTime);
        if (diff < bestDiff) {
            bestDiff = diff;
            reference = filtered[i];
        }
    }

    if (!reference) return null;
    const latestKey = mexicoCityDateStr(new Date(latestLog.date));
    const refKey = mexicoCityDateStr(new Date(reference.date));
    const a = new Date(`${latestKey}T12:00:00Z`).getTime();
    const b = new Date(`${refKey}T12:00:00Z`).getTime();
    const elapsedDays = Math.round((a - b) / (1000 * 60 * 60 * 24));
    return { value: (latest - reference[field]).toFixed(1), days: elapsedDays };
}

// Fecha de un log en día CDMX (no el date part UTC del ISO, que falla de noche)
function formatLocalDate(dateStr, options = { day: 'numeric', month: 'short' }) {
    if (!dateStr) return '';
    const dayKey = mexicoCityDateStr(new Date(dateStr));
    const [year, month, day] = dayKey.split('-').map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return date.toLocaleDateString('es-ES', options);
}

// Color del delta: bajar peso/grasa = bueno (verde); subir músculo = bueno
function changeColorClass(field, deltaStr) {
    const v = parseFloat(deltaStr);
    if (!Number.isFinite(v) || v === 0) return 'text-[var(--text-secondary)]';
    if (field === 'muscleMass') return v > 0 ? 'text-green-400' : 'text-orange-400';
    // weight, bodyFat, bmi: bajar suele ser el objetivo en tracking
    return v < 0 ? 'text-green-400' : 'text-orange-400';
}

export default function BodyTracking() {
    const toast = useToast();
    const fileInputRef = useRef(null);
    const photoPreviewRef = useRef(null);

    // Consolidated data state
    const [logs, setLogs] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

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

    // Keep a ref in sync with the current preview URL and revoke it on unmount
    useEffect(() => {
        photoPreviewRef.current = photoPreview;
    }, [photoPreview]);

    useEffect(() => {
        return () => {
            const p = photoPreviewRef.current;
            if (p && p.startsWith('blob:')) URL.revokeObjectURL(p);
        };
    }, []);

    async function fetchData() {
        try {
            setLoadError(false);
            const [logsData, photosData] = await Promise.all([
                api.getBodyLogs(90),
                api.getBodyPhotos()
            ]);
            setLogs(Array.isArray(logsData) ? logsData : []);
            setPhotos(Array.isArray(photosData) ? photosData : []);
        } catch (error) {
            console.error('Error:', error);
            setLoadError(true);
            toast.error('Error al cargar datos corporales');
        } finally {
            setLoading(false);
        }
    }

    async function handlePhotoSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Solo se permiten imágenes');
            e.target.value = '';
            return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
            toast.error('La imagen es muy grande (máx. 12 MB)');
            e.target.value = '';
            return;
        }

        try {
            const compressed = await compressImage(file);
            // Preview = lo que se sube (comprimido), no el original
            setPhotoPreview(prev => {
                if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                return compressed;
            });
            setPhotoData(compressed);
            toast.success('Foto lista');
        } catch (error) {
            toast.error(error.message || 'Error al procesar imagen');
        }
    }

    const clearPhoto = useCallback(() => {
        setPhotoPreview(prev => {
            if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
            return null;
        });
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
        const hasAdvanced = [bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein]
            .some(v => v !== '' && v != null);
        if (!weight && !photoData && !hasAdvanced) {
            toast.error('Ingresa peso, sube una foto o llena datos de composición');
            return;
        }

        if (weight !== '') {
            const w = parseFloat(weight);
            if (!Number.isFinite(w) || w <= 0 || w > 500) {
                toast.error('Peso inválido (0–500 kg)');
                return;
            }
        }

        setSaving(true);
        try {
            const result = await api.logBodyData({
                weight: weight !== '' ? parseFloat(weight) : null,
                photo: photoData,
                note: note.trim() || null,
                bmi: bmi !== '' ? parseFloat(bmi) : null,
                bodyFat: bodyFat !== '' ? parseFloat(bodyFat) : null,
                muscleMass: muscleMass !== '' ? parseFloat(muscleMass) : null,
                bmr: bmr !== '' ? parseFloat(bmr) : null,
                bodyWater: bodyWater !== '' ? parseFloat(bodyWater) : null,
                visceralFat: visceralFat !== '' ? parseFloat(visceralFat) : null,
                boneMass: boneMass !== '' ? parseFloat(boneMass) : null,
                protein: protein !== '' ? parseFloat(protein) : null
            });

            if (result.photoFailed) {
                toast.error('Datos guardados, pero la foto no se pudo subir. Intenta de nuevo.');
            } else {
                toast.success('¡Datos guardados!');
            }
            clearForm();
            fetchData();
        } catch (error) {
            toast.error(error.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    // Chart: últimos 30 puntos con al menos un dato del tab activo
    const chartData = useMemo(() => {
        return logs
            .filter(l => l.weight != null || l.bodyFat != null || l.muscleMass != null)
            .slice(0, 45)
            .reverse()
            .map(l => ({
                date: formatLocalDate(l.date, { day: 'numeric', month: 'short' }),
                fullDate: formatLocalDate(l.date, { day: 'numeric', month: 'short', year: 'numeric' }),
                weight: l.weight,
                bodyFat: l.bodyFat,
                muscleMass: l.muscleMass
            }));
    }, [logs]);

    const stats = useMemo(() => {
        const latestWithWeight = logs.find(l => l.weight != null);
        const latestWithBMI = logs.find(l => l.bmi != null);
        const latestWithFat = logs.find(l => l.bodyFat != null);
        const latestWithMuscle = logs.find(l => l.muscleMass != null);

        return {
            weight: latestWithWeight?.weight,
            bmi: latestWithBMI?.bmi,
            bodyFat: latestWithFat?.bodyFat,
            muscleMass: latestWithMuscle?.muscleMass,
            weightChange: calculateChange(logs, 'weight', 30),
            fatChange: calculateChange(logs, 'bodyFat', 30),
            muscleChange: calculateChange(logs, 'muscleMass', 30),
            bmiRange: getBMIRange(latestWithBMI?.bmi)
        };
    }, [logs]);

    const chartConfig = useMemo(() => {
        const configs = {
            weight: { key: 'weight', color: '#8b5cf6', label: 'Peso', unit: 'kg' },
            bodyFat: { key: 'bodyFat', color: '#f97316', label: 'Grasa', unit: '%' },
            muscleMass: { key: 'muscleMass', color: '#22c55e', label: 'Músculo', unit: 'kg' }
        };
        return configs[activeChart];
    }, [activeChart]);

    const chartHasSeries = useMemo(
        () => chartData.some(d => d[chartConfig.key] != null),
        [chartData, chartConfig.key]
    );

    const canSubmit = weight !== '' || !!photoData
        || [bmi, bodyFat, muscleMass, bmr, bodyWater, visceralFat, boneMass, protein].some(v => v !== '');

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (loadError && logs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center space-y-3">
                <AlertTriangle size={32} className="text-[var(--warning)]" />
                <p className="font-bold text-lg">No se pudo cargar el seguimiento</p>
                <button
                    type="button"
                    onClick={() => { setLoading(true); fetchData(); }}
                    className="mt-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm active:scale-95"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto pb-6">
            {/* Header con vuelta clara a Progreso */}
            <div>
                <Link
                    to="/progress"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] min-h-[40px] -ml-1 px-1 mb-1 active:opacity-80"
                >
                    <ArrowLeft size={18} aria-hidden />
                    Progreso
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2 leading-tight">
                    <Scale className="text-[var(--primary)] shrink-0" aria-hidden />
                    Cuerpo
                </h1>
                <p className="text-[var(--text-secondary)] text-sm mt-0.5">Peso, composición y fotos</p>
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
                    <p className="text-2xl font-bold tabular-nums whitespace-nowrap">
                        {stats.weight != null ? Number(stats.weight).toFixed(1) : '--'}
                        <span className="text-sm font-normal text-[var(--text-secondary)] ml-1.5">kg</span>
                    </p>
                    {stats.weightChange && (
                        <p className={`text-xs mt-1 tabular-nums ${changeColorClass('weight', stats.weightChange.value)}`}>
                            {parseFloat(stats.weightChange.value) > 0 ? '+' : ''}{stats.weightChange.value} kg
                            <span className="text-[var(--text-secondary)]">
                                {' '}({Math.abs(stats.weightChange.days - 30) <= 5 ? '~30d' : `${stats.weightChange.days}d`})
                            </span>
                        </p>
                    )}
                </div>

                {/* BMI Card */}
                <div className="bg-gradient-to-br from-[var(--bg-card)] to-[#1a1a2e] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                            <Activity size={16} className="text-blue-400" aria-hidden />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">IMC</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">{stats.bmi?.toFixed(1) || '--'}</p>
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
                            <Droplet size={16} className="text-orange-400" aria-hidden />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">Grasa corporal</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums">
                        {stats.bodyFat?.toFixed(1) || '--'}
                        <span className="text-sm font-normal text-[var(--text-secondary)] ml-1">%</span>
                    </p>
                    {stats.fatChange && (
                        <p className={`text-xs mt-1 tabular-nums ${changeColorClass('bodyFat', stats.fatChange.value)}`}>
                            {parseFloat(stats.fatChange.value) > 0 ? '+' : ''}{stats.fatChange.value}%
                            <span className="text-[var(--text-secondary)]">
                                {' '}({Math.abs(stats.fatChange.days - 30) <= 5 ? '~30d' : `${stats.fatChange.days}d`})
                            </span>
                        </p>
                    )}
                </div>

                {/* Muscle Mass Card */}
                <div className="bg-gradient-to-br from-[var(--bg-card)] to-[#1a1a2e] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                            <Dumbbell size={16} className="text-green-400" aria-hidden />
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">Masa muscular</span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums whitespace-nowrap">
                        {stats.muscleMass != null ? Number(stats.muscleMass).toFixed(1) : '--'}
                        <span className="text-sm font-normal text-[var(--text-secondary)] ml-1.5">kg</span>
                    </p>
                    {stats.muscleChange && (
                        <p className={`text-xs mt-1 tabular-nums ${changeColorClass('muscleMass', stats.muscleChange.value)}`}>
                            {parseFloat(stats.muscleChange.value) > 0 ? '+' : ''}{stats.muscleChange.value} kg
                            <span className="text-[var(--text-secondary)]">
                                {' '}({Math.abs(stats.muscleChange.days - 30) <= 5 ? '~30d' : `${stats.muscleChange.days}d`})
                            </span>
                        </p>
                    )}
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
                            capture="environment"
                            onChange={handlePhotoSelect}
                            className="hidden"
                        />

                        {photoPreview ? (
                            <div className="relative">
                                <img src={photoPreview} alt="Vista previa de progreso" className="w-full h-48 object-cover rounded-lg" />
                                <button
                                    type="button"
                                    onClick={clearPhoto}
                                    aria-label="Quitar foto"
                                    className="absolute top-2 right-2 p-2 bg-black/60 rounded-full hover:bg-black/80 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full border-2 border-dashed border-[var(--border)] rounded-lg p-6 text-center hover:border-[var(--primary)] transition-colors"
                            >
                                <Camera size={24} className="mx-auto text-[var(--text-secondary)] mb-2" aria-hidden />
                                <p className="text-sm text-[var(--text-secondary)]">Toca para subir o tomar foto</p>
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
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-center gap-2 py-2 text-sm text-[var(--primary)] hover:bg-[var(--primary)]/10 rounded-lg transition-colors"
                    >
                        {showAdvanced ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
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
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving || !canSubmit}
                        className="w-full bg-gradient-to-r from-[var(--primary)] to-purple-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all shadow-lg shadow-purple-500/20 active:scale-[0.98]"
                    >
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <Check size={18} aria-hidden />
                                Guardar
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Charts with Tabs */}
            {chartData.length > 1 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                    <div className="flex gap-1 mb-4 bg-[var(--bg-dark)] p-1 rounded-lg">
                        {[
                            { key: 'weight', label: 'Peso', icon: Scale },
                            { key: 'bodyFat', label: 'Grasa', icon: Droplet },
                            { key: 'muscleMass', label: 'Músculo', icon: Dumbbell }
                        ].map(tab => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveChart(tab.key)}
                                className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs rounded-md transition-all ${activeChart === tab.key
                                    ? 'bg-[var(--primary)] text-white'
                                    : 'text-[var(--text-secondary)] hover:text-white'
                                    }`}
                            >
                                <tab.icon size={12} aria-hidden />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="h-48">
                        {chartHasSeries ? (
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
                                        labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                                        formatter={(value) => value != null ? [`${value} ${chartConfig.unit}`, chartConfig.label] : ['--', chartConfig.label]}
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
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-[var(--text-secondary)] text-sm">
                                <p>Sin datos de {chartConfig.label.toLowerCase()} aún</p>
                                <p className="text-xs mt-1">Registra mediciones para ver la curva</p>
                            </div>
                        )}
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
                        {photos.map((photo, idx) => (
                            <button
                                key={photo.id}
                                type="button"
                                onClick={() => { setSelectedPhoto(photo); setShowPhotoModal(true); }}
                                className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)] hover:border-[var(--primary)] transition-colors bg-[var(--bg-dark)]"
                            >
                                <img
                                    src={cloudinaryThumb(photo.photo, { width: 360, height: 360 })}
                                    alt={`Progreso ${formatLocalDate(photo.date, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                    className="w-full h-full object-cover"
                                    // Miniatura Cloudinary (~tens of KB), no el full-res (puede ser 3MB+)
                                    loading={idx < 6 ? 'eager' : 'lazy'}
                                    decoding="async"
                                    onError={(e) => {
                                        // Reintento con URL original por si el transform fallara
                                        const full = photo.photo;
                                        if (e.currentTarget.dataset.retried !== '1' && full && e.currentTarget.src !== full) {
                                            e.currentTarget.dataset.retried = '1';
                                            e.currentTarget.src = full;
                                            return;
                                        }
                                        e.currentTarget.style.display = 'none';
                                        const fallback = e.currentTarget.nextElementSibling;
                                        if (fallback) fallback.hidden = false;
                                    }}
                                />
                                <div
                                    hidden
                                    className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-[var(--bg-dark)]"
                                >
                                    <Camera size={18} className="text-[var(--text-secondary)] mb-1 opacity-50" />
                                    <p className="text-[9px] text-[var(--text-secondary)] leading-tight">
                                        No se pudo cargar
                                    </p>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1 pointer-events-none">
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
                <Portal>
                    <div
                        className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in"
                        onClick={() => setShowPhotoModal(false)}
                    >
                        <div className="max-w-md w-full" onClick={e => e.stopPropagation()}>
                            <img
                                src={cloudinaryDisplay(selectedPhoto.photo)}
                                alt="Progreso"
                                className="w-full rounded-xl max-h-[70vh] object-contain bg-black/40"
                                onError={(e) => {
                                    if (e.currentTarget.dataset.retried !== '1' && selectedPhoto.photo) {
                                        e.currentTarget.dataset.retried = '1';
                                        e.currentTarget.src = selectedPhoto.photo;
                                        return;
                                    }
                                    e.currentTarget.replaceWith(Object.assign(document.createElement('p'), {
                                        className: 'text-center text-[var(--text-secondary)] py-12 px-4 text-sm',
                                        textContent: 'No se pudo mostrar la imagen. Revisa la conexión o vuelve a subirla.'
                                    }));
                                }}
                            />
                            <div className="text-center mt-3">
                                <p className="text-white font-medium">
                                    {formatLocalDate(selectedPhoto.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                {selectedPhoto.weight != null && (
                                    <p className="text-[var(--primary)] text-lg font-bold mt-1 tabular-nums whitespace-nowrap">
                                        {Number(selectedPhoto.weight).toFixed(1)} kg
                                    </p>
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
                </Portal>
            )}
        </div>
    );
}
