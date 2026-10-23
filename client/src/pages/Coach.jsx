import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRemoteRead } from '../app/useRemoteRead';
import { api } from '../services/api';
import { mexicoCityDateStr } from '../utils/dates';
import { readCoachReport, readCoachAnswer, readCheckIns } from '../features/coach/contracts';
import { Trend, VolumeBars } from '../features/coach/CoachCharts';
import { CheckInForm, ConfigForm, MeasurementForm, ConfirmDelete } from '../features/coach/CoachForms';
import { MUSCLES, STATES, RULES, FIELDS } from '../features/coach/labels';
import CurrentSetForm from '../features/coach/CurrentSetForm';
import './coach.css';

const SECTIONS = { plateau: 'Estancamientos', volume: 'Volumen', recovery: 'Recuperación', loading: 'Cargas v2', hypertrophy: 'Hipertrofia', timeline: 'Mesociclos' };
const identity = value => value;
function Card({ title, children }) { return <section className="coach-card"><h2>{title}</h2>{children}</section>; }
function Notes({ title = 'Cómo se calculó y límites', children }) { return <details className="coach-notes"><summary>{title}</summary>{children}</details>; }

function PlateauPanel({ report, exerciseId }) {
    const p = report.plateaus.find(p => p.exerciseId === exerciseId);
    if (!p) return <p>Registra tu primer entrenamiento para analizar la evolución.</p>;
    return <Card title={p.name}><span className={`coach-badge state-${p.state}`}>{STATES[p.state]}</span><div className="coach-stats"><div><strong>{p.sessions}</strong><span>días analizados</span></div><div><strong>{p.previous ?? '—'}</strong><span>e1RM previo · kg</span></div><div><strong>{p.recent ?? '—'}</strong><span>e1RM reciente · kg</span></div></div>
        <p>{p.from ? `${p.from} a ${p.to}. Último entrenamiento hace ${p.lastTrainedDays} días.` : 'Sin observaciones comparables.'}</p>
        <Trend title="Rendimiento estimado" points={p.points.map(s => ({ date: s.date, value: s.e1rm }))} unit="kg e1RM" />
        {p.observations.map((o, i) => <p key={i}>{o}</p>)}<p className="coach-action">{p.action}</p>
        <Notes><p>Evidencia: {p.evidence} (cantidad y comparabilidad; no probabilidad). Núcleo plateau v1: {p.corePlateau ? 'empate o descenso' : 'sin señal'}.</p><p>RIR previo: {p.previousRir ?? 'sin dato'} · reciente: {p.recentRir ?? 'sin dato'}. Repeticiones medias: {p.previousReps ?? '—'} → {p.recentReps ?? '—'}.</p>{p.missing.map((v, i) => <p key={i}>{v}</p>)}{p.hypotheses.map((v, i) => <p key={i}>Hipótesis: {v}</p>)}<p>Coach requiere 6 días / 14 días para comparar; posible estancamiento requiere 8 días / 28 días, RIR comparable y empate del núcleo. Progreso &gt;2%; regresión media &gt;5% con caída de los mejores registros. Son reglas heurísticas revisables. La ausencia no se clasifica como regresión.</p></Notes>
    </Card>;
}
function VolumePanel({ report }) {
    const weeks = [...new Set(report.volume.weeks.map(w => w.week))], [week, setWeek] = useState(weeks.at(-1) || ''), [muscle, setMuscle] = useState('chest');
    const selectedWeek = weeks.includes(week) ? week : weeks.at(-1), rows = report.volume.weeks.filter(w => w.week === selectedWeek), row = rows.find(w => w.muscle === muscle);
    return <Card title="Trabajo observado por músculo"><label>Semana CDMX (lunes–domingo)<select value={selectedWeek} onChange={e => setWeek(e.target.value)}>{weeks.map(w => <option key={w} value={w}>{w}</option>)}</select></label>
        {report.volume.partialCurrentWeek && selectedWeek === weeks.at(-1) && <p className="coach-muted">Semana en curso: no se compara con una semana completa.</p>}
        <VolumeBars rows={rows} labels={MUSCLES} onSelect={setMuscle} />
        {row && <><h3>{MUSCLES[muscle]}</h3><p>{row.frequency} días con trabajo registrado · {row.loadKgReps} kg×reps directos. {row.directDelta == null ? 'Comparación semanal no disponible o parcial.' : `Cambio de series directas: ${row.directDelta > 0 ? '+' : ''}${row.directDelta}.`}</p>
            <Trend title="Series directas por semana" unit="series" points={report.volume.weeks.filter(w => w.muscle === muscle).map(w => ({ date: w.week, value: w.direct }))} />
            <Notes title="Ejercicios, rutinas y mesociclos que contribuyeron">{row.contributions.length ? row.contributions.map((c, i) => <div key={i}><strong>{c.name}</strong><p>{c.direct} directas · {c.indirect} indirectas estimadas. Rutina {c.routineId || 'desconocida'} · bloque {report.blocks.find(b => b.id === c.blockId)?.name || 'sin contexto'}. Referencia: {c.sessionId}.</p><small>{c.source}</small></div>) : <p>No hay registros; esto no demuestra ausencia de entrenamiento.</p>}</Notes></>}
        <Notes><p>{report.volume.policy}</p><p>Sin un objetivo universal de series óptimas.</p></Notes>
        {!!report.volume.unknown.length && <div><h3>Información muscular insuficiente</h3>{report.volume.unknown.map(u => <p key={u.exerciseId}>{u.name}: {u.sets} series sin atribuir. Puedes clasificarlas voluntariamente en Cargas v2.</p>)}</div>}
    </Card>;
}
function RecoveryPanel({ report, busy, run, refresh }) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(report.now)), [date, setDate] = useState(today);
    const list = useRemoteRead('coach-checkins', [], () => api.coach('/check-ins'), readCheckIns);
    const r = report.recovery, initial = list.data?.find(c => c.date === date);
    return <><Card title="Tu recuperación declarada"><span className="coach-badge">{r.status === 'insufficient' ? 'Referencia personal insuficiente' : r.status === 'caution' ? 'Cambios respecto de tu referencia' : 'Dentro de la referencia observada'}</span>
        <p>{r.trainingDays} días con entrenamiento reciente · {r.restDaysSinceLast ?? '—'} días desde el último registro. Carga reciente {r.loadRecent} kg×reps; semana anterior {r.loadPrevious}. RIR reciente {r.rirRecent ?? 'sin dato'}.</p>
        {r.observations.map((v, i) => <p key={i}>{v}</p>)}{r.hypotheses.map((v, i) => <p key={i}>Hipótesis: {v}</p>)}<Notes>{r.limitations.map((v, i) => <p key={i}>{v}</p>)}{r.recent.map(m => <p key={m.field}>{FIELDS[m.field] || m.field}: {m.value} ({m.n} registros); referencia {m.baseline ?? 'no disponible'} ({m.baselineN}).</p>)}</Notes>
    </Card><Card title="Check-in privado"><label>Consultar o corregir fecha<input type="date" max={today} value={date} onChange={e => setDate(e.target.value)} /></label>{list.isPending ? <p role="status">Cargando check-ins…</p> : list.error ? <p role="alert">No se pudieron consultar tus registros. <button onClick={() => list.refetch()}>Reintentar</button></p> : <CheckInForm key={`${date}:${initial?.updatedAt || 'new'}`} date={date} initial={initial} busy={busy} onSave={body => run(async () => { await api.coach(`/check-ins/${date}`, body, 'PUT'); await list.refetch(); refresh(); })} />}
        {initial && <ConfirmDelete disabled={busy} onDelete={() => run(async () => { await api.coach(`/check-ins/${date}`, undefined, 'DELETE'); await list.refetch(); refresh(); })} />}
        <Notes title="Historial y privacidad"><p>Los check-ins no se envían al proveedor IA. Retención: 365 días; al guardar se purgan los más antiguos. Puedes corregir o eliminar cada fecha.</p>{list.data?.map(c => <button key={c.date} onClick={() => setDate(c.date)}>{c.date} · sueño {c.sleepHours ?? 'sin dato'} h</button>)}</Notes>
    </Card></>;
}
function Calibration({ exerciseId, busy, run, refresh }) {
    const list = useRemoteRead('coach-suggestions', [], () => api.coach('/suggestions'), identity);
    const results = useRemoteRead('coach-results', [exerciseId], () => api.coach(`/exercises/${exerciseId}/results`), identity, !!exerciseId);
    const [selected, setSelected] = useState({});
    return <Notes title="Evaluar sugerencias registradas">{list.data?.filter(s => s.exerciseId === exerciseId).map(s => <article key={s.id}><p>{new Date(s.createdAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}: {s.payload.recommendation.weight} kg × {s.payload.recommendation.reps} · {s.outcome} · {s.evaluation}</p>{s.outcome === 'presented' && <>
        <label>Serie real posterior (identidad exacta)<select value={selected[s.id] || ''} onChange={e => setSelected({ ...selected, [s.id]: e.target.value })}><option value="">Selecciona la serie que realizaste</option>{results.data?.filter(r => r.workoutLog.date >= s.createdAt).map(r => <option key={r.id} value={r.id}>{mexicoCityDateStr(new Date(r.workoutLog.date))} · {r.weight} kg × {r.reps} · {r.id}</option>)}</select></label>
        <div className="coach-row">{[['accepted', 'Confirmar aceptada'], ['modified', 'Confirmar modificada'], ['ignored', 'Confirmar ignorada']].map(([outcome, label]) => <button disabled={busy || outcome !== 'ignored' && !selected[s.id]} key={outcome} onClick={() => run(async () => { await api.coach(`/suggestions/${s.id}/feedback`, { outcome, confirm: true, ...(outcome === 'ignored' ? {} : { resultSetId: selected[s.id] }) }, 'PUT'); await list.refetch(); refresh(); })}>{label}</button>)}</div></>}{s.actual && <p>Resultado actual: {s.actual.weight} kg × {s.actual.reps}. Si se editó o eliminó la serie, se excluye de la calibración.</p>}</article>)}{list.error && <p>No se pudieron consultar sugerencias.</p>}<p>Sin asociación automática por fecha o parecido. La calibración requiere observaciones longitudinales; no calcula precisión fisiológica.</p></Notes>;
}
function LoadingPanel({ report, exerciseId, busy, run, refresh }) {
    const suggestion = report.loading.find(l => l.exerciseId === exerciseId);
    const config = useRemoteRead('coach-config', [exerciseId], () => api.coach(`/exercises/${exerciseId}/config`), identity, !!exerciseId);
    if (!suggestion) return <p>Elige un ejercicio con historial.</p>;
    return <Card title="Smart Loading 2.0 · evaluación"><div className="coach-stats"><div><strong>{suggestion.recommendation ? `${suggestion.recommendation.weight} × ${suggestion.recommendation.reps}` : 'Sin sugerencia'}</strong><span>v2 · kg × reps</span></div><div><strong>{suggestion.v1 ? `${suggestion.v1.weight} × ${suggestion.v1.reps}` : 'Sin sugerencia'}</strong><span>v1 · referencia intacta</span></div></div><p>Motivo: {RULES[suggestion.rule] || suggestion.rule}. {suggestion.adjustment}</p>
        <Notes><p>Referencia: {suggestion.reference ? `${suggestion.reference.sessionId}: ${suggestion.reference.weight} kg × ${suggestion.reference.reps}, RIR ${suggestion.reference.rir ?? 'sin dato'}` : 'insuficiente'}. Delta: {suggestion.delta ?? '—'} kg. Incremento: {suggestion.increment ?? 'sin configurar'}. Equipo: {suggestion.equipment || 'desconocido'}. Evidencia: {suggestion.evidence}.</p>{suggestion.limitations.map((v, i) => <p key={i}>{v}</p>)}</Notes>
        {suggestion.recommendation && <button disabled={busy} onClick={() => run(async () => { await api.coach(`/exercises/${exerciseId}/suggestions`, { ...suggestion.recommendation, referenceId: suggestion.reference.sessionId, rule: suggestion.rule }, 'POST'); refresh(); })}>Registrar esta sugerencia para evaluarla</button>}
        <Calibration exerciseId={exerciseId} busy={busy} run={run} refresh={refresh} />
        <CurrentSetForm key={exerciseId} exerciseId={exerciseId} busy={busy} run={run} />
        <Notes title="Clasificar ejercicio y confirmar equipo">{config.isPending ? <p>Cargando configuración…</p> : config.error ? <p>No se pudo consultar la configuración.</p> : <ConfigForm key={`${exerciseId}:${config.data?.updatedAt || 'new'}`} exerciseId={exerciseId} initial={config.data} onDone={() => { void config.refetch(); refresh(); }} run={run} busy={busy} />}</Notes>
    </Card>;
}
function HypertrophyPanel({ report, busy, run, refresh }) {
    const h = report.hypertrophy, [zone, setZone] = useState('biceps'), [photos, setPhotos] = useState(false);
    return <Card title="Cambios corporales observados"><Trend title="Peso corporal" unit="kg" points={h.weight} /><label>Perímetro por zona<select value={zone} onChange={e => setZone(e.target.value)}>{Object.entries(MUSCLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><Trend title={MUSCLES[zone]} unit="cm" points={h.measurements.filter(m => m.zone === zone).map(m => ({ date: m.date, value: m.cm }))} />
        {h.changes.map((c, i) => <p key={i}>{MUSCLES[c.metric] || 'Peso'}: {c.before} → {c.after} ({c.delta > 0 ? '+' : ''}{c.delta}) entre {c.from} y {c.to}.</p>)}
        <p>{h.training.days} días · {h.training.completedSets} series completas · {h.training.loadKgReps} kg×reps, frente a {h.training.previousLoadKgReps} en los {report.days} días anteriores.</p>
        <Notes>{h.limitations.map((v, i) => <p key={i}>{v}</p>)}</Notes><Notes title="Registrar o corregir perímetros"><MeasurementForm today={new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(report.now))} run={run} refresh={refresh} busy={busy} />{h.measurements.map(m => <div key={m.id} className="coach-between"><p>{m.date} · {MUSCLES[m.zone]} {m.cm} cm · {m.quality}</p><ConfirmDelete disabled={busy} onDelete={() => run(async () => { await api.coach(`/measurements/${m.id}`, undefined, 'DELETE'); refresh(); })} /></div>)}</Notes>
        <Link className="coach-link" to="/body">Registrar peso o fotos en Cuerpo →</Link><button onClick={() => setPhotos(!photos)}>{photos ? 'Ocultar fotos' : 'Consultar fotos voluntarias'}</button>{photos && <div className="coach-grid">{h.photos.length ? h.photos.map((p, i) => <figure key={i}><img loading="lazy" src={p.url} alt={`Foto voluntaria del ${p.date}`} /><figcaption>{p.date}</figcaption></figure>) : <p>No hay fotografías en este período.</p>}</div>}
    </Card>;
}
function TimelinePanel({ report }) {
    const [selected, setSelected] = useState(report.blocks.at(-1)?.id || '');
    const block = report.blocks.find(b => b.id === selected), rows = report.volume.weeks.flatMap(w => w.contributions.map(c => ({ ...c, muscle: w.muscle }))).filter(c => c.blockId === selected);
    return <Card title="Contexto de mesociclos"><label>Mesociclo<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Selecciona un bloque</option>{report.blocks.map(b => <option value={b.id} key={b.id}>{b.name} · {mexicoCityDateStr(new Date(b.startedAt))}</option>)}</select></label>{block && <p>Inicio {mexicoCityDateStr(new Date(block.startedAt))} · fase {block.phase}. Actividad dentro de los {report.days} días seleccionados.</p>}<div className="coach-scroll"><table><thead><tr><th>Músculo</th><th>Directas</th><th>Indirectas estimadas</th></tr></thead><tbody>{Object.entries(MUSCLES).map(([k, v]) => <tr key={k}><td>{v}</td><td>{rows.filter(c => c.muscle === k).reduce((n, c) => n + c.direct, 0)}</td><td>{rows.filter(c => c.muscle === k).reduce((n, c) => n + c.indirect, 0)}</td></tr>)}</tbody></table></div><div className="coach-scroll"><table><caption>Rendimiento por bloque dentro del período</caption><thead><tr><th>Bloque / ejercicio</th><th>Días</th><th>e1RM inicial → final</th><th>Series</th></tr></thead><tbody>{report.blockPerformance?.map((p, i) => <tr key={i}><td>{report.blocks.find(b => b.id === p.blockId)?.name} · {p.name} · {p.phase}</td><td>{p.days}</td><td>{p.firstE1rm ?? '—'} → {p.lastE1rm ?? '—'} kg</td><td>{p.sets}</td></tr>)}</tbody></table></div><Notes><p>Los bloques se asignan por rutina de origen y fecha de inicio registrada. Las ediciones históricas de un bloque no pueden reconstruirse; no se equiparan cargas entre fases o rutinas distintas. El selector permite contrastar cada bloque con los mismos criterios.</p></Notes></Card>;
}
function AnswerVisual({ view, report, exerciseId }) {
    const [muscle, setMuscle] = useState('chest');
    if (view === 'volume') {
        const week = report.volume.weeks.at(-1)?.week;
        return <div className="coach-inline-visual"><h3>Distribución semanal · {week}</h3><VolumeBars rows={report.volume.weeks.filter(w => w.week === week)} labels={MUSCLES} onSelect={setMuscle} /><p>{MUSCLES[muscle]}: {report.volume.weeks.find(w => w.week === week && w.muscle === muscle)?.frequency || 0} días con trabajo registrado.</p></div>;
    }
    if (view === 'plateau') {
        const p = report.plateaus.find(p => p.exerciseId === exerciseId);
        return p ? <div className="coach-inline-visual"><h3>{p.name}</h3><span className="coach-badge">{STATES[p.state]}</span><Trend title="Rendimiento observado" points={p.points.map(p => ({ date: p.date, value: p.e1rm }))} unit="kg e1RM" /></div> : <p>Faltan sesiones para visualizar el rendimiento.</p>;
    }
    if (view === 'hypertrophy') return <Trend title="Peso corporal observado" points={report.hypertrophy.weight} unit="kg" />;
    if (view === 'recovery') return <div className="coach-scroll"><table><caption>Bienestar relativo al historial individual</caption><thead><tr><th>Indicador</th><th>Reciente</th><th>Referencia</th></tr></thead><tbody>{report.recovery.recent.map(m => <tr key={m.field}><td>{FIELDS[m.field] || m.field}</td><td>{m.value} ({m.n})</td><td>{m.baseline ?? 'sin dato'} ({m.baselineN})</td></tr>)}</tbody></table>{!report.recovery.recent.length && <p>Sin check-ins suficientes.</p>}</div>;
    if (view === 'loading') {
        const s = report.loading.find(s => s.exerciseId === exerciseId);
        return <div className="coach-inline-visual"><strong>{s?.recommendation ? `${s.recommendation.weight} kg × ${s.recommendation.reps}` : 'Sin carga v2 verificable'}</strong><p>{RULES[s?.rule] || s?.rule}</p></div>;
    }
    if (view === 'timeline') return <ol>{report.blocks.map(b => <li key={b.id}>{mexicoCityDateStr(new Date(b.startedAt))} · {b.name} · {b.phase}</li>)}</ol>;
    return null;
}
function Workspace({ report, refresh, days }) {
    const [tab, setTab] = useState('plateau'), [selected, setSelected] = useState(report.plateaus[0]?.exerciseId || ''), [message, setMessage] = useState(''), [useProvider, setUseProvider] = useState(false), [answers, setAnswers] = useState([]), [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
    const exerciseId = report.plateaus.some(p => p.exerciseId === selected) ? selected : report.plateaus[0]?.exerciseId || '';
    const run = async work => { if (busy) return; setBusy(true); setError(''); setStatus(''); try { await work(); setStatus('Operación confirmada por el servidor.'); } catch (e) { setError(e.message || 'No se pudo confirmar la operación.'); } finally { setBusy(false); } };
    const ask = async text => { if (!text.trim() || busy) return; setBusy(true); setError(''); try { const response = readCoachAnswer(await api.coach('/ask', { message: text, exerciseId: exerciseId || null, days, useProvider }, 'POST')); setAnswers(prev => [...prev.slice(-7), { question: text, ...response, analysis: response.analysis || report }]); setMessage(''); } catch (e) { setError(e.message); } finally { setBusy(false); } };
    const props = { report, exerciseId, busy, run, refresh };
    return <><div className="coach-stats"><div><strong>{report.hypertrophy.training.days}</strong><span>días registrados</span></div><div><strong>{report.hypertrophy.training.completedSets}</strong><span>series completas</span></div><div><strong>{report.plateaus.filter(p => p.state === 'possible_plateau' || p.state === 'regression').length}</strong><span>ejercicios para revisar</span></div></div>
        <nav className="coach-tabs" aria-label="Análisis Coach">{Object.entries(SECTIONS).map(([key, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>
        {['plateau', 'loading'].includes(tab) && <label>Ejercicio<select value={exerciseId} onChange={e => setSelected(e.target.value)}><option value="" disabled>Selecciona un ejercicio</option>{report.plateaus.map(p => <option key={p.exerciseId} value={p.exerciseId}>{p.name} · {STATES[p.state]}</option>)}</select></label>}
        {tab === 'plateau' && <PlateauPanel {...props} />}{tab === 'volume' && <VolumePanel report={report} />}{tab === 'recovery' && <RecoveryPanel {...props} />}{tab === 'loading' && <LoadingPanel {...props} />}{tab === 'hypertrophy' && <HypertrophyPanel {...props} />}{tab === 'timeline' && <TimelinePanel report={report} />}
        <Card title="Pregúntale a tus datos"><p className="coach-muted">Entrenamiento individual, explicado con tus registros. Funciona sin proveedor IA.</p><div className="coach-prompts">{['¿Por qué no progreso?', '¿Qué músculos entrené menos este mes?', '¿Cómo influye mi recuperación?', '¿Qué datos te faltan?'].map(q => <button key={q} disabled={busy} onClick={() => ask(q)}>{q}</button>)}</div>
            <div className="coach-conversation" aria-live="polite">{answers.map((a, i) => <article key={i}><h3>{a.question}</h3><span className="coach-badge">{a.mode === 'provider' ? 'IA · hechos verificados' : 'Análisis determinista'}</span><p className="coach-muted">Datos al {mexicoCityDateStr(new Date(a.analysis.now))} · {a.analysis.days} días analizados.</p>{a.text.map((t, j) => <p key={j}>{t}</p>)}{a.views.map(view => <AnswerVisual key={view} view={view} report={a.analysis} exerciseId={a.exerciseId} />)}<div className="coach-row">{a.views.map(view => <button key={view} onClick={() => setTab(view)}>Ver {SECTIONS[view]}</button>)}</div><Notes><p>Hechos: {a.factIds.join(', ') || 'sin hechos suficientes'}.</p>{a.limitations.map((v, j) => <p key={j}>{v}</p>)}</Notes><div className="coach-row">{a.followUps.map(q => <button disabled={busy} key={q} onClick={() => ask(q)}>{q}</button>)}</div></article>)}</div>
            <form className="coach-form" onSubmit={e => { e.preventDefault(); void ask(message); }}><label>Tu pregunta<textarea maxLength={1200} rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="¿Cómo va mi volumen semanal?" /></label><label className="coach-check"><input type="checkbox" checked={useProvider} onChange={e => setUseProvider(e.target.checked)} />Permitir al proveedor elegir visualizaciones usando solo recuentos agregados de entrenamiento. No se envían preguntas, nombres, sueño, estrés, medidas ni fotos.</label><button className="coach-primary" disabled={busy || !message.trim()}>Consultar Coach</button></form>
        </Card>
        <div role="status">{busy ? 'Consultando o guardando…' : status}</div>{error && <p role="alert" className="coach-error">{error}</p>}
    </>;
}
export default function Coach() {
    const [days, setDays] = useState(56), enabled = true;
    const query = useRemoteRead('coach-report', [days], () => api.coach(`/report?days=${days}`), readCoachReport, enabled);
    return <div className="coach-page"><header className="coach-header"><Link to="/progress">← Progreso</Link><span className="coach-badge">Análisis de entrenamiento</span><h1>NexLift <em>Coach</em></h1><p>Entiende tu entrenamiento.<br />Decide tu siguiente paso.</p></header>
        {!enabled ? <p>Coach aún no está activado en esta versión. Tus entrenamientos siguen disponibles.</p> : <><div className="coach-between"><label>Período de análisis<select value={days} onChange={e => setDays(e.target.value === 'month' ? 'month' : Number(e.target.value))}><option value="month">Este mes (CDMX)</option>{[28, 56, 90, 180, 365].map(n => <option key={n} value={n}>{n} días</option>)}</select></label><button onClick={() => query.refetch()} disabled={query.isFetching}>Actualizar datos</button></div>
            <p className="coach-muted">Coach requiere conexión para consultar y guardar. Los cambios solo se confirman con respuesta del servidor.</p>
            {query.isPending ? <p role="status">Preparando tus análisis…</p> : query.error ? <div role="alert"><p>{query.error.message}</p><p>Si no hay conexión, no se confirmó ningún guardado.</p><button onClick={() => query.refetch()}>Reintentar</button></div> : <>{query.data.truncated && <p role="alert">Historial limitado: resultados parciales. Reduce el período.</p>}<Workspace report={query.data} refresh={() => { void query.refetch(); }} days={days} /></>}
        </>}
    </div>;
}






