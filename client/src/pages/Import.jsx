/**
 * CreateRoutine - UI Optimizada Mobile-First
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Upload, CheckCircle, AlertCircle, FileJson,
  Sparkles, PenTool, Plus, Trash2, ArrowUp, ArrowDown, Dumbbell,
  Calendar, ChevronRight, X, Save, Search, Bot
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../components/ui/Toast';
import { Portal } from '../components/ui/Portal';
import { ROUTINE_TEMPLATES, getTemplate } from '../data/routineTemplates';
import { EXERCISES, searchExercises, getExercisesByMuscle } from '../data/exercises';
import MuscleIcon, { MUSCLE_LIST } from '../components/ui/MuscleIcon';
import { toSpanishMuscleGroup } from '../utils/muscleGroup';

// Tabs con diseño más compacto
const TABS = [
  { id: 'templates', label: 'Plantillas', icon: Sparkles },
  { id: 'manual', label: 'Manual', icon: PenTool },
  { id: 'json', label: 'JSON', icon: FileJson },
  { id: 'ai', label: 'IA', icon: Bot }
];

export default function CreateRoutine() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [saving, setSaving] = useState(false);

  // ========== TEMPLATE STATE ==========
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // ========== MANUAL STATE ==========
  const [manualRoutine, setManualRoutine] = useState({
    name: '',
    description: '',
    days: []
  });
  const [showExerciseLibrary, setShowExerciseLibrary] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState(null);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [expandedMuscle, setExpandedMuscle] = useState(null);
  const searchInputRef = useRef(null);

  // ========== JSON STATE ==========
  const [jsonText, setJsonText] = useState('');
  const [jsonStatus, setJsonStatus] = useState(null);
  const [jsonMessage, setJsonMessage] = useState('');

  // Auto-focus
  useEffect(() => {
    if (showExerciseLibrary && searchInputRef.current) {
      setTimeout(() => searchInputRef.current.focus(), 100);
    }
  }, [showExerciseLibrary]);

  const handleSelectTemplate = async () => {
    if (!selectedTemplate) { toast.error('Selecciona una plantilla primero'); return; }
    setSaving(true);
    const template = getTemplate(selectedTemplate);
    const routineData = {
      name: template.name,
      description: template.description,
      days: template.days.map(day => ({
        dayName: day.dayName,
        isRestDay: day.isRestDay,
        exercises: (day.exercises || []).map(ex => {
          const exerciseData = EXERCISES.find(e => e.id === ex.exerciseId);
          return {
            name: exerciseData?.name || ex.exerciseId,
            muscleGroup: toSpanishMuscleGroup(exerciseData?.muscleGroup),
            isUnilateral: exerciseData?.isUnilateral || false,
            targetSets: parseInt(exerciseData?.defaultSets, 10) || 3,
            targetReps: exerciseData?.defaultReps || '8-12',
            restSeconds: parseInt(exerciseData?.restSeconds, 10) || 90,
            note: ''
          };
        })
      }))
    };
    try {
      await api.importRoutine(routineData);
      toast.success(`¡"${template.name}" creada!`);
      navigate('/routines');
    } catch (error) {
      console.error(error);
      toast.error('Error al crear rutina');
    } finally {
      setSaving(false);
    }
  };

  const addDay = () => {
    setManualRoutine(prev => ({
      ...prev,
      days: [...prev.days, { dayName: `Día ${prev.days.length + 1}`, isRestDay: false, exercises: [] }]
    }));
  };

  const updateDay = (index, field, value) => {
    setManualRoutine(prev => ({
      ...prev,
      days: prev.days.map((d, i) => i === index ? { ...d, [field]: value } : d)
    }));
  };

  const removeDay = (index) => {
    if (!window.confirm('¿Borrar este día y sus ejercicios?')) return;
    setManualRoutine(prev => ({ ...prev, days: prev.days.filter((_, i) => i !== index) }));
  };

  const moveDay = (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= manualRoutine.days.length) return;
    setManualRoutine(prev => {
      const newDays = [...prev.days];
      [newDays[index], newDays[newIndex]] = [newDays[newIndex], newDays[index]];
      return { ...prev, days: newDays };
    });
  };

  const addExerciseToDay = (dayIndex, exerciseName, isCustom = false) => {
    const existingEx = EXERCISES.find(e => e.name === exerciseName || e.id === exerciseName);
    const newExercise = {
      name: isCustom ? exerciseName : (existingEx?.name || exerciseName),
      targetSets: existingEx?.defaultSets || 3,
      targetReps: existingEx?.defaultReps || '8-12',
      restSeconds: existingEx?.restSeconds || 90,
      note: '',
      muscleGroup: toSpanishMuscleGroup(existingEx?.muscleGroup),
      isUnilateral: !!existingEx?.isUnilateral
    };
    setManualRoutine(prev => ({
      ...prev,
      days: prev.days.map((d, i) => i === dayIndex ? { ...d, exercises: [...d.exercises, newExercise] } : d)
    }));
    setShowExerciseLibrary(false);
    setExerciseSearch('');
    setExpandedMuscle(null);
    toast.success('Ejercicio agregado');
  };

  const updateExercise = (dayIndex, exIndex, field, value) => {
    setManualRoutine(prev => ({
      ...prev,
      days: prev.days.map((d, i) => i === dayIndex ? {
        ...d,
        exercises: d.exercises.map((ex, j) => j === exIndex ? { ...ex, [field]: value } : ex)
      } : d)
    }));
  };

  const removeExercise = (dayIndex, exIndex) => {
    setManualRoutine(prev => ({
      ...prev,
      days: prev.days.map((d, i) => i === dayIndex ? {
        ...d,
        exercises: d.exercises.filter((_, j) => j !== exIndex)
      } : d)
    }));
  };

  const moveExercise = (dayIndex, exIndex, direction) => {
    const newExIndex = direction === 'up' ? exIndex - 1 : exIndex + 1;
    const day = manualRoutine.days[dayIndex];
    if (newExIndex < 0 || newExIndex >= day.exercises.length) return;
    const newExercises = [...day.exercises];
    [newExercises[exIndex], newExercises[newExIndex]] = [newExercises[newExIndex], newExercises[exIndex]];
    setManualRoutine(prev => ({
      ...prev,
      days: prev.days.map((d, i) => i === dayIndex ? { ...d, exercises: newExercises } : d)
    }));
  };

  const handleSaveManual = async () => {
    if (!manualRoutine.name.trim()) { toast.error('Falta el nombre de la rutina'); return; }
    if (manualRoutine.days.length === 0) { toast.error('Agrega al menos un día'); return; }

    const emptyDay = manualRoutine.days.find(d => !d.isRestDay && d.exercises.length === 0);
    if (emptyDay) {
      toast.error(`"${emptyDay.dayName}" no tiene ejercicios. Agrégalos o márcalo como descanso.`);
      return;
    }
    const emptyName = manualRoutine.days.some(d =>
      !d.isRestDay && d.exercises.some(ex => !String(ex.name || '').trim())
    );
    if (emptyName) { toast.error('Hay ejercicios sin nombre'); return; }

    setSaving(true);
    const payload = {
      name: manualRoutine.name.trim(),
      description: manualRoutine.description || '',
      days: manualRoutine.days.map(day => ({
        ...day,
        dayName: day.dayName.trim() || 'Día',
        exercises: day.isRestDay ? [] : day.exercises.map(ex => ({
          ...ex,
          name: ex.name.trim(),
          muscleGroup: toSpanishMuscleGroup(ex.muscleGroup) || null,
          targetSets: parseInt(ex.targetSets, 10) || 3,
          restSeconds: parseInt(ex.restSeconds, 10) || 90,
          isUnilateral: !!ex.isUnilateral
        }))
      }))
    };
    try {
      await api.importRoutine(payload);
      toast.success('¡Rutina creada!');
      navigate('/routines');
    } catch (error) {
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleImportJson = async () => {
    if (!jsonText.trim()) { setJsonStatus('error'); setJsonMessage('Pega tu JSON aquí'); return; }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setJsonStatus('error');
      setJsonMessage('JSON inválido — revisa comillas y comas');
      return;
    }

    if (!parsed.name || !parsed.days) {
      setJsonStatus('error');
      setJsonMessage('Faltan campos: "name" o "days"');
      return;
    }
    if (!Array.isArray(parsed.days) || parsed.days.length === 0) {
      setJsonStatus('error');
      setJsonMessage('"days" debe ser un array con al menos un día');
      return;
    }

    setJsonStatus('loading');
    setJsonMessage('Importando...');

    const normalizedRoutine = {
      name: String(parsed.name).trim(),
      description: parsed.description || '',
      days: parsed.days.map(day => ({
        dayName: day.dayName || day.name || 'Día',
        isRestDay: !!day.isRestDay,
        exercises: day.isRestDay ? [] : (day.exercises || []).map(ex => ({
          name: ex.name || 'Ejercicio',
          muscleGroup: toSpanishMuscleGroup(ex.muscleGroup || ex.muscle) || null,
          isUnilateral: !!ex.isUnilateral,
          targetSets: parseInt(ex.targetSets ?? ex.sets, 10) || 3,
          targetReps: ex.targetReps || ex.reps || '8-12',
          restSeconds: parseInt(ex.restSeconds ?? ex.rest, 10) || 90,
          note: ex.note || ''
        }))
      }))
    };

    try {
      await api.importRoutine(normalizedRoutine);
      setJsonStatus('success');
      setJsonMessage(`¡"${parsed.name}" importada!`);
      setTimeout(() => navigate('/routines'), 800);
    } catch (error) {
      setJsonStatus('error');
      setJsonMessage(error.message || 'Error del servidor');
    }
  };

  const searchResults = exerciseSearch.length >= 2 ? searchExercises(exerciseSearch) : [];

  // ========================================
  // RENDER OPTIMIZADO
  // ========================================
  return (
    <div className="pb-32 animate-fade-in max-w-lg mx-auto min-h-screen relative">

      {/* Header Sticky con Blur */}
      <div className="sticky top-0 z-30 bg-[var(--bg-card)]/80 backdrop-blur-md border-b border-white/5 pt-4 pb-2 px-4 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/routines" aria-label="Volver a rutinas" className="p-2 -ml-2 text-[var(--text-secondary)] hover:text-white active:scale-95 transition-transform">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-xl font-bold tracking-tight">Crear Rutina</h1>
        </div>

        {/* Segmented Tabs */}
        <div className="flex p-1 bg-[var(--bg-dark)] rounded-lg border border-white/5">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-2 rounded-md text-[11px] sm:text-sm font-medium transition-all ${isActive
                  ? 'bg-[var(--primary)] text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:bg-white/5'
                  }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4">
        {/* ========== TAB: TEMPLATES ========== */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            {ROUTINE_TEMPLATES.map(template => {
              const isSelected = selectedTemplate === template.id;
              const isPreview = previewTemplate === template.id;

              return (
                <div key={template.id}
                  className={`rounded-2xl border transition-all duration-200 overflow-hidden ${isSelected ? 'border-[var(--primary)] bg-[var(--primary)]/5 ring-1 ring-[var(--primary)]' : 'border-white/10 bg-[var(--bg-card)]'}`}>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTemplate(template.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedTemplate(template.id); }}
                    className="p-4 flex gap-4 cursor-pointer active:bg-white/5"
                  >
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[var(--primary)] to-purple-800 flex items-center justify-center shrink-0 shadow-lg">
                      <Dumbbell className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-base truncate">{template.name}</h3>
                        {isSelected && <CheckCircle size={18} className="text-[var(--primary)]" />}
                      </div>

                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{template.description}</p>
                    </div>
                  </div>

                  {/* Footer del Card */}
                  <div className="px-4 py-3 bg-[var(--bg-dark)]/50 border-t border-white/5 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <div className="flex gap-4">
                      <span className="flex items-center gap-1.5"><Calendar size={13} /> {template.daysPerWeek} días/sem</span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewTemplate(isPreview ? null : template.id); }}
                      className="text-[var(--primary)] font-medium flex items-center gap-1 hover:underline p-1 -mr-2"
                    >
                      {isPreview ? 'Ocultar' : 'Ver rutina'} <ChevronRight className={`w-3 h-3 transition-transform ${isPreview ? 'rotate-90' : ''}`} />
                    </button>
                  </div>

                  {/* Preview Expandible */}
                  {isPreview && (
                    <div className="bg-[var(--bg-dark)] border-t border-white/5 p-3 space-y-2 text-xs animate-in slide-in-from-top-2">
                      {template.days.map((day, idx) => (
                        <div key={idx} className="flex gap-3 py-1">
                          <span className="font-bold text-[var(--primary)] whitespace-nowrap w-10">Día {idx + 1}</span>
                          <span className="text-[var(--text-secondary)] truncate">
                            {day.isRestDay ? 'Descanso' : day.exercises.length + ' ejercicios'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={handleSelectTemplate}
              disabled={!selectedTemplate || saving}
              className="fixed bottom-6 left-4 right-4 z-40 py-4 bg-[var(--primary)] text-white font-bold rounded-xl shadow-xl disabled:opacity-50 disabled:translate-y-20 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              {saving ? 'Procesando...' : 'Usar Plantilla Seleccionada'}
            </button>
          </div>
        )}

        {/* ========== TAB: MANUAL ========== */}
        {activeTab === 'manual' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <input
                type="text"
                value={manualRoutine.name}
                onChange={(e) => setManualRoutine(p => ({ ...p, name: e.target.value }))}
                placeholder="Nombre de la Rutina"
                className="w-full bg-transparent border-b-2 border-white/10 px-1 py-3 text-2xl font-bold focus:border-[var(--primary)] outline-none placeholder:text-white/20"
              />
              <input
                type="text"
                value={manualRoutine.description}
                onChange={(e) => setManualRoutine(p => ({ ...p, description: e.target.value }))}
                placeholder="Descripción corta (opcional)"
                className="w-full bg-transparent border-b border-white/10 px-1 py-2 text-sm text-[var(--text-secondary)] focus:border-[var(--primary)] outline-none"
              />
            </div>

            <div className="space-y-4">
              {manualRoutine.days.map((day, dayIndex) => (
                <div key={dayIndex} className="bg-[var(--bg-card)] rounded-2xl border border-white/5 overflow-hidden shadow-sm">

                  {/* Day Header */}
                  <div className={`p-3 flex items-center gap-3 border-b border-white/5 ${day.isRestDay ? 'bg-green-500/5' : 'bg-[var(--bg-dark)]'}`}>
                    <div className="flex flex-col gap-1">
                      {/* Mobile friendly controls */}
                      {dayIndex > 0 && <button onClick={() => moveDay(dayIndex, 'up')} className="p-1 hover:bg-white/10 rounded"><ArrowUp size={14} /></button>}
                      {dayIndex < manualRoutine.days.length - 1 && <button onClick={() => moveDay(dayIndex, 'down')} className="p-1 hover:bg-white/10 rounded"><ArrowDown size={14} /></button>}
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-[var(--primary)] uppercase tracking-wider">Día {dayIndex + 1}</span>
                        <div className="flex gap-2">
                          <label className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1 cursor-pointer transition-colors ${day.isRestDay ? 'bg-green-500/20 border-green-500 text-green-400' : 'border-white/10 text-[var(--text-secondary)]'}`}>
                            <input type="checkbox" className="hidden" checked={day.isRestDay} onChange={(e) => updateDay(dayIndex, 'isRestDay', e.target.checked)} />
                            {day.isRestDay ? 'Descanso' : 'Activo'}
                          </label>
                          <button onClick={() => removeDay(dayIndex)} className="text-red-400 p-1 hover:bg-red-500/10 rounded"><Trash2 size={16} /></button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={day.dayName}
                        onChange={(e) => updateDay(dayIndex, 'dayName', e.target.value)}
                        className="bg-transparent font-bold text-base w-full outline-none placeholder:text-white/30"
                        placeholder="Ej: Pierna Pesada"
                      />
                    </div>
                  </div>

                  {/* Exercises List */}
                  {!day.isRestDay && (
                    <div className="p-2 space-y-2 bg-[var(--bg-card)]/50">
                      {day.exercises.map((ex, exIndex) => (
                        <div key={exIndex} className="bg-[var(--bg-dark)] rounded-xl p-3 border border-white/5 relative group">

                          {/* Top Row: Name & Controls */}
                          <div className="flex justify-between items-start mb-3 gap-2">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-9 h-9 rounded-lg bg-[var(--bg-card)] border border-white/5 flex items-center justify-center shrink-0">
                                <MuscleIcon muscle={ex.muscleGroup} size={18} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-semibold text-sm truncate text-white">{ex.name}</h4>
                                <span className="text-[10px] text-[var(--text-secondary)] uppercase">{ex.muscleGroup || 'Sin grupo'}</span>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <button onClick={() => moveExercise(dayIndex, exIndex, 'up')} disabled={exIndex === 0} className="p-1.5 text-white/40 hover:text-white"><ArrowUp size={14} /></button>
                              <button onClick={() => moveExercise(dayIndex, exIndex, 'down')} disabled={exIndex === day.exercises.length - 1} className="p-1.5 text-white/40 hover:text-white"><ArrowDown size={14} /></button>
                              <button onClick={() => removeExercise(dayIndex, exIndex)} className="p-1.5 text-red-400 ml-1"><X size={16} /></button>
                            </div>
                          </div>

                          {/* Bottom Row: Inputs (Pill Design) */}
                          <div className="flex gap-2 text-center">
                            <div className="flex-1 bg-[var(--bg-card)] rounded-lg p-1.5 border border-white/5">
                              <label className="block text-[9px] text-[var(--text-secondary)] uppercase font-bold mb-0.5">Series</label>
                              <input
                                type="number"
                                value={ex.targetSets}
                                onChange={(e) => updateExercise(dayIndex, exIndex, 'targetSets', e.target.value)}
                                className="w-full bg-transparent text-center font-bold text-sm outline-none p-1"
                              />
                            </div>
                            <div className="flex-1 bg-[var(--bg-card)] rounded-lg p-1.5 border border-white/5">
                              <label className="block text-[9px] text-[var(--text-secondary)] uppercase font-bold mb-0.5">Reps</label>
                              <input
                                type="text"
                                value={ex.targetReps}
                                onChange={(e) => updateExercise(dayIndex, exIndex, 'targetReps', e.target.value)}
                                className="w-full bg-transparent text-center font-bold text-sm outline-none p-1"
                              />
                            </div>
                            <div className="flex-1 bg-[var(--bg-card)] rounded-lg p-1.5 border border-white/5">
                              <label className="block text-[9px] text-[var(--text-secondary)] uppercase font-bold mb-0.5">Descanso</label>
                              <div className="flex items-center justify-center gap-0.5">
                                <input
                                  type="number"
                                  value={ex.restSeconds}
                                  onChange={(e) => updateExercise(dayIndex, exIndex, 'restSeconds', e.target.value)}
                                  className="w-full bg-transparent text-center font-bold text-sm outline-none p-1"
                                />
                                <span className="text-[9px] text-[var(--text-secondary)]">s</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => { setActiveDayIndex(dayIndex); setShowExerciseLibrary(true); }}
                        className="w-full py-3.5 mt-2 border border-dashed border-white/20 rounded-xl text-sm text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                      >
                        <Plus size={18} /> Agregar Ejercicio
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={addDay} className="w-full py-3 bg-[var(--bg-card)] border border-white/10 rounded-xl text-sm font-medium hover:bg-white/5 active:scale-95 transition-all">
                + Agregar Nuevo Día
              </button>
            </div>

            <button
              onClick={handleSaveManual}
              disabled={saving}
              className="fixed bottom-6 left-4 right-4 z-40 py-4 bg-[var(--primary)] text-white font-bold rounded-xl shadow-xl shadow-[var(--primary)]/20 disabled:opacity-50 active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              {saving ? 'Guardando...' : <><Save size={20} /> Guardar Rutina</>}
            </button>
          </div>
        )}

        {/* ========== TAB: JSON ========== */}
        {activeTab === 'json' && (
          <div className="space-y-4">
            {/* Estructura Esperada */}
            <div className="bg-[var(--bg-dark)] rounded-xl border border-white/10 p-4">
              <h3 className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileJson size={14} /> Estructura Esperada
              </h3>
              <pre className="text-[10px] text-[var(--text-secondary)] overflow-x-auto leading-relaxed font-mono">
                {`{
  "name": "Nombre de la Rutina",
  "description": "Descripción opcional",
  "days": [
    {
      "dayName": "Push",
      "exercises": [
        { "name": "Press Banca", "sets": 4, "reps": "8-10" },
        { "name": "Press Inclinado", "sets": 3, "reps": "10-12" }
      ]
    },
    {
      "dayName": "Pull",
      "exercises": [...]
    }
  ]
}`}
              </pre>
            </div>

            {/* Textarea */}
            <div className="bg-[var(--bg-card)] rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-2 border-b border-white/5 flex justify-between items-center">
                <span className="text-xs text-[var(--text-secondary)]">Tu JSON</span>
                <button
                  onClick={() => setJsonText('')}
                  className={`text-xs text-red-400 hover:text-red-300 ${!jsonText ? 'invisible' : ''}`}
                >
                  Limpiar
                </button>
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); setJsonStatus(null); }}
                placeholder='Pega tu JSON aquí...'
                className="w-full h-48 bg-transparent p-4 font-mono text-xs outline-none resize-none"
                spellCheck={false}
              />
            </div>

            {/* Status */}
            {jsonStatus && (
              <div className={`p-3 rounded-lg text-sm border flex items-center gap-2 ${jsonStatus === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                jsonStatus === 'loading' ? 'bg-[var(--primary)]/10 border-[var(--primary)]/30 text-[var(--primary)]' :
                  'bg-green-500/10 border-green-500/30 text-green-400'
                }`}>
                {jsonStatus === 'loading' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                {jsonStatus === 'error' && <AlertCircle size={16} />}
                {jsonStatus === 'success' && <CheckCircle size={16} />}
                {jsonMessage}
              </div>
            )}

            <button
              onClick={handleImportJson}
              disabled={jsonStatus === 'loading' || !jsonText.trim()}
              className="w-full py-4 bg-[var(--primary)] rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              <Upload size={20} /> Importar Rutina
            </button>

            <p className="text-center text-[10px] text-[var(--text-secondary)]">
              💡 Pídele a ChatGPT que genere una rutina en este formato
            </p>
          </div>
        )}

        {/* ========== TAB: IA ========== */}
        {activeTab === 'ai' && (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 mx-auto bg-[var(--primary)]/10 rounded-2xl flex items-center justify-center">
              <Bot size={32} className="text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-1">Rutina diaria con IA</h3>
              <p className="text-sm text-[var(--text-secondary)] max-w-xs mx-auto">
                Ideal si no tienes una rutina fija: responde un cuestionario corto y la app decide qué entrenar cada día. El peso y las reps los sigue calculando el mismo Smart Loading de siempre.
              </p>
            </div>
            <Link
              to="/ai-routine/setup"
              className="inline-flex items-center justify-center gap-2 w-full py-4 bg-[var(--primary)] rounded-xl font-bold active:scale-[0.98] transition-transform"
            >
              <Sparkles size={18} /> Configurar mi rutina IA
            </Link>
          </div>
        )}
      </div>

      {/* ========== EXERCISE LIBRARY MODAL (FULL SCREEN MOBILE) ========== */}
      {showExerciseLibrary && (
        <Portal>
        <div className="fixed inset-0 bg-black z-50 flex flex-col animate-in slide-in-from-bottom-5">
          {/* Modal Header */}
          <div className="p-4 border-b border-white/10 flex items-center gap-3 shrink-0 bg-[var(--bg-base)]">
            <button onClick={() => setShowExerciseLibrary(false)} className="p-2 -ml-2 hover:bg-white/10 rounded-full"><ArrowLeft size={24} /></button>
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar..."
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-3 bg-[var(--bg-dark)] border border-white/10 rounded-xl text-base outline-none focus:border-[var(--primary)]"
              />
              {exerciseSearch && <button onClick={() => setExerciseSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1"><X size={14} /></button>}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {exerciseSearch.length >= 1 ? (
              <div className="space-y-2">
                {/* Create Custom */}
                <button onClick={() => addExerciseToDay(activeDayIndex, exerciseSearch, true)} className="w-full p-4 bg-[var(--primary)]/10 border border-[var(--primary)]/30 rounded-xl flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-full bg-[var(--primary)] flex items-center justify-center"><Plus size={20} className="text-white" /></div>
                  <div>
                    <span className="font-bold text-[var(--primary)]">Crear "{exerciseSearch}"</span>
                    <p className="text-xs opacity-70">Añadir como personalizado</p>
                  </div>
                </button>

                {/* Results */}
                {searchResults.map(ex => (
                  <button key={ex.id} onClick={() => addExerciseToDay(activeDayIndex, ex.id)} className="w-full p-3 bg-[var(--bg-card)] border border-white/5 rounded-xl flex items-center justify-between active:scale-[0.98] transition-transform">
                    <div className="flex items-center gap-3 text-left">
                      <MuscleIcon muscle={ex.muscleGroup} size={24} />
                      <div>
                        <p className="font-semibold text-sm">{ex.name}</p>
                        <p className="text-[10px] text-[var(--text-secondary)] uppercase">{ex.muscleGroup}</p>
                      </div>
                    </div>
                    <Plus size={20} className="text-[var(--primary)]" />
                  </button>
                ))}
              </div>
            ) : (
              /* Categories Grid */
              expandedMuscle ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">{MUSCLE_LIST.find(m => m.id === expandedMuscle)?.name}</h2>
                    <button onClick={() => setExpandedMuscle(null)} className="text-sm text-[var(--primary)]">Ver todos</button>
                  </div>
                  <div className="space-y-2">
                    {getExercisesByMuscle(expandedMuscle).map(ex => (
                      <button key={ex.id} onClick={() => addExerciseToDay(activeDayIndex, ex.id)} className="w-full p-4 bg-[var(--bg-card)] border border-white/5 rounded-xl flex items-center justify-between text-left active:bg-white/5">
                        <span className="font-medium">{ex.name}</span>
                        <Plus size={18} className="text-white/50" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {MUSCLE_LIST.map(m => (
                    <button key={m.id} onClick={() => setExpandedMuscle(m.id)} className="p-4 bg-[var(--bg-card)] border border-white/5 rounded-xl flex flex-col items-center gap-2 active:scale-95 transition-transform">
                      <div className="w-10 h-10 rounded-full bg-[var(--bg-dark)] flex items-center justify-center border border-white/5" style={{ color: m.color }}>
                        <Dumbbell size={20} />
                      </div>
                      <span className="text-xs font-bold">{m.name}</span>
                    </button>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
        </Portal>
      )}
    </div>
  );
}