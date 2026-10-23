import WeekdayPicker from '../src/components/ui/WeekdayPicker.js';
import type { RoutineImportResponse } from '@nexlift/shared';
import type { OperationPresentationState } from '../src/services/operationLabels.js';
import { buildRoutineFormPayload, buildTemplateRoutinePayload } from '../src/utils/routinePayload.js';
import { parseOperation, OperationError } from '../../server/src/services/operationContract.js';
import { normalizeRoutineDays } from '../../server/src/services/routineImportContract.js';
import { decodeRoutineImportResponse } from '../src/services/routineResponse.js';
declare const unchecked: unknown;
// @ts-expect-error weekday is numeric, with explicit nullable selection
const wrongProp = <WeekdayPicker value="lunes" onChange={() => {}} />;
// @ts-expect-error callback cannot assume text or exclude cleared selection
const wrongCallback = <WeekdayPicker value={null} onChange={(value: string): void => { void value; }} />;
// @ts-expect-error unchecked HTTP JSON is not a verified response
const unsafe: RoutineImportResponse = unchecked;
// @ts-expect-error no invented property in the public normalized response
unsafe.routine.versionInventada;
// @ts-expect-error form requires an explicit object
buildRoutineFormPayload(null);
// @ts-expect-error catalog reference IDs are strings, weekdays are numbers
buildTemplateRoutinePayload({name:'R',days:[{exercises:[{exerciseId:0}]}]},[]);
// @ts-expect-error presentation statuses match the existing journal vocabulary
const wrongState: OperationPresentationState = 'uploaded';
// @ts-expect-error backend editing option is boolean
normalizeRoutineDays([], {editing:'yes'});
// @ts-expect-error errors require numeric HTTP status
new OperationError('422','INVALID_OPERATION','bad');
// @ts-expect-error unknown transport JSON requires an actual json() function
decodeRoutineImportResponse({json:unchecked});
const safe = parseOperation(unchecked);
const valid = <WeekdayPicker value={0} onChange={(weekday): void => { void weekday; }} />;
void [wrongProp,wrongCallback,unsafe,wrongState,safe,valid];
