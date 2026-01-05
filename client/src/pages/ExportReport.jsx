import { useState, useEffect, useRef, useMemo } from 'react';
import { FileText, Download, Calendar, TrendingUp, Trophy, Dumbbell, Scale, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

// ==========================================
// CONSTANTS
// ==========================================
const PERIODS = [
    { id: 'weekly', label: 'Semanal', days: 7 },
    { id: 'monthly', label: 'Mensual', days: 30 },
    { id: 'quarterly', label: 'Trimestral', days: 90 },
    { id: 'semester', label: 'Semestral', days: 180 },
    { id: 'yearly', label: 'Anual', days: 365 },
];

// PDF Color palette
const COLORS = {
    purple: [139, 92, 246],
    purpleDark: [109, 62, 216],
    textDark: [30, 30, 30],
    textMedium: [80, 80, 80],
    textLight: [130, 130, 130],
    green: [34, 197, 94],
    red: [239, 68, 68],
    yellow: [234, 179, 8],
    white: [255, 255, 255],
    bgLight: [250, 250, 250],
    bgAlt: [248, 248, 248],
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================
async function loadLogoBase64() {
    try {
        const response = await fetch('/logo.png');
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

// ==========================================
// COMPONENT
// ==========================================
export default function ExportReport() {
    const toast = useToast();
    const chartRef = useRef(null);

    // Data states with safe defaults
    const [stats, setStats] = useState(null);
    const [routine, setRoutine] = useState(null);
    const [prs, setPrs] = useState([]);
    const [bodyLogs, setBodyLogs] = useState([]);
    const [consistency, setConsistency] = useState({});
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [logoBase64, setLogoBase64] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);

    // UI state
    const [period, setPeriod] = useState('monthly');

    // Fetch data on mount
    useEffect(() => {
        fetchAllData();
        // Preload logo once
        loadLogoBase64().then(setLogoBase64);
    }, []);

    async function fetchAllData() {
        try {
            const [statsData, routineData, prsData, bodyData, consistencyData, historyData] = await Promise.all([
                api.getOverviewStats(),
                api.getActiveRoutine(),
                api.getPersonalRecords(),
                api.getBodyLogs(365),
                api.getConsistency(),
                api.getWorkoutHistory(500) // Fetch enough for annual reports
            ]);

            setStats(statsData || {});
            setRoutine(routineData);
            setPrs(prsData || []);
            setBodyLogs(bodyData || []);
            setWorkoutHistory(historyData || []);

            const map = {};
            if (consistencyData?.events) {
                consistencyData.events.forEach(dateStr => {
                    const localDate = new Date(dateStr).toLocaleDateString('en-CA');
                    map[localDate] = (map[localDate] || 0) + 1;
                });
            }
            setConsistency(map);
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error cargando datos');
        } finally {
            setLoading(false);
        }
    }

    // ==========================================
    // MEMOIZED CALCULATIONS
    // ==========================================
    const selectedPeriod = useMemo(() =>
        PERIODS.find(p => p.id === period) || PERIODS[1],
        [period]);

    const cutoffDate = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() - selectedPeriod.days);
        return date;
    }, [selectedPeriod]);

    const filteredPRs = useMemo(() =>
        prs.filter(pr => new Date(pr.date) >= cutoffDate).slice(0, 15),
        [prs, cutoffDate]);

    const filteredBodyLogs = useMemo(() =>
        bodyLogs.filter(l => new Date(l.date) >= cutoffDate && l.weight),
        [bodyLogs, cutoffDate]);

    // Photos for progress section (only if 2+ photos exist)
    const progressPhotos = useMemo(() => {
        const photos = bodyLogs
            .filter(l => new Date(l.date) >= cutoffDate && l.photo)
            .sort((a, b) => new Date(a.date) - new Date(b.date)); // Oldest first
        return photos.length >= 2 ? photos : [];
    }, [bodyLogs, cutoffDate]);

    const filteredHistory = useMemo(() =>
        workoutHistory.filter(h => new Date(h.date) >= cutoffDate),
        [workoutHistory, cutoffDate]);

    const periodDays = useMemo(() =>
        Object.keys(consistency).filter(d => new Date(d) >= cutoffDate).length,
        [consistency, cutoffDate]);

    const totalSessions = useMemo(() => filteredHistory.length, [filteredHistory]);

    const { weightData, startWeight, endWeight, weightChange, weightChartData } = useMemo(() => {
        const data = filteredBodyLogs.slice().reverse();
        const start = data[0]?.weight;
        const end = data[data.length - 1]?.weight;
        const change = end && start ? Number((end - start).toFixed(2)) : null;
        const chartData = data.map(l => ({
            date: new Date(l.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            weight: l.weight
        }));
        return { weightData: data, startWeight: start, endWeight: end, weightChange: change, weightChartData: chartData };
    }, [filteredBodyLogs]);

    // Calculate exercise progress with delta
    const progressData = useMemo(() => {
        const routineExercises = [];
        if (routine?.days) {
            routine.days.forEach(day => {
                if (!day.isRestDay && day.exercises) {
                    day.exercises.forEach(ex => {
                        if (!routineExercises.find(e => e.name === ex.name)) {
                            routineExercises.push({ name: ex.name, id: ex.id });
                        }
                    });
                }
            });
        }

        const exerciseProgress = {};
        filteredHistory.forEach(session => {
            const exName = session.exercise?.name;
            if (!exName || !session.sets || session.sets.length === 0) return;

            const bestSet = session.sets.reduce((best, s) => {
                if (!best || (s.weight || 0) > (best.weight || 0)) return s;
                return best;
            }, null);

            if (!bestSet) return;

            if (!exerciseProgress[exName]) {
                exerciseProgress[exName] = { first: null, last: null };
            }

            const sessionData = {
                date: session.date,
                weight: bestSet.weight || 0,
                reps: bestSet.reps || 0
            };

            if (!exerciseProgress[exName].first || new Date(session.date) < new Date(exerciseProgress[exName].first.date)) {
                exerciseProgress[exName].first = sessionData;
            }
            if (!exerciseProgress[exName].last || new Date(session.date) > new Date(exerciseProgress[exName].last.date)) {
                exerciseProgress[exName].last = sessionData;
            }
        });

        return routineExercises.map(ex => {
            const data = exerciseProgress[ex.name];
            if (!data || !data.first || !data.last) {
                return { name: ex.name, hasData: false };
            }
            return {
                name: ex.name,
                firstWeight: data.first.weight,
                firstReps: data.first.reps,
                lastWeight: data.last.weight,
                lastReps: data.last.reps,
                deltaWeight: Number((data.last.weight - data.first.weight).toFixed(2)),
                deltaReps: data.last.reps - data.first.reps,
                hasData: true
            };
        });
    }, [routine, filteredHistory]);

    // ==========================================
    // PDF GENERATION
    // ==========================================
    async function generatePDF() {
        setGenerating(true);
        toast.info('Generando PDF...');

        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const footerHeight = 20; // Space reserved for footer
            let y = 0;

            // Helper: ensures enough space for content, adds page if needed
            function ensureSpace(requiredHeight) {
                const availableSpace = pageHeight - y - footerHeight;
                if (availableSpace < requiredHeight) {
                    doc.addPage();
                    y = margin;
                }
            }

            // Helper: prints a section title with space check
            function printSectionTitle(title, minTableHeight = 50) {
                ensureSpace(minTableHeight);
                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.textDark);
                doc.text(title, margin, y);
                y += 10;
            }

            // ===== HEADER WITH GRADIENT =====
            for (let i = 0; i < 45; i++) {
                const ratio = i / 45;
                const r = Math.round(COLORS.purple[0] + (COLORS.purpleDark[0] - COLORS.purple[0]) * ratio);
                const g = Math.round(COLORS.purple[1] + (COLORS.purpleDark[1] - COLORS.purple[1]) * ratio);
                const b = Math.round(COLORS.purple[2] + (COLORS.purpleDark[2] - COLORS.purple[2]) * ratio);
                doc.setFillColor(r, g, b);
                doc.rect(0, i, pageWidth, 1, 'F');
            }

            if (logoBase64) {
                doc.addImage(logoBase64, 'PNG', margin, 8, 28, 28);
            }

            doc.setTextColor(...COLORS.white);
            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            doc.text('NexLift', logoBase64 ? margin + 34 : margin, 22);

            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text(`Reporte de Progreso ${selectedPeriod.label}`, logoBase64 ? margin + 34 : margin, 32);

            doc.setFontSize(11);
            doc.text(new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }), pageWidth - margin, 22, { align: 'right' });

            y = 55;

            // ===== STATS SUMMARY =====
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...COLORS.textDark);
            doc.text('RESUMEN DEL PERIODO', margin, y);
            y += 10;

            const cardWidth = (pageWidth - margin * 2 - 15) / 4;
            const cardHeight = 28;

            const statsCards = [
                { value: periodDays, label: 'Dias Entrenados', color: COLORS.purple },
                { value: totalSessions, label: 'Sesiones', color: [59, 130, 246] },
                { value: filteredPRs.length, label: 'PRs Logrados', color: COLORS.yellow },
                { value: weightChange ? `${weightChange > 0 ? '+' : ''}${weightChange}kg` : '--', label: 'Cambio Peso', color: weightChange > 0 ? COLORS.green : weightChange < 0 ? COLORS.red : COLORS.textLight }
            ];

            statsCards.forEach((card, i) => {
                const x = margin + i * (cardWidth + 5);
                doc.setFillColor(...COLORS.bgLight);
                doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, 'F');
                doc.setFillColor(...card.color);
                doc.roundedRect(x, y, 3, cardHeight, 1, 1, 'F');

                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...card.color);
                doc.text(String(card.value), x + cardWidth / 2 + 2, y + 12, { align: 'center' });

                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.textLight);
                doc.text(card.label, x + cardWidth / 2 + 2, y + 21, { align: 'center' });
            });

            y += cardHeight + 15;

            // ===== ACTIVE ROUTINE (using autoTable) =====
            if (routine) {
                printSectionTitle(`RUTINA ACTIVA: ${routine.name}`, 40);

                routine.days.forEach((day) => {
                    ensureSpace(30); // Ensure space for day header + some rows

                    const exercises = (!day.isRestDay && day.exercises) ? day.exercises : [];
                    const tableData = exercises.map(ex => [ex.name, `${ex.targetSets}x${ex.targetReps}`]);

                    autoTable(doc, {
                        startY: y,
                        head: [[`${day.dayName}${day.isRestDay ? ' (Descanso)' : ''}`, '']],
                        body: tableData.length > 0 ? tableData : [['Dia de descanso', '']],
                        theme: 'plain',
                        headStyles: {
                            fillColor: COLORS.purple,
                            textColor: COLORS.white,
                            fontStyle: 'bold',
                            fontSize: 9,
                            cellPadding: 3,
                        },
                        bodyStyles: {
                            fontSize: 8,
                            cellPadding: 2,
                        },
                        alternateRowStyles: {
                            fillColor: COLORS.bgAlt,
                        },
                        columnStyles: {
                            0: { cellWidth: 'auto' },
                            1: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: COLORS.purple }
                        },
                        margin: { left: margin, right: margin },
                    });
                    y = doc.lastAutoTable.finalY + 5;
                });
                y += 5;
            }

            // ===== PERSONAL RECORDS (using autoTable) =====
            if (filteredPRs.length > 0) {
                printSectionTitle('RECORDS PERSONALES DEL PERIODO', 60);

                const prTableData = filteredPRs.map(pr => [
                    pr.exerciseName?.substring(0, 35) || 'Ejercicio',
                    `${pr.weight}kg`,
                    `x${pr.reps}`,
                    new Date(pr.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
                ]);

                autoTable(doc, {
                    startY: y,
                    head: [['Ejercicio', 'Peso', 'Reps', 'Fecha']],
                    body: prTableData,
                    theme: 'striped',
                    headStyles: {
                        fillColor: COLORS.purple,
                        textColor: COLORS.white,
                        fontStyle: 'bold',
                        fontSize: 8,
                        cellPadding: 3,
                    },
                    bodyStyles: {
                        fontSize: 8,
                        cellPadding: 2.5,
                    },
                    columnStyles: {
                        0: { cellWidth: 'auto' },
                        1: { cellWidth: 22, fontStyle: 'bold', textColor: COLORS.purple },
                        2: { cellWidth: 15 },
                        3: { cellWidth: 20, halign: 'right' }
                    },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 10;
            }

            // ===== EXERCISE PROGRESS DELTA (using autoTable) =====
            if (progressData.length > 0) {
                printSectionTitle('PROGRESO POR EJERCICIO', 70);

                const deltaTableData = progressData.map(ex => {
                    if (!ex.hasData) {
                        return [ex.name.substring(0, 25), 'Sin datos', '', '', ''];
                    }
                    return [
                        ex.name.substring(0, 25),
                        `${ex.firstWeight}kg x ${ex.firstReps}`,
                        `${ex.lastWeight}kg x ${ex.lastReps}`,
                        ex.deltaWeight > 0 ? `+${ex.deltaWeight}` : `${ex.deltaWeight}`,
                        ex.deltaReps > 0 ? `+${ex.deltaReps}` : `${ex.deltaReps}`
                    ];
                });

                autoTable(doc, {
                    startY: y,
                    head: [['Ejercicio', 'Inicio', 'Actual', 'dif kg', 'dif reps']],
                    body: deltaTableData,
                    theme: 'striped',
                    headStyles: {
                        fillColor: COLORS.purple,
                        textColor: COLORS.white,
                        fontStyle: 'bold',
                        fontSize: 7,
                        cellPadding: 3,
                    },
                    bodyStyles: {
                        fontSize: 7,
                        cellPadding: 2.5,
                    },
                    didParseCell: (data) => {
                        // Color delta columns
                        if (data.section === 'body' && data.column.index >= 3) {
                            const val = parseFloat(data.cell.text[0]);
                            if (val > 0) {
                                data.cell.styles.textColor = COLORS.green;
                                data.cell.styles.fontStyle = 'bold';
                            } else if (val < 0) {
                                data.cell.styles.textColor = COLORS.red;
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    },
                    columnStyles: {
                        0: { cellWidth: 55 },
                        1: { cellWidth: 35 },
                        2: { cellWidth: 35 },
                        3: { cellWidth: 20, halign: 'center' },
                        4: { cellWidth: 20, halign: 'center' }
                    },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 10;
            }

            // ===== RECENT SESSIONS (using autoTable) =====
            if (filteredHistory.length > 0) {
                printSectionTitle('ULTIMAS SESIONES', 60);

                const sessionTableData = filteredHistory.slice(0, 15).map(session => {
                    const date = new Date(session.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
                    const exName = session.exercise?.name?.substring(0, 25) || 'Ejercicio';

                    let bestSet = '--';
                    let avgRpe = '--';
                    if (session.sets && session.sets.length > 0) {
                        const maxWeight = Math.max(...session.sets.map(s => s.weight || 0));
                        const setWithMax = session.sets.find(s => s.weight === maxWeight);
                        bestSet = `${setWithMax?.weight || 0}kg x ${setWithMax?.reps || 0}`;

                        const rpeSets = session.sets.filter(s => s.rpe);
                        if (rpeSets.length > 0) {
                            avgRpe = (rpeSets.reduce((sum, s) => sum + s.rpe, 0) / rpeSets.length).toFixed(0);
                        }
                    }
                    return [date, exName, bestSet, avgRpe];
                });

                autoTable(doc, {
                    startY: y,
                    head: [['Fecha', 'Ejercicio', 'Mejor Set', 'RPE']],
                    body: sessionTableData,
                    theme: 'striped',
                    headStyles: {
                        fillColor: COLORS.purple,
                        textColor: COLORS.white,
                        fontStyle: 'bold',
                        fontSize: 7,
                        cellPadding: 3,
                    },
                    bodyStyles: {
                        fontSize: 7,
                        cellPadding: 2.5,
                    },
                    didParseCell: (data) => {
                        // Color RPE column
                        if (data.section === 'body' && data.column.index === 3) {
                            const rpe = parseInt(data.cell.text[0]);
                            if (rpe >= 9) data.cell.styles.textColor = COLORS.red;
                            else if (rpe >= 7) data.cell.styles.textColor = COLORS.yellow;
                            else if (rpe > 0) data.cell.styles.textColor = COLORS.green;
                        }
                    },
                    columnStyles: {
                        0: { cellWidth: 20 },
                        1: { cellWidth: 'auto' },
                        2: { cellWidth: 35, fontStyle: 'bold', textColor: COLORS.purple },
                        3: { cellWidth: 15, halign: 'center' }
                    },
                    margin: { left: margin, right: margin },
                });
                y = doc.lastAutoTable.finalY + 10;
            }

            // ===== WEIGHT TRACKING =====
            if (weightChartData.length > 1) {
                printSectionTitle('EVOLUCION DEL PESO CORPORAL', 45);

                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.textMedium);
                doc.text(`Peso inicial: ${startWeight}kg  ->  Peso actual: ${endWeight}kg`, margin, y);
                if (weightChange) {
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...(weightChange > 0 ? COLORS.green : COLORS.red));
                    doc.text(`  (${weightChange > 0 ? '+' : ''}${weightChange}kg)`, margin + 85, y);
                }
                y += 10;

                // Weight data grid
                doc.setFillColor(...COLORS.bgLight);
                doc.roundedRect(margin, y, pageWidth - margin * 2, 20, 3, 3, 'F');

                const visibleWeights = weightChartData.slice(-7);
                const colWidth = (pageWidth - margin * 2) / visibleWeights.length;

                visibleWeights.forEach((w, i) => {
                    const x = margin + i * colWidth + colWidth / 2;
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...COLORS.textLight);
                    doc.text(w.date, x, y + 7, { align: 'center' });
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.purple);
                    doc.text(`${w.weight}kg`, x, y + 14, { align: 'center' });
                });
                y += 25;
            }

            // ===== PROGRESS PHOTOS =====
            if (progressPhotos.length >= 2) {
                // Always start on new page for photos
                doc.addPage();
                y = margin;

                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.textDark);
                doc.text('FOTOS DE PROGRESO', margin, y);
                y += 10;

                // Calculate grid layout (max 3 per row)
                const maxPerRow = 3;
                const photoWidth = (pageWidth - margin * 2 - (maxPerRow - 1) * 5) / maxPerRow;
                const photoHeight = photoWidth * 1.3; // Portrait aspect ratio

                progressPhotos.forEach((log, i) => {
                    const col = i % maxPerRow;
                    const row = Math.floor(i / maxPerRow);

                    // Check if we need a new page
                    if (y + row * (photoHeight + 15) + photoHeight > pageHeight - 30) {
                        doc.addPage();
                        y = margin;
                    }

                    const x = margin + col * (photoWidth + 5);
                    const currentY = y + row * (photoHeight + 15);

                    try {
                        // Add the photo
                        doc.addImage(log.photo, 'JPEG', x, currentY, photoWidth, photoHeight);

                        // Add date label below photo
                        doc.setFillColor(...COLORS.purple);
                        doc.roundedRect(x, currentY + photoHeight - 6, photoWidth, 8, 0, 0, 'F');
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...COLORS.white);
                        const dateStr = new Date(log.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
                        doc.text(dateStr, x + photoWidth / 2, currentY + photoHeight, { align: 'center' });
                    } catch (e) {
                        // If image fails, draw placeholder
                        doc.setFillColor(...COLORS.bgLight);
                        doc.rect(x, currentY, photoWidth, photoHeight, 'F');
                        doc.setFontSize(8);
                        doc.setTextColor(...COLORS.textLight);
                        doc.text('Foto no disponible', x + photoWidth / 2, currentY + photoHeight / 2, { align: 'center' });
                    }
                });
            }

            // ===== FOOTER ON ALL PAGES =====
            const totalPages = doc.internal.getNumberOfPages();
            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);
                doc.setDrawColor(...COLORS.purple);
                doc.setLineWidth(0.5);
                doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);

                doc.setFontSize(8);
                doc.setTextColor(...COLORS.textLight);
                doc.text('NexLift - Tu progreso fitness', margin, pageHeight - 10);
                doc.text(`Pagina ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
                doc.text(new Date().toLocaleString('es-ES'), pageWidth - margin, pageHeight - 10, { align: 'right' });
            }

            // Save
            const date = new Date().toISOString().split('T')[0];
            doc.save(`NexLift_Reporte_${selectedPeriod.label.toLowerCase()}_${date}.pdf`);

            toast.success('PDF generado!');
        } catch (error) {
            console.error('PDF Error:', error);
            toast.error('Error generando PDF');
        } finally {
            setGenerating(false);
        }
    }

    // ==========================================
    // RENDER
    // ==========================================
    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5 animate-fade-in max-w-lg mx-auto pb-20">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="text-[var(--primary)]" />
                    Exportar Reporte
                </h1>
                <p className="text-[var(--text-secondary)] text-sm">Genera un PDF profesional con tu progreso</p>
            </div>

            <div className="bg-[var(--bg-card)] rounded-xl p-4">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Calendar size={16} className="text-[var(--primary)]" />
                    Período del Reporte
                </h3>
                <div className="flex flex-wrap gap-2">
                    {PERIODS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setPeriod(p.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${period === p.id
                                ? 'bg-[var(--primary)] text-white'
                                : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
                                }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-[var(--bg-card)] rounded-xl p-4">
                <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <Activity size={16} className="text-[var(--primary)]" />
                    Vista Previa del Contenido
                </h3>

                <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="bg-[var(--bg-dark)] rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-[var(--primary)]">{periodDays}</p>
                        <p className="text-[9px] text-[var(--text-secondary)]">Días</p>
                    </div>
                    <div className="bg-[var(--bg-dark)] rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-blue-500">{totalSessions}</p>
                        <p className="text-[9px] text-[var(--text-secondary)]">Sesiones</p>
                    </div>
                    <div className="bg-[var(--bg-dark)] rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-yellow-500">{filteredPRs.length}</p>
                        <p className="text-[9px] text-[var(--text-secondary)]">PRs</p>
                    </div>
                    <div className="bg-[var(--bg-dark)] rounded-lg p-2 text-center">
                        <p className={`text-lg font-bold ${weightChange > 0 ? 'text-green-500' : weightChange < 0 ? 'text-red-500' : 'text-[var(--text-secondary)]'}`}>
                            {weightChange ? `${weightChange > 0 ? '+' : ''}${weightChange}` : '--'}
                        </p>
                        <p className="text-[9px] text-[var(--text-secondary)]">kg</p>
                    </div>
                </div>

                {weightChartData.length > 1 && (
                    <div ref={chartRef} className="h-28 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={weightChartData}>
                                <defs>
                                    <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tick={{ fontSize: 8, fill: '#a1a1aa' }} />
                                <YAxis tick={{ fontSize: 8, fill: '#a1a1aa' }} domain={['dataMin - 1', 'dataMax + 1']} width={30} />
                                <Area type="monotone" dataKey="weight" stroke="#8b5cf6" fill="url(#weightGradient)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="text-xs text-[var(--text-secondary)] space-y-1 border-t border-[var(--border)] pt-3">
                    <p className="font-medium text-white">El PDF incluirá:</p>
                    <p>✓ Rutina activa completa</p>
                    <p>✓ Récords personales</p>
                    <p>✓ Progreso por ejercicio (Delta)</p>
                    <p>✓ Últimas sesiones con RPE</p>
                    <p>✓ Evolución del peso</p>
                </div>
            </div>

            <button
                onClick={generatePDF}
                disabled={generating}
                className="w-full bg-gradient-to-r from-[var(--primary)] to-purple-600 text-white py-4 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all shadow-lg shadow-purple-500/30"
            >
                {generating ? (
                    <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Generando...</span>
                    </>
                ) : (
                    <>
                        <Download size={20} />
                        Descargar PDF
                    </>
                )}
            </button>
        </div>
    );
}
