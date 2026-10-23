import { memo, useMemo } from 'react';
import type { FocusEvent, ReactElement } from 'react';
import { Check, Sparkles } from 'lucide-react';
export interface WorkoutFormSet { weight: string | number; reps: string | number; weightR?: string | number; repsR?: string | number; rir: number | null; completed?: boolean }
export interface SetSuggestion { weight: number; reps: number; rationale?: string }
interface SetCardProps {
 set: WorkoutFormSet; index: number; isLocked: boolean; isUnilateral: boolean;
 previousBestScore: number | null; lastSet?: { weight: number; reps: number } | null;
 setSuggestion?: SetSuggestion | null;
 onUpdate: (index: number, field: 'weight' | 'reps' | 'weightR' | 'repsR', value: string) => void;
 onToggle: (index: number) => void; onSetRIR: (index: number, rir: number) => void;
 onApplySetSuggestion?: (index: number, suggestion: SetSuggestion) => void;
}
const RIR_QUESTIONS = [
    { value: 0, label: '0', desc: 'Al fallo' },
    { value: 1, label: '1', desc: '1 en recámara' },
    { value: 2, label: '2', desc: '2 en recámara' },
    { value: 3, label: '3+', desc: 'Cómodo' }
];

function setDeltaLabel(current: { weight: string | number; reps: string | number } | null, last: { weight: string | number; reps: string | number } | null): { text: string; tone: string } | null {
    if (!last || current == null) return null;
    const cw = Number(current.weight);
    const cr = Number(current.reps);
    const lw = Number(last.weight);
    const lr = Number(last.reps);
    // Solo con números reales cargados ('' → 0 no cuenta)
    if (!Number.isFinite(cw) || !Number.isFinite(cr) || cw <= 0 || cr <= 0) return null;
    if (!Number.isFinite(lw) || !Number.isFinite(lr) || lw <= 0 || lr <= 0) return null;
    const dW = Math.round((cw - lw) * 10) / 10;
    const dR = cr - lr;
    if (dW === 0 && dR === 0) return { text: 'igual que última', tone: 'neutral' };
    const parts = [];
    if (dW !== 0) parts.push(`${dW > 0 ? '+' : ''}${dW} kg`);
    if (dR !== 0) parts.push(`${dR > 0 ? '+' : ''}${dR} reps`);
    const better = dW > 0 || (dW === 0 && dR > 0);
    const worse = dW < 0 || (dW === 0 && dR < 0);
    return {
        text: parts.join(' · '),
        tone: better ? 'up' : worse ? 'down' : 'neutral'
    };
}

const SetCard = memo(({ set, index, onUpdate, onToggle, onSetRIR, isLocked, previousBestScore, isUnilateral, lastSet, setSuggestion, onApplySetSuggestion }: SetCardProps): ReactElement => {
    const handleFocus = (e: FocusEvent<HTMLInputElement>): void => e.target.select();

    const isPR = useMemo(() => {
        if (previousBestScore == null || isLocked || !set.completed) return false;
        const w = Number(set.weight) || 0;
        const r = Number(set.reps) || 0;
        const effW = isUnilateral ? Math.min(w, Number(set.weightR) || w) : w;
        const effR = isUnilateral ? Math.min(r, Number(set.repsR) || r) : r;
        const currentScore = effW * (1 + effR / 30);
        return currentScore > previousBestScore;
    }, [set, previousBestScore, isLocked, isUnilateral]);

    // Delta solo DESPUÉS de tener peso/reps (o completada) — no confundir con sugerencia
    const vsLast = useMemo(
        () => setDeltaLabel(
            { weight: set.weight, reps: set.reps },
            lastSet ? { weight: lastSet.weight, reps: lastSet.reps } : null
        ),
        [set.weight, set.reps, lastSet]
    );

    const showSuggestion = !isLocked && !set.completed && !!setSuggestion;

    return (
        <div className={`group relative rounded-2xl p-3 transition-all duration-300 ${set.completed
            ? 'bg-[var(--success)]/10 ring-1 ring-[var(--success)]/50'
            : 'bg-[var(--bg-card)] border border-[var(--border)]'
            }`}>
            <div className="grid grid-cols-10 gap-3 items-center">
                {/* Número de serie horizontal — más legible en móvil que el label vertical */}
                <div className="col-span-1 flex flex-col items-start pt-3 gap-1">
                    <span
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black tabular-nums ${set.completed
                            ? 'bg-[var(--success)] text-white'
                            : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'
                            }`}
                        aria-hidden
                    >
                        {index + 1}
                    </span>
                </div>
                <div className="col-span-7 space-y-2">
                    {!isUnilateral ? (
                        /* Bilateral: standard weight + reps row */
                        <div className="grid grid-cols-2 gap-3">
                            <div className="relative">
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={set.weight}
                                    onFocus={handleFocus}
                                    onChange={(e) => onUpdate(index, 'weight', e.target.value)}
                                    placeholder="0"
                                    readOnly={isLocked}
                                    aria-label={`Serie ${index + 1} peso`}
                                    className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.weight ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                        } ${isLocked ? 'opacity-60' : 'focus:ring-[var(--primary)]/50 focus:bg-[var(--bg-dark)]'}`}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">KG</span>
                            </div>
                            <div className="relative">
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={set.reps}
                                    onFocus={handleFocus}
                                    onChange={(e) => onUpdate(index, 'reps', e.target.value)}
                                    placeholder="0"
                                    readOnly={isLocked}
                                    aria-label={`Serie ${index + 1} reps`}
                                    className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.reps ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                        } ${isLocked ? 'opacity-60' : 'focus:ring-[var(--primary)]/50 focus:bg-[var(--bg-dark)]'}`}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">REP</span>
                            </div>
                        </div>
                    ) : (
                        /* Unilateral: separate L/R rows for weight + reps */
                        <div className="space-y-2">
                            {/* Left side */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={set.weight}
                                        onFocus={handleFocus}
                                        onChange={(e) => onUpdate(index, 'weight', e.target.value)}
                                        aria-label={`Serie ${index + 1} peso izquierdo`}
                                        placeholder="0"
                                        readOnly={isLocked}
                                        className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.weight ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                            } ${isLocked ? 'opacity-60' : 'focus:ring-[var(--primary)]/50 focus:bg-[var(--bg-dark)]'}`}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">KG</span>
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 pointer-events-none font-bold">IZQ</span>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={set.reps}
                                        onFocus={handleFocus}
                                        onChange={(e) => onUpdate(index, 'reps', e.target.value)}
                                        aria-label={`Serie ${index + 1} reps izquierdas`}
                                        placeholder="0"
                                        readOnly={isLocked}
                                        className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.reps ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                            } ${isLocked ? 'opacity-60' : 'focus:ring-[var(--primary)]/50 focus:bg-[var(--bg-dark)]'}`}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">REP</span>
                                </div>
                            </div>
                            {/* Right side */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={set.weightR || ''}
                                        onFocus={handleFocus}
                                        onChange={(e) => onUpdate(index, 'weightR', e.target.value)}
                                        aria-label={`Serie ${index + 1} peso derecho`}
                                        placeholder="0"
                                        readOnly={isLocked}
                                        className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.weightR ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                            } ${isLocked ? 'opacity-60' : 'focus:ring-orange-500/50 focus:bg-[var(--bg-dark)]'}`}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">KG</span>
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-orange-400 pointer-events-none font-bold">DER</span>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={set.repsR || ''}
                                        onFocus={handleFocus}
                                        onChange={(e) => onUpdate(index, 'repsR', e.target.value)}
                                        aria-label={`Serie ${index + 1} reps derechas`}
                                        placeholder="0"
                                        readOnly={isLocked}
                                        className={`w-full bg-[var(--bg-dark)]/50 rounded-xl py-3 px-1 text-center text-xl font-bold tabular-nums focus:outline-none focus:ring-2 transition-all ${set.repsR ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                                            } ${isLocked ? 'opacity-60' : 'focus:ring-orange-500/50 focus:bg-[var(--bg-dark)]'}`}
                                    />
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-secondary)] pointer-events-none font-medium">REP</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* RIR — obligatorio al completar (también se pide en modal) */}
                    <div className={`flex items-center rounded-xl p-1 min-h-[44px] ${
                        !isLocked && !set.completed && set.rir == null && set.weight && set.reps
                            ? 'bg-[var(--warning)]/10 ring-1 ring-[var(--warning)]/40'
                            : 'bg-[var(--bg-dark)]/50'
                    }`}>
                        <span className="text-[10px] text-[var(--text-secondary)] w-8 text-center font-bold shrink-0">RIR</span>
                        <div className="flex flex-1 justify-end gap-1 h-full min-h-[44px]">
                            {RIR_QUESTIONS.map(({ value: rir, label }) => (
                                <button
                                    key={rir}
                                    type="button"
                                    onClick={() => onSetRIR(index, rir)}
                                    disabled={isLocked}
                                    aria-label={`RIR ${rir}`}
                                    aria-pressed={set.rir === rir}
                                    className={`flex-1 min-h-[40px] min-w-[44px] rounded-lg flex items-center justify-center text-xs font-bold transition-all ${set.rir === rir
                                        ? 'bg-[var(--primary)] text-white shadow-sm'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Check Button — única forma de marcar la serie completa (dispara descanso) */}
                <div className="col-span-2 flex justify-end">
                    <button
                        onClick={() => onToggle(index)}
                        disabled={isLocked}
                        aria-label={set.completed ? `Serie ${index + 1} completada` : `Marcar serie ${index + 1} completada`}
                        aria-pressed={set.completed}
                        className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${set.completed
                            ? 'bg-[var(--success)] text-white shadow-lg shadow-[var(--success)]/30 scale-105'
                            : 'bg-[var(--bg-dark)] border-2 border-[var(--border)] text-[var(--text-tertiary)] hover:border-[var(--primary)] hover:text-[var(--primary)]'
                            }`}
                    >
                        <Check size={24} strokeWidth={set.completed ? 3 : 2} />
                    </button>
                </div>
            </div>

            {/* Izq = sesión pasada · Der = sugerencia de ESTA serie (naranja) o delta si ya escribiste */}
            {(lastSet || showSuggestion || vsLast) && (
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px] px-1">
                    {lastSet ? (
                        <span className="text-[var(--text-secondary)] tabular-nums">
                            Última:{' '}
                            <span className="font-semibold text-[var(--text-primary)]/80">
                                {lastSet.weight} kg × {lastSet.reps}
                            </span>
                        </span>
                    ) : <span />}
                    {showSuggestion ? (
                        <button
                            type="button"
                            onClick={() => setSuggestion && onApplySetSuggestion?.(index, setSuggestion)}
                            title={setSuggestion?.rationale || 'Aplicar sugerencia de esta serie'}
                            className="font-bold tabular-nums text-orange-400 active:scale-95 flex items-center gap-1 min-h-[44px]"
                        >
                            <Sparkles size={10} className="shrink-0" aria-hidden />
                            Sugerido {setSuggestion?.weight}×{setSuggestion?.reps}
                        </button>
                    ) : vsLast ? (
                        <span className={`font-bold tabular-nums ${
                            vsLast.tone === 'up' ? 'text-[var(--success)]'
                            : vsLast.tone === 'down' ? 'text-red-400'
                            : 'text-[var(--text-secondary)]'
                        }`}>
                            {vsLast.text}
                        </span>
                    ) : null}
                </div>
            )}

            {/* PR Badge */}
            {isPR && (
                <div className="absolute -top-2 -right-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 animate-in zoom-in z-20">
                    <Sparkles size={10} fill="currentColor" /> PR
                </div>
            )}
        </div>
    );
});
export default SetCard;
