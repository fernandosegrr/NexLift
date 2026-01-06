import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Download, Calendar, TrendingUp, Trophy, Dumbbell, Scale, Activity, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

// ==========================================
// CONSTANTS
// ==========================================
const PERIODS = [
    { id: 'daily', label: 'Diario', days: 1 },
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

/**
 * Converts Date to YYYY-MM-DD string safely
 */
function getLocalDateStr(dateObj) {
    return dateObj.toLocaleDateString('en-CA');
}

/**
 * Loads logo as base64 with retry
 */
async function loadLogoBase64(retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch('/logo.png');
            if (!response.ok) throw new Error('Logo not found');
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            if (i === retries - 1) {
                console.warn('Logo loading failed after retries:', error);
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return null;
}

// ==========================================
// PDF GENERATION HELPERS
// ==========================================

class PDFBuilder {
    constructor(doc, pageWidth, pageHeight, margin, footerHeight) {
        this.doc = doc;
        this.pageWidth = pageWidth;
        this.pageHeight = pageHeight;
        this.margin = margin;
        this.footerHeight = footerHeight;
        this.y = 0;
    }

    ensureSpace(requiredHeight) {
        const availableSpace = this.pageHeight - this.y - this.footerHeight;
        if (availableSpace < requiredHeight) {
            this.doc.addPage();
            this.y = this.margin;
        }
    }

    printSectionTitle(title, minTableHeight = 50) {
        this.ensureSpace(minTableHeight);
        this.doc.setFontSize(13);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(...COLORS.textDark);
        this.doc.text(title, this.margin, this.y);
        this.y += 10;
    }

    renderHeader(logoBase64, periodLabel) {
        // Gradient background
        for (let i = 0; i < 45; i++) {
            const ratio = i / 45;
            const r = Math.round(COLORS.purple[0] + (COLORS.purpleDark[0] - COLORS.purple[0]) * ratio);
            const g = Math.round(COLORS.purple[1] + (COLORS.purpleDark[1] - COLORS.purple[1]) * ratio);
            const b = Math.round(COLORS.purple[2] + (COLORS.purpleDark[2] - COLORS.purple[2]) * ratio);
            this.doc.setFillColor(r, g, b);
            this.doc.rect(0, i, this.pageWidth, 1, 'F');
        }

        // Logo
        if (logoBase64) {
            this.doc.addImage(logoBase64, 'PNG', this.margin, 8, 28, 28);
        }

        // Title
        this.doc.setTextColor(...COLORS.white);
        this.doc.setFontSize(28);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('NexLift', logoBase64 ? this.margin + 34 : this.margin, 22);

        this.doc.setFontSize(14);
        this.doc.setFont('helvetica', 'normal');
        this.doc.text(`Reporte de Progreso ${periodLabel}`, logoBase64 ? this.margin + 34 : this.margin, 32);

        this.doc.setFontSize(11);
        this.doc.text(
            new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
            this.pageWidth - this.margin,
            22,
            { align: 'right' }
        );

        this.y = 55;
    }

    renderStatsCards(stats) {
        this.doc.setFontSize(13);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(...COLORS.textDark);
        this.doc.text('RESUMEN DEL PERÍODO', this.margin, this.y);
        this.y += 10;

        const cardWidth = (this.pageWidth - this.margin * 2 - 15) / 4;
        const cardHeight = 28;

        stats.forEach((card, i) => {
            const x = this.margin + i * (cardWidth + 5);
            this.doc.setFillColor(...COLORS.bgLight);
            this.doc.roundedRect(x, this.y, cardWidth, cardHeight, 4, 4, 'F');
            this.doc.setFillColor(...card.color);
            this.doc.roundedRect(x, this.y, 3, cardHeight, 1, 1, 'F');

            this.doc.setFontSize(18);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setTextColor(...card.color);
            this.doc.text(String(card.value), x + cardWidth / 2 + 2, this.y + 12, { align: 'center' });

            this.doc.setFontSize(8);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setTextColor(...COLORS.textLight);
            this.doc.text(card.label, x + cardWidth / 2 + 2, this.y + 21, { align: 'center' });
        });

        this.y += cardHeight + 15;
    }

    renderAttendanceStats(attendanceStats) {
        this.printSectionTitle('ASISTENCIA DEL PERÍODO', 35);

        const attendanceCardWidth = (this.pageWidth - this.margin * 2 - 10) / 3;
        const attendanceCards = [
            { value: `${attendanceStats.totalDaysInPeriod}`, label: 'Días del Período', color: COLORS.textMedium },
            { value: `${attendanceStats.trainingDays}`, label: 'Días Entrenados', color: COLORS.green },
            {
                value: `${attendanceStats.attendancePercent}%`,
                label: 'Asistencia',
                color: attendanceStats.attendancePercent >= 70 ? COLORS.green : attendanceStats.attendancePercent >= 40 ? COLORS.yellow : COLORS.red
            }
        ];

        attendanceCards.forEach((card, i) => {
            const x = this.margin + i * (attendanceCardWidth + 5);
            this.doc.setFillColor(...COLORS.bgLight);
            this.doc.roundedRect(x, this.y, attendanceCardWidth, 22, 3, 3, 'F');

            this.doc.setFontSize(16);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setTextColor(...card.color);
            this.doc.text(card.value, x + attendanceCardWidth / 2, this.y + 10, { align: 'center' });

            this.doc.setFontSize(7);
            this.doc.setFont('helvetica', 'normal');
            this.doc.setTextColor(...COLORS.textLight);
            this.doc.text(card.label, x + attendanceCardWidth / 2, this.y + 17, { align: 'center' });
        });

        this.y += 30;
    }

    renderFooters(periodLabel) {
        const totalPages = this.doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            this.doc.setPage(i);
            this.doc.setDrawColor(...COLORS.purple);
            this.doc.setLineWidth(0.5);
            this.doc.line(this.margin, this.pageHeight - 15, this.pageWidth - this.margin, this.pageHeight - 15);

            this.doc.setFontSize(8);
            this.doc.setTextColor(...COLORS.textLight);
            this.doc.text('NexLift - Tu progreso fitness', this.margin, this.pageHeight - 10);
            this.doc.text(`Página ${i} de ${totalPages}`, this.pageWidth / 2, this.pageHeight - 10, { align: 'center' });
            this.doc.text(new Date().toLocaleString('es-ES'), this.pageWidth - this.margin, this.pageHeight - 10, { align: 'right' });
        }
    }
}

// ==========================================
// COMPONENT
// ==========================================
export default function ExportReport() {
    const toast = useToast();
    const chartRef = useRef(null);
    const [searchParams] = useSearchParams();

    // Data states
    const [stats, setStats] = useState(null);
    const [routine, setRoutine] = useState(null);
    const [prs, setPrs] = useState([]);
    const [bodyLogs, setBodyLogs] = useState([]);
    const [consistency, setConsistency] = useState({});
    const [workoutHistory, setWorkoutHistory] = useState([]);
    const [logoBase64, setLogoBase64] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingProgress, setGeneratingProgress] = useState(0);

    // UI state
    const [period, setPeriod] = useState(() => {
        const urlPeriod = searchParams.get('period');
        return PERIODS.find(p => p.id === urlPeriod) ? urlPeriod : 'monthly';
    });

    // Fetch data on mount with cleanup
    useEffect(() => {
        let isMounted = true;

        async function fetchAllData() {
            try {
                const [statsData, routineData, prsData, bodyData, consistencyData, historyData] = await Promise.all([
                    api.getOverviewStats(),
                    api.getActiveRoutine(),
                    api.getPersonalRecords(),
                    api.getBodyLogs(365),
                    api.getConsistency(),
                    api.getWorkoutHistory(500)
                ]);

                if (!isMounted) return;

                setStats(statsData || {});
                setRoutine(routineData);
                setPrs(prsData || []);
                setBodyLogs(bodyData || []);
                setWorkoutHistory(historyData || []);

                const map = {};
                if (consistencyData?.events) {
                    consistencyData.events.forEach(dateStr => {
                        const localDate = getLocalDateStr(new Date(dateStr));
                        map[localDate] = (map[localDate] || 0) + 1;
                    });
                }
                setConsistency(map);
            } catch (error) {
                if (isMounted) {
                    console.error('Error:', error);
                    toast?.error('Error cargando datos');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        fetchAllData();

        // Preload logo
        loadLogoBase64().then(logo => {
            if (isMounted) setLogoBase64(logo);
        });

        return () => {
            isMounted = false;
        };
    }, [toast]);

    // ==========================================
    // MEMOIZED CALCULATIONS (CORREGIDO)
    // ==========================================
    const selectedPeriod = useMemo(() =>
        PERIODS.find(p => p.id === period) || PERIODS[2],
        [period]);

    // Cutoff date normalized to midnight
    const cutoffDate = useMemo(() => {
        const date = new Date();

        if (selectedPeriod.id === 'daily') {
            date.setHours(0, 0, 0, 0);
        } else {
            date.setDate(date.getDate() - selectedPeriod.days);
            date.setHours(0, 0, 0, 0);
        }

        return date;
    }, [selectedPeriod]);

    // ISO string for safe comparisons
    const cutoffDateStr = useMemo(() =>
        getLocalDateStr(cutoffDate),
        [cutoffDate]
    );

    // All filtered data using string comparison
    const filteredPRs = useMemo(() =>
        prs.filter(pr => getLocalDateStr(new Date(pr.date)) >= cutoffDateStr).slice(0, 15),
        [prs, cutoffDateStr]);

    const filteredBodyLogs = useMemo(() =>
        bodyLogs.filter(l => l.weight && getLocalDateStr(new Date(l.date)) >= cutoffDateStr),
        [bodyLogs, cutoffDateStr]);

    const progressPhotos = useMemo(() => {
        const photos = bodyLogs
            .filter(l => l.photo && l.photo.trim() && getLocalDateStr(new Date(l.date)) >= cutoffDateStr)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        return photos;
    }, [bodyLogs, cutoffDateStr]);

    const filteredHistory = useMemo(() =>
        workoutHistory.filter(h => getLocalDateStr(new Date(h.date)) >= cutoffDateStr),
        [workoutHistory, cutoffDateStr]);

    const attendanceStats = useMemo(() => {
        const totalDaysInPeriod = selectedPeriod.days;
        const trainingDays = Object.keys(consistency).filter(d => d >= cutoffDateStr).length;
        const attendancePercent = totalDaysInPeriod > 0 ? Math.round((trainingDays / totalDaysInPeriod) * 100) : 0;
        return { totalDaysInPeriod, trainingDays, attendancePercent };
    }, [consistency, cutoffDateStr, selectedPeriod]);

    const periodDays = useMemo(() =>
        Object.keys(consistency).filter(d => d >= cutoffDateStr).length,
        [consistency, cutoffDateStr]);

    const totalSessions = useMemo(() => filteredHistory.length, [filteredHistory]);

    const { weightData, startWeight, endWeight, weightChange, weightChartData } = useMemo(() => {
        const data = filteredBodyLogs.slice().reverse();
        const start = data[0]?.weight;
        const end = data[data.length - 1]?.weight;
        const change = (end != null && start != null) ? Number((end - start).toFixed(2)) : null;
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

        if (routineExercises.length === 0) return [];

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
        }).filter(ex => ex.hasData);
    }, [routine, filteredHistory]);

    // Data validation
    const hasEnoughData = useMemo(() => {
        return periodDays > 0 || totalSessions > 0 || filteredPRs.length > 0;
    }, [periodDays, totalSessions, filteredPRs]);

    // ==========================================
    // PDF GENERATION
    // ==========================================
    async function generatePDF() {
        if (!hasEnoughData) {
            toast?.error('No hay datos suficientes para este período');
            return;
        }

        setGenerating(true);
        setGeneratingProgress(10);
        toast?.info('Generando PDF...');

        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            setGeneratingProgress(20);

            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const footerHeight = 20;

            const builder = new PDFBuilder(doc, pageWidth, pageHeight, margin, footerHeight);
            setGeneratingProgress(30);

            // Header
            builder.renderHeader(logoBase64, selectedPeriod.label);
            setGeneratingProgress(35);

            // Stats Summary
            const statsCards = [
                { value: periodDays, label: 'Días Entrenados', color: COLORS.purple },
                { value: totalSessions, label: 'Sesiones', color: [59, 130, 246] },
                { value: filteredPRs.length, label: 'PRs Logrados', color: COLORS.yellow },
                {
                    value: weightChange !== null ? `${weightChange > 0 ? '+' : ''}${weightChange}kg` : '--',
                    label: 'Cambio Peso',
                    color: weightChange > 0 ? COLORS.green : weightChange < 0 ? COLORS.red : COLORS.textLight
                }
            ];
            builder.renderStatsCards(statsCards);
            setGeneratingProgress(40);

            // Attendance
            builder.renderAttendanceStats(attendanceStats);
            setGeneratingProgress(45);

            // Active Routine
            if (routine) {
                builder.printSectionTitle(`RUTINA ACTIVA: ${routine.name}`, 40);

                routine.days.forEach((day) => {
                    builder.ensureSpace(30);

                    const exercises = (!day.isRestDay && day.exercises) ? day.exercises : [];
                    const tableData = exercises.map(ex => [ex.name, `${ex.targetSets}x${ex.targetReps}`]);

                    autoTable(doc, {
                        startY: builder.y,
                        head: [[`${day.dayName}${day.isRestDay ? ' (Descanso)' : ''}`, '']],
                        body: tableData.length > 0 ? tableData : [['Día de descanso', '']],
                        theme: 'plain',
                        headStyles: {
                            fillColor: COLORS.purple,
                            textColor: COLORS.white,
                            fontStyle: 'bold',
                            fontSize: 9,
                            cellPadding: 3,
                        },
                        bodyStyles: { fontSize: 8, cellPadding: 2 },
                        alternateRowStyles: { fillColor: COLORS.bgAlt },
                        columnStyles: {
                            0: { cellWidth: 'auto' },
                            1: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: COLORS.purple }
                        },
                        margin: { left: margin, right: margin },
                    });
                    builder.y = doc.lastAutoTable.finalY + 5;
                });
                builder.y += 5;
            }
            setGeneratingProgress(55);

            // Personal Records
            if (filteredPRs.length > 0) {
                builder.printSectionTitle('RÉCORDS PERSONALES DEL PERÍODO', 60);

                const prTableData = filteredPRs.map(pr => [
                    pr.exerciseName?.substring(0, 35) || 'Ejercicio',
                    `${pr.weight}kg`,
                    `x${pr.reps}`,
                    new Date(pr.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
                ]);

                autoTable(doc, {
                    startY: builder.y,
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
                    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
                    columnStyles: {
                        0: { cellWidth: 'auto' },
                        1: { cellWidth: 22, fontStyle: 'bold', textColor: COLORS.purple },
                        2: { cellWidth: 15 },
                        3: { cellWidth: 20, halign: 'right' }
                    },
                    margin: { left: margin, right: margin },
                });
                builder.y = doc.lastAutoTable.finalY + 10;
            }
            setGeneratingProgress(65);

            // Exercise Progress Delta
            if (progressData.length > 0) {
                builder.printSectionTitle('PROGRESO POR EJERCICIO', 70);

                const deltaTableData = progressData.map(ex => [
                    ex.name.substring(0, 25),
                    `${ex.firstWeight}kg x ${ex.firstReps}`,
                    `${ex.lastWeight}kg x ${ex.lastReps}`,
                    ex.deltaWeight > 0 ? `+${ex.deltaWeight}` : `${ex.deltaWeight}`,
                    ex.deltaReps > 0 ? `+${ex.deltaReps}` : `${ex.deltaReps}`
                ]);

                autoTable(doc, {
                    startY: builder.y,
                    head: [['Ejercicio', 'Inicio', 'Actual', 'Δ kg', 'Δ reps']],
                    body: deltaTableData,
                    theme: 'striped',
                    headStyles: {
                        fillColor: COLORS.purple,
                        textColor: COLORS.white,
                        fontStyle: 'bold',
                        fontSize: 7,
                        cellPadding: 3,
                    },
                    bodyStyles: { fontSize: 7, cellPadding: 2.5 },
                    didParseCell: (data) => {
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
                builder.y = doc.lastAutoTable.finalY + 10;
            }
            setGeneratingProgress(75);

            // Recent Sessions
            if (filteredHistory.length > 0) {
                builder.printSectionTitle('ÚLTIMAS SESIONES', 60);

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
                    startY: builder.y,
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
                    bodyStyles: { fontSize: 7, cellPadding: 2.5 },
                    didParseCell: (data) => {
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
                builder.y = doc.lastAutoTable.finalY + 10;
            }
            setGeneratingProgress(85);

            // Body Tracking
            if (weightChartData.length > 1 || progressPhotos.length > 0) {
                doc.addPage();
                builder.y = margin;

                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.textDark);
                doc.text('SEGUIMIENTO CORPORAL', margin, builder.y);
                builder.y += 10;

                if (weightChartData.length > 1) {
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.purple);
                    doc.text('Evolución del Peso', margin, builder.y);
                    builder.y += 8;

                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...COLORS.textMedium);
                    doc.text(`Peso inicial: ${startWeight}kg  ->  Peso actual: ${endWeight}kg`, margin, builder.y);
                    if (weightChange !== null) {
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...(weightChange > 0 ? COLORS.green : weightChange < 0 ? COLORS.red : COLORS.textMedium));
                        doc.text(`  (${weightChange > 0 ? '+' : ''}${weightChange}kg)`, margin + 85, builder.y);
                    }
                    builder.y += 10;

                    doc.setFillColor(...COLORS.bgLight);
                    doc.roundedRect(margin, builder.y, pageWidth - margin * 2, 20, 3, 3, 'F');

                    const visibleCount = Math.min(weightChartData.length, selectedPeriod.id === 'yearly' ? 12 : 7);
                    const visibleWeights = weightChartData.slice(-visibleCount);
                    const colWidth = (pageWidth - margin * 2) / visibleWeights.length;

                    visibleWeights.forEach((w, i) => {
                        const x = margin + i * colWidth + colWidth / 2;
                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...COLORS.textLight);
                        doc.text(w.date, x, builder.y + 7, { align: 'center' });
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...COLORS.purple);
                        doc.text(`${w.weight}kg`, x, builder.y + 14, { align: 'center' });
                    });
                    builder.y += 30;
                }

                if (progressPhotos.length > 0) {
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.purple);
                    doc.text('Fotos de Progreso', margin, builder.y);
                    builder.y += 8;

                    const maxPerRow = 3;
                    const photoWidth = (pageWidth - margin * 2 - (maxPerRow - 1) * 5) / maxPerRow;
                    const photoHeight = photoWidth * 1.3;

                    progressPhotos.forEach((log, i) => {
                        const col = i % maxPerRow;
                        const row = Math.floor(i / maxPerRow);

                        if (builder.y + row * (photoHeight + 15) + photoHeight > pageHeight - 30) {
                            doc.addPage();
                            builder.y = margin;
                        }

                        const x = margin + col * (photoWidth + 5);
                        const currentY = builder.y + row * (photoHeight + 15);

                        try {
                            doc.addImage(log.photo, 'JPEG', x, currentY, photoWidth, photoHeight);
                            doc.setFillColor(...COLORS.purple);
                            doc.roundedRect(x, currentY + photoHeight - 6, photoWidth, 8, 0, 0, 'F');
                            doc.setFontSize(7);
                            doc.setFont('helvetica', 'bold');
                            doc.setTextColor(...COLORS.white);
                            const dateStr = new Date(log.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' });
                            doc.text(dateStr, x + photoWidth / 2, currentY + photoHeight, { align: 'center' });
                        } catch (e) {
                            doc.setFillColor(...COLORS.bgLight);
                            doc.rect(x, currentY, photoWidth, photoHeight, 'F');
                            doc.setFontSize(8);
                            doc.setTextColor(...COLORS.textLight);
                            doc.text('Foto no disponible', x + photoWidth / 2, currentY + photoHeight / 2, { align: 'center' });
                        }
                    });
                }
            }
            setGeneratingProgress(95);

            // Footers
            builder.renderFooters(selectedPeriod.label);

            // Save
            const date = new Date().toISOString().split('T')[0];
            doc.save(`NexLift_Reporte_${selectedPeriod.label.toLowerCase()}_${date}.pdf`);

            setGeneratingProgress(100);
            toast?.success('PDF generado exitosamente');
        } catch (error) {
            console.error('PDF Error:', error);
            toast?.error('Error generando PDF. Intenta de nuevo.');
        } finally {
            setGenerating(false);
            setTimeout(() => setGeneratingProgress(0), 500);
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
        <div className="space-y-6 animate-fade-in max-w-lg mx-auto pb-20">
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="text-[var(--primary)]" />
                    Exportar Reporte
                </h1>
                <p className="text-[var(--text-secondary)] text-sm">Genera un PDF profesional con tu progreso</p>
            </div>

            {/* Period Selector */}
            <div className="bg-[var(--bg-card)] rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                    <Calendar size={18} className="text-[var(--primary)]" />
                    Período del Reporte
                </h3>
                <div role="radiogroup" aria-label="Seleccionar período" className="flex flex-wrap gap-2">
                    {PERIODS.map(p => (
                        <button
                            key={p.id}
                            role="radio"
                            aria-checked={period === p.id}
                            onClick={() => setPeriod(p.id)}
                            className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${period === p.id
                                ? 'bg-[var(--primary)] text-white shadow-lg scale-105'
                                : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:bg-[var(--border)] hover:text-white'
                                }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Data Warning */}
            {!hasEnoughData && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle size={20} className="text-yellow-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-sm text-yellow-200">Datos insuficientes</p>
                        <p className="text-xs text-yellow-300/80 mt-1">
                            No hay suficientes datos para este período. Selecciona un período más amplio o entrena más.
                        </p>
                    </div>
                </div>
            )}

            {/* Preview */}
            <div className="bg-[var(--bg-card)] rounded-xl p-4">
                <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-[var(--primary)]" />
                    Vista Previa del Contenido
                </h3>

                <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="bg-[var(--bg-dark)] rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-[var(--primary)]">{periodDays}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">Días</p>
                    </div>
                    <div className="bg-[var(--bg-dark)] rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-blue-500">{totalSessions}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">Sesiones</p>
                    </div>
                    <div className="bg-[var(--bg-dark)] rounded-lg p-3 text-center">
                        <p className="text-xl font-bold text-yellow-500">{filteredPRs.length}</p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">PRs</p>
                    </div>
                    <div className="bg-[var(--bg-dark)] rounded-lg p-3 text-center">
                        <p className={`text-xl font-bold ${weightChange !== null ? (weightChange > 0 ? 'text-green-500' : weightChange < 0 ? 'text-red-500' : 'text-[var(--text-secondary)]') : 'text-[var(--text-secondary)]'}`}>
                            {weightChange !== null ? `${weightChange > 0 ? '+' : ''}${weightChange}` : '--'}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">kg</p>
                    </div>
                </div>

                {weightChartData.length > 1 && (
                    <div ref={chartRef} className="h-32 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={weightChartData}>
                                <defs>
                                    <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#a1a1aa' }} />
                                <YAxis tick={{ fontSize: 9, fill: '#a1a1aa' }} domain={['dataMin - 1', 'dataMax + 1']} width={35} />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a1a', border: '1px solid #27272a', borderRadius: '8px', fontSize: '12px' }}
                                />
                                <Area type="monotone" dataKey="weight" stroke="#8b5cf6" fill="url(#weightGradient)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="text-xs text-[var(--text-secondary)] space-y-1.5 border-t border-[var(--border)] pt-4">
                    <p className="font-semibold text-white text-sm mb-2">El PDF incluirá:</p>
                    <p className="flex items-center gap-2">✓ Rutina activa completa</p>
                    <p className="flex items-center gap-2">✓ Récords personales del período</p>
                    <p className="flex items-center gap-2">✓ Progreso por ejercicio (Delta)</p>
                    <p className="flex items-center gap-2">✓ Últimas sesiones con RPE</p>
                    <p className="flex items-center gap-2">✓ Evolución del peso corporal</p>
                    {progressPhotos.length > 0 && (
                        <p className="flex items-center gap-2">✓ {progressPhotos.length} fotos de progreso</p>
                    )}
                </div>
            </div>

            {/* Generate Button */}
            <button
                onClick={generatePDF}
                disabled={generating || !hasEnoughData}
                className="w-full bg-gradient-to-r from-[var(--primary)] to-purple-600 text-white py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-purple-500/30"
            >
                {generating ? (
                    <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Generando... {generatingProgress}%</span>
                    </>
                ) : (
                    <>
                        <Download size={22} />
                        Descargar PDF
                    </>
                )}
            </button>

            {/* Progress Bar */}
            {generating && generatingProgress > 0 && (
                <div className="bg-[var(--bg-card)] rounded-xl p-3">
                    <div className="h-2 bg-[var(--bg-dark)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-[var(--primary)] to-purple-500 rounded-full transition-all duration-300"
                            style={{ width: `${generatingProgress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}