import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { epley1RM, groupHistoryByExercise } from '../src/utils/exerciseName.js';
import { getCurrentGoalTarget } from '../src/utils/goalPlanner.js';
export default function TrainingHarness() {
    const [reps, setReps] = useState(10);
    const history = [...groupHistoryByExercise([{ date: '2026-10-18T18:00:00Z', exercise: { name: 'Synthetic press' }, sets: [{weight:80,reps}] }]).values()][0];
    const target = getCurrentGoalTarget({exerciseName:'Synthetic press',currentOneRepMax:100,targetWeight:110,targetReps:1},history);
    return <main><label>Reps<input aria-label="reps" type="number" value={reps} onChange={event=>setReps(Number(event.target.value))}/></label>
        <button onClick={()=>setReps(37)}>37</button><button onClick={()=>setReps(1)}>1</button>
        <output id="estimate">{epley1RM(80,reps)}</output><output id="history">{history.sessions[0].best1RM}</output><output id="goal">{target.weight}</output></main>;
}
createRoot(document.getElementById('root')).render(<TrainingHarness/>);
