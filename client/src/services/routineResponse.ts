import { readRoutineImportResponse } from '@nexlift/shared';
import type { RoutineImportResponse } from '@nexlift/shared';
// A transport is untrusted even when its TypeScript interface has json().
export interface JsonResponse { json: () => Promise<unknown> }
export async function decodeRoutineImportResponse(response: JsonResponse): Promise<RoutineImportResponse> {
    const value: unknown = await response.json();
    return readRoutineImportResponse(value);
}
