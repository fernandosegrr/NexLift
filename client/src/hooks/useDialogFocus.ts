import { useEffect, useRef } from 'react';
import type { RefObject, KeyboardEvent } from 'react';

interface DialogFocus { ref: RefObject<HTMLDivElement | null>; onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void }
export function useDialogFocus(onClose: () => void): DialogFocus {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const previous = document.activeElement;
        const node = ref.current;
        node?.querySelector<HTMLElement>('button, input, select, textarea, [tabindex="0"]')?.focus();
        return (): void => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
    }, []);
    return { ref, onKeyDown: (event): void => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); return; }
        if (event.key !== 'Tab') return;
        const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
        const first = nodes[0], last = nodes.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    } };
}
