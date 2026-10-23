

export function registerRoutes(app, { prisma, authMiddleware , console }) {
const ROUTINE_BLOCK_PHASES = ['accumulation', 'intensification', 'deload', 'custom'];

app.get('/api/routines/:id/blocks', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const blocks = await prisma.routineBlock.findMany({
            where: { routineId: req.params.id },
            orderBy: { order: 'asc' }
        });
        res.json(blocks);
    } catch (error) {
        console.error('Error fetching routine blocks:', error);
        res.status(500).json({ error: 'Failed to fetch routine blocks' });
    }
});

app.post('/api/routines/:id/blocks', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const { name, phase, order, durationWeeks } = req.body;
        if (!name) return res.status(400).json({ error: 'Required: name' });
        if (phase && !ROUTINE_BLOCK_PHASES.includes(phase)) {
            return res.status(400).json({ error: `phase must be one of: ${ROUTINE_BLOCK_PHASES.join(', ')}` });
        }

        const block = await prisma.routineBlock.create({
            data: {
                routineId: req.params.id,
                name,
                phase: phase || 'custom',
                order: Number.isInteger(order) ? order : 0,
                durationWeeks: durationWeeks ? parseInt(durationWeeks) : 4
            }
        });
        res.status(201).json(block);
    } catch (error) {
        console.error('Error creating routine block:', error);
        res.status(500).json({ error: 'Failed to create routine block' });
    }
});

app.put('/api/routines/:id/blocks/:blockId', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const existing = await prisma.routineBlock.findFirst({
            where: { id: req.params.blockId, routineId: req.params.id }
        });
        if (!existing) return res.status(404).json({ error: 'Block not found' });

        const { name, phase, order, durationWeeks } = req.body;
        if (phase && !ROUTINE_BLOCK_PHASES.includes(phase)) {
            return res.status(400).json({ error: `phase must be one of: ${ROUTINE_BLOCK_PHASES.join(', ')}` });
        }

        const block = await prisma.routineBlock.update({
            where: { id: req.params.blockId },
            data: {
                name: name ?? existing.name,
                phase: phase ?? existing.phase,
                order: Number.isInteger(order) ? order : existing.order,
                durationWeeks: durationWeeks ? parseInt(durationWeeks) : existing.durationWeeks
            }
        });
        res.json(block);
    } catch (error) {
        console.error('Error updating routine block:', error);
        res.status(500).json({ error: 'Failed to update routine block' });
    }
});

app.delete('/api/routines/:id/blocks/:blockId', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const existing = await prisma.routineBlock.findFirst({
            where: { id: req.params.blockId, routineId: req.params.id }
        });
        if (!existing) return res.status(404).json({ error: 'Block not found' });

        await prisma.routineBlock.delete({ where: { id: req.params.blockId } });
        res.json({ message: 'Block deleted successfully' });
    } catch (error) {
        console.error('Error deleting routine block:', error);
        res.status(500).json({ error: 'Failed to delete routine block' });
    }
});

app.post('/api/routines/:id/blocks/:blockId/start', authMiddleware, async (req, res) => {
    try {
        const routine = await prisma.routine.findFirst({
            where: { id: req.params.id, userId: req.userId }
        });
        if (!routine) return res.status(404).json({ error: 'Routine not found' });

        const existing = await prisma.routineBlock.findFirst({
            where: { id: req.params.blockId, routineId: req.params.id }
        });
        if (!existing) return res.status(404).json({ error: 'Block not found' });

        const block = await prisma.routineBlock.update({
            where: { id: req.params.blockId },
            data: { startedAt: new Date() }
        });
        res.json(block);
    } catch (error) {
        console.error('Error starting routine block:', error);
        res.status(500).json({ error: 'Failed to start routine block' });
    }
});

}
