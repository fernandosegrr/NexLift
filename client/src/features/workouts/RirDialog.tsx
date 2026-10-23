import type { ReactElement } from 'react';
import { Portal } from '../../components/ui/Portal';
import { useDialogFocus } from '../../hooks/useDialogFocus';
const RIR_QUESTIONS = [
    { value: 0, label: '0', desc: 'Al fallo' },
    { value: 1, label: '1', desc: '1 en recámara' },
    { value: 2, label: '2', desc: '2 en recámara' },
    { value: 3, label: '3+', desc: 'Cómodo' }
];


interface Props { index: number; onClose: () => void; onAnswer: (rir: number) => void }
export default function RirDialog({ index, onClose, onAnswer }: Props): ReactElement {
 const focus = useDialogFocus(onClose);
 return (<Portal>
                    <div
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center animate-fade-in"
                        onClick={() => onClose()}
                    >
                        <div
                            className="bg-[var(--bg-card)] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 border border-[var(--border)] shadow-2xl animate-slide-up"
                            onClick={e => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            {...focus}
                            aria-labelledby="rir-prompt-title"
                        >
                            <h3 id="rir-prompt-title" className="text-lg font-bold text-white mb-1">
                                ¿Cuántas te quedaban en la recámara?
                            </h3>
                            <p className="text-sm text-[var(--text-secondary)] mb-4">
                                Serie {index + 1} — el coach ajusta la siguiente con tu RIR
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                {RIR_QUESTIONS.map(({ value, label, desc }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => onAnswer(value)}
                                        className="flex flex-col items-start gap-0.5 p-4 rounded-2xl bg-[var(--bg-dark)] border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/10 active:scale-[0.98] transition-all text-left"
                                    >
                                        <span className="text-2xl font-black text-[var(--primary)] tabular-nums">{label}</span>
                                        <span className="text-xs text-[var(--text-secondary)] font-medium">{desc}</span>
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => onClose()}
                                className="w-full mt-3 py-2.5 text-sm text-[var(--text-secondary)]"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </Portal>);
}
