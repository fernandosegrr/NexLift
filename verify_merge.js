
// Native fetch (Node 18+)

const API_URL = 'http://localhost:3001/api';
let TOKEN = '';
let USER_ID = '';

async function runTest() {
    console.log('🚀 Starting "Merge & Protect" Scenario Verification...');

    try {
        // 1. Register User
        const uniqueUser = `test_merge_${Date.now()}`;
        console.log(`\n1. Registering user: ${uniqueUser}`);
        let res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: uniqueUser, email: `${uniqueUser}@test.com`, password: 'password123', firstName: 'Merge', lastName: 'Tester' })
        });

        if (!res.ok) throw new Error(`Registration failed: ${await res.text()}`);
        let data = await res.json();
        TOKEN = data.token;
        USER_ID = data.user.id;
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` };
        console.log('✅ User registered.');

        // 2. Create "Polea" (The existing legacy exercise)
        console.log('\n2. Creating Exercise "Polea" (Legacy)...');
        res = await fetch(`${API_URL}/routines/import`, {
            method: 'POST', headers,
            body: JSON.stringify({ name: "Legacy Routine", days: [{ dayName: "A", exercises: [{ name: "Polea", sets: 3, reps: "10" }] }] })
        });
        if (!res.ok) throw new Error(`Step 2 Failed: ${await res.text()}`);
        data = await res.json();
        const routineId = data.routine.id;
        const dayId = data.routine.days[0].id;
        const poleaId = data.routine.days[0].exercises[0].id; // ID 1

        // 3. Log data for Polea
        console.log('3. Logging history for "Polea" (Weight: 50kg)...');
        res = await fetch(`${API_URL}/workouts`, {
            method: 'POST', headers,
            body: JSON.stringify({ routineDayId: dayId, date: new Date().toISOString(), exercises: [{ exerciseId: poleaId, sets: [{ weight: 50, reps: 10, completed: true }] }] })
        });
        if (!res.ok) throw new Error(`Step 3 Failed: ${await res.text()}`);

        // 4. Archive Polea
        console.log('4. Deleting Routine (Moves "Polea" to Archive)...');
        res = await fetch(`${API_URL}/routines/${routineId}`, { method: 'DELETE', headers });
        if (!res.ok) throw new Error(`Step 4 Failed: ${await res.text()}`);

        // START NEW SCENARIO
        console.log('\n--- SCENARIO RESET ---');

        // 5. Create "Current Routine" with "Mancuerna"
        console.log('5. Creating new Routine with "Mancuerna"...');
        res = await fetch(`${API_URL}/routines/import`, {
            method: 'POST', headers,
            body: JSON.stringify({ name: "Current Routine", days: [{ dayName: "A", exercises: [{ name: "Mancuerna", sets: 3, reps: "10" }] }] })
        });
        if (!res.ok) throw new Error(`Step 5 Failed: ${await res.text()}`);
        data = await res.json();
        const currentRoutineId = data.routine.id;
        const currentDayId = data.routine.days[0].id;
        const mancuernaId = data.routine.days[0].exercises[0].id; // ID 2

        // 6. Log data for Mancuerna
        console.log('6. Logging history for "Mancuerna" (Weight: 20kg)...');
        res = await fetch(`${API_URL}/workouts`, {
            method: 'POST', headers,
            body: JSON.stringify({ routineDayId: currentDayId, date: new Date().toISOString(), exercises: [{ exerciseId: mancuernaId, sets: [{ weight: 20, reps: 10, completed: true }] }] })
        });
        if (!res.ok) throw new Error(`Step 6 Failed: ${await res.text()}`);

        // 7. RENAME "Mancuerna" -> "Polea"
        console.log('\n7. 💥 ACTION: Renaming "Mancuerna" to "Polea"...');

        const updatePayload = {
            name: "Current Routine",
            days: [{
                id: currentDayId,
                dayName: "A",
                exercises: [{
                    id: mancuernaId, // Sending ID of Mancuerna
                    name: "Polea",   // Changing Name to Polea
                    targetSets: 3, targetReps: "10"
                }]
            }]
        };
        res = await fetch(`${API_URL}/routines/${currentRoutineId}`, {
            method: 'PUT', headers, body: JSON.stringify(updatePayload)
        });
        if (!res.ok) throw new Error(`Step 7 Failed: ${await res.text()}`);
        data = await res.json();

        const newEx = data.days[0].exercises[0];
        console.log(`✅ Update complete. Current Exercise in Slot 0: "${newEx.name}" (ID: ${newEx.id})`);

        // 8. Verify History of the Active Exercise ("Polea")
        console.log('\n8. Verifying History for active "Polea"...');
        res = await fetch(`${API_URL}/workouts/exercise/${newEx.id}/history`, { headers });
        const history = await res.json();

        console.log(`📊 Found ${history.length} history logs.`);

        // CHECK CONDITIONS
        const hasPoleaData = history.some(log => log.sets[0].weight === 50);
        const hasMancuernaData = history.some(log => log.sets[0].weight === 20);

        if (hasPoleaData) console.log('✅ SUCCESS: "Polea" (50kg) history is present.');
        else console.error('❌ FAIL: "Polea" (50kg) history is MISSING.');

        if (!hasMancuernaData) console.log('✅ SUCCESS: "Mancuerna" (20kg) history is NOT present (Correctly separated).');
        else console.error('❌ FAIL: "Mancuerna" (20kg) history LEAKED into Polea.');

        // 9. Verify "Mancuerna" is safe in Archive
        console.log('\n9. Checking Archive for "Mancuerna"...');
        res = await fetch(`${API_URL}/routines/trash`, { headers });
        const trash = await res.json();
        if (!trash) throw new Error("Trash routine not found");

        const archivedMancuerna = trash.days.flatMap(d => d.exercises).find(e => e.name.toLowerCase() === "mancuerna");

        if (archivedMancuerna) {
            console.log(`✅ SUCCESS: Found "Mancuerna" in Archive (ID: ${archivedMancuerna.id}).`);
            // Check its history
            const trashRes = await fetch(`${API_URL}/workouts/exercise/${archivedMancuerna.id}/history`, { headers });
            const trashHistory = await trashRes.json();
            const trashHasData = trashHistory.some(log => log.sets[0].weight === 20);
            if (trashHasData) console.log('✅ SUCCESS: Archived "Mancuerna" still has its 20kg log.');
            else console.error('❌ FAIL: Archived "Mancuerna" lost its data.');
        } else {
            console.error('❌ FAIL: Could not find "Mancuerna" in Archive.');
        }

    } catch (error) {
        console.error('\n❌ CRITICAL FAILURE:', error.message);
    }
}

runTest();
