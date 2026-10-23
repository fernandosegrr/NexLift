# Matriz de lanzamiento y alcance de compatibilidad

El resultado de ejecución definitivo es `matrix-evidence.json`, no esta tabla de
correspondencias. Todos los datos son sintéticos. No representa un smoke manual
en producción ni todos los recorridos posibles de UI.

| Flujos solicitados | Cobertura ejecutable en npm test |
| --- | --- |
| Registro/login/recuperación/perfil/revocación | phase7.integration + phase9-security + phase9.integration; JWT, CAS, dependencia caída, límites y aislamiento |
| Rutinas: crear/importar/editar/activar/archivar; ejercicios personalizados | routine/import/workout/phase6/phase7 integrations; IDs, snapshots y retención |
| Día de entrenamiento, unilateralidad, RIR/RPE, guardado/edición/eliminación | workout integration, phase6/phase7, stabilization-browser con formulario React real |
| Smart Loading, volumen, fechas CDMX, domingo=0 | training characterization/shared, smart-loading, training-analysis y contratos/Atajos; sin fórmulas nuevas |
| Historial/PR/transacciones/mesociclos | phase6/phase7, Smart Loading SQL y análisis; fallo tardío revierte sesión/series/PR/comprobante |
| Progreso/PDF/cuerpo/hábitos/creatina | analysis unit/React/SQL, PDF histórico Edge, phase7 body/checkin, phase9 etapas y revocación |
| Push/recordatorios | phase9 con simulador, procesos concurrentes y reinicio; phase10 selector Express→Fastify recupera una aceptación |
| Atajos | phase6/phase7; acumulación y RPE=10−RIR, token anual/revocación; iPhone físico pendiente |
| Portable/importaciones/dump/restore | 41 backups históricos + phase6 + phase10; contratos distintos, checksum y restauración atómica |
| Offline/conflictos/cambio de cuenta/SW | sync/storage/conflicts, 31 escenarios stabilization en esquema anterior, actual y Fastify; Query/PWA/security browser |
| Arranque/configuración/cierre/readiness | infra histórica, phase7 lifecycle y phase10 release selector/artifacts/schema; SIGTERM de contenedor requiere Linux |

## Escenarios de actualización A–J

| Escenario | Evidencia automatizada y límite |
| --- | --- |
| A. PWA antigua → backend nuevo | Cliente Prisma legacy contra expansión actual y contratos HTTP legacy; frontend del fixture con IDB v2/flags anteriores. No es cada bundle productivo v3 archivado. |
| B. PWA nueva → backend nuevo | App/formulario compilado + API real Express/Fastify + SQL actual y comprobantes. |
| C. Offline durante actualización | SW real cambia frontend/caché con operación pendiente; conserva payload y almacenamiento legacy, luego un recibo. |
| D. Pendientes creados antes de nueva versión | Upgrade físico IndexedDB 20→30, originales/UUID conservados; incompatibilidad queda bloqueada/exportable, no descartada. |
| E. Respuesta perdida | COMMIT real sin respuesta, reinicio de API/navegador y consulta/replay del mismo comprobante. |
| F. Conflicto de dispositivos | Dos procesos Edge, 409, lectura interrumpida, propuesta durable y decisión explícita; no sobrescritura silenciosa. |
| G. Reinicio en sincronización | Falla antes/después de COMMIT; rollback o replay con mismo UUID, sin sets huérfanos ni duplicados. |
| H. Cambio de usuario con pendientes | Aislamiento y bloqueo de cuenta/token; pendientes originales retenidos, ninguna respuesta tardía aplicada a otra cuenta. |
| I. SW durante sesión | Formulario y borradores persistidos cubiertos; upgrade con operación confirmable y recarga única, sin borrar Dexie. Teclas aún no persistidas en RAM y cierre abrupto físico requieren ensayo adicional. |
| J. Reinicio de dispositivo | Cierre y reapertura reales del proceso Edge con mismo perfil, borradores/unilaterales/pendientes. Reinicio físico de iPhone/Safari no ejecutado. |

La nueva sincronización y resolución permanecen **apagadas en producción**.
ProtocolVersion 1, UUID, requestHash, expectedVersion y recibos no cambian.
El número 31 es la suite histórica completa, no 31 pruebas nuevas por transporte.
No certificar compatibilidad universal de clientes antiguos ni entrega push.

## Ensayo humano pendiente, sin producción

En staging aislado autorizado y con dos cuentas sintéticas: instalar la revisión
exacta anterior, registrar ambos lados y RIR, guardar offline, cerrar/reabrir el
dispositivo, actualizar backend y después SW con sesión activa, reconectar y
comparar IDs/sets/PR/recibos. Repetir respuesta perdida y conflicto entre dos
dispositivos; exportar pendientes antes de cualquier intervención. Comparar ambos
borradores con su exportación y verificar cero escrituras en la segunda cuenta.
Anotar SO, Safari, versión instalada, API, hashes de bundle y schema de Dexie.
Nunca borrar IndexedDB o pendientes para lograr compatibilidad.
