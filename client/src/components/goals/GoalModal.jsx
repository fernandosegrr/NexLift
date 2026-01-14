import { useState, useMemo } from 'react';
import { X, Target, Loader2, Dumbbell, TrendingUp, Calculator } from 'lucide-react';

export default function GoalModal({ exercises = [], onSave, onClose }) {
    const [formData, setFormData] = useState({
        exerciseName: '',
        targetWeight: '',
        targetReps: '1', // Por defecto meta de fuerza (1RM)
    });

    // Estado para el cálculo manual del inicio (El parche para evitar NaN)
    const [startData, setStartData] = useState({
        weight: '',
        reps: '5'
    });

    const [saving, setSaving] = useState(false);

    // Cálculo en tiempo real del 1RM estimado (Solo visual)
    const estimatedStart1RM = useMemo(() => {
        const w = parseFloat(startData.weight);
        const r = parseInt(startData.reps);
        if (!w || !r) return 0;
        // Fórmula Epley: Peso * (1 + Reps/30)
        return Math.round(w * (1 + r / 30));
    }, [startData.weight, startData.reps]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.exerciseName || !formData.targetWeight) return;

        setSaving(true);

        // --- TRUCO MATEMÁTICO ---
        // Calculamos el 1RM aquí antes de enviar, para guardarlo en el campo 'currentOneRepMax'
        // que YA existe en tu base de datos. Así el sistema tiene un punto de partida
        // aunque no tengas historial previo.
        let calculatedCurrent1RM = null;
        if (startData.weight && startData.reps) {
            calculatedCurrent1RM = parseFloat(startData.weight) * (1 + parseInt(startData.reps) / 30);
        }

        await onSave({
            exerciseName: formData.exerciseName,
            targetWeight: parseFloat(formData.targetWeight),
            targetReps: parseInt(formData.targetReps),
            currentOneRepMax: calculatedCurrent1RM // <--- Aquí va el dato que evita el NaN
        });

        setSaving(false);
    };

    // Obtener nombres únicos de ejercicios
    const exerciseOptions = [...new Set(exercises.map(e => e.name))].sort();

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-[var(--bg-card)] rounded-2xl p-6 max-w-md w-full border border-[var(--border)] shadow-2xl relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center border border-purple-500/30">
                            <Target className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white text-lg leading-tight">Nuevo Objetivo</h3>
                            <p className="text-xs text-[var(--text-secondary)]">Calculadora de Periodización</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-[var(--bg-dark)] flex items-center justify-center text-[var(--text-secondary)] hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">

                    {/* 1. Selección de Ejercicio */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider ml-1">
                            Ejercicio
                        </label>
                        <select
                            value={formData.exerciseName}
                            onChange={e => setFormData(p => ({ ...p, exerciseName: e.target.value }))}
                            className="w-full px-4 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-purple-500 focus:outline-none appearance-none cursor-pointer hover:border-[var(--primary)]/50 transition-colors"
                            required
                        >
                            <option value="">Seleccionar ejercicio...</option>
                            {exerciseOptions.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* 2. Estado Actual (INPUT MANUAL) */}
                        <div className="col-span-2 bg-[var(--bg-dark)]/50 p-4 rounded-xl border border-[var(--border)]">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Dumbbell className="w-4 h-4 text-blue-400" />
                                    <span className="text-sm font-bold text-white">Tu Nivel Actual</span>
                                </div>
                                {estimatedStart1RM > 0 && (
                                    <span className="text-xs font-mono text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded">
                                        1RM: ≈{estimatedStart1RM}kg
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Peso (kg)</label>
                                    <input
                                        type="number"
                                        value={startData.weight}
                                        onChange={e => setStartData(p => ({ ...p, weight: e.target.value }))}
                                        placeholder="Ej: 90"
                                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-white text-sm focus:border-blue-500 outline-none placeholder:text-gray-700"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-[10px] text-[var(--text-secondary)] mb-1">Reps</label>
                                    <input
                                        type="number"
                                        value={startData.reps}
                                        onChange={e => setStartData(p => ({ ...p, reps: e.target.value }))}
                                        placeholder="Ej: 8"
                                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-white text-sm focus:border-blue-500 outline-none placeholder:text-gray-700"
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-[var(--text-secondary)] mt-2 italic flex items-center gap-1">
                                <Calculator size={10} />
                                Opcional si ya tienes historial registrado (+3 sesiones).
                            </p>
                        </div>

                        {/* 3. Meta (TARGET) */}
                        <div className="col-span-2">
                            <div className="flex items-center gap-2 mb-1.5 ml-1">
                                <TrendingUp className="w-3 h-3 text-purple-400" />
                                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                                    Meta
                                </span>
                            </div>
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={formData.targetWeight}
                                            onChange={e => setFormData(p => ({ ...p, targetWeight: e.target.value }))}
                                            placeholder="Peso"
                                            className="w-full pl-3 pr-8 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white font-bold focus:border-purple-500 outline-none"
                                            required
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">kg</span>
                                    </div>
                                </div>
                                <div className="w-28">
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={formData.targetReps}
                                            onChange={e => setFormData(p => ({ ...p, targetReps: e.target.value }))}
                                            placeholder="Reps"
                                            className="w-full pl-3 pr-8 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white font-bold focus:border-purple-500 outline-none"
                                            required
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)]">reps</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Submit Buttons */}
                    <div className="flex gap-3 pt-4 border-t border-[var(--border)]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-medium bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--bg-card)] hover:text-white transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !formData.exerciseName || !formData.targetWeight}
                            className="flex-[2] py-3 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20 transition-all"
                        >
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Target className="w-5 h-5" />}
                            Crear Plan
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}