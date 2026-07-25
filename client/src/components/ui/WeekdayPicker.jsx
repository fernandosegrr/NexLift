import { WEEKDAY_OPTIONS } from '../../utils/routineDays';

const LETTERS = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' };

// Clases completas y literales por estado — nunca interpoladas (el
// compilador de Tailwind solo genera clases que ve como texto literal, ver
// gotcha de PHASE_BANNER en Workout.jsx / CLAUDE.md).
const STATE_CLASSES = {
    selected: 'bg-[var(--primary)] text-white border border-[var(--primary)]',
    taken: 'bg-[var(--bg-card)] text-[var(--warning)]/70 border border-[var(--warning)]/30',
    free: 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)]'
};

// Fila de 7 chips (Lunes→Domingo) para asignar el día de la semana de un
// RoutineDay. Se ve la semana entera de un golpe, que es lo que hace obvio un
// hueco o un conflicto — un <select> por día los esconde.
//
// `value`: weekday (0-6) asignado a este día, o null.
// `takenBy`: { [weekday]: nombreDelOtroDía } de los DEMÁS días de la rutina.
// `onChange(weekday | null)`: click en un chip libre/tomado asigna; click en
// el chip ya seleccionado lo limpia. Mover un weekday tomado por otro día
// (toast incluido) es responsabilidad del llamador, no de este componente.
export default function WeekdayPicker({ value, takenBy = {}, onChange }) {
    return (
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Día de la semana">
            {WEEKDAY_OPTIONS.map(({ value: weekday, label }) => {
                const isSelected = value === weekday;
                const takenLabel = !isSelected ? takenBy[weekday] : null;
                const state = isSelected ? 'selected' : takenLabel ? 'taken' : 'free';

                return (
                    <button
                        key={weekday}
                        type="button"
                        onClick={() => onChange(isSelected ? null : weekday)}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={takenLabel ? `Ya asignado a "${takenLabel}"` : label}
                        className={`min-h-[44px] rounded-lg text-sm font-semibold transition-colors active:scale-95 ${STATE_CLASSES[state]}`}
                    >
                        {LETTERS[weekday]}
                    </button>
                );
            })}
        </div>
    );
}
