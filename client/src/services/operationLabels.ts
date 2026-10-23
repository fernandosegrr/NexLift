export const operationLabels = {
    pending: 'Entrenamiento guardado en este dispositivo', syncing: 'Sincronizando', confirmed: 'Entrenamiento sincronizado',
    retry_scheduled: 'Reintento programado; datos conservados', paused_auth: 'Pausada: inicia sesión con la cuenta propietaria',
    conflict: 'Hay un conflicto que requiere revisión', blocked_validation: 'Datos bloqueados para revisión',
    blocked_forbidden: 'Sin permiso para enviar; datos conservados', blocked_incompatible: 'Protocolo incompatible; datos conservados',
    blocked_dependency: 'Hay una operación relacionada que requiere revisión',
    blocked_migration: 'La copia de un registro antiguo requiere revisión; originales conservados',
    resolved_preserved: 'Decisión revisada; original conservado en este dispositivo'
};
export type OperationPresentationState = keyof typeof operationLabels;
