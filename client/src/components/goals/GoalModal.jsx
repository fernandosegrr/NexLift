import { useState } from 'react';
import { X, Target, Loader2 } from 'lucide-react';

export default function GoalModal({ exercises = [], onSave, onClose }) {
    const [formData, setFormData] = useState({
        exerciseName: '',
        targetWeight: '',
        targetReps: '5'
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.exerciseName || !formData.targetWeight || !formData.targetReps) return;

        setSaving(true);
        await onSave({
            exerciseName: formData.exerciseName,
            targetWeight: parseFloat(formData.targetWeight),
            targetReps: parseInt(formData.targetReps)
        });
        setSaving(false);
    };

    // Get unique exercise names from routine
    const exerciseOptions = [...new Set(exercises.map(e => e.name))].sort();

    return (
        <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                className="bg-[var(--bg-card)] rounded-2xl p-6 max-w-sm w-full border border-[var(--border)] shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                            <Target className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Nuevo Objetivo</h3>
                            <p className="text-xs text-[var(--text-secondary)]">Define tu meta de fuerza</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-[var(--bg-dark)] flex items-center justify-center text-[var(--text-secondary)] hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Exercise Select */}
                    <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                            Ejercicio de tu rutina
                        </label>
                        <select
                            value={formData.exerciseName}
                            onChange={e => setFormData(p => ({ ...p, exerciseName: e.target.value }))}
                            className="w-full px-3 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                            required
                        >
                            <option value="">Seleccionar ejercicio...</option>
                            {exerciseOptions.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Target Weight */}
                    <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                            Peso objetivo (kg)
                        </label>
                        <input
                            type="number"
                            value={formData.targetWeight}
                            onChange={e => setFormData(p => ({ ...p, targetWeight: e.target.value }))}
                            placeholder="Ej: 100"
                            min="1"
                            step="0.5"
                            className="w-full px-3 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-purple-500 focus:outline-none"
                            required
                        />
                    </div>

                    {/* Target Reps */}
                    <div>
                        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">
                            Repeticiones objetivo
                        </label>
                        <input
                            type="number"
                            value={formData.targetReps}
                            onChange={e => setFormData(p => ({ ...p, targetReps: e.target.value }))}
                            placeholder="Ej: 5"
                            min="1"
                            max="30"
                            className="w-full px-3 py-3 bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl text-white focus:border-purple-500 focus:outline-none"
                            required
                        />
                    </div>

                    {/* Info */}
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                        <p className="text-xs text-blue-300">
                            Analizaremos tu historial para predecir cuándo alcanzarás este objetivo.
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl font-medium bg-[var(--bg-dark)] text-white border border-[var(--border)]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !formData.exerciseName || !formData.targetWeight}
                            className="flex-1 py-3 rounded-xl font-medium bg-purple-500 text-white disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/25"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                            Crear
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
