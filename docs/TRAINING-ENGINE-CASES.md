> Cierre de Fase 5 (5.4–5.5): [políticas, correcciones e integración vigentes](TRAINING-ANALYSIS.md).
> El contenido de fases anteriores se conserva como referencia histórica.

> Fase 5.3: [Smart Loading compartido, reglas y consumidores actuales](TRAINING-SMART-LOADING.md).
> Las ubicaciones y limitaciones de fases anteriores se conservan debajo como referencia histórica.

# Referencias sintéticas de caracterización 5.1

> Casos 5.2: `scripts/test/training-performance.test.mjs` (28) y
> `server/test/performance.integration.test.js` (4). Cubren esfuerzo contextual,
> igualdad original/nueva, empates, lados, ediciones/eliminaciones, HTTP/SQL y
> reproducción del build del harness. [Políticas y alcance](TRAINING-PERFORMANCE.md).

Las expectativas describen la versión recibida, incluidas anomalías. No convierten
un error histórico en criterio deportivo definitivo. Archivo ejecutable:
`scripts/test/training-characterization.test.mjs` (29 casos); los números de
esta tabla son referencias documentales y no inflan el conteo del runner.

| Caso | Entrada / frontera | Resultado protegido / observación |
| --- | --- | --- |
| C01 | 80kg×10 | Historial/PR106.66666666666666kg; strength106.7; PDF sin redondear |
| C02 | 80×1,80×37,80×1000 | Single80 salvo Workout estimate82.66666666666667; cap37/1000→176; PR37→80; strength37→178.7 |
| C03 | undefined/null/''/0/NaN/peso negativo;80.25×10.5;Infinity;Symbol |0 por ausencia/coerción; fracciones preservadas; Infinity histórico; Symbol TypeError |
| C04 | Izquierda80×10/derecha100×10/incompleta | PR100×10; effectiveWorkoutSet de80×10/100×8→80×8 RIR2 |
| C05 | Dos marcas exactamente80×10 | PR mantiene primera fecha/set suministrado; queryowner y fechaASC, mismo cliente TX |
| C06 | 80×10 vs100×2 | Epley diferencia1paso IEEE-754; gana100×2 por `>` estricto |
| C07 | Solo sets0×10/80×0 | Recalc elimina PR derivado y devuelve null; no crea registro0 |
| C08 | RIR0,1,2,3,4 | Almacenado10,9,8,7,6; Atajo normaliza ambos formatos; API idempotente exige coherencia y preserva día original; lados no reinterpretan esfuerzo |
| C09 | Atajo sin esfuerzo, rir3+rpe9, rpe5; fila histórica rpe5 | Atajo default10; rir manda→7;5rechazado; sanitizeSets histórico5aceptado; helper '2junk'→8 |
| C10 | Cargas2000/reps1000/rpe0;0×0incompleta;51sets | Límiteaceptado;0incompletaaceptada;>50rechazado; string80.5kg/10.9 legacy→80.5/10 |
| C11 | Smart80×10RIR2;top80×12RIR1+80×8; varianteRIR3 |80×11;82.5×8;80×9; sinhistoria/nullseries→null |
| C12 | Añadir sesión antigua200×20 detrás de80×10 | Misma recomendación, basedOn pasa1→2; primera sesión vacía no busca otra válida |
| C13 |110×1/100×4/100×3;100×5RIR1+80×12;100×8+50×20 |Referencias100 en los tres; singles,topintenso y drop poseen reglas distintas |
| C14 |'12-8','AMRAP','2.5','-4';intensificación5–9/acumulación8–11;incremento0 |8–12/default8–12/2–5/4–4;3–5/8–17; grid.5; kg6.8+2.5→9.5 |
| C15 |Intra primera80×8RIR0; faltaRIR;10RIR3→8RIR1;8RIR3 |70×10;null;80×8;80×10 |
| C16 |Invertir dossets intra; inter completed:false |Intra difiere por última/primera; inter no filtra flag |
| C17 |480combinaciones pesos/reps/fases/RIR |Paridad completa cliente/backend, determinismo, arrays intactos, resultados finitos en dominio probado |
| C18 |80×10+derecha0×0; derecha solo60kg |Workout800/PDF1600/report800; parcialWorkout800/PDF1400/report1400 |
| C19 |80.5×10 +60×8+55×7, arrayscongelados |1670kg×rep, no mutación; inversión exacta en ESTA fixture, sin prometer asociatividad flotante general |
| C20 |3díasiguales,4iguales,4mejorando;duplicar log mismo día;4sintrabajo |false,true,false; duplicado no suma día; sintrabajo true histórico |
| C21 |7días con pico fuera ventana;incompletas/lados;100×1,100×1,80×37,80×37 |Picoantiguo ignorado; incompletas cuentan; plateau backendtrue/helperfrontendfalse |
| C22 |05:59:59Z/06:00Z, domingo→lunes,31enero→1febrero,31dic→1enero |DíaCDMX correcto; últimos3días cruzan mes; rangocivil31ene–1feb→[31ene06Z,2feb06Z) |
| C23 |Mismo05:30Z bajo TZUTC/CDMX/Tokio |HelperCDMX siempre18oct; groupinghistórico19/18/19oct respectivamente |
| C24 |Verano/invierno2021;4abril2021a12Z |Offset-300/-360; bounds05Z cae3abril, limitaciónDST comprobada; duraciónfija24h |
| C25 |Bloque30ene18Z→6feb17:59/18:00;nowantesstart |Semana1/2; antesstartsemana0; startedAtnull→null; duration1no corta |
| C26 |Bloquesporstart, empate,custom+adaptive |Másnuevo manda, empateprimero, custombloque prevalece sobre adaptive; vencidauntil no activa |
| C27 |Regresiónsinpuntos/xconstante/yconstante/recta10,12,14 |0/0,0/0,0/0,slope2/r2=1 |
| C28 |Plan100→110a1kgsem/reps1/frecuencia1vs7;gapnegativo/rate0 |11filas, rejilla5, misma salida por argumento no usado; últimaTEST110; inválidos[] |
| C29 |100×7+115×1 y otrodía120×8,target1 |Solo115como evidencia elegible; días sinrepselegibles no demuestran meta |

`scripts/test/training-shared.test.mjs` añade ocho pruebas:

| Caso | Comprobación |
| --- | --- |
| S01 |Cuerpo extraído idéntico a ambos snapshots tras borrar solo anotaciones TS; no queda otro cuerpo epley activo en exerciseName |
| S02 |28×28 entradas adversas, resultados/errores exactos entre referencia/TS/ESM/CJS y dos fachadas |
| S03 |2,000 entradas deterministas válidas: finite/no negativo/determinismo/cap/monotonía de peso y repsenteras; semilla0x51a1 |
| S04 |Map y evidencia de metas de ambos pipelines, nombres/lados/orden/inputsinmutar, equivalencia exacta a snapshots |
| S05 |Import clienteESM/servidorCJS; backendESM con native TS stripping deshabilitado; artefacto sin imports runtime externos |
| S06 |Mapasbundle→ESMemitido→TS y sourcesContent exacto; declaraciones shared/client/server emitidas |
| S07 |Strictrechaza4usoserróneos controlados; fixture normal compila; diagnósticos todos en archivo previsto |
| S08 |Edge realperfilaislado: React monta el módulo consumidor,80×10→106.666...,botón37→176en fórmula/historial,botón1→80; getCurrentGoalTarget resuelve100en fixture |

Las integraciones anteriores conservan aserciones sobre edición/borrado de la
mejor serie, transacciones/rebuildPR, cuentas, idempotencia, conflictos, borradores,
Atajos/importación y fechas originales. Sus repeticiones no son casos nuevos.
No se afirmará resultado integral hasta observar salida0 o cierre verificable
con límites expresos en [PHASE-5.1](../server/audit/training-engine/PHASE-5.1.md).
