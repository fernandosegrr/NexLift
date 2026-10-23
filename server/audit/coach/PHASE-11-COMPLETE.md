# NexLift Coach — Fase 11 completa en desarrollo

Fecha de cierre: 23 de octubre de 2026, America/Mexico_City.
Base verificada: main 5c8615ed7006353bf0e1e672eb9bf262b3393dc9, árbol recibido limpio.
Rama local: feat/nexlift-coach. Implementación preservada en cfbdbcc. No push ni despliegue.

## 1. Estado 11.1–11.7

| Bloque | Estado | Resultado |
| --- | --- | --- |
| 11.1 | Completa en desarrollo | Volumen directo/indirecto, frecuencia, semanas, trazas por ejercicio/rutina/bloque y clasificación voluntaria. |
| 11.2 | Completa en desarrollo | Check-ins privados opcionales, consulta/corrección/eliminación y referencia individual con incertidumbre. |
| 11.3 | Completa en desarrollo | Evaluación v1/v2, equipo configurable, series actuales, abstención y calibración por ID explícito. |
| 11.4 | Completa en desarrollo | Siete estados verificables, núcleo compartido y controles de falsos positivos. |
| 11.5 | Completa en desarrollo | Peso/perímetros entre fechas, calidad, entrenamiento y fotos voluntarias. |
| 11.6 | Completa en desarrollo | Asistente visual React, selección de hechos/componentes validados y fallback útil. |
| 11.7 | Completa en desarrollo | Migración ensayada, restauración, aislamiento, Edge, rendimiento y matriz nueva aprobada. |

“Completa en desarrollo” no significa activación productiva ni calibración fisiológica demostrada.

## 2. Arquitectura y consumidores

- Motor único TypeScript: packages/shared/src/domain/coach/types.ts y engine.ts.
- Backend: server/src/modules/coach/{validation,service,assistant,provider,routes}.js.
- Express y Fastify usan el mismo servicio, Prisma y autorización existente.
- Frontend: /coach desde Progreso en desarrollo, con seis paneles accesibles, formularios y conversación.
- Contratos y etiquetas compartidas compilados a artefactos locales; no se duplica matemática entre frontend/backend.
- Reportes calculados en RepeatableRead, sin almacenar agregados que queden obsoletos.

## 3. Migración

202610230001_coach agrega CoachCheckIn, CoachExerciseConfig, CoachMeasurement y CoachSuggestion.
Incluye propiedad, FKs, índices, unicidad y trigger de coherencia cuenta/ejercicio/serie real.
Las tres migraciones recibidas permanecen intactas. La expansión preservó todas las filas y columnas históricas ensayadas.
El SQL solo acepta la base nueva local marcada por el runner; se verificaron rechazo sin marca y repetición idempotente.

## 4. Volumen muscular

Se separan series directas completadas de participación secundaria estimada. La atribución secundaria usa catálogo explícito de producto y factor revisable (0.5 por defecto, 0–1 configurable); no es una constante fisiológica universal.
Una serie unilateral cuenta una vez. kg×reps se calcula y etiqueta aparte con ambos lados explícitamente registrados.
Hay detalle de contribución y procedencia por ejercicio, rutina y bloque; los personalizados sin clasificación quedan visibles como datos insuficientes.
Semanas parciales no se comparan como semanas completas. No se impone un óptimo universal de series.

## 5. Check-ins y recuperación

Horas de sueño 0–24; calidad/energía/fatiga/estrés 1–5; molestias por zona 0–4. Todo es opcional.
Consulta, corrección y eliminación son privadas por cuenta/fecha; las escalas tienen etiquetas y controles móviles.
Se comparan 7 días recientes con 28 previos, con mínimo 3/5 observaciones por variable. Se muestran carga, frecuencia, descanso, RIR y contexto de rendimiento.
Se distinguen observación, hipótesis y datos faltantes; no hay diagnóstico, causalidad atribuida ni cambios automáticos de rutina.

## 6. Smart Loading 2.0

V1 conserva su implementación y consumidores clásicos. V2 solo se evalúa dentro de Coach en desarrollo.
Usa referencia reciente, RIR, objetivo/fase, evolución, incremento decimal/lista de cargas y señales relativas de recuperación suficientes.
Abstiene ante datos insuficientes, valores atípicos, equipo desconocido, contextos distintos o inicio de un bloque posterior a la referencia.
Bloquea saltos mayores de 10% o 10 kg. Se puede evaluar una serie actual sin persistirla.
La recomendación expone referencia, regla explicada, carga, delta, equipo, evidencia y limitaciones. No sustituye el peso del atleta.

## 7. Estancamientos avanzados

Estados: historial insuficiente, mantenimiento, progreso, posible estancamiento, regresión, contradicción y contexto no comparable.
Reutiliza el núcleo plateau y e1RM compartidos, con política Coach conservadora explícita.
Agrupa días en lugar de fabricar muestras a partir de logs parciales. Las reglas y umbrales se documentan en docs/NEXLIFT-COACH.md.
Se verificaron ausencia de cuatro días, menos series, cambio de rutina/equipo/rango/bloque, sesión incompleta, unilateralidad, empates, retorno tras semanas, descarga, valores atípicos y RIR cambiante.
Las descargas automáticas históricas no se reinterpretan ni cambian.

## 8. Hipertrofia

Reutiliza BodyLog para peso y fotos; agrega solamente los perímetros que el schema recibido no contenía.
Gráficas, comparación entre fechas, calidad de medición y resumen del entrenamiento usan observaciones reales, sin interpolación de ausencias.
Cambios de peso/perímetro/báscula no se presentan como crecimiento muscular probado. No hay porcentaje estimado desde imágenes.
Fotos opcionales se cargan al consultarlas y no se mandan al proveedor IA.

## 9. Asistente visual

Incluye tarjetas, gráficas SVG responsivas con tablas exactas, barras interactivas, comparaciones y cronología mediante componentes React reales.
La intención se resuelve con funciones permitidas; solo se aceptan IDs de hechos calculados y vistas de una lista cerrada.
El modelo no puede aportar cifras, prosa arbitraria, HTML, JSX, JavaScript, SQL, userId o herramientas persistentes.
“Este mes” usa el mes civil CDMX; cada respuesta conserva los datos del mismo cálculo para que sus gráficas no cambien con el dashboard.
Los nombres explícitos tienen prioridad contextual; variantes ambiguas no se mezclan. Preguntar por progreso muscular consulta rendimiento, no confunde series con mejora.

## 10. Protección de datos y autorización

JWT y revocación existentes determinan el dueño. Todas las consultas y escrituras quedan acotadas al usuario autenticado, con defensa adicional en PostgreSQL.
El proveedor requiere acción informada mediante checkbox por consulta y recibe solo recuentos agregados elegibles; no pregunta, identidad, nombres, notas, sueño, estrés, medidas ni fotos.
Las consultas privadas se resuelven localmente. No se registran prompts ni datos personales en logs Coach.
Rate limits por cuenta/IP, 20 llamadas de proveedor por cuenta/24 h, 1 simultánea por cuenta y 4 globales; timeout de 8 s, entrada de 1200 caracteres y salida de 300 tokens/4000 caracteres.
Los límites de proveedor son por instancia y reinician al reiniciar el proceso; una futura operación distribuida necesita cuota compartida.

## 11. Fallback

Sin proveedor, sin consentimiento, ante timeout, límite o salida inválida, permanecen disponibles métricas, diagnósticos, formularios y conversación determinista útil.
Las pruebas usaron exclusivamente proveedores simulados; no se realizaron llamadas IA reales.

## 12. Calibración y limitaciones

Registrar la sugerencia verifica que la vista siga vigente y comprueba su referencia/configuración en transacción.
Aceptar o modificar exige confirmación y una serie exacta posterior, de la misma cuenta y ejercicio; no hay matching ambiguo por fecha o peso. Ignorar requiere confirmación, sin asociar una serie.
El resultado se lee por referencia y hash; una edición o eliminación se indica y no cuenta como resultado vigente. Ignorar no crea asociación.
Se necesita uso longitudinal voluntario para calibrar progresión, umbrales de plateau y recuperación. No se inventan precisión, eficacia ni probabilidades fisiológicas.

## 13. Pruebas nuevas

| Suite final | Pruebas únicas | Salida |
| --- | ---: | ---: |
| Motor, aceptación deportiva y asistente simulado | 74 | 0 |
| PostgreSQL, migración, backup, autorización y transportes | 19 | 0 |
| Edge / React / móvil / privacidad / offline | 1 | 0 |
| Total nuevo | 94 | 0 |

## 14. Total acumulado

1467 pruebas históricas + 94 nuevas = **1561 pruebas únicas aprobadas**.
La referencia comunicada era 1464; el código recibido conserva además tres casos de importación de upstream, verificados por la matriz.
987 ejecuciones repetidas se registran aparte y no aumentan el total único. Las corridas preliminares interrumpidas y la corrida que detectó la comparación temporal heredada de JWT tampoco se cuentan. Ese fixture se corrigió validando firma, frescura y duración exacta, sin modificar el JWT de aplicación.

## 15. Resultado exacto de npm test

Comando: npm test, con Node 24.22.1 y npm 11.19.1, desde la raíz.
**Salida final: 0.** Mensaje final: Approved: 1561 unique tests.
Se ejecutó la matriz completa en una copia nueva del código definitivo y se verificaron hashes de fuente al terminar.
Un intento previo salió 1 al agotarse C:; no se aprobó ni se sumó al total. La revisión automática rechazó borrar dependencias temporales (blocked by policy). Se recuperó espacio con compresión NTFS reversible de ensayos propios y vaciado autorizado de la papelera (salida 0), y esta matriz se ejecutó de nuevo desde cero.
Evidencia: server/audit/release/matrix-evidence.json; logs privados conservados en la carpeta aislada indicada por ese archivo.

Sin diagnósticos de limpieza en la corrida final.

## 16. PostgreSQL, Edge, Express y Fastify

- PostgreSQL: PostgreSQL 18.4 on x86_64-windows, compiled by msvc-19.44.35227, 64-bit. Cuatro migraciones, conservación de historia y restauración comprobadas.
- Express/Fastify: HTTP real autenticado, aislamiento, errores seguros, límites y fallback verificados; se conservaron las suites históricas de Atajos y PR transaccional.
- Cliente Prisma recibido compatible con base expandida, sin reinterpretar historia.
- Backup portable v6 incluye Coach; v4/v5 se validan antes de convertir. Dump PostgreSQL completo restaurado y comparado.
- Edge: App React real a 320/390 px; seis paneles, formularios, cambio de cuenta, respuestas tardías y ausencia de falsa confirmación offline.
- Fecha nocturna UTC/CDMX comprobada en navegador. No se certifica Safari/iPhone físico ni evaluación auditiva con lector de pantalla.

## 17. Builds, tipos y lint

Instalaciones limpias del monorepo y workspaces independientes, builds cliente/backend/shared, TypeScript strict, artefactos reproducibles y límites del bundle: salida 0.
Lint TypeScript, módulos y tooling: salida 0. Lint global del cliente: 19 errores y 2 advertencias, salida 1; todos pertenecen al baseline recibido y se comprobó ausencia de hallazgos nuevos.
No se ocultan esas incidencias históricas como un lint global aprobado.

## 18. Rendimiento

- Motor sintético: 500 ejercicios, 5000 sesiones y 15000 series; 5 muestras, mediana 329.71 ms, rango 325.43–347.47 ms.
- Servicio con PostgreSQL local: 5 reportes, mediana 7.31 ms, rango 7.07–7.71 ms; 55 consultas totales (11 por reporte), sin N+1 por ejercicio.
- Se agrupa historia por ejercicio una sola vez y no se persisten agregados. Hay topes y estado explícito si la muestra se limita.
- Son ensayos locales sintéticos; no equivalen a latencia de producción, Lighthouse ni medición fisiológica.

## 19. Riesgos pendientes

Calibración longitudinal con uso real; equipo/prescripción históricos no capturados; bloques editados sin versiones históricas; presupuestos de IA por instancia; Safari/iPhone y lector de pantalla reales; ensayo Linux/Docker de la expansión y proveedor real no certificados en esta fase.
Los registros largos se acotan y se señalan como parciales. Los backups incluyen URLs, no binarios de medios ni el estado Dexie de dispositivos.
La matriz conserva el campo heredado baseline PROVISIONAL. Su aprobación acredita el ensayo técnico local; aquí no se reinspeccionó la transición productiva real comunicada por el usuario.

## 20. Preparación para futura activación

Preparado para revisión y evaluación en desarrollo. No listo para activación productiva automática.
Producción no registra rutas Coach aun con flag; el acceso de UI se limita a desarrollo. V1 y la sincronización productiva conservan sus flags.
Una activación futura necesita aprobación, migración persistente revisada, catálogo/preflight Coach, respaldo restaurable, compatibilidad de cliente anterior, ensayo del despliegue y observación gradual.
El preflight v4 conserva su gate y rechaza la expansión hasta ese trabajo autorizado.

## 21. Producción e historial

**Producción no fue modificada ni usada para probar Coach.** No se leyeron .env operativos, no se ejecutaron DDL ni escrituras en bases reales, no se desplegó ni se hizo push a main.
No se borraron entrenamientos, PR, colas ni borradores offline. Las migraciones previas, lógica deportiva v1, requestHash, versiones, comprobantes y Service Worker conservan sus contratos y regresiones.
La retención elimina únicamente Coach vencido (check-ins 365 días, sugerencias 90); configuraciones y perímetros permiten eliminación voluntaria. El job se instala solo con Coach habilitado en desarrollo.

Evidencias esenciales: integration.json, browser.json, performance.json, lint-summary.json, mobile.png y la matriz final de release. Detalles de reglas y operación: docs/NEXLIFT-COACH.md.
