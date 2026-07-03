// Web Push: suscripción/desuscripción de este dispositivo a las notificaciones de
// descanso (Tarea 2). En iOS 16.4+ solo funciona con la PWA añadida a la pantalla
// de inicio (no en una pestaña de Safari).
import { api } from '../services/api';

// pushManager.subscribe() exige la applicationServerKey como Uint8Array, no como
// el string base64url que devuelve el backend.
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getCurrentPushSubscription() {
    if (!isPushSupported()) return null;
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
}

export async function subscribeToPush() {
    if (!isPushSupported()) {
        throw new Error('Este navegador no soporta notificaciones push');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado');
    }

    const { publicKey } = await api.getVapidPublicKey();
    if (!publicKey) {
        throw new Error('Push no configurado en el servidor');
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await api.subscribeToPush(subscription.toJSON());
    return subscription;
}

export async function unsubscribeFromPush() {
    const subscription = await getCurrentPushSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await api.unsubscribeFromPush(endpoint);
}
