import { createPortal } from 'react-dom';

// Saca su contenido del árbol de la página hacia document.body. Necesario para
// los overlays fixed inset-0: cualquier ancestro con una animación de entrada
// activa (animate-fade-in/slide-up/scale-in, que usan transform con
// animation-fill-mode: forwards) lo convierte en el containing block de sus
// descendientes position:fixed aunque la animación ya haya terminado — el
// modal termina posicionado como si fuera parte del contenido con scroll en
// vez de fijo a la pantalla. Portal evita el problema por completo.
export function Portal({ children }) {
    return createPortal(children, document.body);
}
