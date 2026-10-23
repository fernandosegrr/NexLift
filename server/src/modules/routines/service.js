

export function daysIncludeFor(source, exercises) {
    return source === 'ai'
        ? { include: { exercises }, orderBy: { dayName: 'desc' }, take: 7 }
        : { include: { exercises }, orderBy: { order: 'asc' } };
}

