// PDF de un DÍA completo de entrenamiento (todos los WorkoutLog del día CDMX).
// Distinto de sessionPdf.js (un solo ejercicio). Lazy-importa jsPDF.
import { mexicoCityDateStr } from './dates';

function rirFromRpe(rpe) {
    return rpe != null && Number.isFinite(Number(rpe)) ? 10 - Number(rpe) : null;
}

function formatDayLabel(dayKey) {
    const [y, m, d] = String(dayKey).split('-').map(Number);
    if (!y || !m || !d) return dayKey;
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function epley(weight, reps) {
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    if (w <= 0 || r <= 0) return 0;
    return r === 1 ? w : w * (1 + r / 30);
}

function sessionVolume(session) {
    let total = 0;
    (session.sets || []).forEach(s => {
        total += (Number(s.weight) || 0) * (Number(s.reps) || 0);
        if (s.weightRight != null || s.repsRight != null) {
            total += (Number(s.weightRight) || Number(s.weight) || 0)
                * (Number(s.repsRight) || Number(s.reps) || 0);
        }
    });
    return total;
}

/**
 * @param {Array} sessions - logs del día (shape de GET /api/workouts/history)
 * @param {{ dayKey?: string, userName?: string }} opts
 *   dayKey: YYYY-MM-DD CDMX; si no, se infiere del primer session.date
 */
export async function downloadDayPdf(sessions, opts = {}) {
    const list = Array.isArray(sessions) ? sessions.filter(s => s?.sets?.length) : [];
    if (list.length === 0) {
        throw new Error('No hay ejercicios registrados ese día');
    }

    const dayKey = opts.dayKey
        || mexicoCityDateStr(new Date(list[0].date));
    const dayLabel = formatDayLabel(dayKey);
    const userName = opts.userName || '';

    // Orden estable: por nombre de ejercicio
    const sorted = [...list].sort((a, b) =>
        (a.exercise?.name || '').localeCompare(b.exercise?.name || '', 'es', { sensitivity: 'base' })
    );

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 16;
    let y = 18;

    const purple = [139, 92, 246];
    const purpleDark = [109, 62, 216];
    const textDark = [30, 30, 30];
    const textMed = [90, 90, 90];

    // Header
    doc.setFillColor(...purpleDark);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('NexLift', margin, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Resumen del día', margin, 20);
    doc.setFontSize(9);
    doc.text(dayKey, pageW - margin, 12, { align: 'right' });

    y = 38;

    doc.setTextColor(...textDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    const title = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
    doc.text(title, margin, y);
    y += 6;
    if (userName) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...textMed);
        doc.text(userName, margin, y);
        y += 6;
    }
    y += 4;

    // Totals
    const totalVolume = sorted.reduce((acc, s) => acc + sessionVolume(s), 0);
    const totalSets = sorted.reduce((acc, s) => acc + (s.sets?.length || 0), 0);
    const cardW = (pageW - margin * 2 - 10) / 3;
    const cards = [
        { label: 'Ejercicios', value: String(sorted.length) },
        { label: 'Series', value: String(totalSets) },
        { label: 'Volumen', value: `${Math.round(totalVolume).toLocaleString('es')} kg×r` }
    ];
    cards.forEach((c, i) => {
        const x = margin + i * (cardW + 5);
        doc.setFillColor(248, 248, 250);
        doc.roundedRect(x, y, cardW, 18, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...purple);
        doc.text(c.value, x + cardW / 2, y + 8, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...textMed);
        doc.text(c.label, x + cardW / 2, y + 14, { align: 'center' });
    });
    y += 26;

    // Each exercise
    for (const session of sorted) {
        const name = session.exercise?.name || 'Ejercicio';
        const sets = [...(session.sets || [])].sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));
        const hasUni = sets.some(s => s.weightRight != null || s.repsRight != null);

        // Space for title + table (~8mm + 8mm per set)
        const need = 14 + sets.length * 7;
        if (y + need > pageH - 20) {
            doc.addPage();
            y = margin;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...purple);
        doc.text(name, margin, y);
        y += 2;

        const body = sets.map((s, i) => {
            const rir = rirFromRpe(s.rpe);
            const rirStr = rir != null ? String(rir) : '—';
            if (hasUni) {
                return [
                    String(s.setNumber || i + 1),
                    `${s.weight ?? '—'}×${s.reps ?? '—'}`,
                    `${s.weightRight ?? s.weight ?? '—'}×${s.repsRight ?? s.reps ?? '—'}`,
                    rirStr
                ];
            }
            return [
                String(s.setNumber || i + 1),
                s.weight != null ? `${s.weight} kg` : '—',
                s.reps != null ? String(s.reps) : '—',
                rirStr
            ];
        });

        autoTable(doc, {
            startY: y,
            head: hasUni
                ? [['#', 'Izq', 'Der', 'RIR']]
                : [['#', 'Peso', 'Reps', 'RIR']],
            body,
            theme: 'grid',
            headStyles: { fillColor: purpleDark, fontSize: 8, halign: 'center' },
            bodyStyles: { fontSize: 9, textColor: textDark },
            columnStyles: {
                0: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
                1: { halign: 'center' },
                2: { halign: 'center' },
                3: { halign: 'center', textColor: purple }
            },
            margin: { left: margin, right: margin }
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // Footer last page
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMed);
    doc.text('NexLift — resumen del día', margin, pageH - 9);
    doc.text(dayKey, pageW - margin, pageH - 9, { align: 'right' });

    doc.save(`NexLift_Dia_${dayKey}.pdf`);
}
