# NexLift v4.0 — Fase 6: persistencia e historial independiente

Fecha de trabajo: 21–22 de octubre de 2026, America/Mexico_City.
**Fase 6 completada y certificada en desarrollo Windows/x64.**
La baseline continúa **PROVISIONAL**. Producción no fue consultada ni modificada.
Sin commits, staging Git, despliegues, proveedores reales, activación de sync,
Fase 7 ni Coach. `npm test` completó 70 comandos sin fallos y aprobó
**1,290 pruebas únicas**: 1,236 anteriores y 54 nuevas. Las 582 ejecuciones
repetidas se contabilizan aparte. La activación productiva sigue bloqueada.

## Estado de los cinco bloques

| Bloque | Estado y evidencia |
| --- | --- |
| 6.1 Auditoría y diseño | Completado: código, 17 modelos reales, SQL, PHASE-2.1/2.2/2.3, arquitectura/diccionario, cierre 5, escrituras/PR/operaciones, consumidores y recuperación. |
| 6.2 Historial e integridad | Implementado y ensayado: propiedad directa, contexto inmutable, Exercise estable, planificación desvinculable, FK restrictivas, identidad de series y autorización SQL/HTTP. |
| 6.3 Ejercicios y extensibilidad | Completado dentro del alcance: identidad privada, archivo, nombre actual frente a observado/registrado y desconocidos explícitos; sin ontología ni atributos ficticios. |
| 6.4 Migraciones y recuperación | Cadena real desde cero y actualización sintética; backfill conservador, fallos atómicos, recuperación previa y posterior con PostgreSQL real. |
| 6.5 Integración y certificación | Completado: matriz integral definitiva con 1,290 pruebas únicas, 70 comandos aprobados, esquema nuevo, Edge real, builds, tipos y lint sin regresiones. |

## Repositorio recibido y protección

El cwd inicial `C:/Users/guerr/OneDrive/Documents/Documentos/ChatGPT/NexLift`
estaba vacío. El repositorio real, confirmado por código, Git e informe 5, es
`C:/Users/guerr/OneDrive/Escritorio/NexLift`. Se trabajó ahí.

Se ejecutó git status antes de editar; existían numerosos cambios de fases
anteriores sin commit. No se restablecieron ni borraron. No había AGENTS.md
aplicable. La autorización explícita de esta Fase 6 prevalece sobre la prohibición
histórica de cambiar schema/SQL en CLAUDE.md, ahora actualizada.

Protección única fuera de Temp, **641 archivos públicos verificados por SHA-256**,
status, diff binario y staged diff:
`C:/Users/guerr/.codex/artifacts/nexlift-phase6-received-d5c632a1-5f61-4411-984d-955aa6c86085`.
Los .env, claves, dumps y archivos privados se excluyeron; no se leyeron secretos.
Los informes históricos y ambas migraciones recibidas permanecen protegidos.

Comprobación final: 616 de los 641 archivos recibidos conservan exactamente sus
bytes; 25 contienen los cambios localizados de esta fase y ninguno fue eliminado.
Los **343 archivos protegidos** (cliente, contratos compartidos, auditorías
anteriores, SW, tres lockfiles, Dockerfile y dos migraciones anteriores) siguen
idénticos. No hay cambios staged y `git diff --check` termina con salida 0.
[Comparación y checksums finales](final-checks.json).

## Problemas confirmados y modelo elegido

Antes: `User ← Routine ← RoutineDay ← Exercise ← WorkoutLog ← SetLog`.
Las 18 FK del esquema recibido usaban DELETE CASCADE. Borrar planificación podía
destruir sesiones y series; la propiedad del historial dependía del join a la
rutina actual. El nombre/músculo/unilateralidad se leían del Exercise mutable.
El editor y la papelera protegían sus propios caminos, pero no otros escritores.
Un reparentado podía transferir historial entre cuentas. PR agrupaba por nombre,
sin FK al ejercicio ganador; sugerencias también podían perderse por cascada.

Ahora se conserva **WorkoutLog como registro de un ejercicio**, no se cambia su
significado a visita completa al gimnasio. Se preservan CUID/UUID existentes,
SetLog.id, orden, fecha, cargas, repeticiones, esfuerzo contextual y lados.
Exercise sigue siendo una identidad privada estable y un adaptador de la
prescripción legacy, con relación opcional a su día actual. No se inventa un
catálogo canónico global ni se fusionan ejercicios por similitud de nombres.

| Objeto | Expansión concreta |
| --- | --- |
| Exercise | userId propio nullable solo para planes legacy sin dueño; archivedAt; routineDayId opcional. Conserva nombre, músculo, unilateralidad, prescripción y todos los IDs. |
| WorkoutLog | userId obligatorio; exerciseNameSnapshot; muscleGroupSnapshot e isUnilateralSnapshot nullable; snapshotSource; contextCapturedAt; originRoutineId/originRoutineDayId como procedencia sin FK a planes eliminables. |
| PersonalRecord | sourceExerciseId opcional: identidad del ganador demostrable al recalcular; NULL para PR anteriores sin procedencia demostrable. |
| SetLog | Mismas columnas; trigger impide cambiar ID o reasignar una serie ya registrada a otra sesión. |
| Resto | RestLog, BodyLog, Goal, cardio, TrainingProfile y bloques conservan sus columnas/semántica. Comprobantes permanecen en su esquema SQL separado. |

Inventario comprobado en PostgreSQL: **17 modelos/166 columnas/21 FK/50 índices**,
frente a 17/155/18/48. Trece objetos SQL adicionales: cinco funciones y ocho
triggers. [Catálogo actual](declared-catalog.json), reproducido desde instalación
vacía y actualización con datos; las referencias 2.1/2.2 no se reescribieron.

## Políticas de eliminación y propiedad

| Relación/operación | Política y efecto |
| --- | --- |
| Routine → RoutineDay y RoutineBlock | CASCADE de planificación; los bloques no contienen sesiones. |
| RoutineDay → Exercise | SET NULL: Exercise sobrevive, conserva dueño y queda archivado al desvincularse. |
| Exercise → WorkoutLog | RESTRICT: no se puede destruir el ancla de sesiones registradas. |
| User → WorkoutLog/Exercise | RESTRICT: eliminación física de cuenta requiere un flujo explícito posterior; desactivación conserva historial. |
| Exercise → SuggestionLog y PR.sourceExerciseId | RESTRICT: conserva telemetría/PR, incluso sin sesiones. |
| WorkoutLog → SetLog | CASCADE conservado para eliminación intencional de sesión por el dueño. |
| PendingReminder → Exercise/User | Cascadas efímeras conservadas. |
| CardioSession → CardioSegment | Cascada subordinada conservada. |

El editor mantiene la papelera para consumidores anteriores. Retiene ejercicios
con sesiones, sugerencias o PR; en el modelo nuevo un renombrado conserva el ID.
Las entradas nuevas no restauran automáticamente una identidad archivada solo
por coincidir el nombre. El reshuffle IA usa el mismo criterio de retención.
Un borrado SQL directo de día/rutina también conserva el historial mediante FK,
sin depender de que se haya usado ese editor.

Triggers validan propiedad al insertar/mover Exercise y al registrar sesiones,
sugerencias, recordatorios y procedencia de PR. Impiden transferir dueños de
rutina, mover días entre cuentas, cambiar dueño/ID de Exercise o reasignar
sesiones/series. Se mantienen Serializable, bloqueo de cuenta, reintentos acotados,
versiones y rollback transaccional. La autorización HTTP sigue siendo obligatoria:
estos constraints no sustituyen autenticar al actor ni son una política RLS.
Un rol DDL puede desactivar triggers; readiness detecta ese drift.

## Contexto histórico y reglas de backfill

La expansión se ejecuta en una transacción con bloqueo del grafo afectado.
No borra filas, no renumera series, no cambia fechas/IDs y no recalcula números.

1. Exercise.userId proviene exclusivamente de su Routine actual. Planes legacy
   sin dueño se conservan sin asignarlos a nadie; no pueden registrar sesiones.
2. WorkoutLog.userId se copia de ese propietario verificable. Si existen sesiones
   sin dueño o sugerencias/recordatorios entre cuentas, **falla toda la migración**.
   No se remedia el dato ambiguo por conjetura.
3. Para logs previos solo se copia la etiqueta actual observada a
   exerciseNameSnapshot, con `snapshotSource=legacy-observed`. Músculo,
   unilateralidad y planificación original quedan NULL: no se conoce su valor
   histórico. contextCapturedAt registra la observación en UTC.
4. Para escrituras nuevas, un trigger captura el contexto disponible al persistir,
   incluso cuando un cliente anterior omite las columnas nuevas. `recorded`
   significa capturado al guardar; contextCapturedAt **no** es performedAt.
   Un envío offline tardío no demuestra que el catálogo fuera igual al entrenar.
5. El nombre/contexto/propietario/identidad del log quedan inmutables en SQL.
   Las ediciones autorizadas de series, fecha y notas siguen el protocolo previo.
6. PR.sourceExerciseId anterior queda NULL. El recálculo nuevo puede registrar
   el ganador sin inferir identidad a partir de nombres parecidos.

La representación HTTP utiliza el snapshot. Cuando una clasificación unilateral
legacy es desconocida y existen campos derechos, el adaptador conserva su
presentación de dos lados a partir de las series; no convierte eso en una nueva
clasificación persistida. No se modifica el cálculo deportivo de ningún lado.
No se inventan timestamps individuales de series que nunca fueron registrados.

## Catálogo, PR y preparación Coach

La clave estable es Exercise.id dentro de su cuenta. Nombres duplicados no son
identidades equivalentes. Los nombres observados por sesión permiten preservar
etiquetas y derivar variantes de presentación. El catálogo estático y las
clasificaciones actuales siguen separados de evidencia histórica; el origen
catálogo/personalizado antiguo no puede reconstruirse con certeza por nombre.

No se añaden columnas sin consumidor para alias, equipo, patrón de movimiento,
músculos secundarios ni supuestos de recuperación. Esos datos podrán incorporarse
con procedencia verificable. El músculo primario conocido sigue en Exercise;
el snapshot registra solo lo capturado en la escritura nueva. NULL significa
desconocido, no un grupo muscular ficticio ni ausencia fisiológica demostrada.

La API/tabla PR conserva su **proyección legacy por nombre** y equivalencia
case-insensitive; no se presenta como un catálogo de ejercicios idénticos.
sourceExerciseId aporta procedencia y el historial por ID permite reconstrucción
sin rutina. Se conservan Epley de Fase 5, lado más fuerte, esfuerzo, ceros,
series incompletas y selección estricta `>` de empates. No se activa otro orden
de desempate para timestamps idénticos. Recalcular/edit/delete sigue usando el
cliente de la misma transacción. Los PR anteriores se conservan, no se deduplican
ni reinterpretan durante la migración.

Se dispone de dueño/identidad/fecha/series y contexto con calidad explícita para
analizar tendencias. Origin IDs son procedencia, no dependencias a planificación.
Un vínculo exacto a un bloque histórico borrado, sueño/fatiga o recomendación→serie
exigirá un contrato y captura adicionales. No se atribuyen esos datos a registros
antiguos ni se crean tablas de métricas/Coach. Fase 7 no se inicia.

## Migración versionada y SQL revisado

Nueva: `server/prisma/migrations/202610220001_phase6_history/migration.sql`.
Contiene guard desechable, preflight, ADD COLUMN, backfill documentado, SET NOT
NULL tras verificar propietario, sustitución de tres políticas FK, tres FK
nuevas, dos índices y funciones/triggers de integridad. El DROP se limita a los
tres constraints reemplazados en la misma transacción; no hay DROP de tablas o
columnas, DELETE de históricos ni TRUNCATE en la migración.

`0_init` y `202610180001_phase31_operations` mantienen sus bytes/checksums.
Se generó además el diff Prisma 6.19.3 recibido→actual **sin conexión**: coincide
en las 11 columnas añadidas, tres FK sustituidas, tres nuevas y dos índices.
[SQL de revisión, no ejecutable como migración](prisma-structural-diff.sql) y
[comparación explícita](sql-review.json). El SQL versionado añade el backfill
previo a NOT NULL y CHECK/triggers que Prisma no representa.
La cadena usa Prisma migrate deploy real solo en clústeres nuevos creados y
verificados por los runners. No se usó db push, migrate dev ni reset. El SQL exige
nombre reservado de Fase 6, comentario aleatorio de la base, opt-in específico y
loopback. El runner comprueba PGDATA/postmaster.pid, puerto e identidad antes de
crear targets. No acepta argumentos/URLs externas ni lee .env operativo.

Es una transición **expandir → backfill → verificar → adaptar**. No se contraen
columnas legacy ni se ofrece este SQL provisional para aplicarlo a datos reales.
Una copia productiva con propietarios ambiguos requiere remediación autorizada
y una revisión del procedimiento, conservando primero los datos.

## Integración, API y clientes anteriores

`historyPersistence.js` adapta Prisma con extensión de consultas: traduce scopes
legacy de historial a dueño directo y etiquetas/músculos de snapshots; proyecta
el objeto exercise de las lecturas anteriores sin añadir consultas. También
funciona en transacciones y conserva los hooks de fallo del ensayo offline.
Respeta AND/OR/NOT y no sustituye filtros de propiedad incompatibles entre sí.

La integración en index consta de importar ese cliente y usar la retención común
en IA. No se reescriben todas las rutas: historial, estadísticas, metas, Atajos,
reportes y exportaciones usan el adaptador. WorkoutTransaction usa dueño directo
para sesiones/ejercicios y permite registrar trabajo pendiente del dueño sobre
un Exercise archivado. El editor y los adaptadores de backup se actualizan de
forma localizada. Se incluyen pruebas de Express completo, no solo handlers.

No cambian endpoints previos, nombres de campos legacy, Atajos, canonicalización,
requestHash, SetLog IDs, sessionVersion ni journal de operaciones. Los contratos
TypeScript y Dexie/SW recibidos permanecen sin modificaciones. La respuesta de
creación conserva sus datos nuevos como campos aditivos; las selecciones HTTP
estrechas mantienen exactamente sus campos. Los recibos anteriores siguen siendo
JSON congelado, sin re-hash ni nuevas columnas introducidas en su contenido.

La matriz distingue dos obligaciones: las 1,236 pruebas históricas mantienen su
schema/cliente recibido para caracterizaciones deliberadas y baseline antigua,
ejecutando los adaptadores finales; luego se genera el cliente actual y se
ensaya la expansión con 54 casos nuevos y las 31 pruebas offline/Edge repetidas
sobre el esquema nuevo. No se hacen pasar fixtures destructivos antiguos por
pruebas de la nueva retención. Un cliente Prisma anterior generado por separado
también lee/escribe la base nueva en el ensayo.

Compatibilidad de PWA anterior con backend nuevo está cubierta. **No se promete
revertir a cualquier backend antiguo solo cambiando la imagen**: un lector que
solo hace joins de planificación o lee metadata mutable necesita el adaptador
para interpretar registros desvinculados o renombrados tras esta fase. Esto forma
parte del gate de rollback/despliegue; conservar datos no equivale a certificar
semántica de downgrade de todos los lectores anteriores.

## Backups, restauración y recuperación

El JSON portable nuevo es **v5**, con 15 colecciones exportables como antes,
campos nuevos y checksums. Lee v4 verificando su checksum original antes de
transformar; mantiene diarios v1 y exportaciones Settings 2.x con su política
de archivo incompleto y allowIncomplete explícito. El v4 se convierte a contexto
observado con desconocidos NULL y sin inventar relación a rutinas originales.

Exportar incluye ejercicios/sesiones archivados o desvinculados mediante dueño
directo. Restore mantiene dry-run, mapeo determinista de IDs `nx4_`, orden
topológico, preflight de conflictos, transacción y verificación antes del commit.
Las FK opcionales NULL se conservan; procedencia de planes presentes y PR ganador
se mapean de forma segura. No se sobrescriben cuentas o registros ajenos.
No se recalculan PR silenciosamente al restaurar: se conserva el respaldo.
Los propietarios opcionales legacy de BodyLog/RestLog/PR fuera del nuevo historial
no se reasignan ni endurecen por suposición; deben auditarse en la copia autorizada.

JSON portable sigue excluyendo credenciales, push efímero y journal de recibos.
Las fotos son **referencias**, no binarios. No es el respaldo de operaciones Dexie,
cuyo importador automático continúa pendiente. Los bundles PostgreSQL sanitizado
y completo siguen funcionando; el completo incorpora conteo/digest verificable
del journal de operaciones además del esquema y los 17 modelos.
Restaurar únicamente JSON tampoco recupera los comprobantes perdidos: no se debe
reanudar una cola antigua suponiendo que un 404 demuestra que nunca se confirmó.
La recuperación del protocolo requiere el dump completo con journal o una
reconciliación explícita; la activación de sync continúa bloqueada en producción.

Pruebas de recuperación: pg_dump previo a la expansión → migrar/verificar →
simular migración fallida con DDL/DML → restaurar el archivo previo en otra base
nueva → comparar todos los valores/IDs/fechas y recibos → volver a migrar.
También se restauran JSON v5/v4/diario, bundle sanitizado y dump completo posterior;
checksum/manifiesto falsos o fallo tardío revierten toda la transacción.

Una transacción SQL fallida se revierte automáticamente. La migración exitosa
no tiene un down automático: recuperar esquema/datos anteriores requiere el dump
concreto y código compatible, ensayado en destino nuevo. Un backup anterior no
incluye escrituras posteriores; definir RPO/reconciliación antes de despliegue.
Editar/desarchivar planificación es reversible, mientras los históricos existen;
una sesión eliminada intencionalmente requiere respaldo para recuperación.

## Pruebas y certificación final

**Resultado final de `npm test`: aprobado, salida 0; 70 comandos con salida 0.**
La ejecución definitiva completa corresponde a
`C:/Users/guerr/.codex/artifacts/nexlift-verification/nexlift-phase6-verification-J8lKDa`.
Terminó el 22 de octubre de 2026 a las 04:30:09 UTC (21 de octubre, 22:30:09
en America/Mexico_City), con Node **24.22.0**, npm **11.19.1**, PostgreSQL
**18.4** y Microsoft Edge real. Se usó instalación nested desde los locks
recibidos, entorno limpio y copias desechables; no se usaron .env operativos.

| Verificación definitiva | Resultado |
| --- | --- |
| Pruebas históricas | 1,236/1,236 aprobadas. |
| Pruebas nuevas de Fase 6 | 54/54 aprobadas. |
| Total único | **1,290 aprobadas; 0 fallidas.** |
| Repeticiones | 582 aprobadas, excluidas del total único: 31 offline con esquema nuevo, 34 shared, 365 workspaces, 104 servidor standalone y 48 smoke de dependencias productivas. |
| SQL y recuperación | Migración real desde vacío y desde esquema anterior; preservación por columna/ID/fecha; abortos atómicos; dump previo y posterior; JSON v5/v4/legacy; bundles completos y sanitizados aprobados. |
| Navegador y operaciones | Suites originales de sync, almacenamiento y conflictos aprobadas; 31 offline originales y las mismas 31 sobre esquema nuevo aprobadas en Edge/Dexie/PostgreSQL reales. |
| HTTP y deporte | Express completo, Atajos, PR transaccionales, Smart Loading, análisis, contratos y consumidores anteriores aprobados. |
| TypeScript y generación | Typecheck strict, build tipado, check:generated y consumidores ESM/CommonJS aprobados, también tras generar el cliente Prisma nuevo. |
| Builds y bundle | Frontend y backend, check:bundle, build de ensayo y build frontend con NODE_ENV=production aprobados. |
| Instalaciones limpias | npm ci raíz, cliente y servidor standalone; prune de dependencias productivas y smoke aprobados. Locks preservados. |
| Lint TS/tooling/persistencia | Aprobado; los 20 archivos runtime/arneses revisados por check-phase6 no tienen errores ni advertencias. |
| Lint global del cliente | **27 errores y 3 advertencias preexistentes**, mismas firmas que Fase 5; sin regresiones. No se declara verde. |
| Conservación de fuente | Hashes del código definitivo verificados al final de la matriz; 343 archivos protegidos idénticos, ningún recibido eliminado, ningún staged. |

[Matriz íntegra y hashes de fuente](matrix-evidence.json),
[evidencia SQL/HTTP/rendimiento](phase6-evidence.json),
[offline con esquema nuevo](offline-current-evidence.json) y
[comparación exacta de lint](lint-comparison.json).
Los logs crudos de los 70 comandos se retienen en el directorio de verificación;
las evidencias originales de fases anteriores no se sobrescribieron.

Pruebas nuevas: **54 casos planos** de PostgreSQL/Express real, incluyendo dos
usuarios, rutinas múltiples, nombres duplicados y ya renombrados, datos incompletos,
null/cero, unilateralidad, PR, timestamps idénticos, trabajo offline, comprobantes,
conflictos, mesociclos, cuerpos/fotos y fallos de migración/restauración.
Se verifican valores por columna, no solo aceptación del SQL o conteos.

El primer ensayo nuevo tuvo 44/48 aprobadas: un fixture mandaba órdenes duplicados;
dos backups sintéticos no reproducían la codificación Float del exportador Prisma
anterior; el lector de catálogo del fixture omitía el search_path usado por readiness.
Se corrigieron los fixtures conservando las aserciones y usando el cliente Prisma
anterior real. Las siguientes corridas dirigidas aprobaron 48 y luego 54 casos.
Los intentos y logs se conservan en los directorios de ensayo. Se corrigió también
no-ex-assign histórico en el servicio de restore sin alterar su resultado.
Se verificó además que permitir FK opcionales de planificación/procedencia en
v5 no permita propietarios NULL en ninguna entidad exportada. Los archivos
forjados con checksums válidos se rechazan antes de escribir; v4 sigue exigiendo
su enlace a día obligatorio. Aprueban los 54 casos actuales, 41 backups
históricos y 365 unitarios de workspaces con el cliente nuevo. La corrida que se
interrumpió para incorporar esta revisión queda registrada como cancelada.
La primera matriz integral se detuvo con 82/84 casos de entrenamientos: el arnés
que extrae reshuffle no enlazaba el nuevo helper. Se corrigió ese binding sin
modificar aserciones y los 84 casos volvieron a pasar. Otra corrida se canceló
después de dejar terminar sus runners desechables porque la revisión detectó
que fix-weights debía recalcular por etiqueta histórica tras renombrar. Esa
corrección y su comprobación están en la revisión definitiva. Ningún intento
fallido/cancelado se suma ni se presenta como certificación final.
[Diagnósticos conservados](development-checks.json).
Dos corridas posteriores expusieron un fallo del arnés al reactivar una pestaña
congelada. Los diagnósticos demostraron una segunda navegación, desaparición del
runtime suspendido y logs de Vite desconectando/reconectando: su cliente de
desarrollo recargaba el documento al perder el WebSocket durante la congelación.
`hmr:false` solo no retiraba ese cliente. El arnés ahora lo retira únicamente del
HTML de almacenamiento, comprueba que no se carga y verifica la identidad del
documento antes/después del rechazo. La prueba original LEADERSHIP_LOST y su
timeout permanecen intactos. Dos repeticiones con caché fría aprobaron 47/47.
[Diagnóstico y corrección](storage-hmr-diagnostic.json). La aplicación, IndexedDB
y sus reglas no cambiaron. Las catorce verificaciones dirigidas restantes también
aprobaron; no se suman al total único. La corrida definitiva J8lKDa ejecutó después
la matriz completa sobre el código final, incluidos los 47 casos de almacenamiento
y la validación reforzada de backups, y aprobó sin fallos. Los cinco intentos
anteriores quedan registrados como fallidos o cancelados, sin agregarlos al
resultado certificado.

Se conserva el test de igualdad de fuente de Fase 5: deshace exactamente las dos
integraciones declaradas de index antes de comparar la lógica deportiva previa.
No se cambian fórmulas, goldens, timeouts o aserciones de comportamiento para
ocultar fallos. Las pruebas del navegador mantienen sus acciones/aserciones.

## Rendimiento e índices

Ensayo sintético: 2,004 sesiones, 12,005 series; lectura de 2,000 registros con
series y Exercise en **3 consultas Prisma**, sin N+1 añadido por snapshots.
Se mide reconstrucción transaccional de PR. EXPLAIN ANALYZE/BUFFERS confirma
Index Scan Backward sobre `WorkoutLog_userId_date_idx` para historia por cuenta.
El índice Exercise(userId, archivedAt) permite catálogo privado independiente del
plan. No se añaden índices redundantes por nombres o nuevas unicidades sin medir.
La comprobación de retención usa un único SELECT EXISTS para sesiones, sugerencias
y procedencia de PR, manteniendo un viaje SQL por identidad en los editores
heredados en lugar de introducir dos consultas adicionales por ejercicio.
Tiempos de la corrida final: lectura **270.59 ms**, reconstrucción de PR
**240.52 ms**; el EXPLAIN del acceso por cuenta registró **0.043 ms** de ejecución.
[Datos y plan completos](phase6-evidence.json).
Se ensaya además editar y eliminar por Express una rutina de diez días, cien
ejercicios personalizados y seiscientas series históricas: se conservan sus cien
sesiones, identidades, series y PR. Edición **603.78 ms**, eliminación
**12.54 ms**; quedan 2,104 logs y 12,605 series al sumar ese escenario.
Los tiempos y conteos quedan en largeRoutine.
No representan latencia de producción ni validación deportiva/Coach.

## Gates bloqueados y entrega a Fase 7

| Gate productivo | Estado |
| --- | --- |
| Baseline contra esquema real autorizado | BLOQUEADO: no se dispone de copia autorizada; no se accedió a producción. |
| Respaldo verificable de la base objetivo y ensayo representativo | BLOQUEADO: solo datos/archivos sintéticos. |
| SQL/recovery sobre esos datos y política de propietarios ambiguos | PENDIENTE; no asignar dueños ni identidades por conjetura. |
| Frontend/backend anterior y plan de downgrade concreto | PWA legacy ensayada; downgrade de lectores antiguos requiere adaptador o recuperación completa. |
| Docker/Linux/OpenSSL y EasyPanel | NO CERTIFICADOS; no se construyó/ejecutó una imagen. |
| Arranque productivo sin DDL | El index probado no migra; el Dockerfile operativo antiguo conserva db push y no se ejecutó. Su uso sigue bloqueado hasta reemplazar/validar el arranque. |
| Despliegue, rollback, RPO/RTO y autorización de activación | PENDIENTES; no hay autorización de activar. |

Fase 7 puede partir del esquema/contratos de desarrollo certificados en esta fase,
de los IDs preservados y de los límites explícitos de procedencia/PR. No necesita
repetir la auditoría completa; sí respetar los gates, la ausencia de datos reales,
el protocolo offline y las decisiones deportivas pendientes documentadas en Fase 5.

**Producción intacta. Baseline PROVISIONAL. Sin commits ni despliegues.**
