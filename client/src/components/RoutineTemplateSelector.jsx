/**
 * RoutineTemplateSelector - Selector de plantillas de rutinas
 * 
 * Modal para elegir una rutina predefinida al crear nueva
 */

import { useState } from 'react';
import { X, Dumbbell, Calendar, Trophy, ChevronRight, Sparkles } from 'lucide-react';
import { ROUTINE_TEMPLATES, getTemplate } from '../data/routineTemplates';
import { EXERCISES } from '../data/exercises';
import MuscleIcon from './ui/MuscleIcon';

// Mapeo de ejercicio ID a nombre
const getExerciseName = (exerciseId) => {
    const exercise = EXERCISES.find(e => e.id === exerciseId);
    return exercise?.name || exerciseId;
};

/**
 * Selector de plantillas de rutinas
 */
export default function RoutineTemplateSelector({ isOpen, onClose, onSelectTemplate }) {
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [previewTemplate, setPreviewTemplate] = useState(null);

    if (!isOpen) return null;

    const handleSelectTemplate = () => {
        if (selectedTemplate) {
            const template = getTemplate(selectedTemplate);
            onSelectTemplate(template);
            onClose();
        }
    };

    const handlePreview = (templateId) => {
        setPreviewTemplate(previewTemplate === templateId ? null : templateId);
    };

    // Colores de dificultad
    const difficultyColors = {
        beginner: 'text-green-400 bg-green-500/20',
        intermediate: 'text-yellow-400 bg-yellow-500/20',
        advanced: 'text-red-400 bg-red-500/20'
    };

    const difficultyLabels = {
        beginner: 'Principiante',
        intermediate: 'Intermedio',
        advanced: 'Avanzado'
    };

    return (
        <div
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="w-full max-w-lg max-h-[85vh] bg-[var(--bg-card)] rounded-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                            <Sparkles className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">Elegir Plantilla</h2>
                            <p className="text-xs text-[var(--text-secondary)]">Rutinas prediseñadas por expertos</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Templates List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {ROUTINE_TEMPLATES.map(template => {
                        const isSelected = selectedTemplate === template.id;
                        const isPreview = previewTemplate === template.id;

                        return (
                            <div key={template.id}>
                                {/* Template Card */}
                                <button
                                    onClick={() => setSelectedTemplate(template.id)}
                                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${isSelected
                                            ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                                            : 'border-[var(--border)] bg-[var(--bg-dark)] hover:border-[var(--primary)]/50'
                                        }`}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Icon */}
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--primary)] to-purple-700 flex items-center justify-center shrink-0">
                                            <Dumbbell className="w-6 h-6 text-white" />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold text-white">{template.name}</h3>
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${difficultyColors[template.difficulty]}`}>
                                                    {difficultyLabels[template.difficulty]}
                                                </span>
                                            </div>
                                            <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                                                {template.description}
                                            </p>

                                            {/* Stats */}
                                            <div className="flex items-center gap-4 mt-2">
                                                <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                                                    <Calendar className="w-3 h-3" />
                                                    {template.daysPerWeek} días/semana
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                                                    <Trophy className="w-3 h-3" />
                                                    {template.days.reduce((sum, d) => sum + (d.exercises?.length || 0), 0)} ejercicios
                                                </div>
                                            </div>
                                        </div>

                                        {/* Selected indicator */}
                                        {isSelected && (
                                            <div className="w-6 h-6 rounded-full bg-[var(--primary)] flex items-center justify-center shrink-0">
                                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        )}
                                    </div>

                                    {/* Preview toggle */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handlePreview(template.id); }}
                                        className="mt-3 flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                                    >
                                        <ChevronRight className={`w-3 h-3 transition-transform ${isPreview ? 'rotate-90' : ''}`} />
                                        {isPreview ? 'Ocultar detalles' : 'Ver detalles'}
                                    </button>
                                </button>

                                {/* Preview Panel */}
                                {isPreview && (
                                    <div className="mt-2 p-3 bg-[var(--bg-dark)] rounded-xl border border-[var(--border)] space-y-2">
                                        {template.days.map((day, idx) => (
                                            <div key={idx} className="flex items-start gap-2">
                                                <span className="text-xs font-medium text-[var(--primary)] w-16 shrink-0">
                                                    Día {idx + 1}
                                                </span>
                                                <div>
                                                    <p className="text-sm font-medium">
                                                        {day.isRestDay ? '🛌 Descanso' : day.dayName}
                                                    </p>
                                                    {!day.isRestDay && (
                                                        <p className="text-xs text-[var(--text-secondary)]">
                                                            {day.exercises.slice(0, 3).map(e => getExerciseName(e.exerciseId)).join(', ')}
                                                            {day.exercises.length > 3 && ` +${day.exercises.length - 3} más`}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--border)] flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-[var(--bg-dark)] text-white rounded-xl font-medium hover:bg-[var(--border)] transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSelectTemplate}
                        disabled={!selectedTemplate}
                        className="flex-1 py-3 bg-gradient-to-r from-[var(--primary)] to-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-600 hover:to-purple-700 transition-all"
                    >
                        Usar Plantilla
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * Botón para abrir el selector
 */
export function TemplateButton({ onClick }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--primary)]/20 to-pink-500/20 border border-[var(--primary)]/30 rounded-xl text-[var(--primary)] text-sm font-medium hover:from-[var(--primary)]/30 hover:to-pink-500/30 transition-all"
        >
            <Sparkles className="w-4 h-4" />
            Usar Plantilla
        </button>
    );
}
