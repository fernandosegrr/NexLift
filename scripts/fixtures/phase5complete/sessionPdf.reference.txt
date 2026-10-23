// PDF de UNA sesión de entrenamiento (WorkoutLog + sets).
// Lazy-importa jsPDF igual que ExportReport — no hincha el bundle inicial.
import { mexicoCityDateStr } from './dates';

function rirFromRpe(rpe) {
    return rpe != null && Number.isFinite(Number(rpe)) ? 10 - Number(rpe) : null;
}

function formatDayLabel(dateInput) {
    const key = mexicoCityDateStr(new Date(dateInput));
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('es-ES', {
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

/**
 * @param {object} session - shape de GET /api/workouts/:logId
 *   { id, date, exercise: { name, ... }, sets: [{ setNumber, weight, reps, rpe, weightRight, repsRight }] }
 * @param {{ userName?: string }} opts
 */
export async function downloadSessionPdf(session, opts = {}) {
    if (!session?.sets?.length) {
        throw new Error('La sesión no tiene series');
    }

    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 16;
    let y = 18;

    const purple = [139, 92, 246];
    const purpleDark = [109, 62, 216];
    const textDark = [30, 30, 30];
    const textMed = [90, 90, 90];
    const green = [34, 197, 94];

    // Header band
    doc.setFillColor(...purpleDark);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('NexLift', margin, 12);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Sesión de entrenamiento', margin, 20);
    doc.setFontSize(9);
    doc.text(mexicoCityDateStr(), pageW - margin, 12, { align: 'right' });

    y = 38;

    const exerciseName = session.exercise?.name || 'Ejercicio';
    const dayLabel = formatDayLabel(session.date);
    const userName = opts.userName || '';

    doc.setTextColor(...textDark);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(exerciseName, margin, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...textMed);
    doc.text(dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1), margin, y);
    if (userName) {
        y += 5;
        doc.text(userName, margin, y);
    }
    y += 10;

    // Stats summary
    const sets = [...(session.sets || [])].sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0));
    let volume = 0;
    let best1RM = 0;
    let bestLabel = '';

    sets.forEach(s => {
        const w = Number(s.weight) || 0;
        const r = Number(s.reps) || 0;
        volume += w * r;
        if (s.weightRight != null || s.repsRight != null) {
            volume += (Number(s.weightRight) || w) * (Number(s.repsRight) || r);
        }
        const effW = s.weightRight != null
            ? Math.min(w, Number(s.weightRight) || w)
            : w;
        const effR = s.repsRight != null
            ? Math.min(r, Number(s.repsRight) || r)
            : r;
        const rm = epley(effW, effR);
        if (rm > best1RM) {
            best1RM = rm;
            bestLabel = `${effW}kg × ${effR}`;
        }
    });

    const cardW = (pageW - margin * 2 - 10) / 3;
    const cards = [
        { label: 'Series', value: String(sets.length) },
        { label: 'Volumen', value: `${Math.round(volume).toLocaleString('es')} kg×r` },
        { label: 'Mejor (1RM est.)', value: best1RM > 0 ? `~${Math.round(best1RM)} kg` : '—' }
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

    if (bestLabel) {
        doc.setFontSize(9);
        doc.setTextColor(...textMed);
        doc.text(`Mejor serie de la sesión: ${bestLabel}`, margin, y);
        y += 8;
    }

    // Sets table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...purple);
    doc.text('SERIES', margin, y);
    y += 4;

    const hasUnilateral = sets.some(s => s.weightRight != null || s.repsRight != null);

    const head = hasUnilateral
        ? [['#', 'Izq', 'Der', 'RIR']]
        : [['#', 'Peso', 'Reps', 'RIR']];

    const body = sets.map((s, i) => {
        const rir = rirFromRpe(s.rpe);
        const rirStr = rir != null ? String(rir) : '—';
        if (hasUnilateral) {
            const left = `${s.weight ?? '—'}×${s.reps ?? '—'}`;
            const right = `${s.weightRight ?? s.weight ?? '—'}×${s.repsRight ?? s.reps ?? '—'}`;
            return [String(s.setNumber || i + 1), left, right, rirStr];
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
        head,
        body,
        theme: 'grid',
        headStyles: { fillColor: purpleDark, fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 10, textColor: textDark },
        columnStyles: {
            0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
            1: { halign: 'center' },
            2: { halign: 'center' },
            3: { halign: 'center', textColor: purple }
        },
        margin: { left: margin, right: margin }
    });

    y = doc.lastAutoTable.finalY + 12;

    // Footer note
    doc.setFontSize(8);
    doc.setTextColor(...textMed);
    doc.setFont('helvetica', 'italic');
    doc.text('Generado con NexLift — 1RM estimado con fórmula de Epley.', margin, y);
    if (best1RM > 0) {
        y += 4;
        doc.setTextColor(...green);
        doc.text(`1RM estimado de la sesión ≈ ${Math.round(best1RM * 10) / 10} kg`, margin, y);
    }

    // Page footer
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220, 220, 220);
    doc.line(margin, pageH - 14, pageW - margin, pageH - 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...textMed);
    doc.text('NexLift', margin, pageH - 9);
    doc.text(exerciseName.slice(0, 40), pageW - margin, pageH - 9, { align: 'right' });

    const safeName = exerciseName.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/gi, '').trim().replace(/\s+/g, '_') || 'sesion';
    const dayKey = mexicoCityDateStr(new Date(session.date));
    doc.save(`NexLift_Sesion_${safeName}_${dayKey}.pdf`);
}
