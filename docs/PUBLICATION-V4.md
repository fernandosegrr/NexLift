# Publicación NexLift v4.0 — Fases 1–10

El propietario autorizó expresamente commits separados, integración en main,
push origin main y el posible autodespliegue vinculado a esa rama. Esta autorización
posterior sustituye la prohibición de publicación de las fases de preparación;
los informes históricos conservan sus resultados y restricciones originales.

## Alcance

Se publica el estado final por conjuntos funcionales, sin inventar revisiones
históricas de cada fase. Los contratos, la modularización y los modelos se solapan;
los commits intermedios se revisan como partes del conjunto v4, no como releases
independientes. Se preservan los commits remotos al integrar origin/main.

No se publican archivos .env, credenciales, dumps, copias privadas, node_modules,
builds ni diagnósticos temporales locales. Los fixtures históricos son entradas
necesarias de regresión y no backups operativos.

## Cambio del procedimiento automático

El Dockerfile raíz replica exactamente Dockerfile.release. Se elimina el antiguo
CMD que ejecutaba prisma db push y ocultaba sus errores. La nueva imagen compila
shared, backend y frontend con locks; usa Node 24.22.1/Debian/OpenSSL 3 y arranca
node deploy/release-http.mjs sin DDL ni reparación del esquema.

La configuración anterior de EasyPanel puede ser insuficiente. Se requiere puerto
interno 3001, variables explícitas y esquema compatible según
[configuración v4](RELEASE-V4-EASYPANEL.md). Si faltan variables o la baseline no
coincide, el servicio falla de forma segura antes de escuchar. No se añaden valores
por defecto que oculten ese gate ni se ejecutan migraciones persistentes.

Express se selecciona mediante NEXLIFT_HTTP_TRANSPORT=express. Fastify requiere
selección explícita y NEXLIFT_FASTIFY_ACTIVATION=reviewed-v4; no se activa aquí.
La nueva sincronización y la resolución siguen deshabilitadas en producción.

## Evidencia y límites

La matriz integral previa aprobó 1,464 pruebas únicas en Windows/Node 24.22.1,
con PostgreSQL desechable y Edge. Corresponde al código descrito en
[el cierre de Fase 10](../server/audit/release/PHASE-10-COMPLETE.md), anterior a
esta publicación. No equivale a una prueba nueva de producción ni de Linux.

La publicación añade comprobación de igualdad del Dockerfile por defecto con la
receta revisada. Las comprobaciones rápidas finales y el resultado real del push
se registran en el reporte de entrega de esta publicación, sin atribuirles la
certificación integral histórica.

Docker/Linux, baseline productiva y Safari/iOS físico siguen pendientes. La
workflow incluida es manual y de ensayo: no publica ni despliega. El repositorio
no demuestra por sí solo si existe un webhook EasyPanel ni que se haya ejecutado.
No se accede al panel ni se consultan credenciales.

## Intervención posterior

1. Revisar logs del proveedor si el despliegue automático arranca o falla.
2. Configurar variables, puerto y dominio conforme al runbook.
3. Revisar y validar la baseline mediante un proceso autorizado separado antes
   de cualquier migración persistente. No db push, reset, resolución forzada ni DDL
   automático; no marcar una base real como desechable para eludir protecciones.
4. No restaurar un backup anterior sobre escrituras nuevas. Preservar y reconciliar
   los datos antes de decidir una recuperación.

No se inicia NexLift Coach ni Fase 11.
