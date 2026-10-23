# Análisis deportivo compartido — cierre de Fase 5

El código vigente prevalece sobre los inventarios históricos. Dominio puro:
`packages/shared/src/domain/training/`; adaptadores ESM/CJS reproducibles mediante
`npm run build:typed`. Express, React, consultas, autorización y transacciones
siguen fuera del dominio. No se implementan Coach, Smart Loading 2.0 ni Fase 6.

## Políticas e integración 5.4

| Área | Política conservada / consumidor real |
| --- | --- |
| Identidad | `exerciseIdentity.ts`: misma normalización conservadora de nombres, equipo y paréntesis musculares. Dos exerciseName JS delegan; PR conserva identidad case-insensitive propia. |
| Historial | `groupTrainingHistory`: mínimos independientes de lados, parseFloat/parseInt, Epley cap36, mejor por día, sesiones ASC, todos los sets. `best1RMRecent` y `bestOneRepMaxForTarget` mantienen últimas3 y últimas3 **elegibles**. Goals mantiene su política de día del dispositivo/proceso explícita; `{calendarPolicy:'cdmx-civil'}` selecciona CDMX sin reescribir historial ni achievedAt. |
| Plateau | `progress.ts`: mínimo4 días, ventana últimas6, mitades floor/ceil, máximo reciente <= antiguo. Backend usa lado débil y regla PR 1<reps<37; frontend compara best1RM suministrado, normalmente capped. Empates cuentan, RIR/RPE no ajustan puntuación. No se inventa umbral de regresión. |
| Muestra | Trigger por ID y todos sus logs; estadísticas por nombre lowercase, últimos10 logs dentro de200 globales, solo ejercicios con PR. Se conserva cada alcance. Rutina/ID nuevo puede perder muestra; nombre puede reunir rutinas. Días sin trabajo y sets incompletos cuentan por compatibilidad; cuatro días vacíos pueden señalar plateau. No es medición de fatiga ni prueba deportiva suficiente por sí sola. |
| Tendencia | `linearRegression`: mismo O(n), x sigue siendo índice de sesión. R² y frecuencia declarada no son recuperación ni certeza fisiológica. Plan Goal visual permanece JS con sus fases, rejilla5kg y reglas distintas de RoutineBlock/Smart. |
| Mesociclos | `mesocycles.ts`: último startedAt no null, empate primero; tiempo transcurrido en semanas7×24h, semana0/futura y ausencias largas conservadas. `routinePhaseStatusAt` recibe now; bloque domina sobre adaptive, expiración estricta until>now. durationWeeks informativa. Wrappers en logic suministran reloj y alimentan rutinas/Atajos/Smart. |
| Descarga | Orquestador sigue backend: cooldown7d, volumen izquierdo actual<85% previo con previo>0, >=3 ejercicios plateau, ventana7d; no doble10% en intra. Cinco reducers de volumen de overview/home/progress-page y descarga delegan a shared. Consultas, selección, writes y umbrales intactos. |

**Avance de bloques:** el código y la guía histórica expresan selección por inicio
manual, no definen sucesor, expiración, reinicio ni efecto de ausencias. No hay
evidencia para activar avance automático. Queda bloqueada únicamente esa decisión
de producto; no bloquea la extracción ni las verificaciones.

## Volumen: unidades y cambio de lectura aprobado en esta fase

`trainingLoadVolume` calcula kg×rep sin redondear por serie. Se conserva orden de
suma IEEE-754; los endpoints redondean al final como antes. `trainingSessionLoadSummary`
cuenta filas además de carga y suma secuencialmente incluso entre sesiones.

| Política | L80×10, derecha0×0 | L80×10, solo peso derecho60 | Uso |
| --- | ---: | ---: | --- |
| recorded-sides |800|800| overview/home/progress-page; derecha parcial aporta0 |
| left-only |800|800| descarga; rutina/progress conservan su variante izquierda |
| inherit-missing-right |800|1400| comparación ExportReport y PDFs corregidos; ausencia nullish hereda cada campo |
| legacy-pdf-zero-fallback |1600|1400| referencia explícita reproducible de PDFs recibidos, sin consumidores de presentación activos |

**Corrección activa exclusivamente de presentación:** PDFs de día y sesión
respetan cero derecho; ya no sustituyen0 por la izquierda. Cambia el cálculo del
PDF generado de registros que contienen ese cero, no el registro ni estadísticas
persistidas. Los adaptadores PDF y jsPDF/autoTable reales se verifican en Edge.
No se cambia la selección e1RM del PDF, que tiene otra regla histórica.

Workout conserva parseFloat, aliases weightR/repsR, filtros positivos y finitos
por lado sin herencia. Esa política de formulario difiere de las estadísticas y
se caracteriza separadamente; no se convierte a otra por accidente. `completed`
lo filtra cada caller cuando lo hacía; no se introduce un filtro global.

Filas registradas/completadas, días con actividad, frecuencia, carga y esfuerzo
son métricas distintas. No existe volumen muscular fraccionado ni volumen de
carga planificado universal: targetReps puede ser un rango y no fija peso.
Planes Goal son prescripciones; no se confunden con trabajo realizado. Una etiqueta
muscleGroup en Exercise no prueba contribuciones secundarias ni hipertrofia.

## Calendario y compatibilidad

`calendar.ts` separa instantes UTC, fechas civiles CDMX y duraciones. Intl fija
America/Mexico_City; el formateador reutilizado no contiene reloj ni datos de
usuario, y evita reconstrucciones repetidas. Domingo=0; desplazamientos civiles
se anclan en UTC, con mes/año/bisiesto. Semana civil lunes–domingo es distinta de
las ventanas rolling7d y las52 cubetas desde1enero de Progress, que se conservan.

Correcciones de lectura activas: `mexicoCityLastNDays` recorre fechas civiles sin
restar24h, evitando duplicados/omisiones DST; ExportReport compara el día civil
de hace7d mediante shift. No se cambian fechas guardadas ni performedAt.

Solución preparada y probada para límites: `trainingCivilDayBounds` resuelve cada
medianoche independientemente. 2021-04-04=[06Z,05Z día siguiente),23h;
2021-10-31=[05Z,06Z día siguiente),25h. Se verifica bajo UTC/CDMX/Tokyo/Los Angeles.
`legacyTrainingDayBounds`, usado por el wrapper servidor existente, conserva
offset del instante+24h **con su defecto DST conocido**. No se activa globalmente
la corrección sobre escrituras/operaciones/descarga ni sobre reconciliación de
metas: cambiaría selección histórica y requiere política específica. No se
modifican UUID, hashes, payloads pendientes, borradores ni identificadores.

## Reproducción y límites 5.5

Node24.22.0/npm11.19.1, TS5.9.3 y Prisma6.19.3, locks conservados:

```text
npm run build:typed
npm run test:analysis
npm run test:analysis:integration
npm run check:typescript
npm run lint:tooling
npm test
```

Los30 casos nuevos de dominio/Edge y4 HTTP/PG complementan las1,202 pruebas
recibidas. Goldens26 capturados antes, snapshots con SHA256, comparación sembrada,
negativos TS8, pureza/ciclos, inmovilidad y rendimiento; bucles no se cuentan como
pruebas adicionales. Dos suites históricas se adaptan a extracciones deliberadas:
el defecto PDF sigue comprobándose contra snapshot, el nuevo resultado se prueba
en el consumidor real; el guard de index reconstruye exactamente la fuente recibida
deshaciendo solo cinco sustituciones de reducers y un import. Smart y Workout
mantienen sus garantías y el JSX de Workout no cambia.

Resultados finales, diagnóstico de intentos, restricciones pendientes de producto,
entorno, evidencia y preparación Coach/Fase6:
[PHASE-5-COMPLETE](../server/audit/training-engine/PHASE-5-COMPLETE.md).
Baseline **PROVISIONAL**, sincronización nueva deshabilitada en producción.
