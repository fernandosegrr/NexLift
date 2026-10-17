import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
    FileText, Download, Calendar, Activity, AlertCircle,
    TrendingUp, ArrowLeft
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { mexicoCityDateStr } from '../utils/dates';

// ==========================================
// CONSTANTS & CONFIG
// ==========================================
const PERIODS = [
    { id: 'daily', label: 'Un día', days: 1 },
    { id: 'weekly', label: 'Semanal', days: 7 },
    { id: 'monthly', label: 'Mensual', days: 30 },
    { id: 'quarterly', label: 'Trimestral', days: 90 },
    { id: 'semester', label: 'Semestral', days: 180 },
    { id: 'yearly', label: 'Anual', days: 365 },
];

/** Carga una imagen remota a dataURL para jsPDF; timeout / CORS / 404 → null. */
async function loadImageAsDataUrl(url, timeoutMs = 12000) {
    if (!url) return null;
    if (String(url).startsWith('data:')) return url;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal, referrerPolicy: 'no-referrer' });
        clearTimeout(t);
        if (!res.ok) return null;
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) return null;
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        // Fallback: Image + canvas (a veces evita CORS raro de fetch)
        try {
            return await new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.referrerPolicy = 'no-referrer';
                const timer = setTimeout(() => resolve(null), timeoutMs);
                img.onload = () => {
                    clearTimeout(timer);
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width;
                        canvas.height = img.naturalHeight || img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        resolve(canvas.toDataURL('image/jpeg', 0.85));
                    } catch {
                        resolve(null);
                    }
                };
                img.onerror = () => {
                    clearTimeout(timer);
                    resolve(null);
                };
                img.src = url;
            });
        } catch {
            return null;
        }
    }
}

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

// Trunca por grafemas (no por code units UTF-16) para no partir un emoji o
// caracter combinado a la mitad al cortar nombres largos en el PDF.
function truncateText(str, maxLength) {
    if (!str) return str;
    return Array.from(str).slice(0, maxLength).join('');
}

// Formatea un instante UTC como día de calendario CDMX (misma convención que el resto de la app).
function formatLocalDate(dateStr, options = { day: 'numeric', month: 'short' }, locale = 'es-ES') {
    if (!dateStr) return '';
    const dayKey = mexicoCityDateStr(new Date(dateStr)); // YYYY-MM-DD CDMX
    const [year, month, day] = dayKey.split('-').map(Number);
    // Mediodía local del calendar day — evita que toLocaleDateString cruce de día
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return date.toLocaleDateString(locale, options);
}

// RIR: SetLog.rpe guarda 10-RIR. rpe=10 es RIR 0 (truthy); rpe=0 no debería
// usarse, pero `rpe != null` es la condición correcta (no `if (rpe)`).
function rirFromRpe(rpe) {
    return rpe != null && Number.isFinite(Number(rpe)) ? 10 - Number(rpe) : null;
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

    renderHeader(logoBase64, periodLabel, userName) {
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
        const subtitle = userName ? `Reporte de ${userName} • ${periodLabel}` : `Reporte de Progreso • ${periodLabel}`;
        this.doc.text(subtitle, logoBase64 ? this.margin + 34 : this.margin, 29);

        this.doc.setFontSize(10);
        // Fecha de generación en CDMX (no UTC del toISOString del filename)
        const genDay = mexicoCityDateStr();
        const [gy, gm, gd] = genDay.split('-').map(Number);
        const genLabel = new Date(gy, gm - 1, gd, 12, 0, 0)
            .toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        this.doc.text(
            genLabel,
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
    const { user } = useAuth();
    const [searchParams] = useSearchParams();

    const [data, setData] = useState({
        stats: {},
        routine: null,
        prs: [],
        bodyLogs: [],
        consistency: {},
        history: [],
        cardio: []
    });

    const [loading, setLoading] = useState(true);
    const [logoBase64, setLogoBase64] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);

    const [period, setPeriod] = useState(() => {
        const p = searchParams.get('period');
        return PERIODS.find(x => x.id === p) ? p : 'monthly';
    });
    // Día concreto para período "Un día" (antes solo era "hoy" sin picker)
    const [dayDate, setDayDate] = useState(() => {
        const d = searchParams.get('date');
        return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : mexicoCityDateStr();
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
                    api.getBodyLogs(180),
                    api.getConsistency(),
                    // 500 con select slim en server (antes ~250KB con exercise:true)
                    api.getWorkoutHistory(500)
                ]);

                if (!isMounted) return;

                const getVal = (res) => res.status === 'fulfilled' ? res.value : null;

                const consistencyRaw = getVal(results[4]);
                const consistencyMap = {};
                if (consistencyRaw?.events) {
                    consistencyRaw.events.forEach(d => {
                        const k = mexicoCityDateStr(new Date(d));
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Computed Data
    const computed = useMemo(() => {
        const selectedP = PERIODS.find(p => p.id === period) || PERIODS[2];

        // Ventana del período en días calendario CDMX estrictos (anclados a mediodía UTC)
        const todayCdmx = mexicoCityDateStr();
        const dailyKey = selectedP.id === 'daily'
            ? (dayDate || todayCdmx)
            : null;
        let cutoffStr = todayCdmx;
        let isAfterCutoff;
        if (selectedP.id === 'daily') {
            // Un solo día exacto en CDMX
            isAfterCutoff = (d) => mexicoCityDateStr(new Date(d)) === dailyKey;
        } else {
            const daysBack = selectedP.days - 1; // inclusivo: 30d = hoy + 29 atrás
            const todayAnchor = new Date(`${todayCdmx}T12:00:00Z`);
            cutoffStr = mexicoCityDateStr(new Date(todayAnchor.getTime() - daysBack * 24 * 60 * 60 * 1000));
            isAfterCutoff = (d) => {
                const key = mexicoCityDateStr(new Date(d));
                return key >= cutoffStr && key <= todayCdmx;
            };
        }

        const allPeriodPRs = data.prs
            .filter(pr => isAfterCutoff(pr.date))
            .slice()
            .sort((a, b) => (b.estimated1RM || b.weight || 0) - (a.estimated1RM || a.weight || 0));
        const prsCount = allPeriodPRs.length;
        const filteredPRs = allPeriodPRs.slice(0, 15);
        // Filtro estricto: excluir registros que son únicamente check-in de hábitos diarios
        const measurementLogs = data.bodyLogs.filter(
            b => (b.weight != null || b.bodyFat != null || b.muscleMass != null) && isAfterCutoff(b.date)
        );
        const filteredLogs = measurementLogs.filter(l => l.weight != null);
        const periodBodyLogs = data.bodyLogs.filter(l => isAfterCutoff(l.date));
        const filteredHistory = data.history.filter(h => isAfterCutoff(h.date));

        // Adherencia nutricional y suplementación (agrupado por día CDMX)
        const habitsByDay = new Map();
        periodBodyLogs.forEach(l => {
            const dKey = mexicoCityDateStr(new Date(l.date));
            const cur = habitsByDay.get(dKey) || {
                creatineTaken: false,
                dietCompliant: false,
                zeroLiquidCalories: false
            };
            habitsByDay.set(dKey, {
                creatineTaken: cur.creatineTaken || Boolean(l.creatineTaken),
                dietCompliant: cur.dietCompliant || Boolean(l.dietCompliant),
                zeroLiquidCalories: cur.zeroLiquidCalories || Boolean(l.zeroLiquidCalories)
            });
        });

        const denomDays = Math.max(1, selectedP.id === 'daily' ? 1 : (selectedP.days || 7));
        let creatineDays = 0;
        let dietDays = 0;
        let zeroLiquidDays = 0;
        let trackedHabitDays = 0;
        habitsByDay.forEach(v => {
            if (v.creatineTaken) creatineDays++;
            if (v.dietCompliant) dietDays++;
            if (v.zeroLiquidCalories) zeroLiquidDays++;
            if (v.creatineTaken || v.dietCompliant || v.zeroLiquidCalories) trackedHabitDays++;
        });

        const adherence = {
            denomDays,
            trackedHabitDays,
            creatineDays,
            dietDays,
            zeroLiquidDays,
            creatinePct: Math.min(100, Math.round((creatineDays / denomDays) * 100)),
            dietPct: Math.min(100, Math.round((dietDays / denomDays) * 100)),
            zeroLiquidPct: Math.min(100, Math.round((zeroLiquidDays / denomDays) * 100)),
            overallPct: Math.min(100, Math.round(((creatineDays + dietDays + zeroLiquidDays) / (denomDays * 3)) * 100))
        };

        // ============ COMPARACIÓN DIARIA POR DÍA DE SEMANA ============
        let dailyComparison = null;
        if (selectedP.id === 'daily') {
            const todayStr = dailyKey; // día elegido en el date picker
            // Mismo día de la semana, 7 días antes (CDMX)
            const anchor = new Date(`${todayStr}T12:00:00Z`);
            const lastWeekStr = mexicoCityDateStr(new Date(anchor.getTime() - 7 * 24 * 60 * 60 * 1000));

            const todaySessions = data.history.filter(h =>
                mexicoCityDateStr(new Date(h.date)) === todayStr
            );
            const lastWeekSessions = data.history.filter(h =>
                mexicoCityDateStr(new Date(h.date)) === lastWeekStr
            );

            const calculateVolume = (sessions) => {
                let total = 0;
                let sets = 0;
                sessions.forEach(session => {
                    (session.sets || []).forEach(s => {
                        total += (s.weight || 0) * (s.reps || 0);
                        if (s.repsRight != null || s.weightRight != null) {
                            total += (s.weightRight ?? s.weight ?? 0) * (s.repsRight ?? s.reps ?? 0);
                        }
                        sets++;
                    });
                });
                return { volume: total, sets };
            };

            const todayStats = calculateVolume(todaySessions);
            const lastWeekStats = calculateVolume(lastWeekSessions);

            const todayPRs = data.prs.filter(pr =>
                mexicoCityDateStr(new Date(pr.date)) === todayStr
            );

            const groupByExercise = (sessions) => {
                const grouped = {};
                sessions.forEach(session => {
                    if (!session.exercise?.name) return;
                    const name = session.exercise.name;
                    if (!grouped[name]) grouped[name] = [];
                    grouped[name].push(...(session.sets || []).map(s => ({
                        weight: s.weight,
                        reps: s.reps,
                        weightRight: s.weightRight ?? null,
                        repsRight: s.repsRight ?? null,
                        rir: rirFromRpe(s.rpe)
                    })));
                });
                return grouped;
            };

            const todayExercises = groupByExercise(todaySessions);
            const lastWeekExercises = groupByExercise(lastWeekSessions);

            const allExerciseNames = [...new Set([
                ...Object.keys(todayExercises),
                ...Object.keys(lastWeekExercises)
            ])];

            const lastWeekExerciseCount = Object.keys(lastWeekExercises).length;
            const todayExerciseCount = Object.keys(todayExercises).length;

            const volumeChange = lastWeekStats.volume > 0
                ? ((todayStats.volume - lastWeekStats.volume) / lastWeekStats.volume * 100).toFixed(1)
                : null;

            // Si hoy va muy por debajo (0 volumen, o menos de la mitad de ejercicios y
            // del volumen), la % engaña: suele ser sesión aún en curso, no un -100% real.
            const comparisonIncomplete = lastWeekStats.volume > 0 && (
                todayStats.volume <= 0
                || (
                    todayExerciseCount < Math.max(1, Math.ceil(lastWeekExerciseCount * 0.5))
                    && todayStats.volume < lastWeekStats.volume * 0.5
                )
            );

            const weekdayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            const weekdayName = weekdayNames[new Date(`${todayStr}T12:00:00Z`).getUTCDay()];

            dailyComparison = {
                todayDate: todayStr,
                lastWeekDate: lastWeekStr,
                weekdayName,
                todayVolume: todayStats.volume,
                todaySets: todayStats.sets,
                todayExerciseCount,
                lastWeekExerciseCount,
                todayPRs: todayPRs,
                lastWeekVolume: lastWeekStats.volume,
                lastWeekSets: lastWeekStats.sets,
                volumeChange: volumeChange,
                volumeDelta: todayStats.volume - lastWeekStats.volume,
                comparisonIncomplete,
                exercises: allExerciseNames.map(name => ({
                    name,
                    today: todayExercises[name] || [],
                    lastWeek: lastWeekExercises[name] || []
                })).filter(ex => ex.today.length > 0 || ex.lastWeek.length > 0)
            };
        }

        const photos = data.bodyLogs
            .filter(l => (l.photo || l.photoUrl) && isAfterCutoff(l.date))
            .map(l => ({ ...l, photo: l.photo || l.photoUrl }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const weightChart = filteredLogs.slice().reverse().map(l => ({
            date: formatLocalDate(l.date, { day: 'numeric', month: 'short' }),
            weight: l.weight
        }));

        // Días con ENTRENO real (WorkoutLog), no consistency (que incluye descansos auto)
        const trainingDays = new Set(
            filteredHistory.map(h => mexicoCityDateStr(new Date(h.date)))
        ).size;
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

            // Fórmula Epley: 1RM = weight * (1 + reps / 30)
            const calculate1RM = (weight, reps) => weight * (1 + reps / 30);

            // Buscar mejor set de la sesión usando 1RM (considera peso Y reps)
            const bestSet = session.sets.reduce((prev, current) => {
                const prevScore = calculate1RM(prev?.weight || 0, prev?.reps || 0);
                const currScore = calculate1RM(current?.weight || 0, current?.reps || 0);
                return currScore > prevScore ? current : prev;
            }, null);

            if (!bestSet) return;

            if (!exerciseGroups[name]) exerciseGroups[name] = [];
            const bestRIR = rirFromRpe(bestSet.rpe);
            // Adjusted 1RM considers RIR: effective reps = reps + RIR
            const effectiveReps = (bestSet.reps || 0) + (bestRIR || 0);
            exerciseGroups[name].push({
                date: new Date(session.date),
                weight: bestSet.weight || 0,
                reps: bestSet.reps || 0,
                rir: bestRIR,
                estimated1RM: calculate1RM(bestSet.weight || 0, effectiveReps)
            });
        });

        // Calcular diferencias y score de mejora usando 1RM
        Object.keys(exerciseGroups).forEach(name => {
            const sessions = exerciseGroups[name].sort((a, b) => a.date - b.date);
            if (sessions.length >= 2) {
                const first = sessions[0];
                const last = sessions[sessions.length - 1];
                const deltaWeight = Number((last.weight - first.weight).toFixed(2));
                const deltaReps = last.reps - first.reps;
                const delta1RM = Number((last.estimated1RM - first.estimated1RM).toFixed(2));

                // Solo incluir si hubo cambio real en 1RM
                if (delta1RM !== 0) {
                    progressData.push({
                        name,
                        firstWeight: first.weight,
                        firstReps: first.reps,
                        first1RM: Number(first.estimated1RM.toFixed(1)),
                        lastWeight: last.weight,
                        lastReps: last.reps,
                        last1RM: Number(last.estimated1RM.toFixed(1)),
                        deltaWeight,
                        deltaReps,
                        delta1RM,
                        // Score basado en mejora de 1RM estimado
                        improvementScore: Math.abs(delta1RM)
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
            prsCount,
            filteredLogs,
            measurementLogs,
            photos,
            weightChart,
            trainingDays,
            totalSessions,
            weightChange,
            progressData,
            dailyComparison,
            adherence,
            hasData: trainingDays > 0 || totalSessions > 0 || prsCount > 0 || measurementLogs.length > 0
                || adherence.trackedHabitDays > 0
                || (dailyComparison?.exercises?.length > 0),
            dayDate: dailyKey
        };
    }, [data, period, dayDate]);

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
            builder.renderHeader(logoBase64, computed.period.label, user?.firstName);
            setProgress(25);

            // 2. Resumen Stats
            builder.printSectionTitle('RESUMEN DEL PERÍODO', 35);
            const stats = [
                { val: computed.trainingDays, lbl: 'Días Entrenados', col: COLORS.purple },
                { val: computed.totalSessions, lbl: 'Sesiones Totales', col: [59, 130, 246] },
                { val: computed.prsCount, lbl: 'Nuevos PRs', col: COLORS.yellow },
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
            builder.y += 32;

            // 2.2 ADHERENCIA NUTRICIONAL / SUPLEMENTACIÓN (Daily Check-in)
            if (computed.adherence) {
                const adh = computed.adherence;
                builder.ensureSpace(26);
                doc.setFillColor(...COLORS.bgAlt);
                doc.roundedRect(margin, builder.y, w - margin * 2, 20, 3, 3, 'F');

                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...COLORS.purple);
                doc.text(
                    `% DE ADHERENCIA NUTRICIONAL / SUPLEMENTACION (${adh.overallPct}% global)`,
                    margin + 5,
                    builder.y + 7
                );

                doc.setFontSize(8.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(...COLORS.textDark);
                const adhSummaryText =
                    `Creatina: ${adh.creatineDays}/${adh.denomDays} dias (${adh.creatinePct}%)   |   ` +
                    `Dieta: ${adh.dietPct}% (${adh.dietDays}/${adh.denomDays} dias)   |   ` +
                    `0 Cal. Liquidas: ${adh.zeroLiquidPct}% (${adh.zeroLiquidDays}/${adh.denomDays} dias)`;
                doc.text(adhSummaryText, margin + 5, builder.y + 15);
                builder.y += 26;
            }

            // 2.5 COMPARACIÓN DIARIA (solo para período "Diario")
            if (computed.dailyComparison) {
                const dc = computed.dailyComparison;
                builder.printSectionTitle(`RESUMEN DEL ${dc.weekdayName.toUpperCase()}`, 80);

                // Stats cards para el día
                const dailyStats = [
                    { val: dc.todayExerciseCount, lbl: 'Ejercicios', col: COLORS.purple },
                    { val: dc.todaySets, lbl: 'Series', col: [59, 130, 246] },
                    { val: Math.round(dc.todayVolume / 1000) + 'k', lbl: 'Volumen kg×r', col: [34, 197, 94] },
                    { val: dc.todayPRs.length, lbl: 'PRs', col: COLORS.yellow }
                ];

                const dCardW = (w - margin * 2 - 15) / 4;
                dailyStats.forEach((s, i) => {
                    const x = margin + i * (dCardW + 5);
                    doc.setFillColor(...COLORS.bgLight);
                    doc.roundedRect(x, builder.y, dCardW, 22, 3, 3, 'F');
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...s.col);
                    doc.text(String(s.val), x + dCardW / 2, builder.y + 9, { align: 'center' });
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...COLORS.textLight);
                    doc.text(s.lbl, x + dCardW / 2, builder.y + 17, { align: 'center' });
                });
                builder.y += 30;

                // Comparación de volumen vs semana pasada
                if (dc.lastWeekVolume > 0) {
                    if (dc.comparisonIncomplete) {
                        // No pintar -100% en rojo: la sesión de pesas aún no está completa
                        doc.setFillColor(255, 251, 235); // amber soft
                        doc.roundedRect(margin, builder.y, w - margin * 2, 22, 3, 3, 'F');

                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...COLORS.yellow);
                        doc.text('Sesion de pesas incompleta o en curso', margin + 5, builder.y + 8);

                        doc.setFontSize(8);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...COLORS.textMedium);
                        const hoyLbl = dc.todayVolume > 0
                            ? `Parcial hoy: ${Math.round(dc.todayVolume).toLocaleString()} kg x r`
                            : 'Sin volumen de pesas registrado hoy';
                        // Sin tildes/em-dash: helvetica de jsPDF no renderiza bien unicode en todos los entornos
                        doc.text(
                            `${hoyLbl}  |  ${dc.weekdayName} pasado: ${Math.round(dc.lastWeekVolume).toLocaleString()} kg x r - % no aplica aun`,
                            margin + 5,
                            builder.y + 16
                        );
                        builder.y += 28;
                    } else {
                        const volChangeNum = parseFloat(dc.volumeChange);
                        const isPositive = volChangeNum > 0;
                        doc.setFillColor(...COLORS.bgAlt);
                        doc.roundedRect(margin, builder.y, w - margin * 2, 18, 3, 3, 'F');

                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...COLORS.textMedium);
                        doc.text('Volumen vs semana pasada:', margin + 5, builder.y + 7);

                        doc.setFontSize(11);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...(isPositive ? COLORS.green : COLORS.red));
                        doc.text(
                            `${isPositive ? '+' : ''}${dc.volumeChange}% (${isPositive ? '+' : ''}${Math.round(dc.volumeDelta).toLocaleString()}kg)`,
                            margin + 5, builder.y + 14
                        );

                        doc.setFontSize(8);
                        doc.setTextColor(...COLORS.textLight);
                        doc.text(`Hoy: ${Math.round(dc.todayVolume).toLocaleString()}kg  |  Anterior: ${Math.round(dc.lastWeekVolume).toLocaleString()}kg`, w - margin - 5, builder.y + 11, { align: 'right' });
                        builder.y += 25;
                    }
                }

                // PRs logrados hoy
                if (dc.todayPRs.length > 0) {
                    builder.ensureSpace(40);
                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...COLORS.yellow);
                    doc.text('RECORDS PERSONALES DE HOY', margin, builder.y);
                    builder.y += 6;

                    const prRows = dc.todayPRs.map(pr => [
                        truncateText(pr.exerciseName, 30),
                        `${pr.weight}kg x ${pr.reps}`
                    ]);
                    autoTable(doc, {
                        startY: builder.y,
                        body: prRows,
                        theme: 'plain',
                        bodyStyles: { fontSize: 9 },
                        columnStyles: {
                            0: { fontStyle: 'bold' },
                            1: { halign: 'right', textColor: COLORS.yellow, fontStyle: 'bold' }
                        },
                        margin: { left: margin, right: margin }
                    });
                    builder.y = doc.lastAutoTable.finalY + 8;
                }

                // Tabla de ejercicios con comparación
                if (dc.exercises.length > 0) {
                    builder.printSectionTitle('DETALLE POR EJERCICIO', 40);

                    const formatSets = (sets) => {
                        if (!sets || sets.length === 0) return '—';
                        return sets.map(s => {
                            let str = (s.repsRight != null || s.weightRight != null)
                                ? `I:${s.weight}x${s.reps} D:${s.weightRight ?? s.weight}x${s.repsRight ?? s.reps}`
                                : `${s.weight}x${s.reps}`;
                            if (s.rir !== null && s.rir !== undefined) str += ` R${s.rir}`;
                            return str;
                        }).join(', ');
                    };

                    const compRows = dc.exercises.map(ex => [
                        truncateText(ex.name, 22),
                        formatSets(ex.today),
                        formatSets(ex.lastWeek)
                    ]);

                    autoTable(doc, {
                        startY: builder.y,
                        head: [['Ejercicio', 'Hoy', `${dc.weekdayName} pasado`]],
                        body: compRows,
                        theme: 'grid',
                        headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                        bodyStyles: { fontSize: 8 },
                        columnStyles: {
                            0: { fontStyle: 'bold', cellWidth: 50 },
                            1: { halign: 'left', textColor: COLORS.purple },
                            2: { halign: 'left', textColor: COLORS.textMedium }
                        },
                        margin: { left: margin, right: margin }
                    });
                    builder.y = doc.lastAutoTable.finalY + 10;
                }
            }

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
                const rows = computed.filteredPRs.map(pr => {
                    const est1RM = pr.estimated1RM ? `${Math.round(pr.estimated1RM)}` : '--';
                    return [
                        truncateText(pr.exerciseName, 28),
                        `${pr.weight}kg`,
                        `x${pr.reps}`,
                        est1RM,
                        formatLocalDate(pr.date, { day: '2-digit', month: '2-digit' })
                    ];
                });
                autoTable(doc, {
                    startY: builder.y,
                    head: [['Ejercicio', 'Peso', 'Reps', '1RM Est.', 'Fecha']],
                    body: rows,
                    theme: 'grid',
                    headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                    columnStyles: {
                        1: { halign: 'right', fontStyle: 'bold', textColor: COLORS.purple },
                        2: { halign: 'center' },
                        3: { halign: 'center', textColor: COLORS.yellow },
                        4: { halign: 'right', textColor: COLORS.textMedium }
                    },
                    margin: { left: margin, right: margin }
                });
                builder.y = doc.lastAutoTable.finalY + 10;
            }

            // 5. PROGRESO POR EJERCICIO - Muestra peso, reps y fuerza estimada
            if (computed.progressData.length > 0) {
                builder.printSectionTitle('PROGRESO POR EJERCICIO', 60);

                const deltaRows = computed.progressData.map(ex => [
                    truncateText(ex.name, 28),
                    `${ex.firstWeight}x${ex.firstReps}`,
                    `${ex.lastWeight}x${ex.lastReps}`,
                    ex.deltaWeight > 0 ? `+${ex.deltaWeight}` : ex.deltaWeight < 0 ? `${ex.deltaWeight}` : '0',
                    ex.deltaReps > 0 ? `+${ex.deltaReps}` : ex.deltaReps < 0 ? `${ex.deltaReps}` : '0',
                    ex.delta1RM > 0 ? `+${ex.delta1RM.toFixed(1)}` : ex.delta1RM < 0 ? `${ex.delta1RM.toFixed(1)}` : '0'
                ]);

                autoTable(doc, {
                    startY: builder.y,
                    head: [['Ejercicio', 'Inicio', 'Actual', 'kg', 'reps', 'Fuerza']],
                    body: deltaRows,
                    theme: 'grid',
                    headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                    bodyStyles: { fontSize: 9 },
                    columnStyles: {
                        0: { fontStyle: 'bold' },
                        1: { halign: 'center', textColor: COLORS.textMedium },
                        2: { halign: 'center', textColor: COLORS.purple },
                        3: { halign: 'center', fontStyle: 'bold' },
                        4: { halign: 'center' },
                        5: { halign: 'center', fontStyle: 'bold' }
                    },
                    didParseCell: (cellData) => {
                        if (cellData.section === 'body') {
                            const text = cellData.cell.text[0];
                            // kg (index 3)
                            if (cellData.column.index === 3) {
                                if (text.startsWith('+')) cellData.cell.styles.textColor = COLORS.green;
                                else if (text.startsWith('-')) cellData.cell.styles.textColor = COLORS.red;
                            }
                            // reps (index 4)
                            if (cellData.column.index === 4) {
                                if (text.startsWith('+')) cellData.cell.styles.textColor = COLORS.green;
                                else if (text.startsWith('-')) cellData.cell.styles.textColor = COLORS.red;
                            }
                            // Fuerza (index 5)
                            if (cellData.column.index === 5) {
                                if (text.startsWith('+')) cellData.cell.styles.textColor = COLORS.green;
                                else if (text.startsWith('-')) cellData.cell.styles.textColor = COLORS.red;
                            }
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
            const measurementHistory = data.bodyLogs
                .filter(b => b.weight != null || b.bodyFat != null || b.muscleMass != null)
                .filter(b => computed.measurementLogs.includes(b));
            // Comprobamos si hay algún dato de composición (bodyFat, bmi, etc)
            const logsWithComp = measurementHistory.filter(l =>
                l.bodyFat || l.muscleMass || l.bmi || l.bodyWater || l.boneMass
            );
            const showComp = logsWithComp.length > 0;
            const showMeasurementTable = measurementHistory.length > 0;

            if (showWeight || showPhotos || showComp || showMeasurementTable) {
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

                // B. Fotos — convertir a dataURL (jsPDF no siempre acepta URL remota directa)
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

                    const photoPayloads = await Promise.all(
                        computed.photos.map(async (photo) => ({
                            ...photo,
                            dataUrl: await loadImageAsDataUrl(photo.photo || photo.photoUrl)
                        }))
                    );

                    let drawn = 0;
                    photoPayloads.forEach((photo) => {
                        const col = drawn % maxPerRow;
                        if (col === 0 && drawn > 0) builder.y += rowHeight;
                        if (col === 0 && builder.y + rowHeight > h - margin) {
                            doc.addPage();
                            builder.y = margin;
                        }
                        const x = margin + col * (pW + gap);
                        if (photo.dataUrl) {
                            try {
                                const fmt = photo.dataUrl.includes('image/png') ? 'PNG' : 'JPEG';
                                doc.addImage(photo.dataUrl, fmt, x, builder.y, pW, pH);
                            } catch {
                                doc.setDrawColor(...COLORS.gridLine);
                                doc.rect(x, builder.y, pW, pH);
                                doc.setFontSize(7);
                                doc.setTextColor(...COLORS.textLight);
                                doc.text('Sin imagen', x + pW / 2, builder.y + pH / 2, { align: 'center' });
                            }
                        } else {
                            doc.setDrawColor(...COLORS.gridLine);
                            doc.rect(x, builder.y, pW, pH);
                            doc.setFontSize(7);
                            doc.setTextColor(...COLORS.textLight);
                            doc.text('No disponible', x + pW / 2, builder.y + pH / 2, { align: 'center' });
                        }
                        doc.setFillColor(...COLORS.purpleDark);
                        doc.rect(x, builder.y + pH - 6, pW, 6, 'F');
                        doc.setTextColor(255, 255, 255);
                        doc.setFontSize(7);
                        doc.text(
                            formatLocalDate(photo.date, { day: 'numeric', month: 'numeric', year: 'numeric' }),
                            x + pW / 2, builder.y + pH - 1.5,
                            { align: 'center' }
                        );
                        drawn++;
                    });
                    if (drawn > 0) builder.y += rowHeight + 10;
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

                // D. Historial de Mediciones (filtrado estrictamente sin check-ins vacíos)
                if (showMeasurementTable) {
                    builder.ensureSpace(45);
                    builder.printSectionTitle('HISTORIAL DE MEDICIONES', 30);
                    const historyRows = measurementHistory.slice(0, 20).map(b => [
                        formatLocalDate(b.date, { day: '2-digit', month: '2-digit', year: 'numeric' }),
                        b.weight != null ? `${Number(b.weight).toFixed(1)} kg` : '-',
                        b.bmi != null ? Number(b.bmi).toFixed(1) : '-',
                        b.bodyFat != null ? `${Number(b.bodyFat).toFixed(1)}%` : '-',
                        b.muscleMass != null ? `${Number(b.muscleMass).toFixed(1)} kg` : '-'
                    ]);
                    autoTable(doc, {
                        startY: builder.y,
                        head: [['Fecha', 'Peso', 'IMC', 'Grasa', 'Músculo']],
                        body: historyRows,
                        theme: 'grid',
                        headStyles: { fillColor: COLORS.purpleDark, fontSize: 9 },
                        bodyStyles: { fontSize: 8.5 },
                        columnStyles: {
                            0: { fontStyle: 'bold' },
                            1: { halign: 'center', textColor: COLORS.purple },
                            2: { halign: 'center' },
                            3: { halign: 'center' },
                            4: { halign: 'center' }
                        },
                        margin: { left: margin, right: margin }
                    });
                    builder.y = doc.lastAutoTable.finalY + 10;
                }
            }

            setProgress(100);
            builder.renderFooters();

            const fileSuffix = computed.period.id === 'daily' && computed.dayDate
                ? computed.dayDate
                : mexicoCityDateStr();
            doc.save(`NexLift_${computed.period.label.replace(/\s+/g, '_')}_${fileSuffix}.pdf`);
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
        <div className="max-w-lg mx-auto space-y-6 pb-6 animate-fade-in">
            {/* Header */}
            <div>
                <Link
                    to="/progress"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] min-h-[40px] -ml-1 px-1 mb-1 active:opacity-80"
                >
                    <ArrowLeft size={18} aria-hidden />
                    Progreso
                </Link>
                <h1 className="text-2xl font-bold flex items-center gap-2 leading-tight">
                    <FileText className="text-[var(--primary)] shrink-0" aria-hidden />
                    Exportar PDF
                </h1>
                <p className="text-[var(--text-secondary)] text-sm mt-0.5">Resumen de progreso</p>
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
                            type="button"
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
                {period === 'daily' && (
                    <div className="mt-3 pt-3 border-t border-[var(--border)] min-w-0">
                        <label htmlFor="export-day-date" className="block text-xs text-[var(--text-secondary)] mb-1.5">
                            Día a exportar (todos los ejercicios de ese día)
                        </label>
                        {/* min-w-0 + overflow-hidden: iOS date input no desborda el card */}
                        <div className="min-w-0 max-w-full overflow-hidden rounded-xl">
                            <input
                                id="export-day-date"
                                type="date"
                                value={dayDate}
                                max={mexicoCityDateStr()}
                                onChange={(e) => setDayDate(e.target.value)}
                                className="block w-full min-w-0 max-w-full bg-[var(--bg-dark)] border border-[var(--border)] rounded-xl px-3 py-2.5 text-sm text-white focus:border-[var(--primary)] outline-none"
                            />
                        </div>
                    </div>
                )}
            </section>

            {/* 2. Preview Rápido */}
            <section className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border)]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Vista Previa</h3>
                    <span className="text-xs text-[var(--text-secondary)]">
                        {period === 'daily'
                            ? (computed.dayDate || dayDate)
                            : `${computed.period.days} días seleccionados`}
                    </span>
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
                            <StatBox val={computed.prsCount} label="PRs" color="text-yellow-400" />
                            <StatBox val={computed.weightChange} label="Peso" isDelta />
                        </div>

                        {/* Adherencia Nutricional / Suplementación */}
                        {computed.adherence && (
                            <div className="rounded-lg p-3 border border-emerald-500/20 bg-emerald-500/10">
                                <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] font-bold text-emerald-300/90 uppercase tracking-wider">
                                        % Adherencia Nutricional / Suplementación
                                    </p>
                                    <span className="text-[11px] font-bold text-emerald-300 tabular-nums">
                                        {computed.adherence.overallPct}% global
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                                    <span>
                                        Creatina: <span className="font-bold text-[var(--text-primary)]">{computed.adherence.creatineDays}/{computed.adherence.denomDays} días</span> ({computed.adherence.creatinePct}%)
                                    </span>
                                    <span>
                                        Dieta: <span className="font-bold text-emerald-300">{computed.adherence.dietPct}%</span> ({computed.adherence.dietDays}/{computed.adherence.denomDays}d)
                                    </span>
                                    <span>
                                        0 Cal. Líquidas: <span className="font-bold text-emerald-300">{computed.adherence.zeroLiquidPct}%</span> ({computed.adherence.zeroLiquidDays}/{computed.adherence.denomDays}d)
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Daily Comparison Preview — no asustar con -100% si la sesión va a medias */}
                        {computed.dailyComparison && computed.dailyComparison.lastWeekVolume > 0 && (
                            computed.dailyComparison.comparisonIncomplete ? (
                                <div className="rounded-lg p-3 border border-amber-500/25 bg-amber-500/10">
                                    <p className="text-[10px] font-bold text-amber-300/90 uppercase tracking-wider mb-1">
                                        vs {computed.dailyComparison.weekdayName} pasado
                                    </p>
                                    <p className="text-sm font-bold text-amber-100 leading-snug">
                                        Sesión de pesas incompleta o en curso
                                    </p>
                                    <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-snug">
                                        {computed.dailyComparison.todayVolume > 0
                                            ? `Llevas ${Math.round(computed.dailyComparison.todayVolume).toLocaleString()} kg×reps parciales`
                                            : 'Aún no hay volumen de pesas hoy'}
                                        {' · '}
                                        la semana pasada fueron{' '}
                                        {Math.round(computed.dailyComparison.lastWeekVolume).toLocaleString()} kg×reps.
                                        La % se mostrará cuando completes el entreno.
                                    </p>
                                </div>
                            ) : (
                                <div className={`rounded-lg p-3 border ${parseFloat(computed.dailyComparison.volumeChange) >= 0
                                    ? 'bg-green-500/10 border-green-500/20'
                                    : 'bg-red-500/10 border-red-500/20'
                                    }`}>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                                                vs {computed.dailyComparison.weekdayName} pasado
                                            </p>
                                            <p className={`text-xl font-bold ${parseFloat(computed.dailyComparison.volumeChange) >= 0 ? 'text-green-400' : 'text-red-400'
                                                }`}>
                                                {parseFloat(computed.dailyComparison.volumeChange) >= 0 ? '+' : ''}{computed.dailyComparison.volumeChange}%
                                            </p>
                                        </div>
                                        <div className="text-right text-xs text-[var(--text-secondary)]">
                                            <p>Hoy: <span className="text-[var(--text-primary)] font-medium">{Math.round(computed.dailyComparison.todayVolume).toLocaleString()} kg×reps</span></p>
                                            <p>Anterior: {Math.round(computed.dailyComparison.lastWeekVolume).toLocaleString()} kg×reps</p>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}

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
                                <div className="space-y-2">
                                    {computed.progressData.slice(0, 3).map((ex, i) => (
                                        <div key={ex.name} className="text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[var(--text-primary)] font-medium truncate flex-1 mr-2">
                                                    {i + 1}. {ex.name}
                                                </span>
                                            </div>
                                            <div className="flex gap-3 mt-0.5 text-[10px]">
                                                <span className={ex.deltaWeight > 0 ? 'text-green-400' : ex.deltaWeight < 0 ? 'text-red-400' : 'text-gray-400'}>
                                                    {ex.deltaWeight > 0 ? '+' : ''}{ex.deltaWeight}kg
                                                </span>
                                                <span className={ex.deltaReps > 0 ? 'text-green-400' : ex.deltaReps < 0 ? 'text-red-400' : 'text-gray-400'}>
                                                    {ex.deltaReps > 0 ? '+' : ''}{ex.deltaReps} reps
                                                </span>
                                                <span className={`font-bold ${ex.delta1RM > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {ex.delta1RM > 0 ? '↑' : '↓'}{Math.abs(ex.delta1RM).toFixed(1)} fuerza
                                                </span>
                                            </div>
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