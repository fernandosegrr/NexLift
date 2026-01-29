
const API_URL = 'http://localhost:3001/api';

async function runTest() {
    console.log('🧪 Starting Isolated Restore Verification...');

    try {
        // 1. Register
        const unique = `restore_test_${Date.now()}`;
        let res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: unique, email: `${unique}@test.com`, password: '123', firstName: 'T', lastName: 'T' })
        });
        if (!res.ok) throw new Error(await res.text());
        const { token, user } = await res.json();
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

        // 2. Create Routine with "Deadlift"
        console.log('2. Creating "Deadlift"...');
        res = await fetch(`${API_URL}/routines/import`, {
            method: 'POST', headers,
            body: JSON.stringify({ name: "R1", days: [{ dayName: "D1", exercises: [{ name: "Deadlift", sets: 1, reps: "1" }] }] })
        });
        const rData = await res.json();
        const routineId = rData.routine.id;
        const exId = rData.routine.days[0].exercises[0].id; // ORIGINAL ID
        const dayId = rData.routine.days[0].id;
        console.log(`   Original ID: ${exId}`);

        // 3. Log History
        console.log('3. Logging 200kg...');
        const logRes = await fetch(`${API_URL}/workouts/log`, {
            method: 'POST', headers,
            body: JSON.stringify({
                exerciseId: exId,
                sets: [{ weight: 200, reps: 1, completed: true }]
            })
        });
        if (!logRes.ok) throw new Error(`Log failed: ${await logRes.text()}`);

        // 4. Archive "Deadlift" (Simulate Rename Logic)
        console.log('4. Renaming "Deadlift" -> "Sumo" (Triggers Archive of Deadlift)...');
        res = await fetch(`${API_URL}/routines/${routineId}`, {
            method: 'PUT', headers,
            body: JSON.stringify({
                name: "R1",
                days: [{
                    id: dayId,
                    dayName: "D1",
                    exercises: [{
                        id: exId,
                        name: "Sumo Deadlift", // Change Name
                        targetSets: 1, targetReps: "1"
                    }]
                }]
            })
        });
        if (!res.ok) throw new Error(await res.text());
        const uData = await res.json();
        const newSumoId = uData.days[0].exercises[0].id; // Should be NEW ID
        console.log(`   Renamed. New ID: ${newSumoId}`);
        if (newSumoId === exId) console.error('⚠️ WARNING: ID did not change! Archive logic might have failed.');

        // 5. Verify Deadlift is in Archive
        console.log('5. Checking Trash for "Deadlift"...');
        res = await fetch(`${API_URL}/routines/trash`, { headers });
        const trash = await res.json();
        // SEARCH CASE INSENSITIVE
        const archived = trash ? trash.days.flatMap(d => d.exercises).find(e => e.name.toLowerCase() === 'deadlift') : null;

        if (archived) {
            console.log(`✅ Found "Deadlift" in Archive! ID: ${archived.id}`);
        } else {
            console.error('❌ "Deadlift" NOT found in archive.');
            return;
        }

        // 6. Restore "Deadlift"
        console.log('6. Adding "Deadlift" back to routine...');
        res = await fetch(`${API_URL}/routines/${routineId}`, {
            method: 'PUT', headers,
            body: JSON.stringify({
                name: "R1",
                days: [{
                    id: dayId,
                    dayName: "D1",
                    exercises: [
                        { id: newSumoId, name: "Sumo Deadlift", targetSets: 1, targetReps: "1" },
                        { name: "Deadlift", targetSets: 1, targetReps: "1" } // Add Deadlift (Should Restore)
                    ]
                }]
            })
        });
        if (!res.ok) throw new Error(await res.text());
        const finalData = await res.json();
        // SEARCH CASE INSENSITIVE
        const restoredEx = finalData.days[0].exercises.find(e => e.name.toLowerCase() === "deadlift");

        console.log(`7. Verify Restore...`);
        if (!restoredEx) {
            console.error('❌ Restore failed: Deadlift not found in routine.');
            return;
        }

        console.log(`   Restored ID: ${restoredEx.id}`);
        if (restoredEx.id === archived.id) {
            console.log(`✅ RESTORE SUCCESS: ID matched Archive ID (${archived.id})`);
        } else {
            console.error(`⚠️ NEW ID CREATED: ${restoredEx.id} (Expected ${archived.id}). Smart Restore logic failed.`);
        }

        // 8. Check History
        console.log('8. Checking History...');
        res = await fetch(`${API_URL}/workouts/exercise/${restoredEx.id}/history`, { headers });
        const hist = await res.json();
        console.log(`📊 History Logs: ${hist.length}`);
        if (hist.length > 0 && hist[0].sets[0].weight === 200) {
            console.log('🎉 HISTORY PRESERVED (200kg found). LOGIC VERIFIED.');
        } else {
            console.error('❌ HISTORY LOST');
        }

    } catch (e) {
        console.error('CRITICIAL ERROR:', e);
    }
}

runTest();
