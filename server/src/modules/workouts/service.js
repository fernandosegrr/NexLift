import { createWorkoutHandlers } from '../../routes/workouts.js';
export function createWorkoutService({ prisma, scheduleRestReminder, console }) {
const workoutHandlers = createWorkoutHandlers({ prisma, scheduleRestReminder, logger: console });
return { workoutHandlers };
}
