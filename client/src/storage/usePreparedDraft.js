import { createContext, useContext, useMemo } from 'react';
import { createDraftStore } from '../services/workoutDrafts.js';

export const PreparedDraft = createContext(null);
export function usePreparedDraft(kind, resourceId, ownerId) {
    const prepared = useContext(PreparedDraft);
    return useMemo(() => prepared || createDraftStore(kind, resourceId, ownerId), [prepared, kind, resourceId, ownerId]);
}
