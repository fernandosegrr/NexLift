import { useState, useRef, useCallback, useEffect } from 'react';
export function useRestTimer(onStop?: () => void): { secondsLeft: number | null; isDone: boolean; start: (seconds: number) => void; stop: () => void } {
    const [secondsLeft, setSecondsLeft] = useState<number | null>(null); // null = sin temporizador activo
    const [isDone, setIsDone] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Timestamp absoluto de fin, no un contador de ticks: los navegadores
    // móviles pausan/limitan setInterval en segundo plano, así que un contador
    // que solo resta 1 por tick se queda "congelado" en vez de reflejar el
    // tiempo real transcurrido al volver. Con un endTime fijo, recalculamos
    // contra Date.now() en cada tick y también al recuperar foco/visibilidad.
    const endTimeRef = useRef<number | null>(null);

    const clear = useCallback((): void => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const recompute = useCallback((): void => {
        if (endTimeRef.current === null) return;
        const remaining = Math.max(0, Math.round((endTimeRef.current - Date.now()) / 1000));
        if (remaining <= 0) {
            const wasRunning = endTimeRef.current !== null;
            clear();
            endTimeRef.current = null;
            setSecondsLeft(0);
            setIsDone(true);
            // Vibrar solo al cruzar a "listo" (no en cada recompute ya terminado)
            if (wasRunning && navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 120]);
        } else {
            setSecondsLeft(remaining);
        }
    }, [clear]);

    const start = useCallback((seconds: number): void => {
        clear();
        if (!seconds || seconds <= 0) return;
        setIsDone(false);
        endTimeRef.current = Date.now() + seconds * 1000;
        setSecondsLeft(seconds);
        intervalRef.current = setInterval(recompute, 1000);
    }, [clear, recompute]);

    const stop = useCallback((): void => {
        clear();
        endTimeRef.current = null;
        setSecondsLeft(null);
        setIsDone(false);
        onStop?.();
    }, [clear, onStop]);

    // Al volver de segundo plano (app minimizada, pantalla bloqueada, cambio de
    // pestaña), recalcula de inmediato en vez de esperar al siguiente tick del
    // interval — que pudo no haber corrido en absoluto mientras no era visible.
    useEffect(() => {
        function handleResume(): void {
            if (document.visibilityState === 'visible') recompute();
        }
        document.addEventListener('visibilitychange', handleResume);
        window.addEventListener('focus', recompute);
        window.addEventListener('pageshow', recompute); // iOS Safari bfcache
        return (): void => {
            document.removeEventListener('visibilitychange', handleResume);
            window.removeEventListener('focus', recompute);
            window.removeEventListener('pageshow', recompute);
        };
    }, [recompute]);

    // Limpieza al desmontar
    useEffect(() => clear, [clear]);

    return { secondsLeft, isDone, start, stop };
}

