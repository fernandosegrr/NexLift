/**
 * ExerciseLibrary - Biblioteca de ejercicios con búsqueda y categorías
 * 
 * Panel lateral/modal para seleccionar ejercicios precargados
 */

import { useState, useMemo } from 'react';
import { Search, X, Plus, ChevronDown, ChevronRight, Dumbbell } from 'lucide-react';
import MuscleIcon, { getMuscleColor, MUSCLE_LIST } from './ui/MuscleIcon';
import { Portal } from './ui/Portal';
import { EXERCISES, MUSCLE_GROUPS, searchExercises, getExercisesByMuscle, getMuscleGroup } from '../data/exercises';

export default function ExerciseLibrary({
    onSelectExercise,
    onClose,
    isOpen = true
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState(['chest', 'back']); // Abrir algunos por defecto

    // Ejercicios filtrados por búsqueda
    const filteredExercises = useMemo(() => {
        if (searchQuery.length >= 2) {
            return searchExercises(searchQuery);
        }
        return null; // null significa mostrar por categorías
    }, [searchQuery]);

    // Toggle grupo expandido
    const toggleGroup = (groupId) => {
        setExpandedGroups(prev =>
            prev.includes(groupId)
                ? prev.filter(g => g !== groupId)
                : [...prev, groupId]
        );
    };

    // Manejar selección de ejercicio
    const handleSelectExercise = (exercise) => {
        onSelectExercise({
            name: exercise.name,
            muscleGroup: exercise.muscleGroup,
            isUnilateral: exercise.isUnilateral || false,
            targetSets: exercise.defaultSets,
            targetReps: exercise.defaultReps,
            restSeconds: 90,
            note: '',
            equipment: exercise.equipment
        });
    };

    if (!isOpen) return null;

    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden flex flex-col max-h-[70vh]">
            {/* Header */}
            <div className="p-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-dark)]">
                <div className="flex items-center gap-2">
                    <Dumbbell className="w-5 h-5 text-[var(--primary)]" />
                    <span className="font-medium text-sm">Biblioteca de Ejercicios</span>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-[var(--border)] rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-[var(--text-secondary)]" />
                    </button>
                )}
            </div>

            {/* Search */}
            <div className="p-3 border-b border-[var(--border)]">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                    <input
                        type="text"
                        placeholder="Buscar ejercicio..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg text-sm text-white placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--primary)]"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Exercise List */}
            <div className="flex-1 overflow-y-auto">
                {filteredExercises ? (
                    // Resultados de búsqueda
                    <div className="p-2">
                        {filteredExercises.length === 0 ? (
                            <p className="text-center text-[var(--text-secondary)] text-sm py-8">
                                No se encontraron ejercicios
                            </p>
                        ) : (
                            <div className="space-y-1">
                                {filteredExercises.map(exercise => (
                                    <ExerciseItem
                                        key={exercise.id}
                                        exercise={exercise}
                                        onSelect={handleSelectExercise}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    // Vista por categorías
                    <div className="divide-y divide-[var(--border)]">
                        {MUSCLE_GROUPS.map(group => {
                            const isExpanded = expandedGroups.includes(group.id);
                            const groupExercises = getExercisesByMuscle(group.id);

                            return (
                                <div key={group.id}>
                                    {/* Group Header */}
                                    <button
                                        onClick={() => toggleGroup(group.id)}
                                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[var(--bg-dark)] transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <MuscleIcon muscle={group.id} size={18} colored />
                                            <span className="text-sm font-medium">{group.name}</span>
                                            <span className="text-xs text-[var(--text-secondary)] bg-[var(--bg-dark)] px-1.5 py-0.5 rounded">
                                                {groupExercises.length}
                                            </span>
                                        </div>
                                        {isExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-[var(--text-secondary)]" />
                                        )}
                                    </button>

                                    {/* Group Exercises */}
                                    {isExpanded && (
                                        <div className="bg-[var(--bg-dark)]/50 pb-2">
                                            {groupExercises.map(exercise => (
                                                <ExerciseItem
                                                    key={exercise.id}
                                                    exercise={exercise}
                                                    onSelect={handleSelectExercise}
                                                    compact
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Footer hint */}
            <div className="p-2 border-t border-[var(--border)] bg-[var(--bg-dark)]">
                <p className="text-center text-xs text-[var(--text-secondary)]">
                    Toca un ejercicio para agregarlo
                </p>
            </div>
        </div>
    );
}

/**
 * Componente de item de ejercicio
 */
function ExerciseItem({ exercise, onSelect, compact = false }) {
    const muscleGroup = getMuscleGroup(exercise.muscleGroup);

    return (
        <button
            onClick={() => onSelect(exercise)}
            className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--primary)]/10 rounded-lg transition-colors text-left group ${compact ? 'ml-6' : ''
                }`}
        >
            {/* Icon */}
            <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${getMuscleColor(exercise.muscleGroup)}20` }}
            >
                <MuscleIcon
                    muscle={exercise.muscleGroup}
                    size={16}
                    colored
                />
            </div>

            {/* Name and details */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                    {exercise.name}
                </p>
                {!compact && (
                    <p className="text-xs text-[var(--text-secondary)]">
                        {muscleGroup?.name} • {exercise.defaultSets}×{exercise.defaultReps}
                    </p>
                )}
            </div>

            {/* Add icon */}
            <Plus className="w-4 h-4 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
    );
}

/**
 * Versión modal de la biblioteca
 */
export function ExerciseLibraryModal({ isOpen, onClose, onSelectExercise }) {
    if (!isOpen) return null;

    return (
        <Portal>
            <div
                className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in"
                onClick={onClose}
            >
                <div
                    className="w-full sm:max-w-md sm:rounded-xl rounded-t-2xl overflow-hidden animate-slide-up"
                    onClick={e => e.stopPropagation()}
                >
                    <ExerciseLibrary
                        isOpen={true}
                        onClose={onClose}
                        onSelectExercise={(exercise) => {
                            onSelectExercise(exercise);
                            onClose();
                        }}
                    />
                </div>
            </div>
        </Portal>
    );
}
