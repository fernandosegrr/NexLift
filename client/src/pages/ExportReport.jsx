import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    FileText, Download, Calendar, Activity, AlertCircle,
    TrendingUp
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';

// ==========================================
// CONSTANTS & CONFIG
// ==========================================
const PERIODS = [
    { id: 'daily', label: 'Diario', days: 1 },
    { id: 'weekly', label: 'Semanal', days: 7 },
    { id: 'monthly', label: 'Mensual', days: 30 },
    { id: 'quarterly', label: 'Trimestral', days: 90 },
    { id: 'semester', label: 'Semestral', days: 180 },
    { id: 'yearly', label: 'Anual', days: 365 },
];

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
    gridLine: [230, 230, 230]
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function getLocalDateStr(dateObj) {
    return dateObj.toLocaleDateString('en-CA');
}

async function loadLogoBase64(retries = 2) {
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
            if (i === retries - 1) return null;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return null;
}

// ==========================================
// PDF BUILDER CLASS
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
            return true;
        }
        return false;
    }

    printSectionTitle(title, minHeight = 40) {
        this.ensureSpace(minHeight);
        this.doc.setFontSize(14);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(...COLORS.purple);
        this.doc.text(title, this.margin, this.y);
        this.doc.setLineWidth(0.5);
        this.doc.setDrawColor(...COLORS.purple);
        this.doc.line(this.margin, this.y + 2, this.margin + 15, this.y + 2);
        this.y += 12;
    }

    drawLineChart(data, width, height) {
        this.ensureSpace(height + 20);

        const startX = this.margin + 10;
        const startY = this.y + 5;
        const endX = this.margin + width;
        const endY = startY + height;
        const chartBottomY = endY - 15;

        this.doc.setFillColor(...COLORS.bgAlt);
        this.doc.roundedRect(this.margin, startY, width, height, 3, 3, 'F');

        if (data.length < 2) {
            this.doc.text("Datos insuficientes", startX, startY + height / 2);
            this.y += height + 10;
            return;
        }

        const weights = data.map(d => d.weight);
        const minWeight = Math.min(...weights) - 1;
        const maxWeight = Math.max(...weights) + 1;
        const range = maxWeight - minWeight || 1;

        this.doc.setDrawColor(...COLORS.gridLine);
        this.doc.setLineWidth(0.1);

        for (let i = 0; i <= 4; i++) {
            const yPos = chartBottomY - (i * (chartBottomY - startY - 10) / 4);
            const val = minWeight + (i * range / 4);
            this.doc.line(startX, yPos, endX - 5, yPos);
            this.doc.setFontSize(7);
            this.doc.setTextColor(...COLORS.textLight);
            this.doc.text(val.toFixed(1), startX - 2, yPos + 1, { align: 'right' });
        }

        const getX = (index) => startX + (index * (endX - startX - 10) / (data.length - 1));
        const getY = (val) => chartBottomY - ((val - minWeight) / range) * (chartBottomY - startY - 10);

        this.doc.setDrawColor(...COLORS.purple);
        this.doc.setLineWidth(0.8);

        for (let i = 0; i < data.length - 1; i++) {
            this.doc.line(getX(i), getY(data[i].weight), getX(i + 1), getY(data[i + 1].weight));
        }

        data.forEach((d, i) => {
            const x = getX(i);
            const y = getY(d.weight);
            this.doc.setFillColor(...COLORS.white);
            this.doc.setDrawColor(...COLORS.purple);
            this.doc.setLineWidth(0.5);
            this.doc.circle(x, y, 1.5, 'FD');

            const step = Math.ceil(data.length / 6);
            if (i === 0 || i === data.length - 1 || i % step === 0) {
                this.doc.setFontSize(7);
                this.doc.setTextColor(...COLORS.textLight);
                this.doc.text(d.date, x, chartBottomY + 4, { align: 'center' });
            }
        });

        this.y += height + 10;
    }

    renderHeader(logoBase64, periodLabel) {
        for (let i = 0; i < 40; i++) {
            const ratio = i / 40;
            const r = Math.round(COLORS.purple[0] + (COLORS.purpleDark[0] - COLORS.purple[0]) * ratio);
            const g = Math.round(COLORS.purple[1] + (COLORS.purpleDark[1] - COLORS.purple[1]) * ratio);
            const b = Math.round(COLORS.purple[2] + (COLORS.purpleDark[2] - COLORS.purple[2]) * ratio);
            this.doc.setFillColor(r, g, b);
            this.doc.rect(0, i, this.pageWidth, 1, 'F');
        }

        if (logoBase64) {
            this.doc.addImage(logoBase64, 'PNG', this.margin, 6, 28, 28);
        }

        this.doc.setTextColor(...COLORS.white);
        this.doc.setFontSize(26);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('NexLift', logoBase64 ? this.margin + 34 : this.margin, 20);

        this.doc.setFontSize(12);
        this.doc.setFont('helvetica', 'normal');
        this.doc.text(`Reporte de Progreso • ${periodLabel}`, logoBase64 ? this.margin + 34 : this.margin, 29);

        this.doc.setFontSize(10);
        this.doc.text(
            new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
            this.pageWidth - this.margin,
            20,
            { align: 'right' }
        );

        this.y = 50;
    }

    renderFooters() {
        const totalPages = this.doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            this.doc.setPage(i);
            this.doc.setDrawColor(220, 220, 220);
            this.doc.setLineWidth(0.1);
            this.doc.line(this.margin, this.pageHeight - 15, this.pageWidth - this.margin, this.pageHeight - 15);

            this.doc.setFontSize(8);
            this.doc.setTextColor(...COLORS.textLight);
            this.doc.text('NexLift - Tu progreso fitness', this.margin, this.pageHeight - 10);
            this.doc.text(`Página ${i} de ${totalPages}`, this.pageWidth / 2, this.pageHeight - 10, { align: 'center' });
        }
    }
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function ExportReport() {
    const toast = useToast();
    const [searchParams] = useSearchParams();

    const [data, setData] = useState({
        stats: {},
        routine: null,
        prs: [],
        bodyLogs: [],
        consistency: {},
        history: []
    });

    const [loading, setLoading] = useState(true);
    const [logoBase64, setLogoBase64] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);

    const [period, setPeriod] = useState(() => {
        const p = searchParams.get('period');
        return PERIODS.find(x => x.id === p) ? p : 'monthly';
    });

    // Data Fetching
    useEffect(() => {
        let isMounted = true;

        async function loadData() {
            try {
                const results = await Promise.allSettled([
                    api.getOverviewStats(),
                    api.getActiveRoutine(),
                    api.getPersonalRecords(),
                    api.getBodyLogs(365),
                    api.getConsistency(),
                    api.getWorkoutHistory(500)
                ]);

                if (!isMounted) return;

                const getVal = (res) => res.status === 'fulfilled' ? res.value : null;

                const consistencyRaw = getVal(results[4]);
                const consistencyMap = {};
                if (consistencyRaw?.events) {
                    consistencyRaw.events.forEach(d => {
                        const k = getLocalDateStr(new Date(d));
                        consistencyMap[k] = (consistencyMap[k] || 0) + 1;
                    });
                }

                setData({
                    stats: getVal(results[0]) || {},
                    routine: getVal(results[1]),
                    prs: getVal(results[2]) || [],
                    bodyLogs: getVal(results[3]) || [],
                    consistency: consistencyMap,
                    history: getVal(results[5]) || []
                });

            } catch (error) {
                console.error("Critical load error:", error);
                toast.error("Error de conexión");
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadData();
        loadLogoBase64().then(l => isMounted && setLogoBase64(l));

        return () => { isMounted = false; };
    }, []);

    // Computed Data
    const computed = useMemo(() => {
        const selectedP = PERIODS.find(p => p.id === period) || PERIODS[2];

        const date = new Date();
        if (selectedP.id === 'daily') date.setHours(0, 0, 0, 0);
        else {
            date.setDate(date.getDate() - selectedP.days);
            date.setHours(0, 0, 0, 0);
        }
        const cutoffStr = getLocalDateStr(date);
        const isAfterCutoff = (d) => getLocalDateStr(new Date(d)) >= cutoffStr;

        const filteredPRs = data.prs.filter(pr => isAfterCutoff(pr.date)).slice(0, 15);
        const filteredLogs = data.bodyLogs.filter(l => l.weight && isAfterCutoff(l.date));
        const filteredHistory = data.history.filter(h => isAfterCutoff(h.date));

        const photos = data.bodyLogs
            .filter(l => l.photo && isAfterCutoff(l.date))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const weightChart = filteredLogs.slice().reverse().map(l => ({
            date: new Date(l.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            weight: l.weight
        }));

        const trainingDays = Object.keys(data.consistency).filter(d => d >= cutoffStr).length;
        const totalSessions = filteredHistory.length;

        let weightChange = null;
        if (filteredLogs.length > 0) {
            const start = filteredLogs[filteredLogs.length - 1].weight;
            const end = filteredLogs[0].weight;
            weightChange = Number((end - start).toFixed(2));
        }

        // --- CÁLCULO DE DELTAS MEJORADO ---
        // Agrupa historial por ejercicio, ordena por relevancia y filtra cambios significativos
        let progressData = [];
        const exerciseGroups = {};

        filteredHistory.forEach(session => {
            if (!session.exercise?.name || !session.sets?.length) return;
            const name = session.exercise.name;

            // Buscar mejor set de la sesión (mayor peso)
            const bestSet = session.sets.reduce((prev, current) =>
                (current.weight > (prev?.weight || 0)) ? current : prev
                , null);

            if (!bestSet) return;

            if (!exerciseGroups[name]) exerciseGroups[name] = [];
            exerciseGroups[name].push({
                date: new Date(session.date),
                weight: bestSet.weight || 0,
                reps: bestSet.reps || 0
            });
        });

        // Calcular diferencias y score de mejora
        Object.keys(exerciseGroups).forEach(name => {
            const sessions = exerciseGroups[name].sort((a, b) => a.date - b.date);
            if (sessions.length >= 2) {
                const first = sessions[0];
                const last = sessions[sessions.length - 1];
                const deltaWeight = Number((last.weight - first.weight).toFixed(2));
                const deltaReps = last.reps - first.reps;

                // Solo incluir si hubo cambio real
                if (deltaWeight !== 0 || deltaReps !== 0) {
                    progressData.push({
                        name,
                        firstWeight: first.weight,
                        firstReps: first.reps,
                        lastWeight: last.weight,
                        lastReps: last.reps,
                        deltaWeight,
                        deltaReps,
                        // Score ponderado: prioriza peso, secundario reps
                        improvementScore: Math.abs(deltaWeight) + (Math.abs(deltaReps) * 0.3)
                    });
                }
            }
        });

        // Ordenar por mayor mejora y limitar a top 12
        progressData.sort((a, b) => b.improvementScore - a.improvementScore);
        progressData = progressData.slice(0, 12);

        return {
            period: selectedP,
            cutoffStr,
            filteredPRs,
            filteredLogs,
            photos,
            weightChart,
            trainingDays,
            totalSessions,
            weightChange,
            progressData, // <--- Nueva propiedad disponible
            hasData: trainingDays > 0 || totalSessions > 0 || filteredPRs.length > 0 || filteredLogs.length > 0
        };
    }, [data, period]);

    // ==========================================
    // PDF GENERATION LOGIC
    // ==========================================
    const generatePDF = async () => {
        if (!computed.hasData) return toast.error('Sin datos en este período');

        setGenerating(true);
        setProgress(10);
        toast.info('Generando reporte completo...');

        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');

            const doc = new jsPDF('p', 'mm', 'a4');
            const w = doc.internal.pageSize.getWidth();
            const h = doc.internal.pageSize.getHeight();
            const margin = 15;

            const builder = new PDFBuilder(doc, w, h, margin, 20);

            // 1. Header
            builder.renderHeader(logoBase64, computed.period.label);
            setProgress(25);

            // 2. Resumen Stats
            builder.printSectionTitle('RESUMEN DEL PERÍODO', 35);
            const stats = [
                { val: computed.trainingDays, lbl: 'Días Entrenados', col: COLORS.purple },
                { val: computed.totalSessions, lbl: 'Sesiones Totales', col: [59, 130, 246] },
                { val: computed.filteredPRs.length, lbl: 'Nuevos PRs', col: COLORS.yellow },
                {
                    val: computed.weightChange !== null ? `${computed.weightChange > 0 ? '+' : ''}${computed.weightChange}kg` : '--',
                    lbl: 'Cambio Peso',
                    col: computed.weightChange > 0 ? COLORS.green : computed.weightChange < 0 ? COLORS.red : COLORS.textMedium
                }
            ];

            const cardW = (w - margin * 2 - 15) / 4;
            stats.forEach((s, i) => {
                const x = margin + i * (cardW + 5);
                doc.setFillColor(...COLORS.bgLight);
                doc.roundedRect(x, builder.y, cardW, 25, 3, 3, 'F');
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...s.col);
                doc.text(String(s.val), x + cardW / 2, builder.y + 10, { align: 'center' });
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.textLight);
                doc.text(s.lbl, x + cardW / 2, builder.y + 18, { align: 'center' });
            });
            builder.y += 35;

            // 3. Rutina Activa
            if (data.routine) {
                builder.printSectionTitle(`RUTINA: ${data.routine.name}`, 40);
                data.routine.days.forEach(day => {
                    builder.ensureSpace(30);
                    const rows = day.exercises?.map(ex => [ex.name, `${ex.targetSets}x${ex.targetReps}`]) || [];
                    autoTable(doc, {
                        startY: builder.y,
                        head: [[`${day.dayName}${day.isRestDay ? ' (Descanso)' : ''}`, '']],
                        body: rows.length ? rows : [['Día de descanso', '']],
                        theme: 'grid',
                        headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                        columnStyles: { 1: { halign: 'right', fontStyle: 'bold', textColor: COLORS.purple } },
                        margin: { left: margin, right: margin }
                    });
                    builder.y = doc.lastAutoTable.finalY + 6;
                });
                builder.y += 5;
            }
            setProgress(40);

            // 4. PRs
            if (computed.filteredPRs.length > 0) {
                builder.printSectionTitle('RÉCORDS PERSONALES (PRs)', 50);
                const rows = computed.filteredPRs.map(pr => [
                    pr.exerciseName?.substring(0, 30),
                    `${pr.weight}kg`,
                    `x${pr.reps}`,
                    new Date(pr.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
                ]);
                autoTable(doc, {
                    startY: builder.y,
                    head: [['Ejercicio', 'Peso', 'Reps', 'Fecha']],
                    body: rows,
                    theme: 'grid',
                    headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                    columnStyles: {
                        1: { halign: 'right', fontStyle: 'bold', textColor: COLORS.purple },
                        2: { halign: 'center' },
                        3: { halign: 'right', textColor: COLORS.textMedium }
                    },
                    margin: { left: margin, right: margin }
                });
                builder.y = doc.lastAutoTable.finalY + 10;
            }

            // 5. PROGRESO POR EJERCICIO (DELTAS) - MEJORADO
            if (computed.progressData.length > 0) {
                builder.printSectionTitle('PROGRESO POR EJERCICIO', 60);

                const deltaRows = computed.progressData.map(ex => [
                    ex.name.substring(0, 35),
                    `${ex.firstWeight}kg x ${ex.firstReps}`,
                    `${ex.lastWeight}kg x ${ex.lastReps}`,
                    ex.deltaWeight > 0 ? `+${ex.deltaWeight}kg` : ex.deltaWeight < 0 ? `${ex.deltaWeight}kg` : '0',
                    ex.deltaReps > 0 ? `+${ex.deltaReps}` : ex.deltaReps < 0 ? `${ex.deltaReps}` : '0'
                ]);

                autoTable(doc, {
                    startY: builder.y,
                    head: [['Ejercicio', 'Primera Sesión', 'Última Sesión', 'Δ Peso', 'Δ Reps']],
                    body: deltaRows,
                    theme: 'grid',
                    headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                    bodyStyles: { fontSize: 9 },
                    columnStyles: {
                        0: { fontStyle: 'bold' },
                        1: { halign: 'center', textColor: COLORS.textMedium },
                        2: { halign: 'center', textColor: COLORS.purple },
                        3: { halign: 'center', fontStyle: 'bold' },
                        4: { halign: 'center' }
                    },
                    didParseCell: (cellData) => {
                        // Colorear columna Δ Peso (index 3)
                        if (cellData.section === 'body' && cellData.column.index === 3) {
                            const text = cellData.cell.text[0];
                            if (text.startsWith('+')) cellData.cell.styles.textColor = COLORS.green;
                            else if (text.startsWith('-')) cellData.cell.styles.textColor = COLORS.red;
                        }
                        // Colorear columna Δ Reps (index 4)
                        if (cellData.section === 'body' && cellData.column.index === 4) {
                            const text = cellData.cell.text[0];
                            if (text.startsWith('+')) cellData.cell.styles.textColor = COLORS.green;
                            else if (text.startsWith('-')) cellData.cell.styles.textColor = COLORS.red;
                        }
                    },
                    margin: { left: margin, right: margin }
                });
                builder.y = doc.lastAutoTable.finalY + 10;
            }
            setProgress(60);

            // 6. Body Tracking
            const showWeight = computed.weightChart.length > 1;
            const showPhotos = computed.photos.length > 0;
            // Comprobamos si hay algún dato de composición (bodyFat, bmi, etc)
            const logsWithComp = computed.filteredLogs.filter(l =>
                l.bodyFat || l.muscleMass || l.bmi || l.bodyWater || l.boneMass
            );
            const showComp = logsWithComp.length > 0;

            if (showWeight || showPhotos || showComp) {
                doc.addPage();
                builder.y = margin;

                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.purple);
                doc.text('SEGUIMIENTO CORPORAL', margin, builder.y);
                builder.y += 15;

                // A. Gráfica Peso
                if (showWeight) {
                    doc.setFontSize(11);
                    doc.setTextColor(...COLORS.textDark);
                    doc.text('Evolución del Peso', margin, builder.y);
                    builder.y += 5;
                    builder.drawLineChart(computed.weightChart, w - margin * 2, 50);
                }

                // B. Fotos
                if (showPhotos) {
                    builder.ensureSpace(40);
                    doc.setFontSize(11);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.textDark);
                    doc.text('Progreso Visual', margin, builder.y);
                    builder.y += 10;

                    const maxPerRow = 3;
                    const gap = 5;
                    const pW = (w - margin * 2 - (maxPerRow - 1) * gap) / maxPerRow;
                    const pH = pW * 1.33;
                    const rowHeight = pH + 15;

                    computed.photos.forEach((photo, i) => {
                        const col = i % maxPerRow;
                        if (col === 0 && i > 0) builder.y += rowHeight;
                        if (col === 0 && builder.y + rowHeight > h - margin) {
                            doc.addPage();
                            builder.y = margin;
                        }

                        const x = margin + col * (pW + gap);
                        try {
                            doc.addImage(photo.photo, 'JPEG', x, builder.y, pW, pH);
                            doc.setFillColor(...COLORS.purpleDark);
                            doc.rect(x, builder.y + pH - 6, pW, 6, 'F');
                            doc.setTextColor(255, 255, 255);
                            doc.setFontSize(7);
                            doc.text(
                                new Date(photo.date).toLocaleDateString('es-ES'),
                                x + pW / 2, builder.y + pH - 1.5,
                                { align: 'center' }
                            );
                        } catch (e) {
                            doc.rect(x, builder.y, pW, pH);
                        }
                    });
                    builder.y += rowHeight + 10;
                }

                // C. Composición Corporal con COMPARATIVA
                if (showComp) {
                    // Obtener el registro más antiguo y más reciente del período
                    const oldest = logsWithComp[logsWithComp.length - 1];
                    const latest = logsWithComp[0];
                    const hasComparison = logsWithComp.length > 1;

                    builder.ensureSpace(70);
                    builder.printSectionTitle('COMPOSICIÓN CORPORAL', 30);

                    // Helper para calcular delta
                    const getDelta = (oldVal, newVal, decimals = 1) => {
                        if (!oldVal || !newVal) return '-';
                        const diff = Number((newVal - oldVal).toFixed(decimals));
                        if (diff === 0) return '0';
                        return diff > 0 ? `+${diff}` : `${diff}`;
                    };

                    // Tabla con comparativa
                    const compRows = [];

                    if (latest.bodyFat !== null || oldest?.bodyFat !== null) {
                        compRows.push([
                            'Grasa Corporal',
                            oldest?.bodyFat ? `${oldest.bodyFat}%` : '-',
                            latest.bodyFat ? `${latest.bodyFat}%` : '-',
                            hasComparison ? getDelta(oldest?.bodyFat, latest.bodyFat) + '%' : '-'
                        ]);
                    }
                    if (latest.muscleMass !== null || oldest?.muscleMass !== null) {
                        compRows.push([
                            'Masa Muscular',
                            oldest?.muscleMass ? `${oldest.muscleMass}kg` : '-',
                            latest.muscleMass ? `${latest.muscleMass}kg` : '-',
                            hasComparison ? getDelta(oldest?.muscleMass, latest.muscleMass) + 'kg' : '-'
                        ]);
                    }
                    if (latest.bmi !== null || oldest?.bmi !== null) {
                        compRows.push([
                            'IMC',
                            oldest?.bmi ? oldest.bmi.toFixed(1) : '-',
                            latest.bmi ? latest.bmi.toFixed(1) : '-',
                            hasComparison ? getDelta(oldest?.bmi, latest.bmi) : '-'
                        ]);
                    }
                    if (latest.bodyWater !== null || oldest?.bodyWater !== null) {
                        compRows.push([
                            'Agua Corporal',
                            oldest?.bodyWater ? `${oldest.bodyWater}%` : '-',
                            latest.bodyWater ? `${latest.bodyWater}%` : '-',
                            hasComparison ? getDelta(oldest?.bodyWater, latest.bodyWater) + '%' : '-'
                        ]);
                    }
                    if (latest.bmr !== null || oldest?.bmr !== null) {
                        compRows.push([
                            'Metabolismo Basal',
                            oldest?.bmr ? `${oldest.bmr} kcal` : '-',
                            latest.bmr ? `${latest.bmr} kcal` : '-',
                            hasComparison ? getDelta(oldest?.bmr, latest.bmr, 0) + ' kcal' : '-'
                        ]);
                    }

                    if (compRows.length > 0) {
                        autoTable(doc, {
                            startY: builder.y,
                            head: [['Métrica', 'Inicio', 'Actual', 'Cambio']],
                            body: compRows,
                            theme: 'grid',
                            headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                            columnStyles: {
                                0: { fontStyle: 'bold' },
                                1: { halign: 'center', textColor: COLORS.textMedium },
                                2: { halign: 'center', textColor: COLORS.purple },
                                3: { halign: 'center', fontStyle: 'bold' }
                            },
                            didParseCell: (cellData) => {
                                // Colorear columna Cambio
                                if (cellData.section === 'body' && cellData.column.index === 3) {
                                    const text = cellData.cell.text[0];
                                    // Para grasa: negativo es bueno (verde), positivo es malo (rojo)
                                    // Para músculo: positivo es bueno (verde), negativo es malo (rojo)
                                    if (text.startsWith('+')) {
                                        // Verificar si es grasa (inversión de color)
                                        const metric = compRows[cellData.row.index]?.[0];
                                        if (metric === 'Grasa Corporal') {
                                            cellData.cell.styles.textColor = COLORS.red;
                                        } else {
                                            cellData.cell.styles.textColor = COLORS.green;
                                        }
                                    } else if (text.startsWith('-')) {
                                        const metric = compRows[cellData.row.index]?.[0];
                                        if (metric === 'Grasa Corporal') {
                                            cellData.cell.styles.textColor = COLORS.green;
                                        } else {
                                            cellData.cell.styles.textColor = COLORS.red;
                                        }
                                    }
                                }
                            },
                            margin: { left: margin, right: margin }
                        });
                        builder.y = doc.lastAutoTable.finalY + 10;
                    }

                    if (latest.note) {
                        doc.setFontSize(9);
                        doc.setTextColor(...COLORS.textMedium);
                        doc.setFont('helvetica', 'italic');
                        doc.text(`Nota: "${latest.note}"`, margin, builder.y);
                        builder.y += 10;
                    }
                }
            }

            setProgress(100);
            builder.renderFooters();

            doc.save(`NexLift_${computed.period.label}_${new Date().toISOString().split('T')[0]}.pdf`);
            toast.success('Reporte descargado');

        } catch (error) {
            console.error(error);
            toast.error('Error generando PDF');
        } finally {
            setGenerating(false);
            setProgress(0);
        }
    };

    // UI RENDER
    if (loading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
            <div className="w-10 h-10 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--text-secondary)]">Preparando datos...</p>
        </div>
    );

    return (
        <div className="max-w-lg mx-auto space-y-6 pb-24 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="text-[var(--primary)]" />
                    Exportar Reporte
                </h1>
                <p className="text-[var(--text-secondary)] text-sm">Resumen de progreso completo</p>
            </div>

            {/* 1. Selector de Período */}
            <section className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Calendar size={16} className="text-[var(--primary)]" /> Período
                </h3>
                <div className="flex flex-wrap gap-2">
                    {PERIODS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setPeriod(p.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${period === p.id
                                ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-900/20'
                                : 'bg-[var(--bg-dark)] text-[var(--text-secondary)] hover:text-white'
                                }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </section>

            {/* 2. Preview Rápido */}
            <section className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Vista Previa</h3>
                    <span className="text-xs text-[var(--text-secondary)]">{computed.period.days} días seleccionados</span>
                </div>

                {!computed.hasData ? (
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-3">
                        <AlertCircle className="text-yellow-500 shrink-0" size={20} />
                        <p className="text-xs text-yellow-200">No hay datos suficientes en este rango de fechas.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Stats Grid - 4 columns */}
                        <div className="grid grid-cols-4 gap-2">
                            <StatBox val={computed.trainingDays} label="Días" color="text-purple-400" />
                            <StatBox val={computed.totalSessions} label="Sesiones" />
                            <StatBox val={computed.filteredPRs.length} label="PRs" color="text-yellow-400" />
                            <StatBox val={computed.weightChange} label="Peso" isDelta />
                        </div>

                        {/* Weight Chart */}
                        {computed.weightChart.length > 1 && (
                            <div className="h-24 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={computed.weightChart}>
                                        <defs>
                                            <linearGradient id="gcolor" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <YAxis domain={['dataMin - 1', 'dataMax + 1']} hide />
                                        <Area
                                            type="monotone"
                                            dataKey="weight"
                                            stroke="#8b5cf6"
                                            fill="url(#gcolor)"
                                            strokeWidth={2}
                                            animationDuration={1500}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Top Mejoras Mini-Preview */}
                        {computed.progressData.length > 0 && (
                            <div className="bg-[var(--bg-dark)] rounded-lg p-3 border border-[var(--border)]">
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <TrendingUp size={10} className="text-green-400" /> Top Mejoras
                                </p>
                                <div className="space-y-1.5">
                                    {computed.progressData.slice(0, 3).map((ex, i) => (
                                        <div key={ex.name} className="flex items-center justify-between text-xs">
                                            <span className="text-[var(--text-secondary)] truncate flex-1 mr-2">
                                                <span className="text-[var(--text-primary)] font-medium">{i + 1}.</span> {ex.name}
                                            </span>
                                            <span className={`font-bold shrink-0 ${ex.deltaWeight > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {ex.deltaWeight > 0 ? '▲' : '▼'} {Math.abs(ex.deltaWeight)}kg
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Badges */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                            {data.routine && (
                                <span className="text-[10px] bg-[var(--primary)]/10 text-[var(--primary)] px-2 py-1 rounded-full border border-[var(--primary)]/20">
                                    Rutina: {data.routine.name}
                                </span>
                            )}
                            {computed.progressData.length > 0 && (
                                <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-1 rounded-full border border-green-500/20">
                                    {computed.progressData.length} ejercicios con progreso
                                </span>
                            )}
                            {computed.photos.length > 0 && (
                                <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-1 rounded-full border border-purple-500/20">
                                    {computed.photos.length} fotos
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </section>

            {/* Action Button */}
            <button
                onClick={generatePDF}
                disabled={generating || !computed.hasData}
                className="w-full bg-[var(--primary)] text-white py-4 rounded-xl font-bold shadow-lg shadow-purple-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            >
                <div className="relative z-10 flex items-center justify-center gap-2">
                    {generating ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Generando... {progress}%</span>
                        </>
                    ) : (
                        <>
                            <Download size={20} /> Descargar Reporte PDF
                        </>
                    )}
                </div>

                {generating && (
                    <div
                        className="absolute left-0 top-0 bottom-0 bg-white/20 transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                )}
            </button>
        </div>
    );
}

// Small UI Components
function StatBox({ val, label, color = "text-white", isDelta }) {
    let displayVal = val;
    let finalColor = color;

    if (isDelta && val !== null) {
        displayVal = `${val > 0 ? '+' : ''}${val}`;
        finalColor = val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-gray-400';
    } else if (val === null || val === undefined) {
        displayVal = '--';
    }

    return (
        <div className="bg-[var(--bg-dark)] rounded-lg p-2 text-center border border-[var(--border)]">
            <p className={`text-lg font-bold ${finalColor}`}>{displayVal}</p>
            <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{label}</p>
        </div>
    );
}