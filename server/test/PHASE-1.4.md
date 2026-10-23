# NexLift V4.0 — Fase 1.4: contrato de importación de rutinas

Estado: **COMPLETADO**. Fecha de ejecución: 2026-10-18.

La configuración validada se conserva desde los formularios, JSON y plantillas hasta PostgreSQL y la respuesta HTTP. La edición posterior usa el mismo contrato de ejercicios y conserva las protecciones de autorización, archivo e historial de la fase 1.1. La generación diaria de IA y sus reemplazos validan la configuración en la frontera de persistencia, sin modificar las decisiones del entrenador.

## Hallazgos confirmados antes de editar

En el código local, `POST /api/routines/import` leía `exercise.sets || 3`, `exercise.reps || '8-12'` y `exercise.rest || null`, aunque los formularios enviaban `targetSets`, `targetReps` y `restSeconds`. Su objeto de creación no contenía `muscleGroup`.

| Caso original | Enviado | Interpretación anterior | PostgreSQL tras corregir |
|---|---|---|---|
| Series | `targetSets: 4` | `3` | `4` |
| Repeticiones | `targetReps: "4-6"` | `"8-12"` | `"4-6"` |
| Descanso | `restSeconds: 150` | `null` | `150` |
| Grupo muscular | `muscleGroup: "Espalda"` | Omitido | `"Espalda"` |
| Descanso cero | `restSeconds: 0` / `rest: 0` | Ignorado / convertido a `null` | `0` |

La prueba de regresión ejecuta el handler de producción mediante HTTP, consulta PostgreSQL y compara la respuesta con el registro comprometido. No se accedió a registros reales para reproducirlo.

## Recorrido de cada origen

| Origen real | Pérdida o diferencia encontrada | Implementación final |
|---|---|---|
| Manual: `Import.jsx`, `handleSaveManual` | `parseInt` truncaba valores; `|| 3/90` ocultaba entradas inválidas y descansos cero | `buildRoutineFormPayload` conserva entradas; el servidor valida sin truncar |
| JSON: `Import.jsx`, `handleImportJson` | Elegía un alias antes de enviarlo, inventaba nombres, convertía booleanos con `!!`, descartaba órdenes y ejercicios de descanso, sustituía null/cero | Envía el JSON parseado sin reconstruirlo; toda incompatibilidad llega al contrato central |
| Plantillas: `getTemplate`, `EXERCISES` | Reconstrucción local con defaults por truthiness; no respetaba configuraciones en las referencias de la plantilla | Builder único: defaults explícitos solo si no hay valor/alias; respeta overrides; una referencia inexistente falla claramente |
| Nombres por IA: `exerciseAgent.js` | El import y el editor reconstruían objetos incompletos; el editor asociaba veredictos por posición de respuesta | Solo cambia `name`; asocia cada veredicto a su `index`; nunca copia prescripciones o relaciones desde el veredicto |
| Fallback determinista: `canonicalExerciseKey` | Mismas pérdidas en los objetos de persistencia posteriores | Se ejecuta el servicio real sin API key en pruebas; conserva su matching y su normalización de nombres |
| Generación diaria IA: `planToday`, `chooseExercisesForDay` | Prescripciones canónicas, pero persistencia por spread sin la validación común | `normalizeImportedExercise` antes del create anidado; mismo fallback y mismas decisiones |
| Reemplazos IA: `pickReplacementExercises` | Otro camino de creación por spread | Misma normalización antes de archivar o eliminar los reemplazados; no cambia selección ni reglas de entrenamiento |
| Edición: `EditRoutine.jsx`, PUT | El cliente convertía cero/null a 60; el servidor convertía cero a null y omitía músculos en las ramas de actualización, creación y recuperación del archivo | Builder de formulario común y campos normalizados en todas esas ramas; IDs, archivo, locks y validación de pertenencia se conservan |

`api.importRoutine` y `api.updateRoutine` ya serializaban el objeto sin renombrar propiedades. Se conservó ese transporte y se comprobó mediante peticiones HTTP reales desde esos métodos. No existe un handler `POST /api/routines` en el servidor actual; el método cliente `createRoutine` no es el recorrido de creación utilizado por la interfaz. No se inventó una ruta adicional.

## Contrato canónico

```json
{
  "name": "Fuerza",
  "description": "",
  "days": [{
    "dayName": "Domingo",
    "weekday": 0,
    "isRestDay": false,
    "order": 0,
    "splitLabel": "Pull",
    "exercises": [{
      "name": "Remo",
      "muscleGroup": "Espalda",
      "targetSets": 4,
      "targetReps": "4-6",
      "restSeconds": 150,
      "order": 0,
      "isUnilateral": true,
      "note": "Alternar lados"
    }]
  }]
}
```

| Campo de ejercicio | Validación y compatibilidad | Si está ausente / undefined |
|---|---|---|
| `name` | String no vacío, sin espacios exteriores; después puede recibir el nombre canónico del matching existente | Error |
| `muscleGroup` | Catálogo actual español o IDs ingleses; se normaliza a español; admite etiquetas sin acento y `Core / Abdomen` → `Core`; `null`, `""`, `"default"` representan sin asignar. Alias: `muscle` | `null` |
| `targetSets` | Entero positivo hasta 2147483647. Alias: `sets` | `3` |
| `targetReps` | Entero positivo, string de entero, rango ascendente positivo `4-6`, o `AMRAP` ya contemplado por el parser existente. Espacios del rango y guiones tipográficos se normalizan. Alias: `reps` | `"8-12"` |
| `restSeconds` | `null` o entero 0..2147483647. Alias: `rest` | `null` |
| `order` | Entero 0..2147483647; único entre ejercicios del mismo día | Índice del array |
| `isUnilateral` | Booleano estricto; nunca `!!"false"` | `false` |
| `note` | String o `null`; conserva texto, espacios interiores y string vacío | `null` |

Los límites numéricos son los del almacenamiento `Int`, no límites nuevos de entrenamiento de 10 series o 600 segundos. Se admiten strings numéricos completos cuyo valor sea entero (`"4"`, `"4.0"`, `"1.5e2"` para 150 segundos); se rechazan sufijos, hexadecimales, fracciones no enteras, vacío, booleanos, NaN e Infinity. Las repeticiones numéricas y los extremos de rango deben ser positivos y caber en ese intervalo. No se cambia `parseRepRange` ni ningún cálculo de entrenamiento.

Los alias se validan y normalizan **ambos** antes de compararlos: `targetSets: 4` y `sets: "04"` coinciden. `targetSets: 4` y `sets: 3` fallan. `restSeconds: 0` y `rest: null` fallan; cero y null tienen significados distintos. Un campo requerido con null no recibe un default.

Los días requieren `dayName` (o el alias histórico `name`). Sus campos opcionales admitidos son `weekday`, `isRestDay`, `order`, `splitLabel` y `exercises`. `weekday` conserva la resolución existente: 0 es domingo, null es sin asignar, una clave omitida permite inferencia desde el nombre. Valores fuera de 0..6, fracciones, strings y días de semana repetidos fallan. `isRestDay` es booleano; un día de descanso con ejercicios explícitos falla en vez de descartarlos.

Los arrays, objetos y textos se comprueban antes de consultar el catálogo o escribir. Los órdenes deben ser únicos entre hermanos, sin exigir que sean consecutivos o comiencen en cero. Se rechazan IDs de procedencia repetidos entre días o ejercicios de una importación. Repetir un nombre de ejercicio, incluso en un mismo día con órdenes diferentes, sigue permitido: no se elimina ninguna entrada de entrenamiento. Los días sin programar, los días de entrenamiento vacíos y la rutina vacía siguen admitidos como borradores por el contrato del servidor; no se añade un mínimo arbitrario de días o ejercicios. La interfaz manual conserva sus comprobaciones de formulario.

El import crea nuevos IDs. Los IDs, padres, credenciales, historial y metadata no admitida no se asignan a Prisma por spread del input. `userId` procede de la autenticación; `source` e `isActive` conservan los defaults de creación manual, aunque el JSON intente cambiarlos. No se hace `connect` a ejercicios ajenos ni se mueve un ejercicio existente al importar. La restauración de backups, con IDs, bloques, origen y demás entidades, mantiene su contrato independiente de fase 1.3.

## Semántica de formularios y edición

Los formularios mantienen strings numéricos hasta la validación del servidor. Un control opcional de descanso vacío significa limpiar explícitamente a null. `0` no se sustituye por 60/90. La creación manual y las plantillas pueden iniciar el formulario con 3 series, `8-12` y 90 segundos, como antes; son valores iniciales explícitos y no una reparación silenciosa del input inválido.

En el editor, reordenar la lista genera los órdenes de la nueva posición de la interfaz. Un JSON importado con órdenes explícitos los conserva. Se persiste `splitLabel` cuando llega y se conserva el anterior cuando un editor antiguo lo omite.

Para preservar el contrato de PUT de fase 1.1, omitir la colección `exercises` deja intactos sus ejercicios; enviar `[]` ejecuta el archivo o eliminación protegidos existentes. En un ejercicio con ID, omitir músculo, descanso, nota o unilateralidad conserva el valor existente; enviarlo explícitamente lo valida y actualiza. Un ejercicio nuevo recibe los defaults del contrato. Se siguen rechazando IDs ajenos, reasignaciones entre días, duplicados y referencias desconocidas antes de la primera escritura.

Todas las ramas del editor escriben el mismo conjunto de campos normalizados: actualización con/sin historial, renombrado con creación, renombrado con recuperación de un archivado, ejercicio nuevo y recuperación de archivo. No se recalculan ni recrean WorkoutLog, SetLog, PRs o RIR.

## Atomicidad y HTTP

El import anterior usaba un create anidado de Prisma, que ya era atómico; no se atribuye al código anterior una falta de atomicidad que no tenía. Ahora la normalización completa precede al matching y una transacción explícita contiene la creación y lectura de la respuesta. La llamada externa de nombres queda fuera de la transacción. Solo después de su commit se devuelve el `201` y el envelope compatible `{ message, routine }`, con días y ejercicios ordenados y los datos realmente persistidos.

La edición conserva la transacción Serializable, los locks, las comprobaciones dentro de la transacción y los filtros de propietario implementados en fase 1.1. Una validación falla con `400`; errores de unicidad/serialización del import devuelven `409`; una falla inesperada devuelve `500`, nunca éxito parcial. El JSON sintácticamente inválido sigue siendo rechazado por Express antes del handler. Los detalles de campo de esta fase corresponden a JSON válido que llega a la validación del contrato.

Ejemplo de conflicto:

```json
{
  "error": "days[0].exercises[0].targetSets: conflicto entre targetSets y sets",
  "details": [{
    "path": "days[0].exercises[0].targetSets",
    "message": "conflicto entre targetSets y sets"
  }]
}
```

## Pruebas y resultados

| Comando (directorio) | Pruebas aprobadas |
|---|---:|
| `npm test` (server) | 104 |
| `npm run test:integration` (server, fase 1.1) | 48 |
| `npm run test:backup` (server) | 17 |
| `npm run test:backup:integration` (server) | 41 |
| `npm run test:import` (server, nuevo) | 22 |
| `npm run test:import:integration` (server, nuevo) | 39 |
| `npm test -- --no-cache --configLoader native` (client) | 173 |
| **Total** | **444** |

Se mantienen las **369** pruebas anteriores y se agregan **75**: 22 de contrato, 39 de integración PostgreSQL/HTTP y 14 de frontend (9 de builders y 5 de transporte). Cero fallidas, omitidas o canceladas en las ejecuciones finales de estas suites.

La integración nueva usa un clúster PostgreSQL creado con `initdb` en un directorio temporal nuevo, puerto dinámico y escucha únicamente en 127.0.0.1. Rechaza URLs que no correspondan a ese clúster y utiliza datos sintéticos A/B. No carga `.env`, no acepta una URL de base externa y fuerza la API key de OpenAI a vacío. Crea las seis tablas del fixture SQL de la fase 1.1 en esa base nueva, sin migraciones ni db push. Detiene el proceso y comprueba el destino absoluto antes de retirar su directorio temporal.

La integración compara todos los campos de configuración de Exercise, sus padres, el orden y campos de días, la respuesta HTTP y los registros. Comprueba las cuatro plantillas reales (`ppl`, `upper-lower`, `full-body`, `bro-split`), JSON heredado, aliases equivalentes/conflictivos, null/cero/false, datos inválidos al final del grafo, aislamiento de cuentas, veredictos desordenados y campos maliciosos en respuestas de nombres. Un trigger SQL sintético falla dentro de la creación anidada; otra prueba fuerza un error SQL después de las escrituras y antes del commit. Ambas comparan snapshots completos y prueban rollback sin filas parciales.

Se prueban las seis ramas de edición, el recorrido importar → editar y los editores heredados con campos omitidos. Se comparan los WorkoutLog/SetLog existentes, sus IDs, fechas con milisegundos, pesos/repeticiones de ambos lados y RIR sin alteraciones. La suite anterior conserva sus 48 pruebas de referencias, locks, carreras y archivo protegido.

Las prescripciones deterministas de fuerza, hipertrofia y general, incluida la selección para reemplazos, se normalizan y guardan en PostgreSQL con comparación de cada campo. Los veredictos de nombres de IA se simulan por inyección; el fallback determinista se ejecuta realmente. No se invocaron modelos ni servicios de producción. La integración autentica con principales sintéticos; se comprueba además que el registro de rutas real conserva `authMiddleware`. No se declara una prueba E2E en navegador ni una prueba real del proveedor de IA.

Verificaciones adicionales:

- Build cliente exitoso, 2637 módulos. Permanece el aviso previo del chunk PDF de 779.10 kB; no es un error de compilación.
- ESLint de `Import.jsx`, `EditRoutine.jsx`, builder y dos archivos nuevos de pruebas cliente: sin errores ni warnings. No se afirma que todo el repositorio esté libre de incidencias previas de lint.
- `node --check` en index, contrato, rutas y runner de esta fase; comprobación de whitespace y revisión de diff.
- Sin cambios en `schema.prisma`, lockfiles, algoritmos de `logic.js`, `aiRoutineAgent.js`, `aiRoutineService.js`, `exerciseAgent.js` o `splitTemplates.js`.

## Archivos de esta fase

Nuevos:

- `server/src/services/routineImportContract.js`: validación, normalización y alias.
- `server/src/routes/importRoutine.js`: handler inyectable, resolución de nombres y creación atómica.
- `client/src/utils/routinePayload.js`: construcción de formularios y plantillas sin coerciones destructivas.
- `server/test/routine-import-contract.test.js`.
- `server/test/routine-import.integration.test.js`.
- `server/test/run-import-integration.mjs`.
- `client/src/utils/routinePayload.test.js`.
- `client/src/services/routineImport.http.test.js`.
- Este informe.

Modificados dentro del alcance:

- `server/src/index.js`: registro del handler de importación y validación común antes de crear ejercicios IA.
- `server/src/routes/updateRoutine.js`: validación y persistencia de configuración; mantiene la protección de fase 1.1.
- `client/src/pages/Import.jsx`: builders, envío JSON original y ejemplo válido con campos canónicos.
- `client/src/pages/EditRoutine.jsx`: builder común; deja de sustituir valores con defaults por truthiness.
- `server/package.json`: scripts nuevos, sin dependencias adicionales.
- `README.md`: sección del formato de rutinas; sección de respaldos de fase 1.3 intacta.

No se modificaron los mecanismos offline ni los módulos de backups/restauración. No se accedió a producción, no se cambiaron datos reales, no se eliminaron ni recrearon historiales reales, no se ejecutaron migraciones ni db push, no se hicieron commits o despliegues. Las modificaciones preexistentes del workspace se conservaron. No se inició la siguiente fase.
