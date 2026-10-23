# Cobertura de los 35 escenarios solicitados

Los bucles y variantes dentro de un caso no incrementan el conteo de pruebas.
Las rutas siguientes son relativas a la raíz del repositorio. El resultado real
de ejecución se registra en phase43-evidence.json al cerrar la matriz.

| # | Escenario | Prueba ejecutable / fuente |
| --- | --- | --- |
| 1 | Operación válida | scripts/test/contracts.test.mjs: equivalencia de las cinco variantes |
| 2 | Payload inválido | Mismo archivo: errores públicos anteriores; Express antes de consultar SQL |
| 3 | UUID malformado | Shared UUID; Express POST y GET con ID inválido |
| 4 | Reintento idéntico | server/test/operation.integration.test.js: identical retry/lookup sin escribir PR/sets/receipt |
| 5 | Mismo ID, otro contenido | Misma suite PostgreSQL: changed weight/reps y concurrencia incompatible |
| 6 | performedAt válido | Paridad de valores/offsets/canonical hash en contratos nuevos |
| 7 | Fecha inválida | Shared/Express: calendario imposible, fecha ambigua y offset inválido |
| 8 | Cambio de día CDMX | Paridad 05:59:59.999Z/06:00Z; integración offline real conserva instante anterior |
| 9 | Versiones válidas/obsoletas | Operaciones PostgreSQL: lectura owned/conditional edits/concurrent edits; conflictos reales |
| 10 | RIR/RPE históricos | Nuevas combinaciones 0–4 y rpe almacenado; paridad con código anterior |
| 11 | Unilateralidad | Paridad nueva de lados/null/cero y PR unilateral de integración SQL |
| 12 | Descanso cero | Shared y cliente API real conservan rest=0/restSeconds=0 |
| 13 | Domingo cero | Cliente API real y contrato de días1.4 preservado |
| 14 | Alias legacy | Paridad1.4 y HTTP cliente real envían sets/reps/rest/muscle intactos |
| 15 | Alias incompatibles | Shared error de campo; routineImport.http.test.js envía conflicto al servidor |
| 16 | Comprobante válido | Shared: cinco variantes; verificación contextual real en operationProtocol |
| 17 | Comprobante incompatible | Motor cliente real guarda blocked_incompatible, conserva payload/hash y no receipt |
| 18 | HTTP401 | Motor cliente real pausa; Express autentica antes de validar; auth/tokenVersion histórico |
| 19 | HTTP409 | Motor conserva conflicto; versiones/concurrencia/resolución en SQL/Edge |
| 20 | HTTP429 | Motor conserva datos y Retry-After; clasificación compartida |
| 21 | HTTP503 | Express sanitiza dependencia; motor retiene y programa; caída PG real en suites previas |
| 22 | Respuesta perdida después de commit | operation.integration.test.js: commit acknowledgement loss; Edge offline comprueba COMMIT real y recuperación GET |
| 23 | Integridad de PR | Operaciones PostgreSQL: fallo PR/INSERT de receipt hace rollback; PR unilateral y reconstrucción final |
| 24 | Aislamiento multiusuario | PostgreSQL account-scoped IDs/receipts; Edge cambio de usuario/respuesta tardía |
| 25 | Hash canónico | Paridad de implementaciones archivadas cliente/servidor; mismos bytes normalizados y hash |
| 26 | Payload inmutable | Paridad antes/después; motor lost/incompatible conserva UUID/payload/hash/instante |
| 27 | null/undefined | Shared defaults/alias/proyección/series y paridad de patch y normalizador |
| 28 | Opcionales | Tipos de request vs canonical y sesión proyectada vs completa; no inventa defaults en respuestas |
| 29 | Extras | Shared conserva referencia/extensiones; request operación rechaza extras definidos; importación proyecta explícitamente como1.4 |
| 30 | Sin conexión | Motor cliente unitario sin envíos; integración Edge/IDB/API caída/reapertura real |
| 31 | Dexie previo | server/test/storage.integration.test.js y estabilización: v1/v2/v3/legacy con originales conservados |
| 32 | Atajos iOS | HTTP backend histórico y operaciones source=shortcut; sanitizer legacy intacto. **No se acredita iPhone físico** |
| 33 | Importación frontend real | client/test/contracts-api.cases.js: 3 casos sobre api.importRoutine y HTTP loopback; más 5 históricos |
| 34 | Express real | scripts/test/contracts.test.mjs: middleware JWT real, rutas reales, rechazos pre-DB y 503 seguro. DB simulada en estos ocho; DB nativa en la suite histórica |
| 35 | Cliente real | createOperationSync/store/transport/operationProtocol en nuevas pruebas; api.importRoutine real con HTTP; Vite/Edge en matriz histórica |

Los 48 smoke son repeticiones. La compatibilidad iOS se limita a contratos HTTP;
Docker/Linux, Safari/iOS físico y destinos persistentes mantienen sus gates.
