import type { ReactElement } from 'react';
import { Trash2 } from 'lucide-react';
export interface SessionFormSet { id?: string; weight: string; reps: string; weightRight: string; repsRight: string; rir: number | null; completed?: boolean }
interface Props { set: SessionFormSet; index: number; isUnilateral: boolean; onUpdate: (index: number, field: 'weight' | 'reps' | 'weightRight' | 'repsRight' | 'rir', value: string | number) => void; onRemove: (index: number) => void }
export default function SessionSetRow({ set, index, isUnilateral, onUpdate, onRemove }: Props): ReactElement {
    return (<div
                            
                            className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]"
                        >
                            <div className="flex items-start gap-3">
                                {/* Set Number */}
                                <div className="w-8 h-8 rounded-full bg-[var(--primary)]/20 flex items-center justify-center mt-5">
                                    <span className="text-sm font-bold text-[var(--primary)]">{index + 1}</span>
                                </div>

                                <div className="flex-1 min-w-0 space-y-2">
                                    {/* Left / Bilateral row */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[10px] text-[var(--text-secondary)] block mb-1">
                                                {isUnilateral ? 'PESO IZQ (kg)' : 'PESO (kg)'}
                                            </label>
                                            <input aria-label={`Serie ${index + 1} peso`}                                                 type="number"
                                                inputMode="decimal"
                                                step="0.5"
                                                value={set.weight}
                                                onChange={e => onUpdate(index, 'weight', e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 px-3 text-center font-bold focus:border-[var(--primary)] focus:outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-[var(--text-secondary)] block mb-1">
                                                {isUnilateral ? 'REPS IZQ' : 'REPS'}
                                            </label>
                                            <input aria-label={`Serie ${index + 1} reps`}                                                 type="number"
                                                inputMode="numeric"
                                                value={set.reps}
                                                onChange={e => onUpdate(index, 'reps', e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-lg py-3 px-3 text-center font-bold focus:border-[var(--primary)] focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    {/* Right side row (unilateral only) */}
                                    {isUnilateral && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-[10px] text-orange-400 block mb-1">PESO DER (kg)</label>
                                                <input aria-label={`Serie ${index + 1} peso derecho`}                                                     type="number"
                                                    inputMode="decimal"
                                                    step="0.5"
                                                    value={set.weightRight}
                                                    onChange={e => onUpdate(index, 'weightRight', e.target.value)}
                                                    placeholder="0"
                                                    className="w-full bg-[var(--bg-dark)] border border-orange-500/30 rounded-lg py-3 px-3 text-center font-bold focus:border-orange-500 focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-orange-400 block mb-1">REPS DER</label>
                                                <input aria-label={`Serie ${index + 1} reps derechas`}                                                     type="number"
                                                    inputMode="numeric"
                                                    value={set.repsRight}
                                                    onChange={e => onUpdate(index, 'repsRight', e.target.value)}
                                                    placeholder="0"
                                                    className="w-full bg-[var(--bg-dark)] border border-orange-500/30 rounded-lg py-3 px-3 text-center font-bold focus:border-orange-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {/* RIR obligatorio */}
                                    <div className="flex items-center gap-1 min-h-[44px]">
                                        <span className="text-[10px] font-bold text-[var(--text-secondary)] w-8">RIR</span>
                                        {[0, 1, 2, 3].map(rir => (
                                            <button
                                                key={rir}
                                                type="button"
                                                onClick={() => onUpdate(index, 'rir', rir)}
                                                aria-label={`RIR ${rir}`}
                                                aria-pressed={set.rir === rir}
                                                className={`flex-1 min-h-[44px] rounded-lg text-xs font-bold ${
                                                    set.rir === rir
                                                        ? 'bg-[var(--primary)] text-white'
                                                        : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] border border-[var(--border)]'
                                                }`}
                                            >
                                                {rir === 3 ? '3+' : rir}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Delete Button */}
                                <button
                                    type="button"
                                    aria-label={`Eliminar serie ${index + 1}`}
                                    onClick={() => onRemove(index)}
                                    className="p-2 min-h-[44px] min-w-[44px] text-red-400 hover:bg-red-500/20 rounded-lg mt-4"
                                >
                                    <Trash2 size={18} aria-hidden />
                                </button>
                            </div>
                        </div>);
}
