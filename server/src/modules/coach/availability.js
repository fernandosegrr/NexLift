// Schema expansion is optional during the v4 -> Coach handover. Never cache a
// negative result: the next authenticated request recovers after migration.
export async function coachTablesAvailable(prisma) {
    const [row] = await prisma.$queryRaw`SELECT count(*)::int AS count FROM pg_catalog.pg_tables
        WHERE schemaname='public' AND tablename IN ('CoachCheckIn','CoachExerciseConfig','CoachMeasurement','CoachSuggestion')`;
    return row.count === 4;
}
