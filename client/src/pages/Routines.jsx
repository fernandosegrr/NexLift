import { useDialogFocus } from '../hooks/useDialogFocus';
import { useRemoteRead } from '../app/useRemoteRead';
import { readRoutines } from '../features/remoteViews';
import RemoteStatus from '../components/ui/RemoteStatus';
import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Dumbbell, ChevronDown, ChevronRight, Play, Check,
    Trash2, Plus, Pencil, AlertTriangle, Trophy,
    Calendar, Bot, Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';
import { resolveTodayRoutineDay, weekdayLabel } from '../utils/routineDays';
import { mexicoCityDayOfWeek } from '../utils/dates';

const BLOCK_PHASE_LABELS = {
    accumulation: 'Acumulación',
    intensification: 'Intensificación',
    deload: 'Descarga',
    custom: 'Personalizado'
};

function findTodayDay(routine) {
    if (!routine?.days?.length || routine.source === 'ai') return null;
    return resolveTodayRoutineDay(routine.days);
}

export default function Routines() {
    const remote = useRemoteRead('routines', ['list'], () => api.getRoutines(), readRoutines);
    const routines = useMemo(() => remote.data || [], [remote.data]);
    const loading = remote.isPending;
    const loadError = remote.isError;
    const [expandedRoutineId, setExpandedRoutineId] = useState(null);
    const [expandedDayId, setExpandedDayId] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const toast = useToast();

    const activeRoutine = useMemo(() => routines.find(r => r.isActive), [routines]);
    const otherRoutines = useMemo(() => routines.filter(r => !r.isActive), [routines]);

    useEffect(() => {
        const active = remote.data?.find(item => item.isActive);
        if (active) setExpandedRoutineId(previous => previous ?? active.id);
    }, [remote.data]);
    const loadRoutines = () => remote.refetch();

    const [changing, setChanging] = useState(false);
    const handleActivate = async id => {
        if (changing) return;
        setChanging(true);
        try { await api.activateRoutine(id); await remote.refetch(); setExpandedRoutineId(id); toast.success('Rutina activada'); }
        catch { toast.error('No se pudo activar la rutina'); }
        finally { setChanging(false); }
    };
    const handleDelete = async () => {
        if (!deleteConfirm || changing) return;
        setChanging(true);
        try { await api.deleteRoutine(deleteConfirm.id); setDeleteConfirm(null); await remote.refetch(); toast.success('Rutina eliminada'); }
        catch { toast.error('No se pudo eliminar la rutina'); }
        finally { setChanging(false); }
    };

    const toggleRoutine = id => {
        setExpandedRoutineId(previous => previous === id ? null : id);
        setExpandedDayId(null);
    };
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <div className="w-12 h-12 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                <p className="text-[var(--text-secondary)] animate-pulse">Cargando entrenamientos...</p>
            </div>
        );
    }

    if (loadError && routines.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center space-y-3">
                <AlertTriangle size={32} className="text-[var(--warning)]" />
                <p className="font-bold text-lg">No se pudieron cargar las rutinas</p>
                <p className="text-sm text-[var(--text-secondary)]">Revisa tu conexión e intenta de nuevo</p>
                <button
                    type="button"
                    onClick={() => { void loadRoutines(); }}
                    className="mt-2 px-4 py-2 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm active:scale-95"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="pb-24 space-y-8 animate-fade-in max-w-lg mx-auto">
            <RemoteStatus fetching={remote.isFetching} stale={remote.isStale} error={remote.error} updatedAt={remote.dataUpdatedAt} retry={() => { void remote.refetch(); }} />
            {/* Header */}
            <div className="flex items-center justify-between pt-2">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-[var(--text-secondary)] bg-clip-text text-transparent">
                        Mis Rutinas
                    </h1>
                    <p className="text-sm text-[var(--text-secondary)]">Gestiona tu plan de entrenamiento</p>
                </div>
                <Link
                    to="/import"
                    aria-label="Crear o importar rutina"
                    className="w-12 h-12 bg-[var(--primary)] rounded-2xl flex items-center justify-center shadow-[0_0_20px_-5px_var(--primary)] active:scale-95 transition-all hover:bg-opacity-90"
                >
                    <Plus size={24} color="white" strokeWidth={2.5} />
                </Link>
            </div>

            {/* Hero: Rutina activa */}
            {activeRoutine && (
                <section className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--primary)] uppercase tracking-wider pl-1">
                        <Trophy size={14} aria-hidden />
                        Plan actual
                    </div>
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--primary)] to-purple-600 rounded-2xl opacity-30 group-hover:opacity-50 blur transition duration-500" />
                        <div className="relative">
                            <RoutineCard
                                routine={activeRoutine}
                                isActive
                                isExpanded={expandedRoutineId === activeRoutine.id}
                                expandedDayId={expandedDayId}
                                onToggle={() => toggleRoutine(activeRoutine.id)}
                                onDayToggle={setExpandedDayId}
                                onDelete={() => setDeleteConfirm(activeRoutine)}
                                onRoutineUpdated={loadRoutines}
                            />
                        </div>
                    </div>
                </section>
            )}

            {/* Biblioteca */}
            <section className="space-y-4">
                <div className="flex items-center justify-between pl-1">
                    <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Biblioteca ({otherRoutines.length})
                    </h2>
                </div>

                {otherRoutines.length === 0 && !activeRoutine ? (
                    <EmptyState />
                ) : otherRoutines.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)] pl-1 py-2">
                        No hay otras rutinas. Usa + para crear o importar una.
                    </p>
                ) : (
                    <div className="grid gap-3">
                        {otherRoutines.map(routine => (
                            <RoutineCard
                                key={routine.id}
                                routine={routine}
                                isActive={false}
                                isExpanded={expandedRoutineId === routine.id}
                                expandedDayId={expandedDayId}
                                onToggle={() => toggleRoutine(routine.id)}
                                onDayToggle={setExpandedDayId}
                                onActivate={() => handleActivate(routine.id)}
                                onDelete={() => setDeleteConfirm(routine)}
                                onRoutineUpdated={loadRoutines}
                            />
                        ))}
                    </div>
                )}
            </section>

            {deleteConfirm && (
                <DeleteModal
                    routineName={deleteConfirm.name}
                    isActive={!!deleteConfirm.isActive}
                    onCancel={() => setDeleteConfirm(null)}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}

// ----------------------------------------------------------------------
// SUB-COMPONENTES
// ----------------------------------------------------------------------

function RoutineCard({
    routine,
    isActive,
    isExpanded,
    expandedDayId,
    onToggle,
    onDayToggle,
    onActivate,
    onDelete,
    onRoutineUpdated
}) {
    const navigate = useNavigate();
    const isAi = routine.source === 'ai';
    // Para rutinas IA, `days` viene acotado a los más recientes (server)
    const totalExercises = (routine.days || []).reduce((acc, d) => acc + (d.exercises?.length || 0), 0);
    const [startingToday, setStartingToday] = useState(false);
    const [reshuffling, setReshuffling] = useState(false);
    const toast = useToast();

    const todayDay = useMemo(() => findTodayDay(routine), [routine]);
    const phaseLabel = routine.activeBlock
        ? `${BLOCK_PHASE_LABELS[routine.activeBlock.phase] || routine.activeBlock.phase} · Semana ${routine.currentWeek} de ${routine.activeBlock.durationWeeks}`
        : (routine.phase && BLOCK_PHASE_LABELS[routine.phase]
            ? BLOCK_PHASE_LABELS[routine.phase]
            : null);

    async function handleTrainToday() {
        if (startingToday) return;
        setStartingToday(true);
        try {
            if (isAi) {
                const result = await api.getAiRoutineToday();
                if (result?.isRestDay || result?.day?.isRestDay) {
                    toast.info('Hoy es día de descanso según tu plan IA');
                    return;
                }
                if (result?.day?.id) {
                    navigate(`/workout/${result.day.id}`);
                    return;
                }
                toast.error('No se pudo resolver el día de hoy');
                return;
            }
            // Manual: ir al día de hoy si existe y no es descanso
            if (todayDay?.isRestDay) {
                toast.info('Hoy es día de descanso en esta rutina');
                return;
            }
            if (todayDay?.id) {
                navigate(`/workout/${todayDay.id}`);
                return;
            }
            toast.error(`Ningún día está asignado a hoy (${weekdayLabel(mexicoCityDayOfWeek())}). Edítala para asignarlo.`);
        } catch {
            toast.error('No se pudo abrir el entrenamiento de hoy');
        } finally {
            setStartingToday(false);
        }
    }

    async function handleReshuffle(e) {
        e.stopPropagation();
        if (reshuffling) return;
        setReshuffling(true);
        try {
            const today = await api.getAiRoutineToday();
            if (!today?.day?.id) {
                toast.error('Todavía no hay un día de hoy que cambiar');
                return;
            }
            await api.reshuffleAiRoutineDay(today.day.id);
            toast.success('Ejercicios de hoy actualizados');
            onRoutineUpdated?.();
        } catch (err) {
            toast.error(err.message || 'No se pudo cambiar los ejercicios');
        } finally {
            setReshuffling(false);
        }
    }

    return (
        <div className={`
            bg-[var(--bg-card)] rounded-xl overflow-hidden transition-all duration-300
            ${isActive ? 'border border-[var(--primary)]/50 bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-dark)]' : 'border border-[var(--border)] hover:border-[var(--border)]/80'}
        `}>
            {/* Header — button real para a11y (no div clickeable) */}
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isExpanded}
                className="w-full p-4 flex items-center gap-4 text-left cursor-pointer hover:bg-white/5 transition-colors"
            >
                <div className={`
                    w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors
                    ${isActive ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-900/40' : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'}
                `}>
                    {isActive
                        ? <Trophy size={20} fill="currentColor" className="text-white/90" aria-hidden />
                        : <Dumbbell size={20} aria-hidden />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className={`font-bold text-lg truncate ${isActive ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                            {routine.name}
                        </h3>
                        {isActive && (
                            <span className="bg-[var(--primary)]/20 text-[var(--primary)] text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">
                                ACTIVA
                            </span>
                        )}
                        {isAi && (
                            <span className="bg-purple-500/20 text-purple-400 text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">
                                IA
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                        {isAi ? (
                            <span>{totalExercises} ejercicios en los últimos días</span>
                        ) : (
                            <>
                                <span className="flex items-center gap-1">
                                    <Calendar size={12} aria-hidden /> {routine.days?.length || 0} días
                                </span>
                                <span className="w-1 h-1 rounded-full bg-[var(--border)]" aria-hidden />
                                <span>{totalExercises} ejercicios</span>
                            </>
                        )}
                    </div>
                    {phaseLabel && (
                        <p className="text-[10px] text-[var(--primary)] font-medium mt-1">
                            {phaseLabel}
                        </p>
                    )}
                    {/* Chip de hoy (manual) siempre visible en la activa — incluido el
                        hueco real (sin día asignado), que antes se ocultaba en silencio */}
                    {isActive && !isAi && (
                        <p className="text-[10px] text-[var(--text-secondary)] mt-1">
                            Hoy:{' '}
                            <span className="text-[var(--text-primary)] font-semibold">
                                {todayDay ? (todayDay.isRestDay ? 'Descanso' : todayDay.dayName) : 'Sin entrenamiento programado'}
                            </span>
                        </p>
                    )}
                </div>

                <ChevronDown
                    aria-hidden
                    className={`text-[var(--text-secondary)] shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
            </button>

            {/* CTA entrenar hoy — visible en la activa sin forzar expandir todo el acordeón */}
            {isActive && (
                <div className="px-4 pb-3">
                    <button
                        type="button"
                        onClick={handleTrainToday}
                        disabled={startingToday}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-white text-sm font-bold rounded-xl active:scale-[0.98] transition-transform disabled:opacity-60 shadow-lg shadow-purple-900/20"
                    >
                        {startingToday
                            ? <Loader2 size={16} className="animate-spin" />
                            : <Play size={14} fill="currentColor" />}
                        {!isAi && !todayDay
                            ? 'Sin día asignado hoy'
                            : todayDay?.isRestDay && !isAi ? 'Hoy es descanso' : 'Entrenar hoy'}
                    </button>
                </div>
            )}

            {/* Expanded */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="border-t border-[var(--border)] bg-[var(--bg-dark)]/50">
                        {isAi ? (
                            <div className="p-4 space-y-3">
                                {routine.days?.length > 0 ? (
                                    <div>
                                        <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-bold mb-2">
                                            Últimos días
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {routine.days.slice(0, 7).map(day => (
                                                <span
                                                    key={day.id}
                                                    className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--bg-dark)] px-2 py-1 rounded-lg border border-[var(--border)]"
                                                >
                                                    {day.splitLabel || day.dayName}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-[var(--text-secondary)]">
                                        Todavía no hay días entrenados con esta rutina.
                                    </p>
                                )}
                                {!isActive && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleTrainToday(); }}
                                        disabled={startingToday}
                                        className="w-full flex items-center justify-center gap-2 py-3 bg-[var(--primary)] text-white text-sm font-bold rounded-lg active:scale-[0.98] transition-transform disabled:opacity-60"
                                    >
                                        {startingToday
                                            ? <Loader2 size={16} className="animate-spin" />
                                            : <Play size={14} fill="currentColor" />}
                                        Entrenar hoy
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleReshuffle}
                                    disabled={reshuffling}
                                    className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-white transition-colors disabled:opacity-60"
                                >
                                    {reshuffling
                                        ? <Loader2 size={12} className="animate-spin" />
                                        : <Bot size={12} />}
                                    No me gusta este día, cambiar ejercicios
                                </button>
                            </div>
                        ) : (
                            <div className="divide-y divide-[var(--border)]/50">
                                {(routine.days || []).map((day) => (
                                    <DayRow
                                        key={day.id}
                                        day={day}
                                        isToday={todayDay?.id === day.id}
                                        isExpanded={expandedDayId === day.id}
                                        onToggle={() => onDayToggle(expandedDayId === day.id ? null : day.id)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Footer de acciones */}
                        <div className="p-3 flex items-center justify-between bg-[var(--bg-card)] border-t border-[var(--border)]">
                            <div className="flex gap-2 flex-wrap">
                                {!isActive && onActivate && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onActivate(); }}
                                        className="text-xs text-[var(--primary)] font-bold flex items-center gap-2 px-3 py-2 bg-[var(--primary)]/10 rounded-lg hover:bg-[var(--primary)]/20"
                                    >
                                        <Check size={14} strokeWidth={3} aria-hidden /> Activar
                                    </button>
                                )}
                                {isAi ? (
                                    <Link
                                        to="/ai-routine/setup"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-2 text-[var(--text-secondary)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                                        title="Reconfigurar perfil IA"
                                        aria-label="Reconfigurar perfil IA"
                                    >
                                        <Bot size={18} />
                                    </Link>
                                ) : (
                                    <>
                                        <Link
                                            to={`/routines/${routine.id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-2 text-[var(--text-secondary)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                                            title="Ver detalle"
                                            aria-label="Ver detalle de la rutina"
                                        >
                                            <ChevronRight size={18} />
                                        </Link>
                                        <Link
                                            to={`/routines/${routine.id}/edit`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-2 text-[var(--text-secondary)] hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                                            title="Editar"
                                            aria-label="Editar rutina"
                                        >
                                            <Pencil size={18} />
                                        </Link>
                                    </>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                aria-label="Eliminar rutina"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DayRow({ day, isToday, isExpanded, onToggle }) {
    return (
        <div className={`group ${isToday ? 'bg-[var(--primary)]/5' : ''}`}>
            <div className="w-full px-4 py-3.5 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left hover:opacity-90"
                    aria-expanded={isExpanded}
                >
                    <ChevronRight
                        size={16}
                        aria-hidden
                        className={`text-[var(--text-secondary)] shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-white' : ''}`}
                    />
                    <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${isExpanded || isToday ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                            {day.dayName}
                            {isToday && (
                                <span className="ml-2 text-[10px] font-bold text-[var(--primary)] bg-[var(--primary)]/15 px-1.5 py-0.5 rounded">
                                    HOY
                                </span>
                            )}
                        </p>
                        <p className="text-[10px] text-[var(--text-secondary)]">
                            {weekdayLabel(day.weekday) ? `${weekdayLabel(day.weekday)} · ` : ''}
                            {day.isRestDay
                                ? 'Descanso'
                                : `${day.exercises?.length || 0} ejercicio${(day.exercises?.length || 0) === 1 ? '' : 's'}`}
                        </p>
                    </div>
                </button>

                {day.isRestDay ? (
                    <span className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--border)] px-2 py-1 rounded shrink-0">
                        DESCANSO
                    </span>
                ) : (
                    <Link
                        to={`/workout/${day.id}`}
                        className="flex items-center gap-1.5 pl-3 pr-4 py-1.5 bg-[var(--primary)] text-white text-xs font-bold rounded-full shadow-lg shadow-purple-900/20 active:scale-95 transition-transform hover:bg-purple-500 shrink-0"
                    >
                        <Play size={12} fill="currentColor" aria-hidden /> Iniciar
                    </Link>
                )}
            </div>

            {isExpanded && !day.isRestDay && (
                <div className="bg-[var(--bg-dark)] px-4 pb-4 pt-1 animate-fade-in">
                    <div className="pl-8 space-y-2 border-l-2 border-[var(--border)] ml-2">
                        {(day.exercises || []).map((ex) => (
                            <div key={ex.id} className="pl-4 relative">
                                <div className="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-[var(--border)]" aria-hidden />
                                <p className="text-sm text-[var(--text-primary)]">{ex.name}</p>
                                <p className="text-xs text-[var(--text-secondary)] font-mono mt-0.5">
                                    {ex.targetSets} series × {ex.targetReps} reps
                                    {ex.restSeconds ? ` · ${ex.restSeconds}s` : ''}
                                </p>
                                {ex.note && (
                                    <p className="text-[10px] text-[var(--text-secondary)] italic mt-0.5">
                                        {ex.note}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function EmptyState() {
    return (
        <div className="border border-dashed border-[var(--border)] rounded-2xl p-8 text-center bg-[var(--bg-card)]/50">
            <div className="w-16 h-16 bg-[var(--bg-dark)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Dumbbell className="text-[var(--text-secondary)] opacity-50" size={32} aria-hidden />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Sin rutinas aún</h3>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-[220px] mx-auto">
                Crea tu propia rutina, importa una plantilla o prueba el plan diario con IA.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                    to="/import"
                    className="inline-flex items-center gap-2 text-sm font-bold text-[var(--primary)] hover:text-white transition-colors"
                >
                    <Plus size={16} /> Crear o importar
                </Link>
                <Link
                    to="/ai-routine/setup"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] hover:text-white transition-colors"
                >
                    <Bot size={16} /> Rutina con IA
                </Link>
            </div>
        </div>
    );
}

function DeleteModal({ routineName, isActive, onCancel, onConfirm }) {
    const focus = useDialogFocus(onCancel);
    return (
        <Portal>
            <div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
                onClick={onCancel}
                role="presentation"
            >
                <div
                    role="dialog"
                    {...focus}
                    aria-modal="true"
                    aria-labelledby="delete-routine-title"
                    className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-scale-in"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <AlertTriangle className="text-red-500" size={24} aria-hidden />
                    </div>

                    <h3 id="delete-routine-title" className="text-xl font-bold text-center mb-2">
                        ¿Eliminar rutina?
                    </h3>
                    <p className="text-center text-[var(--text-secondary)] text-sm mb-2">
                        Estás a punto de borrar{' '}
                        <span className="text-white font-medium">&quot;{routineName}&quot;</span>.
                    </p>
                    {isActive && (
                        <p className="text-center text-[var(--warning)] text-xs mb-4 font-medium">
                            Es tu rutina activa. El historial de series se conserva en la papelera del sistema.
                        </p>
                    )}
                    {!isActive && (
                        <p className="text-center text-[var(--text-secondary)] text-xs mb-6">
                            El historial de series se conserva; no se pierden tus logs.
                        </p>
                    )}

                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="py-3 rounded-xl font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className="py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-900/20 active:scale-95 transition-all"
                        >
                            Sí, eliminar
                        </button>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
