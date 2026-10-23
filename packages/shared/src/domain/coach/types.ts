export const COACH_VERSION = 'coach-1' as const;
export const COACH_MUSCLES = ['chest', 'back', 'shoulders', 'legs', 'biceps', 'triceps', 'forearms', 'core'] as const;
export type CoachMuscle = typeof COACH_MUSCLES[number];
export interface CoachSet {
    id?: string; weight: number; reps: number; rpe: number | null; completed: boolean;
    weightRight?: number | null; repsRight?: number | null;
}
export interface CoachExercise {
    id: string; name: string; muscleGroup: string | null; targetReps: string; isUnilateral: boolean;
}
export interface CoachSession {
    id: string; exerciseId: string; date: string; name: string; muscleGroup: string | null;
    unilateral: boolean | null; routineId: string | null; blockId: string | null; phase: string | null;
    /** Only recorded, comparable context; do not reconstruct old equipment from today's prescription. */
    equipment?: string | null; repRange?: string | null;
    sets: CoachSet[];
}
export interface CoachCheckIn {
    date: string; sleepHours: number | null; sleepQuality: number | null; energy: number | null;
    fatigue: number | null; stress: number | null; soreness: Partial<Record<CoachMuscle, number>>;
}
export interface CoachExerciseConfig {
    exerciseId: string; directMuscle: CoachMuscle | null; secondaryMuscles: CoachMuscle[];
    indirectWeight: number; equipment: string | null; increment: number | null; availableLoads: number[];
    updatedAt: string;
}
export interface CoachMeasurement { id: string; date: string; zone: CoachMuscle; cm: number; quality: 'consistent' | 'variable' | 'unknown' }
export interface CoachBodyPoint { id: string; date: string; weight: number | null; muscleMass: number | null; photoUrl: string | null }
export interface CoachBlock { id: string; name: string; routineId: string; phase: string; startedAt: string }
export interface CoachInput {
    now: string; days: number; sessions: CoachSession[]; exercises: CoachExercise[]; configs: CoachExerciseConfig[];
    checkIns: CoachCheckIn[]; body: CoachBodyPoint[]; measurements: CoachMeasurement[]; blocks: CoachBlock[];
    truncated: boolean;
}
export interface VolumeContribution { sessionId: string; exerciseId: string; name: string; routineId: string | null; blockId: string | null; direct: number; indirect: number; source: string }
export interface MuscleWeek {
    muscle: CoachMuscle; week: string; direct: number; indirect: number; frequency: number;
    previousDirect: number | null; directDelta: number | null; loadKgReps: number; contributions: VolumeContribution[];
}
export interface CoachVolume { weeks: MuscleWeek[]; unknown: { exerciseId: string; name: string; sets: number }[]; policy: string; partialCurrentWeek: boolean }
export interface CoachRecovery {
    status: 'insufficient' | 'usual' | 'caution'; observations: string[]; hypotheses: string[]; limitations: string[];
    recent: { field: string; value: number; baseline: number | null; n: number; baselineN: number }[];
    trainingDays: number; restDaysSinceLast: number | null; loadRecent: number; loadPrevious: number;
    rirRecent: number | null; rirPrevious: number | null;
}
export type PlateauState = 'insufficient' | 'maintenance' | 'progress' | 'possible_plateau' | 'regression' | 'contradictory' | 'context_changed';
export const COACH_STATE_LABELS: Record<PlateauState, string> = { insufficient: 'Historial insuficiente', maintenance: 'Mantenimiento normal', progress: 'Progreso detectado', possible_plateau: 'Posible estancamiento', regression: 'Regresión observada', contradictory: 'Señales contradictorias', context_changed: 'Contexto no comparable' };
export const COACH_RULE_LABELS: Record<string, string> = {
    insufficient: 'Faltan al menos dos sesiones con trabajo registrado.', 'missing-rir-or-incomplete': 'Falta RIR o hay series incompletas en la referencia.', 'configure-equipment': 'Confirma el equipo y sus incrementos disponibles.',
    'unilateral-not-comparable': 'Faltan ambos lados comparables para una sugerencia única.', 'stale-or-outlier': 'La referencia es antigua o la carga cambió demasiado.', 'same-day-not-independent': 'Dos registros del mismo día no son sesiones independientes.',
    'context-changed': 'Cambió el contexto de entrenamiento.', 'mesocycle-context-changed': 'Inició otro mesociclo; falta rendimiento comparable en el bloque nuevo.',
    'planned-deload-review': 'Hay una descarga planificada. Revisa la carga dentro de ese contexto.', 'recovery-hold': 'Mantener la carga mientras revisas los cambios de bienestar.', 'effort-hold': 'Mantener la carga por esfuerzo alto o repeticiones bajo el rango.',
    'all-at-target': 'Todas las series al peso de referencia alcanzaron el techo con reserva.', 'equipment-ceiling': 'Ya alcanzaste la mayor carga configurada.', 'individual-rep-progression': 'Probar una repetición más antes de aumentar la carga.',
    'reference-outside-equipment': 'La referencia no coincide con las cargas disponibles.', 'jump-guard': 'El incremento disponible excede el límite prudente de esta versión.'
};
export const COACH_FIELD_LABELS: Record<string, string> = { sleepHours: 'Horas de sueño', sleepQuality: 'Calidad del sueño', energy: 'Energía', fatigue: 'Fatiga', stress: 'Estrés' };
export interface CoachPlateau {
    exerciseId: string; name: string; state: PlateauState; sessions: number; from: string | null; to: string | null;
    previous: number | null; recent: number | null; previousReps: number | null; recentReps: number | null;
    previousRir: number | null; recentRir: number | null; lastTrainedDays: number | null;
    evidence: 'insufficient' | 'limited' | 'repeated'; observations: string[]; hypotheses: string[]; missing: string[]; action: string;
    points: { date: string; e1rm: number; sets: number; reps: number; rir: number | null; load: number }[];
    corePlateau: boolean;
}
export interface CoachLoading {
    exerciseId: string; recommendation: { weight: number; reps: number } | null;
    reference: { sessionId: string; weight: number; reps: number; rir: number | null; source: 'history' | 'current-input' } | null;
    rule: string; increment: number | null; delta: number | null; equipment: string | null;
    adjustment: string; evidence: 'insufficient' | 'limited' | 'repeated'; limitations: string[];
    v1: { weight: number; reps: number; rationale: string } | null;
}
export interface CoachHypertrophy {
    weight: { date: string; value: number }[]; measurements: CoachMeasurement[];
    changes: { metric: string; from: string; to: string; before: number; after: number; delta: number }[];
    training: { days: number; sessions: number; completedSets: number; loadKgReps: number; previousLoadKgReps: number };
    photos: { date: string; url: string }[]; limitations: string[];
}
export type CoachView = 'volume' | 'recovery' | 'plateau' | 'loading' | 'hypertrophy' | 'timeline';
export interface CoachFact { id: string; view: CoachView; text: string; externalSafe: boolean }
export interface CoachReport {
    version: typeof COACH_VERSION; now: string; days: number; truncated: boolean;
    volume: CoachVolume; recovery: CoachRecovery; plateaus: CoachPlateau[]; loading: CoachLoading[];
    hypertrophy: CoachHypertrophy; blocks: CoachBlock[]; facts: CoachFact[];
    blockPerformance: { blockId: string; exerciseId: string; name: string; phase: string | null; days: number; sets: number; load: number; firstE1rm: number | null; lastE1rm: number | null }[];
}
export interface CoachAnswer {
    mode: 'deterministic' | 'provider'; intent: CoachView; text: string[]; factIds: string[];
    views: CoachView[]; exerciseId: string | null; followUps: string[]; limitations: string[];
    analysis?: CoachReport;
}
