# NexLift Coach — contrato de desarrollo

Implementación aditiva sobre main `5c8615ed7006353bf0e1e672eb9bf262b3393dc9`, rama
`feat/nexlift-coach`. Producción queda fuera de esta fase. No ejecutar el
Dockerfile legado, db push, ni migraciones en una base real.

## Consumidores y activación local

`/coach` se alcanza desde Progreso en Vite development. Sus seis paneles son
Estancamientos, Volumen, Recuperación, Cargas v2, Hipertrofia y Mesociclos.
La producción oculta el acceso y el backend no registra rutas Coach incluso
si recibe `coachEnabled: true`. Express y Fastify comparten servicios.

En un entorno de desarrollo **ya aislado y autorizado**, configurar
`NEXLIFT_COACH_ENABLED=true`; no copiar .env productivos. Primero se requiere
el schema Coach y `npm run db:generate` / `npm run build:typed`. El SQL nuevo
solo permite bases desechables verificadas por el runner. No existe un
comando de activación productiva de Coach.

Pruebas reproducibles con Node 24.22.1 y npm 11.19.1:

```
npm run build:typed
npm run test:coach
npm run test:coach:integration
npm run test:coach:browser
npm test
```

El runner PostgreSQL crea PGDATA nuevo, verifica directorio, puerto, comentario
y opt-in, aplica las cuatro migraciones y se apaga en finally. No hereda URLs,
claves ni proveedores reales. La previsualización sintética opcional funciona
con Vite en `/test/coach-harness.html`; sus escrituras son fixtures en memoria,
no persistencia de producto. El navegador automatizado monta App real.

## Fuente de verdad y reglas

`packages/shared/src/domain/coach/{types,engine}.ts` es la única implementación
matemática nueva. Consume fechas civiles CDMX, volumen, esfuerzo, rangos y
plateau del núcleo compartido. No cambia algoritmos v1 ni descarga automática.

Volumen: cada fila completada válida cuenta una serie directa, también si es
unilateral. kg×reps usa ambos lados explícitamente registrados y se expone
aparte; no se rellena un lado ausente. Las relaciones secundarias se buscan
por nombres exactos normalizados en COACH_ATTRIBUTION, catálogo de producto v1.
Se estiman por defecto a 0.5 por serie, configurable entre 0 y 1: es una
heurística de atribución, sin equivalencia científica universal. La
clasificación voluntaria actual es retrospectiva y se etiqueta como tal;
no modifica snapshots. Lo desconocido queda sin atribuir. Las semanas
parciales no producen comparaciones engañosas. No se fija un volumen óptimo.

Recuperación: 7 días recientes frente a los 28 anteriores; mínimo 3 y 5
observaciones respectivamente, por variable. Un cambio desfavorable de una
unidad (una hora en sueño) genera cautela, sin puntuación biológica ni
causalidad. Sueño 0–24 h; calidad/energía/fatiga/estrés 1–5; molestias 0–4.
Todos son opcionales. RPE almacenado continúa siendo 10−RIR.

Plateau: agrupa días, no logs parciales del mismo día. Requiere 6 días en al
menos 14 días y e1RM elegible (carga positiva, 1–12 reps; lado conservador en
unilaterales con ambos lados presentes). Compara medias de mitades y conserva
el resultado del núcleo plateau como señal separada. Progreso >2% con mejora
del núcleo; regresión media >5% y mejores marcas recientes >2% inferiores.
Posible plateau exige 8 días / 28 días, empate/descenso del núcleo, RIR
comparable y registro reciente (≤14 días). La estabilidad restante puede ser
mantenimiento. Dispersión >50% o RIR contradictorio producen abstención.
Cambios de rutina, equipo capturado, unilateralidad, bloques, nombre/rango,
series (>25%), rango observado (>35%), configuración, interrupción >21 días,
descarga o series incompletas impiden comparación directa. Son umbrales de
producto revisables, no sensibilidad/especificidad demostradas.

El esquema histórico no guardaba equipo ni prescripción por sesión. No se
inventan; se explicita el límite. Tampoco se reconstruyen ediciones antiguas
de RoutineBlock. La tabla de mesociclos muestra fechas, muestras, series y
e1RM por ejercicio/bloque sin equiparar fases distintas.

Cargas v2: mínimo dos registros independientes, RIR conocido, referencia
reciente, contexto comparable y equipo confirmado. Primero aumenta reps;
solo aumenta carga si todas las series al peso de referencia cumplen techo
y RIR ≥1. Usa incremento decimal o lista de pesos configurada; bloquea saltos
>10% o >10 kg. Fatiga relativa/fallo mantienen carga; descarga pide revisión.
Admite evaluar series actuales sin persistirlas. Si comenzó un bloque nuevo
después de la referencia, v2 se abstiene hasta contar con rendimiento comparable
dentro de ese contexto. V1 se calcula aparte y sigue atendiendo consumidores
clásicos y Atajos. No rellena ni sustituye inputs.

Hipertrofia: peso y perímetros entre fechas reales, sin interpolar ausencias.
El schema anterior no tenía perímetros con cinta; CoachMeasurement agrega
solo ese dato, zona y calidad. El peso y fotos se leen de BodyLog existente.
No se interpreta perímetro, báscula o fotografía como crecimiento muscular
demostrado. Las fotos se cargan solo al abrirlas y nunca van al proveedor.

## IA, datos y límites

El servidor autentica el JWT, determina userId y ejecuta consultas acotadas
en RepeatableRead. Ninguna herramienta acepta userId del modelo. Las rutas
rechazan campos desconocidos. Los reportes tienen límite explícito de 5000
logs, 500 ejercicios y 1500 registros corporales; si se alcanza, la interfaz
marca resultados parciales. No se almacenan agregados derivados.

La intención inicial es determinista.
La consulta “este mes” resuelve el mes civil CDMX. Cada respuesta conserva un
snapshot de presentación del mismo cálculo; cambiar después el período del
dashboard no cambia sus gráficas. Las preguntas de progreso muscular consultan
rendimiento por ejercicios clasificados, no solo recuentos de series; nombres
ambiguos requieren elegir la variante y no mezclan identidades.
El proveedor opcional solo selecciona IDs de hechos calculados y componentes
permitidos. Se valida todo el objeto;
no se acepta prosa, cifras nuevas, HTML, JSX, JavaScript, SQL ni acciones.
Los componentes React incluyen tarjetas, gráficas SVG con tablas accesibles,
barras interactivas, comparaciones y cronología, dentro y fuera del chat.
La conversación es memoria de la vista y se reinicia al cambiar de cuenta.

Se requiere el checkbox explícito para cada consulta con uso de proveedor.
Únicamente se transmiten recuentos agregados elegibles: no la pregunta,
identidad, nombres, notas, check-ins, medidas ni fotografías. Las consultas
privadas permanecen deterministas. El modelo es configurable y usa la misma
OPENAI_API_KEY del proveedor existente; no es una dependencia obligatoria.
Una instancia limita a 20 llamadas por cuenta/24 h, 1 simultánea por cuenta
y 4 globales; HTTP limita 20 preguntas/15 min por cuenta y 60 por IP.
Entrada 1200 caracteres, contexto ≤10000, salida 300 tokens/4000 caracteres,
timeout 8 s, sin retries. Uso solo agregado en memoria, sin logs personales.
Los presupuestos se reinician con la instancia; operación actual de una
réplica. Cualquier futura arquitectura distribuida necesita cuota compartida.

No hay automatizaciones de rutinas, sustituciones, asimetrías, planificador,
modo rápido ni nuevas suscripciones. Todas las escrituras están en formularios
con confirmación expresa y servicios autorizados. El asistente no escribe.

## Persistencia, calibración y recuperación

Migración `202610230001_coach`: cuatro tablas adicionales con dueño, FKs,
índices y trigger de coherencia entre cuenta, ejercicio y serie real. No
modifica filas de entrenamiento, PR ni migraciones anteriores.

Check-ins: 365 días; sugerencias: 90 días. Se purgan al guardar y con un job
diario solo cuando Coach está habilitado en desarrollo. Configuraciones y
perímetros se conservan hasta eliminación voluntaria/cuenta. Los backups
privados mantienen su retención previa (14 copias); purgar origen no elimina
copias anteriores antes de su vencimiento.

Registrar una sugerencia vuelve a calcularla, comprueba que coincida con la
vista y verifica referencia/configuración en transacción. Una asociación
requiere ID explícito de serie posterior, misma cuenta y ejercicio y
confirmación del usuario. La serie solo puede evaluar una sugerencia. Se
guarda resultado por referencia y hash, sin duplicar la serie. Las ediciones
o eliminaciones se muestran como tales y no se consideran muestras vigentes.
Ignorada no crea asociación. Sin datos reales longitudinales, no hay cifras
de precisión ni umbrales autorregulados aprendidos.

Backup portable v6 incluye cuatro colecciones Coach y valida aislamiento,
FKs, tipos, escalas y checksum. Se verifican v4/v5 originales antes de añadir
colecciones vacías. Restauración serializable, sin sobreescribir conflictos;
IDs ajenos se remapean por las reglas existentes. Los payloads de sugerencia
conservan su procedencia original y un hash no coincidente tras remapeo no se
presenta como calibración vigente. El dump PostgreSQL completo incluye las
tablas, constraints y migraciones, con ensayo de restauración y huellas.

Coach no agrega una cola offline. Sin conexión muestra estado explícito y
no confirma escrituras; no elimina Dexie, borradores ni colas existentes.
requestHash, idempotencia, versiones de sesión, Service Worker y flag de
sincronización productiva conservan sus contratos.

## Validación y límites de certificación

La matriz conserva fixtures de schema anteriores para las pruebas históricas,
luego instala el schema y cliente Coach reales y prueba migración, upgrade,
restore, HTTP Express/Fastify y Edge. Reruns están excluidos del total único.
Los registros finales y el informe consolidado están en server/audit/coach.
Se corrigió una comparación temporal del fixture HTTP heredado: dos JWT de
peticiones independientes pueden cruzar un segundo. Ahora se verifican firma
HS256, claims, emisión reciente y duración exacta de 365 días antes de
normalizar solo los tiempos volátiles. No se cambió la emisión de tokens.
Edge a 320/390 px verifica layout, formularios, consultas, cambio de cuenta
y fallos de red. No equivale a Safari/iPhone físico ni a una evaluación
auditiva con lector de pantalla. SVG tiene nombre accesible y tablas de datos;
botones/inputs nativos usan objetivos ≥44 px, etiquetas y foco visible.

La futura activación necesita revisión autorizada de migración persistente,
catálogo/preflight Coach, respaldo restaurable, cliente anterior y despliegue
aislado. El preflight productivo v4 conserva su catálogo y rechaza esta
expansión; no se le quita esa protección durante desarrollo.

