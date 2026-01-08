import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, AlertCircle, FileJson, Copy } from 'lucide-react';
import { api } from '../services/api';

const exampleJson = `{
  "name": "Push Pull Legs",
  "description": "Rutina clásica de 6 días",
  "days": [
    {
      "dayName": "Día 1: Push (Pecho/Hombros/Tríceps)",
      "exercises": [
        { "name": "press de banca plano", "sets": 4, "reps": "6-8", "rest": 180 },
        { "name": "press inclinado mancuernas", "sets": 3, "reps": "8-10", "rest": 120 },
        { "name": "elevaciones laterales", "sets": 4, "reps": "12-15", "note": "Peso ligero, controlar" },
        { "name": "extensión tríceps polea", "sets": 3, "reps": "10-12" }
      ]
    },
    {
      "dayName": "Día 2: Pull (Espalda/Bíceps)",
      "exercises": [
        { "name": "jalón al pecho", "sets": 4, "reps": "8-10", "rest": 120 },
        { "name": "remo con barra", "sets": 4, "reps": "6-8", "rest": 180 },
        { "name": "curl predicador", "sets": 3, "reps": "10-12" }
      ]
    },
    {
      "dayName": "Día 3: Descanso",
      "isRestDay": true,
      "exercises": []
    }
  ]
}`;

export default function Import() {
  const navigate = useNavigate();
  const [jsonText, setJsonText] = useState('');
  const [status, setStatus] = useState(null); // 'loading' | 'success' | 'error' | null
  const [message, setMessage] = useState('');

  async function handleImport() {
    if (!jsonText.trim()) {
      setStatus('error');
      setMessage('El campo está vacío. Pega tu JSON.');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setStatus('error');
      setMessage('Sintaxis JSON inválida. Revisa comillas y comas.');
      return;
    }

    // Validación básica
    if (!parsed.name || !parsed.days || !Array.isArray(parsed.days)) {
      setStatus('error');
      setMessage('Faltan campos obligatorios: "name" o "days" (array).');
      return;
    }

    setStatus('loading');
    setMessage('Procesando rutina...');

    // --- NORMALIZACIÓN DE DATOS (CRÍTICO) ---
    // Convierte formatos simples (sets/reps) al formato interno de la App (targetSets/targetReps)
    const normalizedRoutine = {
      ...parsed,
      days: parsed.days.map(day => ({
        ...day,
        exercises: (day.exercises || []).map(ex => ({
          name: ex.name || 'Ejercicio sin nombre',
          // Mapeo inteligente: busca 'targetSets' O 'sets' O usa valor por defecto
          targetSets: ex.targetSets || ex.sets || 3,
          targetReps: ex.targetReps || ex.reps || '8-12',
          restSeconds: ex.restSeconds || ex.rest || 60,
          note: ex.note || ''
        }))
      }))
    };

    try {
      const result = await api.importRoutine(normalizedRoutine);
      setStatus('success');
      setMessage(`¡"${result.routine.name}" importada correctamente!`);
      setTimeout(() => navigate('/routines'), 1500);
    } catch (error) {
      console.error(error);
      setStatus('error');
      setMessage('Error al guardar en el servidor.');
    }
  }

  function loadExample() {
    setJsonText(exampleJson);
    setStatus(null);
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto pb-20">
      <div>
        <h1 className="text-2xl font-bold">Importar Rutina</h1>
        <p className="text-[var(--text-secondary)] text-sm">
          Carga una rutina desde un archivo JSON o texto.
        </p>
      </div>

      {/* JSON Input Area */}
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-[var(--bg-dark)] border-b border-[var(--border)]">
          <label className="font-medium text-sm flex items-center gap-2">
            <FileJson size={16} className="text-[var(--primary)]" />
            Código JSON
          </label>
          <button
            onClick={loadExample}
            className="text-xs flex items-center gap-1 text-[var(--accent)] hover:text-white transition-colors"
          >
            <Copy size={12} />
            Cargar ejemplo
          </button>
        </div>
        <textarea
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            setStatus(null);
          }}
          placeholder={`{\n  "name": "Mi Rutina",\n  "days": [...]\n}`}
          className="w-full h-[300px] bg-[var(--bg-card)] p-4 font-mono text-xs text-[var(--text-primary)] resize-none outline-none focus:bg-[var(--bg-main)]/50 transition-colors"
          spellCheck={false}
        />
      </div>

      {/* Status Message */}
      {status && (
        <div className={`flex items-center gap-3 p-4 rounded-xl text-sm font-medium border animate-fade-in
                    ${status === 'success' ? 'bg-green-500/10 text-green-400 border-green-500/20' : ''}
                    ${status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : ''}
                    ${status === 'loading' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20' : ''}
                `}>
          {status === 'loading' && <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
          {status === 'success' && <CheckCircle size={18} />}
          {status === 'error' && <AlertCircle size={18} />}
          <span>{message}</span>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleImport}
        disabled={status === 'loading'}
        className="btn-primary w-full py-4 flex items-center justify-center gap-2 font-semibold shadow-lg shadow-[var(--primary)]/20"
      >
        <Upload size={20} />
        {status === 'loading' ? 'Importando...' : 'Importar Rutina'}
      </button>

      {/* Structure Hint + ChatGPT Tip */}
      <div className="bg-[var(--bg-dark)] rounded-xl p-4 text-[11px] text-[var(--text-secondary)] space-y-4">
        <div>
          <p className="font-bold mb-2 uppercase tracking-wider text-[var(--primary)] flex items-center gap-2">
            💡 Tip: Usa ChatGPT
          </p>
          <p className="leading-relaxed">
            Pídele a ChatGPT que genere tu rutina en JSON con este formato. Solo copia y pega el resultado aquí.
          </p>
        </div>

        <div className="border-t border-[var(--border)] pt-3">
          <p className="font-bold mb-2 uppercase tracking-wider text-[var(--text-primary)]">Estructura Mínima:</p>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[10px] bg-black/20 p-2 rounded">
            {`{
  "name": "Mi Rutina",
  "days": [{
    "dayName": "Día 1: Push",
    "exercises": [
      { "name": "press de banca", "sets": 4, "reps": "6-8" }
    ]
  }]
}`}
          </pre>
        </div>

        <p className="text-[10px] opacity-70">
          * Los nombres se normalizan automáticamente (sin prefijos "a1.", todo minúsculas)
        </p>
      </div>
    </div>
  );
}