/**
 * Barrel export for all shared routes
 * 
 * Usage:
 *   import { createAuthRoutes, createRoutineRoutes, ... } from '../shared/routes/index.js';
 *   const auth = createAuthRoutes(prisma);
 *   app.post('/api/auth/register', auth.register);
 */

export { createAuthRoutes } from './auth.js';
export { createRoutineRoutes } from './routines.js';
export { createWorkoutRoutes } from './workouts.js';
export { createExerciseRoutes } from './exercises.js';
export { createBodyRoutes } from './body.js';
export { createStatsRoutes } from './stats.js';
