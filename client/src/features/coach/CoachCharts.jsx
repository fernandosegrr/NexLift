export function Trend({ title, points, unit = '' }) {
    if (!points.length) return <p className="coach-muted">Sin registros suficientes para {title.toLowerCase()}.</p>;
    const values = points.map(p => p.value), min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const xy = points.map((p, i) => `${12 + i / Math.max(1, points.length - 1) * 276},${88 - (p.value - min) / span * 66}`);
    return <figure className="coach-chart"><figcaption>{title} · {unit}</figcaption>
        <svg viewBox="0 0 300 104" role="img" aria-label={`${title}: ${points.length} registros. Datos exactos en la tabla desplegable.`}>
            <path d="M12 88H288" stroke="var(--border)" /><polyline points={xy.join(' ')} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
            {points.map((p, i) => <circle key={`${p.date}-${i}`} cx={xy[i].split(',')[0]} cy={xy[i].split(',')[1]} r="3" fill="var(--primary)"><title>{p.date}: {p.value} {unit}</title></circle>)}
        </svg>
        <div className="coach-between coach-muted"><span>{points[0].date}</span><span>{points.at(-1).date}</span></div>
        <details><summary>Consultar datos exactos</summary><div className="coach-scroll"><table><thead><tr><th>Fecha CDMX</th><th>{unit || 'Valor'}</th></tr></thead><tbody>{points.map((p, i) => <tr key={i}><td>{p.date}</td><td>{p.value}</td></tr>)}</tbody></table></div></details>
    </figure>;
}

export function VolumeBars({ rows, labels, onSelect }) {
    const max = Math.max(1, ...rows.map(r => r.direct + r.indirect));
    return <div className="coach-bars">{rows.map(row => <button key={row.muscle} onClick={() => onSelect(row.muscle)} aria-label={`Ver ${labels[row.muscle]}: ${row.direct} directas y ${row.indirect} indirectas estimadas`}>
        <span className="coach-between"><span>{labels[row.muscle]}</span><span>{row.direct} <small>directas</small> + {row.indirect} <small>estimadas</small></span></span>
        <span className="coach-bar"><span style={{ width: `${row.direct / max * 100}%` }} /><span style={{ width: `${row.indirect / max * 100}%` }} /></span>
    </button>)}</div>;
}
