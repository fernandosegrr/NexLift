import { useState, useEffect, useRef } from 'react';
import { Scale, Camera, TrendingUp, ChevronDown, Calendar, Plus, X, Check } from 'lucide-react';
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

                // Scale down if needed
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

export default function BodyTracking() {
    const toast = useToast();
    const fileInputRef = useRef(null);

    // Data
    const [logs, setLogs] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);

    // Form
    const [weight, setWeight] = useState('');
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoData, setPhotoData] = useState(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    // UI
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState(null);

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

    function clearPhoto() {
        setPhotoPreview(null);
        setPhotoData(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

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
                note: note || null
            });

            toast.success('¡Datos guardados!');
            setWeight('');
            clearPhoto();
            setNote('');
            fetchData(); // Refresh
        } catch (error) {
            toast.error('Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    // Chart data (last 30 days with weight)
    const chartData = logs
        .filter(l => l.weight)
        .slice(0, 30)
        .reverse()
        .map(l => ({
            date: new Date(l.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            weight: l.weight
        }));

    // Stats
    const latestWeight = logs.find(l => l.weight)?.weight;
    const firstWeight = chartData[0]?.weight;
    const weightChange = latestWeight && firstWeight ? (latestWeight - firstWeight).toFixed(1) : null;

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
                <p className="text-[var(--text-secondary)] text-sm">Peso y fotos de progreso</p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-[var(--bg-card)] rounded-xl p-4 text-center">
                    <Scale size={20} className="mx-auto text-[var(--primary)] mb-2" />
                    <p className="text-2xl font-bold">{latestWeight || '--'}<span className="text-sm font-normal text-[var(--text-secondary)]">kg</span></p>
                    <p className="text-xs text-[var(--text-secondary)]">Peso actual</p>
                </div>
                <div className="bg-[var(--bg-card)] rounded-xl p-4 text-center">
                    <TrendingUp size={20} className={`mx-auto mb-2 ${weightChange > 0 ? 'text-green-500' : weightChange < 0 ? 'text-red-500' : 'text-[var(--text-secondary)]'}`} />
                    <p className="text-2xl font-bold">
                        {weightChange ? (weightChange > 0 ? `+${weightChange}` : weightChange) : '--'}
                        <span className="text-sm font-normal text-[var(--text-secondary)]">kg</span>
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">Últimos 30 días</p>
                </div>
            </div>

            {/* Log Weight Card */}
            <div className="bg-[var(--bg-card)] rounded-xl p-4">
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
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-3 text-lg font-semibold focus:border-[var(--primary)] outline-none"
                        />
                    </div>

                    {/* Photo Upload */}
                    <div>
                        <label className="text-xs text-[var(--text-secondary)] block mb-1">Foto de progreso (mensual)</label>
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
                                    className="absolute top-2 right-2 p-2 bg-black/60 rounded-full"
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
                            className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:border-[var(--primary)] outline-none"
                        />
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={saving || (!weight && !photoData)}
                        className="w-full bg-[var(--primary)] text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all"
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

            {/* Weight Chart */}
            {chartData.length > 1 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-4">
                    <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                        <TrendingUp size={16} className="text-[var(--primary)]" />
                        Evolución de Peso
                    </h3>
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
                                    formatter={(value) => [`${value} kg`, 'Peso']}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="weight"
                                    stroke="#8b5cf6"
                                    strokeWidth={2}
                                    dot={{ fill: '#8b5cf6', r: 4 }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Progress Photos Grid */}
            {photos.length > 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-4">
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
                                        {new Date(photo.date).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })}
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
                                {new Date(selectedPhoto.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                            {selectedPhoto.note && (
                                <p className="text-[var(--text-secondary)] text-sm mt-1">{selectedPhoto.note}</p>
                            )}
                        </div>
                        <button
                            onClick={() => setShowPhotoModal(false)}
                            className="w-full mt-4 bg-[var(--bg-card)] text-white py-3 rounded-xl font-medium"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
