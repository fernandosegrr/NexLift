import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, AlertCircle, FileJson } from 'lucide-react';
import { api } from '../services/api';

const exampleJson = `{
  "name": "Mi Rutina Push Pull Legs",
  "description": "Rutina de 6 días + 1 descanso",
  "days": [
    {
      "dayName": "Lunes - Push",
      "exercises": [
        { "name": "Press Banca", "sets": 4, "reps": "6-8", "note": "Control" },
        { "name": "Press Inclinado", "sets": 3, "reps": "8-10" },
        { "name": "Aperturas", "sets": 3, "reps": "12-15" }
      ]
    },
    {
      "dayName": "Martes - Pull",
      "exercises": [
        { "name": "Dominadas", "sets": 4, "reps": "6-10" },
        { "name": "Remo con Barra", "sets": 4, "reps": "8-10" }
      ]
    },
    {
      "dayName": "Domingo - Descanso",
      "isRestDay": true,
      "exercises": []
    }
  ]
}`;

export default function Import() {
    const navigate = useNavigate();
    const [jsonText, setJsonText] = useState('');
    const [status, setStatus] = useState(null);
    const [message, setMessage] = useState('');

    async function handleImport() {
        if (!jsonText.trim()) {
            setStatus('error');
            setMessage('Pega el JSON de tu rutina');
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(jsonText);
        } catch (e) {
            setStatus('error');
            setMessage('JSON inválido. Verifica la sintaxis.');
            return;
        }

        if (!parsed.name || !parsed.days || !Array.isArray(parsed.days)) {
            setStatus('error');
            setMessage('Estructura incorrecta. Se requiere: name, days[]');
            return;
        }

        setStatus('loading');
        setMessage('Importando rutina...');

        try {
            const result = await api.importRoutine(parsed);
            setStatus('success');
            setMessage(`¡"${result.routine.name}" importada con ${result.routine.days.length} días!`);
            setTimeout(() => navigate('/routines'), 1500);
        } catch (error) {
            setStatus('error');
            setMessage('Error al importar. Intenta de nuevo.');
        }
    }

    function loadExample() {
        setJsonText(exampleJson);
        setStatus(null);
    }

    return (
        <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold">Importar Rutina</h1>
                <p className="text-[var(--text-secondary)]">
                    Pega el JSON con tu rutina personalizada
                </p>
            </div>

            {/* JSON Input */}
            <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                    <label className="font-medium flex items-center gap-2">
                        <FileJson size={18} className="text-[var(--primary)]" />
                        Código JSON
                    </label>
                    <button
                        onClick={loadExample}
                        className="text-sm text-[var(--accent)] hover:underline"
                    >
                        Cargar ejemplo
                    </button>
                </div>
                <textarea
                    value={jsonText}
                    onChange={(e) => {
                        setJsonText(e.target.value);
                        setStatus(null);
                    }}
                    placeholder={`Pega aquí tu JSON...\n\nEjemplo:\n${exampleJson.slice(0, 100)}...`}
                    className="input min-h-[300px] font-mono text-sm resize-none"
                    spellCheck={false}
                />
            </div>

            {/* Status Message */}
            {status && (
                <div className={`
          flex items-center gap-3 p-4 rounded-xl
          ${status === 'success' ? 'bg-[var(--success)]/10 text-[var(--success)]' : ''}
          ${status === 'error' ? 'bg-red-500/10 text-red-400' : ''}
          ${status === 'loading' ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : ''}
        `}>
                    {status === 'loading' && (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {status === 'success' && <CheckCircle size={20} />}
                    {status === 'error' && <AlertCircle size={20} />}
                    <span>{message}</span>
                </div>
            )}

            {/* Import Button */}
            <button
                onClick={handleImport}
                disabled={status === 'loading'}
                className="btn-primary w-full flex items-center justify-center gap-2 py-4"
            >
                <Upload size={20} />
                Importar Rutina
            </button>

            {/* JSON Structure Guide */}
            <div className="card p-4">
                <h3 className="font-medium mb-3">Estructura esperada:</h3>
                <pre className="text-xs text-[var(--text-secondary)] overflow-x-auto bg-[var(--bg-dark)] p-3 rounded-lg">
                    {`{
  "name": "Nombre de la rutina",
  "description": "Descripción opcional",
  "days": [
    {
      "dayName": "Nombre del día",
      "isRestDay": false,  // true = día descanso
      "exercises": [
        {
          "name": "Ejercicio",
          "sets": 4,
          "reps": "8-10",
          "rest": 120,    // opcional
          "note": "Notas" // opcional
        }
      ]
    },
    {
      "dayName": "Domingo - Descanso",
      "isRestDay": true,
      "exercises": []
    }
  ]
}`}
                </pre>
            </div>
        </div>
    );
}

