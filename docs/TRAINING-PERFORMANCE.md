> Cierre de Fase 5 (5.4–5.5): [políticas, correcciones e integración vigentes](TRAINING-ANALYSIS.md).
> El contenido de fases anteriores se conserva como referencia histórica.

> Fase 5.3: [Smart Loading compartido, reglas y consumidores actuales](TRAINING-SMART-LOADING.md).
> Las ubicaciones y limitaciones de fases anteriores se conservan debajo como referencia histórica.

# Esfuerzo y rendimiento — Fase 5.2

El dominio continúa la [auditoría 5.1](TRAINING-ENGINE-AUDIT.md), sin transformar
datos históricos. Baseline **PROVISIONAL**; sincronización nueva deshabilitada en
producción. No incluye Smart Loading 5.3 ni Coach.

## Esfuerzo contextual

`UserRir` son repeticiones en reserva declaradas; `StoredRpe` es la convención
histórica de SetLog.rpe; `InferredRir` es lo inferido al leerla. Cada tipo lleva
`kind` y `value`: un número sin etiqueta no entra en las conversiones de dominio.
Los adaptadores de formulario aceptan números nullable, con contexto en su nombre.
Los tipos no validan JSON ni afirman medir fatiga objetivamente.

`rirToStoredRpe` / `storedRpeToRir` calculan `10-value`, sin clamp o redondeo.
`formRirToStoredRpe` / `storedRpeToFormRir` conservan null/undefined como null y
cero como significativo. RPE antiguo 0–10 puede producir RIR inferido 10–0,
aunque los botones actuales sean 0–3. No se reconvierten registros anteriores.

`parseLegacyShortcutEffort` es exclusivo de log-set legacy:

- rir presente no vacío tiene prioridad; fuera de 0–4 se rechaza aunque rpe sea
  válido. Conserva parseFloat, decimales y coerciones como `2junk`.
- rpe 0–4 significa RIR; rpe 6–10 significa almacenado. Se rechaza todo (4,6),
  incluido 5, con el mensaje anterior.
- null/undefined/vacío/blanco producen `missing-default`, RIR0/RPE10.
- `convertLegacyShortcutRir` conserva el helper histórico sin límite de rango;
  no valida requests y conserva errores de coerción, incluido Symbol.

`parseCanonicalWorkoutEffort` interpreta v1 sin parámetro source. Números finitos
y enteros; rir opcional 0–4 y rpe simultáneo exactamente concordante. RPE0–4 sigue
almacenado incluso con source=shortcut; rpe5 no es el hueco legacy. Ausencia y
null siguen diferenciados. El sanitizer establecido sigue aplicando rango
almacenado 0–10 y obligatoriedad para trabajo positivo. Este parser no reemplaza
la validación completa de serie.

`readSetInput` conserva recorrido/prioridad de validación de todos los campos;
delega únicamente esfuerzo. Campo, código y texto de errores se preservan mediante
el adaptador de contratos. Backups/importaciones no utilizan el parser de Atajos.

## Políticas explícitas

Carga y e1RM son kg; reps es conteo. e1RM no es 1RM medido, crecimiento muscular
demostrado ni recomendación fisiológica. No se introduce fórmula universal.

| Concepto | Regla anterior y actual | Consumidores / compatibilidad | Casos y riesgo restante |
| --- | --- | --- | --- |
| Historial/metas | Number\|\|0; sin trabajo→0; single→peso; cap36; w*(1+r/30) | cappedEpley1RM de 5.1; ambos exerciseName | 80×37→176, diferente de PR |
| PR | Tras Number\|\|0, omite w<=0/r<=0; extrapola solo 1<r<37; resto→w | personalRecordEpley1RM + selectHistoricalPersonalRecord; backend recalcPRForExercise | 1/10/36/37, decimales/coerciones; inputs legacy infinitos fuera del dominio API se preservan |
| Comparación | `>` binario exacto; primero gana empate | Selector sin ordenar ni redondear | 80×10=106.66666666666666; 100×2=106.66666666666667 gana; sin epsilon |
| Orden | Consulta fecha ASC; sets sin orden SQL explícito | Backend conserva consulta y fecha original opaca | Misma fecha no establece orden total; añadir IDs cambiaría ganadores y requiere decisión |
| Unilateral PR | Izquierda primero; cada derecho nullish hereda izquierdo; gana mejor candidato; completed no filtra | Selector compartido; cero no se sustituye | Derecho0×0, parcial/incompleto, mejor derecho; no es promedio ni mínimo Smart |
| Fuerza visual | Single→w, resto extrapola sin cap; una decimal | strength intacto | 80×10→106.7; separar presentación de comparación persistida |
| Workout/reporte | Extrapolan incluso single; selección propia de serie/lados | Intactos | Propósito distinto de PR; no consolidar accidentalmente |
| PDF | Variantes single/extrapolación; fallback derecho por \|\| | Intacto | Cero/parcial mantienen divergencias; futura evaluación histórica |
| Volumen | kg×rep, políticas de lados/ausencias por consumidor | No se añade otra implementación ni métricas UI | Workout/backend no equivalen a PDF; no es volumen efectivo por músculo |
| Formularios | Ausencia→null; RIR↔10-RPE | Workout/EditSession usan shared vía generated | Equivalencia exacta de expresiones y Edge |
| Atajo/v1 | Dos políticas contextuales anteriores | Sanitizer legacy y readSetInput reales | Rejillas, runtime, HTTP/SQL y hash canónico |

Se conserva el orden de operaciones flotantes. Antes de persistir la igualdad es
exacta. Prisma/PostgreSQL puede presentar 106.6666666666667 tras serializar ambos
estimados próximos; las pruebas persistentes comparan exactamente el adaptador
recibido y el nuevo a través de la misma frontera. No autoriza redondear antes de
seleccionar el PR. No se introduce tolerancia para ocultar diferencias.

## Transacciones y métricas seleccionadas

La consulta con propietario, nombre case-insensitive/fecha ASC y deleteMany/create
de PR permanecen en personalRecords.js, con el client del llamador. Mismo número
de consultas, sin transacción anidada. Crear/editar/eliminar, Atajos, operaciones,
resoluciones y reintentos conservan Serializable, locks y comprobantes. Shared no
importa Prisma, React, Express, reloj, HTTP ni SQL; no escribe en IndexedDB.

Los formularios migran solo conversiones nullable al leer/guardar/mostrar. Payload,
fecha original, IDs/versiones y borradores permanecen intactos. La métrica extraída
es mejor rendimiento histórico con su carga, reps, e1RM y fecha, O(series), memoria
auxiliar O(1), sin mutación ni consultas nuevas. No se agregan series efectivas,
volumen muscular, porcentajes nuevos ni recomputación del historial en renders.

`HistoricalPrSession<DateValue>` lleva fecha opaca y arrays readonly; no es DTO
HTTP ni normalización universal Smart. Para 5.3 quedan tipos de esfuerzo con
contexto y políticas nombradas disponibles; cada consumidor deberá elegir la
frontera adecuada. No cambian umbrales plateau/deload, fechas CDMX ni las
divergencias DST/agrupación de 5.1.

## Verificación

`npm run test:performance`: 28 pruebas planas de dominio, equivalencia, tipos,
consumidor, determinismo, rendimiento y reproducción del harness. Rejillas de
29×29, 160 historias aleatorias y ocho diagnósticos controlados se cuentan dentro
de sus casos respectivos. `npm run test:performance:integration`: cuatro casos
HTTP/PostgreSQL desechable (esfuerzo, propietario, unilateralidad, rollback).
Total esperado: 1,141 anteriores +32 nuevas = **1,173 únicas**, repeticiones aparte.

El harness offline heredaba NODE_ENV=test pero forzaba PROD/SW=true: el build
incluía React development y repetición de efectos StrictMode. La reproducción
contrasta los módulos React realmente incluidos. Los dos builds del ensayo se
compilan coherentemente en producción y restauran NODE_ENV, también ante error.
El click CDP espera controles unilaterales antes de escribir. Se conservan las
60 aserciones anteriores, acciones, timeouts y escenarios. El diagnóstico de
fallo registra solo estados sintéticos/requests sin headers de autorización.
Esto no demuestra que los restantes fallos offline estén resueltos: consultar
[resultados y límites de ejecución](../server/audit/training-engine/PHASE-5.2.md).
