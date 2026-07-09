// Ajusta el rango de reps objetivo según la fase del bloque activo (si hay uno) —
// idéntico a server/src/logic.js (adjustRepRangeForPhase) / server/src/index.js
// original. NO modifica el rango guardado del ejercicio, solo el usado para ESTA
// sugerencia: intensificación lo reduce a la mitad (más peso, menos reps),
// acumulación sube el techo 50% (más reps antes de subir peso). Descarga/
// personalizado/sin bloque activo: rango sin cambios.
//
// Extraída de Workout.jsx (P1 del plan de mejoras) para poder testear paridad
// exacta contra la copia del servidor sin levantar ni la DB ni el navegador — ver
// client/src/utils/smartLoading.parity.test.js.
export function adjustRepRangeForPhase(lo, hi, phase) {
    if (phase === 'intensification') {
        const newLo = Math.max(1, Math.round(lo * 0.5));
        return { lo: newLo, hi: Math.max(newLo, Math.round(hi * 0.5)) };
    }
    if (phase === 'accumulation') {
        return { lo, hi: Math.round(hi * 1.5) };
    }
    return { lo, hi };
}
