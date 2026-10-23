import { v2 as cloudinary } from 'cloudinary';
import webpush from 'web-push';

// Only process entrypoints configure production-capable SDKs. Tests inject
// fakes into createRuntime and never import/call this factory.
export async function createProviders(env) {
    const cloudinaryConfigured = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
    if (cloudinaryConfigured) cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET });
    const vapidConfigured = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
    const vapidDetails = vapidConfigured ? { subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
        publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY } : undefined;
    const { deduplicateExercises } = await import('../../services/exerciseAgent.js');
    const { chooseExercisesForDay } = env.OPENAI_API_KEY ? await import('../../services/aiRoutineAgent.js') : {};
    return { cloudinary, cloudinaryConfigured, vapidConfigured, fetch,
        webpush: { sendNotification: (subscription, payload, options = {}) => webpush.sendNotification(subscription, payload, { ...options, vapidDetails }) },
        deduplicateExercises, chooseExercisesForDay };
}
