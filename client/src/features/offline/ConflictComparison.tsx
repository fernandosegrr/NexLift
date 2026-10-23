import type { ReactElement } from 'react';
export interface Difference { key: string; field: string; target: string; conflict?: boolean; prAffected?: boolean; explanation?: string; original?: unknown; local?: unknown; remote?: unknown; localChanged?: boolean; incompatible?: boolean; selectable?: boolean }
interface Props { differences: readonly Difference[]; selected: readonly string[]; onSelect: (key: string, local: boolean) => void }
export const labels: Record<string, string> = { weight: 'Peso (kg)', reps: 'Repeticiones', rpe: 'RPE (10 − RIR)', completed: 'Serie completada',
    weightRight: 'Peso derecho (kg)', repsRight: 'Repeticiones derechas', notes: 'Notas', date: 'Fecha original',
    order: 'Orden de series', added: 'Serie añadida', removed: 'Serie eliminada', isUnilateral: 'Ejercicio unilateral', deleted: 'Eliminar entrenamiento completo' };
export const show = (value: unknown): string => value === undefined ? 'Sin base verificable' : value === null ? 'Sin valor / eliminado' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export default function ConflictComparison({ differences, selected, onSelect }: Props): ReactElement {
    return (<div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th>Campo / serie</th><th>Original</th><th>Local</th><th>Servidor</th><th>Conservar</th></tr></thead>
                <tbody>{differences.map(d => <tr key={d.key} className="border-t border-[var(--border)]">
                    <th>{labels[d.field] || d.field} {d.target !== 'session' && d.target !== 'exercise' ? `· ${d.target}` : ''}{d.conflict && ' · dos modificaciones distintas'}{d.prAffected && ' · puede afectar récords'}{d.explanation && <p>{d.explanation}</p>}</th>
                    <td className="p-2">{show(d.original)}</td><td className="p-2">{show(d.local)}</td><td className="p-2">{show(d.remote)}</td>
                    <td>{d.localChanged && !d.incompatible && d.selectable !== false ? <select aria-label={`Conservar ${d.key}`} value={selected.includes(d.key) ? 'local' : 'remote'}
                        onChange={e => onSelect(d.key, e.target.value === 'local')}><option value="remote">Servidor</option><option value="local">Mi cambio local</option></select> : 'Servidor / revisión requerida'}</td>
                </tr>)}</tbody></table></div>);
}
