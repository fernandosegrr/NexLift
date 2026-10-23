// GENERATED from TypeScript by npm run build:typed; do not edit.
"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
class ContractValidationError extends Error {
  code;
  issues;
  constructor(code, path, message) {
    super(message);
    this.code = code;
    this.name = "ContractValidationError";
    this.issues = [{ path, message }];
  }
}
function fail$1(path, message, code = "INVALID_OPERATION") {
  throw new ContractValidationError(code, path, message);
}
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function record(value, path) {
  if (!isRecord(value))
    fail$1(path, `${path} must be an object`);
  return value;
}
function exact(value, allowed, path, allowUndefined = true) {
  const data = record(value, path);
  if (Object.keys(data).some((key2) => (!allowUndefined || data[key2] !== void 0) && !allowed.includes(key2)))
    fail$1(path, `Unknown ${path} field`);
  return data;
}
function identifier(value, path) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim())
    fail$1(path, `${path} is required`);
  return value;
}
function isOperationId(value) {
  return typeof value === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
}
function operationId(value) {
  if (!isOperationId(value))
    fail$1("operationId", "operationId must be a UUID");
  return value.toLowerCase();
}
function isSessionVersion(value) {
  return typeof value === "string" && /^[a-f\d]{64}$/.test(value);
}
function finite(value, path, max, integer2 = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max || integer2 && !Number.isInteger(value))
    fail$1(path, `Invalid ${path}`);
  return value;
}
function instant(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,3}))?(Z|[+-]\d\d:\d\d)$/);
  if (!match)
    fail$1("performedAt", "performedAt must be an ISO instant with an explicit offset and at most millisecond precision");
  const [, y, mo, d, h, min, sec, , zone] = match;
  const check = /* @__PURE__ */ new Date(0);
  check.setUTCFullYear(Number(y), Number(mo) - 1, Number(d));
  check.setUTCHours(0, 0, 0, 0);
  if (Number(y) < 1 || check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d) || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59 || zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
    fail$1("performedAt", "Invalid performedAt calendar instant");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !/^\d{4}-/.test(date.toISOString()))
    fail$1("performedAt", "Invalid performedAt");
  return date.toISOString();
}
function canonicalInstant(value, path) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    fail$1(path, "Invalid original date");
  return value;
}
function text$1(value, fallback, label) {
  if (value === void 0)
    return fallback;
  if (value === null && fallback === null)
    return null;
  if (typeof value !== "string" || value.length > 2e3)
    fail$1(label, `${label} must be a string of at most 2000 characters`);
  return value;
}
const setFields = ["weight", "reps", "rpe", "completed", "weightRight", "repsRight"];
function parseResolution(value) {
  return patch(() => resolution(value));
}
function patch(action) {
  try {
    return action();
  } catch (error) {
    if (error instanceof ContractValidationError)
      throw new ContractValidationError("INVALID_SESSION_PATCH", error.issues[0].path, error.message);
    throw error;
  }
}
function resolution(value) {
  const data = exactPatch(value, ["conflictId", "originalOperationId", "decision"]);
  if (!isOperationId(data.conflictId) || data.conflictId !== data.conflictId.toLowerCase() || data.conflictId !== data.originalOperationId || data.decision !== "local" && data.decision !== "manual")
    fail$1("resolution", "Invalid conflict reference", "INVALID_SESSION_PATCH");
  return { conflictId: data.conflictId, originalOperationId: data.originalOperationId, decision: data.decision };
}
function exactPatch(value, allowed) {
  if (!isRecord(value) || Object.keys(value).some((key2) => !allowed.includes(key2)))
    fail$1("patch", "Invalid patch fields", "INVALID_SESSION_PATCH");
  return value;
}
function stableId(value) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim())
    fail$1("id", "Stable set ID required", "INVALID_SESSION_PATCH");
  return value;
}
function patchFields(value) {
  const data = exactPatch(value, setFields), result = {};
  if (!Object.keys(data).length)
    fail$1("fields", "Empty set patch", "INVALID_SESSION_PATCH");
  if ("completed" in data) {
    if (typeof data.completed !== "boolean")
      fail$1("completed", "Invalid completed", "INVALID_SESSION_PATCH");
    result.completed = data.completed;
  }
  for (const key2 of ["weight", "reps", "rpe", "weightRight", "repsRight"]) {
    if (!Object.hasOwn(data, key2))
      continue;
    if (data[key2] === null && (key2 === "rpe" || key2 === "weightRight" || key2 === "repsRight"))
      result[key2] = null;
    else
      result[key2] = finite(data[key2], key2, key2 === "rpe" ? 10 : key2.includes("reps") ? 1e3 : 2e3, !key2.startsWith("weight"));
  }
  return result;
}
function parseChanges(value) {
  return patch(() => changes(value));
}
function changes(value) {
  const data = exactPatch(value, ["session", "updates", "additions", "removals", "order"]);
  const result = {};
  if (data.session !== void 0) {
    const session = exactPatch(data.session, ["notes", "date"]);
    result.session = {};
    if (Object.hasOwn(session, "notes")) {
      if (session.notes !== null && (typeof session.notes !== "string" || session.notes.length > 2e3))
        fail$1("notes", "Invalid notes", "INVALID_SESSION_PATCH");
      result.session.notes = session.notes;
    }
    if (Object.hasOwn(session, "date"))
      result.session.date = canonicalInstant(session.date, "date");
    if (!Object.keys(result.session).length)
      fail$1("session", "Empty session patch", "INVALID_SESSION_PATCH");
  }
  for (const name of ["updates", "additions", "removals", "order"]) {
    if (data[name] === void 0)
      continue;
    const values = data[name];
    if (!Array.isArray(values) || !values.length || values.length > 50)
      fail$1(name, `Invalid ${name}`, "INVALID_SESSION_PATCH");
    if (name === "removals" || name === "order")
      result[name] = values.map(stableId);
    else
      result[name] = values.map((value2) => {
        const item = exactPatch(value2, ["id", "fields"]);
        const id = stableId(item.id), fields = patchFields(item.fields);
        if (name === "additions" && setFields.some((k) => !Object.hasOwn(fields, k)))
          fail$1("fields", "New sets require complete values", "INVALID_SESSION_PATCH");
        return { id, fields };
      });
    const ids = (result[name] ?? []).map((item) => typeof item === "string" ? item : item.id);
    if (new Set(ids).size !== ids.length)
      fail$1(name, `Duplicate ${name}`, "INVALID_SESSION_PATCH");
  }
  const targets = [...result.updates ?? [], ...result.additions ?? [], ...result.removals ?? []].map((item) => typeof item === "string" ? item : item.id);
  if (new Set(targets).size !== targets.length || !Object.keys(result).length)
    fail$1("changes", "Overlapping or empty patch", "INVALID_SESSION_PATCH");
  return result;
}
function parseCanonicalWorkoutEffort(set) {
  for (const field of ["rpe", "rir"]) {
    const value = set[field];
    if (value === void 0 || field === "rpe" && value === null)
      continue;
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value))
      return { state: "invalid", field, message: `Invalid ${field}` };
  }
  if (set.rir !== void 0) {
    const rir = set.rir;
    if (typeof rir !== "number" || rir < 0 || rir > 4)
      return { state: "invalid", field: "rir", message: "rir must be an integer from 0 to 4" };
    if (set.rpe !== void 0 && set.rpe !== 10 - rir)
      return { state: "invalid", field: "rpe", message: "rir and rpe conflict" };
    return { state: "interpreted", context: "canonical-workout", storedRpe: 10 - rir };
  }
  if (typeof set.rpe === "number")
    return { state: "interpreted", context: "canonical-workout", storedRpe: set.rpe };
  return { state: "missing", context: "canonical-workout", storedRpe: set.rpe === null ? null : void 0 };
}
function readSetInput(value) {
  if (!Array.isArray(value))
    fail$1("sets", "sets must be an array");
  return value.map((raw) => {
    const set = record(raw, "set");
    if (Object.keys(set).some((key2) => set[key2] !== void 0 && !["weight", "reps", "rpe", "rir", "weightRight", "repsRight", "completed"].includes(key2)))
      fail$1("set", "Unknown set field");
    for (const name of ["weight", "reps", "weightRight", "repsRight", "rpe", "rir"]) {
      if (set[name] === void 0 || set[name] === null && !["weight", "reps", "rir"].includes(name))
        continue;
      const number = set[name];
      if (typeof number !== "number" || !Number.isFinite(number) || name !== "weight" && name !== "weightRight" && !Number.isInteger(number))
        fail$1(name, `Invalid ${name}`);
    }
    if (set.completed !== void 0 && typeof set.completed !== "boolean")
      fail$1("completed", "completed must be boolean");
    const effort = parseCanonicalWorkoutEffort(set);
    if (effort.state === "invalid")
      fail$1(effort.field, effort.message);
    return { ...set, rpe: effort.storedRpe };
  });
}
function readSessionIdentity(value) {
  return identifier(value, "logId");
}
const operationKinds = ["workout.create", "workout.appendSet", "workout.replaceSets", "workout.delete", "rest.create"];
function isOperationKind(value) {
  return operationKinds.some((kind) => kind === value);
}
function parseWorkoutOperation(value, context) {
  const input = record(value, "Operation");
  const common = ["operationId", "kind", "source", "performedAt"];
  const kind = input.kind;
  if (!isOperationKind(kind))
    fail$1("kind", "Unsupported operation kind");
  const fields = {
    "workout.create": ["exerciseId", "sets", "notes"],
    "workout.appendSet": ["logId", "expectedVersion", "sets"],
    "workout.replaceSets": ["logId", "expectedVersion", "sets", "changes", "resolution"],
    "workout.delete": ["logId", "expectedVersion", "resolution"],
    "rest.create": ["note"]
  };
  exact(input, [...common, ...fields[kind]], "operation");
  const id = operationId(input.operationId), performedAt = instant(input.performedAt);
  if (input.source !== "pwa" && input.source !== "shortcut")
    fail$1("source", "source must be pwa or shortcut");
  const identity = { operationId: id, source: input.source, performedAt, performedDay: context.mexicoCityDateStr(new Date(performedAt)) };
  if (kind === "rest.create")
    return { ...identity, kind, note: text$1(input.note, "Día de descanso", "note") };
  const resourceId = identifier(kind === "workout.create" ? input.exerciseId : input.logId, kind === "workout.create" ? "exerciseId" : "logId");
  const version = input.expectedVersion;
  if (kind !== "workout.create" && !isSessionVersion(version))
    fail$1("expectedVersion", "expectedVersion must be the current sessionVersion");
  const resolution2 = input.resolution === void 0 ? void 0 : parseResolution(input.resolution);
  if (resolution2?.originalOperationId === id)
    fail$1("resolution", "A resolution requires a new operationId");
  if (kind === "workout.delete" && isSessionVersion(version))
    return { ...identity, kind, logId: resourceId, expectedVersion: version, ...resolution2 ? { resolution: resolution2 } : {} };
  if (kind === "workout.replaceSets" && input.changes !== void 0 && isSessionVersion(version)) {
    if (input.sets !== void 0)
      fail$1("sets", "Use changes or sets, never both");
    return { ...identity, kind, logId: resourceId, expectedVersion: version, changes: parseChanges(input.changes), ...resolution2 ? { resolution: resolution2 } : {} };
  }
  if (input.resolution !== void 0)
    fail$1("resolution", "Resolution requires a partial patch");
  const parsed = context.sanitizeSets(readSetInput(input.sets));
  if (parsed.error)
    fail$1("sets", parsed.error);
  if (!parsed.sets)
    fail$1("sets", "sets must be an array");
  const sets = parsed.sets;
  if (kind === "workout.appendSet" && sets.length !== 1)
    fail$1("sets", "appendSet requires exactly one set");
  if (kind === "workout.create") {
    if (!sets.some((set) => set.weight > 0 && set.reps > 0))
      fail$1("sets", "At least one set with work is required");
    return { ...identity, kind, exerciseId: resourceId, notes: text$1(input.notes, null, "notes"), sets };
  }
  if ((kind === "workout.appendSet" || kind === "workout.replaceSets") && isSessionVersion(version))
    return { ...identity, kind, logId: resourceId, expectedVersion: version, sets };
  return fail$1("kind", "Unsupported operation kind");
}
class RoutineValidationError extends Error {
  status = 400;
  details;
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.details = [{ path, message }];
  }
}
const INT_MAX = 2147483647;
function fail(path, message) {
  throw new RoutineValidationError(path, message);
}
function text(value, path) {
  if (typeof value !== "string" || !value.trim())
    fail(path, "debe ser texto no vacío");
  return value.trim();
}
function nullableText(value, path) {
  if (value === null)
    return null;
  if (typeof value !== "string")
    fail(path, "debe ser texto o null");
  return value;
}
function integer(value, path, min = 0) {
  const n = typeof value === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > INT_MAX)
    fail(path, `debe ser un entero entre ${min} y ${INT_MAX}`);
  return n;
}
function boolean(value, path) {
  if (typeof value !== "boolean")
    fail(path, "debe ser booleano (true/false)");
  return value;
}
function reps(value, path) {
  if (typeof value === "number")
    return String(integer(value, path, 1));
  const s = text(value, path);
  if (/^AMRAP$/i.test(s))
    return "AMRAP";
  const match = s.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);
  if (!match)
    fail(path, "usa repeticiones positivas, un rango como 4-6 o AMRAP");
  const low = integer(match[1], path, 1), high = match[2] === void 0 ? low : integer(match[2], path, 1);
  if (low > high)
    fail(path, "el inicio del rango no puede superar el final");
  return match[2] === void 0 ? String(low) : `${low}-${high}`;
}
const muscleGroups = ["Pecho", "Espalda", "Hombros", "Piernas", "Bíceps", "Tríceps", "Antebrazos", "Core"];
function key(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
const muscles = new Map(muscleGroups.map((value) => [key(value), value]));
["chest", "back", "shoulders", "legs", "biceps", "triceps", "forearms", "core"].forEach((value, i) => muscles.set(value, muscleGroups[i]));
muscles.set("core / abdomen", "Core");
function muscle(value, path) {
  if (value === null || value === "" || value === "default")
    return null;
  const normalized = muscles.get(key(text(value, path)));
  if (!normalized)
    fail(path, "grupo muscular fuera del catálogo actual");
  return normalized;
}
function alias(input, canonical, legacy, normalize, fallback, path) {
  const hasCanonical = input[canonical] !== void 0, hasLegacy = input[legacy] !== void 0;
  if (!hasCanonical && !hasLegacy)
    return fallback;
  const a = hasCanonical ? normalize(input[canonical], `${path}.${canonical}`) : fallback;
  const b = hasLegacy ? normalize(input[legacy], `${path}.${legacy}`) : fallback;
  if (hasCanonical && hasLegacy && a !== b)
    fail(`${path}.${canonical}`, `conflicto entre ${canonical} y ${legacy}`);
  return hasCanonical ? a : b;
}
function normalizeImportedExercise(input, index = 0, path = "exercise") {
  if (!isRecord(input))
    fail(path, "debe ser un objeto");
  return {
    name: text(input.name, `${path}.name`),
    muscleGroup: alias(input, "muscleGroup", "muscle", muscle, null, path),
    targetSets: alias(input, "targetSets", "sets", (v, p) => integer(v, p, 1), 3, path),
    targetReps: alias(input, "targetReps", "reps", reps, "8-12", path),
    restSeconds: alias(input, "restSeconds", "rest", (v, p) => v === null ? null : integer(v, p), null, path),
    isUnilateral: input.isUnilateral !== void 0 ? boolean(input.isUnilateral, `${path}.isUnilateral`) : false,
    note: input.note !== void 0 ? nullableText(input.note, `${path}.note`) : null,
    order: input.order !== void 0 ? integer(input.order, `${path}.order`) : index
  };
}
exports.ContractValidationError = ContractValidationError;
exports.RoutineValidationError = RoutineValidationError;
exports.normalizeImportedExercise = normalizeImportedExercise;
exports.operationId = operationId;
exports.operationKinds = operationKinds;
exports.parseChanges = parseChanges;
exports.parseResolution = parseResolution;
exports.parseWorkoutOperation = parseWorkoutOperation;
exports.readSessionIdentity = readSessionIdentity;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJhY3RzLmNqcyIsInNvdXJjZXMiOlsiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvdmFsaWRhdGlvbi9yZXN1bHRzLmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvdmFsaWRhdGlvbi9wcmltaXRpdmVzLmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvY29udHJhY3RzL2NvbmZsaWN0cy5qcyIsIi4uLy4uLy4uL3BhY2thZ2VzL3NoYXJlZC9kaXN0L2RvbWFpbi90cmFpbmluZy9lZmZvcnQuanMiLCIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9jb250cmFjdHMvd29ya291dFNlc3Npb25zLmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvY29udHJhY3RzL3dvcmtvdXRPcGVyYXRpb25zLmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvY29udHJhY3RzL3JvdXRpbmVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjbGFzcyBDb250cmFjdFZhbGlkYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgICBjb2RlO1xuICAgIGlzc3VlcztcbiAgICBjb25zdHJ1Y3Rvcihjb2RlLCBwYXRoLCBtZXNzYWdlKSB7XG4gICAgICAgIHN1cGVyKG1lc3NhZ2UpO1xuICAgICAgICB0aGlzLmNvZGUgPSBjb2RlO1xuICAgICAgICB0aGlzLm5hbWUgPSAnQ29udHJhY3RWYWxpZGF0aW9uRXJyb3InO1xuICAgICAgICB0aGlzLmlzc3VlcyA9IFt7IHBhdGgsIG1lc3NhZ2UgfV07XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlKHBhcnNlciwgdmFsdWUpIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBkYXRhOiBwYXJzZXIodmFsdWUpIH07XG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBDb250cmFjdFZhbGlkYXRpb25FcnJvcilcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBpc3N1ZXM6IGVycm9yLmlzc3VlcyB9O1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1yZXN1bHRzLmpzLm1hcCIsImltcG9ydCB7IENvbnRyYWN0VmFsaWRhdGlvbkVycm9yIH0gZnJvbSAnLi9yZXN1bHRzLmpzJztcbmV4cG9ydCBmdW5jdGlvbiBmYWlsKHBhdGgsIG1lc3NhZ2UsIGNvZGUgPSAnSU5WQUxJRF9PUEVSQVRJT04nKSB7XG4gICAgdGhyb3cgbmV3IENvbnRyYWN0VmFsaWRhdGlvbkVycm9yKGNvZGUsIHBhdGgsIG1lc3NhZ2UpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVjb3JkKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlICE9PSBudWxsICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHJlY29yZCh2YWx1ZSwgcGF0aCkge1xuICAgIGlmICghaXNSZWNvcmQodmFsdWUpKVxuICAgICAgICBmYWlsKHBhdGgsIGAke3BhdGh9IG11c3QgYmUgYW4gb2JqZWN0YCk7XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGV4YWN0KHZhbHVlLCBhbGxvd2VkLCBwYXRoLCBhbGxvd1VuZGVmaW5lZCA9IHRydWUpIHtcbiAgICBjb25zdCBkYXRhID0gcmVjb3JkKHZhbHVlLCBwYXRoKTtcbiAgICBpZiAoT2JqZWN0LmtleXMoZGF0YSkuc29tZShrZXkgPT4gKCFhbGxvd1VuZGVmaW5lZCB8fCBkYXRhW2tleV0gIT09IHVuZGVmaW5lZCkgJiYgIWFsbG93ZWQuaW5jbHVkZXMoa2V5KSkpXG4gICAgICAgIGZhaWwocGF0aCwgYFVua25vd24gJHtwYXRofSBmaWVsZGApO1xuICAgIHJldHVybiBkYXRhO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlkZW50aWZpZXIodmFsdWUsIHBhdGgpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCAhdmFsdWUudHJpbSgpIHx8IHZhbHVlICE9PSB2YWx1ZS50cmltKCkpXG4gICAgICAgIGZhaWwocGF0aCwgYCR7cGF0aH0gaXMgcmVxdWlyZWRgKTtcbiAgICByZXR1cm4gdmFsdWU7XG59XG5leHBvcnQgZnVuY3Rpb24gaXNPcGVyYXRpb25JZCh2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIC9eW2EtZlxcZF17OH0oPzotW2EtZlxcZF17NH0pezN9LVthLWZcXGRdezEyfSQvaS50ZXN0KHZhbHVlKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBvcGVyYXRpb25JZCh2YWx1ZSkge1xuICAgIGlmICghaXNPcGVyYXRpb25JZCh2YWx1ZSkpXG4gICAgICAgIGZhaWwoJ29wZXJhdGlvbklkJywgJ29wZXJhdGlvbklkIG11c3QgYmUgYSBVVUlEJyk7XG4gICAgcmV0dXJuIHZhbHVlLnRvTG93ZXJDYXNlKCk7XG59XG5leHBvcnQgZnVuY3Rpb24gaXNTZXNzaW9uVmVyc2lvbih2YWx1ZSkge1xuICAgIHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIC9eW2EtZlxcZF17NjR9JC8udGVzdCh2YWx1ZSk7XG59XG5leHBvcnQgZnVuY3Rpb24gZmluaXRlKHZhbHVlLCBwYXRoLCBtYXgsIGludGVnZXIgPSBmYWxzZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNGaW5pdGUodmFsdWUpIHx8IHZhbHVlIDwgMCB8fCB2YWx1ZSA+IG1heCB8fCBpbnRlZ2VyICYmICFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSlcbiAgICAgICAgZmFpbChwYXRoLCBgSW52YWxpZCAke3BhdGh9YCk7XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGluc3RhbnQodmFsdWUpIHtcbiAgICBjb25zdCBtYXRjaCA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubWF0Y2goL14oXFxkezR9KS0oXFxkXFxkKS0oXFxkXFxkKVQoXFxkXFxkKTooXFxkXFxkKTooXFxkXFxkKSg/OlxcLihcXGR7MSwzfSkpPyhafFsrLV1cXGRcXGQ6XFxkXFxkKSQvKTtcbiAgICBpZiAoIW1hdGNoKVxuICAgICAgICBmYWlsKCdwZXJmb3JtZWRBdCcsICdwZXJmb3JtZWRBdCBtdXN0IGJlIGFuIElTTyBpbnN0YW50IHdpdGggYW4gZXhwbGljaXQgb2Zmc2V0IGFuZCBhdCBtb3N0IG1pbGxpc2Vjb25kIHByZWNpc2lvbicpO1xuICAgIGNvbnN0IFssIHksIG1vLCBkLCBoLCBtaW4sIHNlYywgLCB6b25lXSA9IG1hdGNoO1xuICAgIGNvbnN0IGNoZWNrID0gbmV3IERhdGUoMCk7XG4gICAgY2hlY2suc2V0VVRDRnVsbFllYXIoTnVtYmVyKHkpLCBOdW1iZXIobW8pIC0gMSwgTnVtYmVyKGQpKTtcbiAgICBjaGVjay5zZXRVVENIb3VycygwLCAwLCAwLCAwKTtcbiAgICBpZiAoTnVtYmVyKHkpIDwgMSB8fCBjaGVjay5nZXRVVENGdWxsWWVhcigpICE9PSBOdW1iZXIoeSkgfHwgY2hlY2suZ2V0VVRDTW9udGgoKSAhPT0gTnVtYmVyKG1vKSAtIDEgfHwgY2hlY2suZ2V0VVRDRGF0ZSgpICE9PSBOdW1iZXIoZClcbiAgICAgICAgfHwgTnVtYmVyKGgpID4gMjMgfHwgTnVtYmVyKG1pbikgPiA1OSB8fCBOdW1iZXIoc2VjKSA+IDU5XG4gICAgICAgIHx8ICh6b25lICE9PSAnWicgJiYgKE51bWJlcih6b25lLnNsaWNlKDEsIDMpKSA+IDIzIHx8IE51bWJlcih6b25lLnNsaWNlKDQpKSA+IDU5KSkpXG4gICAgICAgIGZhaWwoJ3BlcmZvcm1lZEF0JywgJ0ludmFsaWQgcGVyZm9ybWVkQXQgY2FsZW5kYXIgaW5zdGFudCcpO1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoZGF0ZS5nZXRUaW1lKCkpIHx8ICEvXlxcZHs0fS0vLnRlc3QoZGF0ZS50b0lTT1N0cmluZygpKSlcbiAgICAgICAgZmFpbCgncGVyZm9ybWVkQXQnLCAnSW52YWxpZCBwZXJmb3JtZWRBdCcpO1xuICAgIHJldHVybiBkYXRlLnRvSVNPU3RyaW5nKCk7XG59XG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsSW5zdGFudCh2YWx1ZSwgcGF0aCkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8ICFOdW1iZXIuaXNGaW5pdGUoRGF0ZS5wYXJzZSh2YWx1ZSkpIHx8IG5ldyBEYXRlKHZhbHVlKS50b0lTT1N0cmluZygpICE9PSB2YWx1ZSlcbiAgICAgICAgZmFpbChwYXRoLCAnSW52YWxpZCBvcmlnaW5hbCBkYXRlJyk7XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHRleHQodmFsdWUsIGZhbGxiYWNrLCBsYWJlbCkge1xuICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICByZXR1cm4gZmFsbGJhY2s7XG4gICAgaWYgKHZhbHVlID09PSBudWxsICYmIGZhbGxiYWNrID09PSBudWxsKVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCB2YWx1ZS5sZW5ndGggPiAyMDAwKVxuICAgICAgICBmYWlsKGxhYmVsLCBgJHtsYWJlbH0gbXVzdCBiZSBhIHN0cmluZyBvZiBhdCBtb3N0IDIwMDAgY2hhcmFjdGVyc2ApO1xuICAgIHJldHVybiB2YWx1ZTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXByaW1pdGl2ZXMuanMubWFwIiwiaW1wb3J0IHsgY2Fub25pY2FsSW5zdGFudCwgZmFpbCwgZmluaXRlLCBpc09wZXJhdGlvbklkLCBpc1JlY29yZCB9IGZyb20gJy4uL3ZhbGlkYXRpb24vcHJpbWl0aXZlcy5qcyc7XG5pbXBvcnQgeyBDb250cmFjdFZhbGlkYXRpb25FcnJvciB9IGZyb20gJy4uL3ZhbGlkYXRpb24vcmVzdWx0cy5qcyc7XG5leHBvcnQgY29uc3Qgc2V0RmllbGRzID0gWyd3ZWlnaHQnLCAncmVwcycsICdycGUnLCAnY29tcGxldGVkJywgJ3dlaWdodFJpZ2h0JywgJ3JlcHNSaWdodCddO1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmVzb2x1dGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBwYXRjaCgoKSA9PiByZXNvbHV0aW9uKHZhbHVlKSk7XG59XG5mdW5jdGlvbiBwYXRjaChhY3Rpb24pIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYWN0aW9uKCk7XG4gICAgfVxuICAgIGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBDb250cmFjdFZhbGlkYXRpb25FcnJvcilcbiAgICAgICAgICAgIHRocm93IG5ldyBDb250cmFjdFZhbGlkYXRpb25FcnJvcignSU5WQUxJRF9TRVNTSU9OX1BBVENIJywgZXJyb3IuaXNzdWVzWzBdLnBhdGgsIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG59XG5mdW5jdGlvbiByZXNvbHV0aW9uKHZhbHVlKSB7XG4gICAgY29uc3QgZGF0YSA9IGV4YWN0UGF0Y2godmFsdWUsIFsnY29uZmxpY3RJZCcsICdvcmlnaW5hbE9wZXJhdGlvbklkJywgJ2RlY2lzaW9uJ10pO1xuICAgIGlmICghaXNPcGVyYXRpb25JZChkYXRhLmNvbmZsaWN0SWQpIHx8IGRhdGEuY29uZmxpY3RJZCAhPT0gZGF0YS5jb25mbGljdElkLnRvTG93ZXJDYXNlKClcbiAgICAgICAgfHwgZGF0YS5jb25mbGljdElkICE9PSBkYXRhLm9yaWdpbmFsT3BlcmF0aW9uSWQgfHwgZGF0YS5kZWNpc2lvbiAhPT0gJ2xvY2FsJyAmJiBkYXRhLmRlY2lzaW9uICE9PSAnbWFudWFsJylcbiAgICAgICAgZmFpbCgncmVzb2x1dGlvbicsICdJbnZhbGlkIGNvbmZsaWN0IHJlZmVyZW5jZScsICdJTlZBTElEX1NFU1NJT05fUEFUQ0gnKTtcbiAgICByZXR1cm4geyBjb25mbGljdElkOiBkYXRhLmNvbmZsaWN0SWQsIG9yaWdpbmFsT3BlcmF0aW9uSWQ6IGRhdGEub3JpZ2luYWxPcGVyYXRpb25JZCwgZGVjaXNpb246IGRhdGEuZGVjaXNpb24gfTtcbn1cbmZ1bmN0aW9uIGV4YWN0UGF0Y2godmFsdWUsIGFsbG93ZWQpIHtcbiAgICBpZiAoIWlzUmVjb3JkKHZhbHVlKSB8fCBPYmplY3Qua2V5cyh2YWx1ZSkuc29tZShrZXkgPT4gIWFsbG93ZWQuaW5jbHVkZXMoa2V5KSkpXG4gICAgICAgIGZhaWwoJ3BhdGNoJywgJ0ludmFsaWQgcGF0Y2ggZmllbGRzJywgJ0lOVkFMSURfU0VTU0lPTl9QQVRDSCcpO1xuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHN0YWJsZUlkKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnRyaW0oKSB8fCB2YWx1ZSAhPT0gdmFsdWUudHJpbSgpKVxuICAgICAgICBmYWlsKCdpZCcsICdTdGFibGUgc2V0IElEIHJlcXVpcmVkJywgJ0lOVkFMSURfU0VTU0lPTl9QQVRDSCcpO1xuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHBhdGNoRmllbGRzKHZhbHVlKSB7XG4gICAgY29uc3QgZGF0YSA9IGV4YWN0UGF0Y2godmFsdWUsIHNldEZpZWxkcyksIHJlc3VsdCA9IHt9O1xuICAgIGlmICghT2JqZWN0LmtleXMoZGF0YSkubGVuZ3RoKVxuICAgICAgICBmYWlsKCdmaWVsZHMnLCAnRW1wdHkgc2V0IHBhdGNoJywgJ0lOVkFMSURfU0VTU0lPTl9QQVRDSCcpO1xuICAgIGlmICgnY29tcGxldGVkJyBpbiBkYXRhKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZGF0YS5jb21wbGV0ZWQgIT09ICdib29sZWFuJylcbiAgICAgICAgICAgIGZhaWwoJ2NvbXBsZXRlZCcsICdJbnZhbGlkIGNvbXBsZXRlZCcsICdJTlZBTElEX1NFU1NJT05fUEFUQ0gnKTtcbiAgICAgICAgcmVzdWx0LmNvbXBsZXRlZCA9IGRhdGEuY29tcGxldGVkO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBbJ3dlaWdodCcsICdyZXBzJywgJ3JwZScsICd3ZWlnaHRSaWdodCcsICdyZXBzUmlnaHQnXSkge1xuICAgICAgICBpZiAoIU9iamVjdC5oYXNPd24oZGF0YSwga2V5KSlcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICBpZiAoZGF0YVtrZXldID09PSBudWxsICYmIChrZXkgPT09ICdycGUnIHx8IGtleSA9PT0gJ3dlaWdodFJpZ2h0JyB8fCBrZXkgPT09ICdyZXBzUmlnaHQnKSlcbiAgICAgICAgICAgIHJlc3VsdFtrZXldID0gbnVsbDtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmVzdWx0W2tleV0gPSBmaW5pdGUoZGF0YVtrZXldLCBrZXksIGtleSA9PT0gJ3JwZScgPyAxMCA6IGtleS5pbmNsdWRlcygncmVwcycpID8gMTAwMCA6IDIwMDAsICFrZXkuc3RhcnRzV2l0aCgnd2VpZ2h0JykpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2hhbmdlcyh2YWx1ZSkge1xuICAgIHJldHVybiBwYXRjaCgoKSA9PiBjaGFuZ2VzKHZhbHVlKSk7XG59XG5mdW5jdGlvbiBjaGFuZ2VzKHZhbHVlKSB7XG4gICAgY29uc3QgZGF0YSA9IGV4YWN0UGF0Y2godmFsdWUsIFsnc2Vzc2lvbicsICd1cGRhdGVzJywgJ2FkZGl0aW9ucycsICdyZW1vdmFscycsICdvcmRlciddKTtcbiAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICBpZiAoZGF0YS5zZXNzaW9uICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbiA9IGV4YWN0UGF0Y2goZGF0YS5zZXNzaW9uLCBbJ25vdGVzJywgJ2RhdGUnXSk7XG4gICAgICAgIHJlc3VsdC5zZXNzaW9uID0ge307XG4gICAgICAgIGlmIChPYmplY3QuaGFzT3duKHNlc3Npb24sICdub3RlcycpKSB7XG4gICAgICAgICAgICBpZiAoc2Vzc2lvbi5ub3RlcyAhPT0gbnVsbCAmJiAodHlwZW9mIHNlc3Npb24ubm90ZXMgIT09ICdzdHJpbmcnIHx8IHNlc3Npb24ubm90ZXMubGVuZ3RoID4gMjAwMCkpXG4gICAgICAgICAgICAgICAgZmFpbCgnbm90ZXMnLCAnSW52YWxpZCBub3RlcycsICdJTlZBTElEX1NFU1NJT05fUEFUQ0gnKTtcbiAgICAgICAgICAgIHJlc3VsdC5zZXNzaW9uLm5vdGVzID0gc2Vzc2lvbi5ub3RlcztcbiAgICAgICAgfVxuICAgICAgICBpZiAoT2JqZWN0Lmhhc093bihzZXNzaW9uLCAnZGF0ZScpKVxuICAgICAgICAgICAgcmVzdWx0LnNlc3Npb24uZGF0ZSA9IGNhbm9uaWNhbEluc3RhbnQoc2Vzc2lvbi5kYXRlLCAnZGF0ZScpO1xuICAgICAgICBpZiAoIU9iamVjdC5rZXlzKHJlc3VsdC5zZXNzaW9uKS5sZW5ndGgpXG4gICAgICAgICAgICBmYWlsKCdzZXNzaW9uJywgJ0VtcHR5IHNlc3Npb24gcGF0Y2gnLCAnSU5WQUxJRF9TRVNTSU9OX1BBVENIJyk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgbmFtZSBvZiBbJ3VwZGF0ZXMnLCAnYWRkaXRpb25zJywgJ3JlbW92YWxzJywgJ29yZGVyJ10pIHtcbiAgICAgICAgaWYgKGRhdGFbbmFtZV0gPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICBjb25zdCB2YWx1ZXMgPSBkYXRhW25hbWVdO1xuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkodmFsdWVzKSB8fCAhdmFsdWVzLmxlbmd0aCB8fCB2YWx1ZXMubGVuZ3RoID4gNTApXG4gICAgICAgICAgICBmYWlsKG5hbWUsIGBJbnZhbGlkICR7bmFtZX1gLCAnSU5WQUxJRF9TRVNTSU9OX1BBVENIJyk7XG4gICAgICAgIGlmIChuYW1lID09PSAncmVtb3ZhbHMnIHx8IG5hbWUgPT09ICdvcmRlcicpXG4gICAgICAgICAgICByZXN1bHRbbmFtZV0gPSB2YWx1ZXMubWFwKHN0YWJsZUlkKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmVzdWx0W25hbWVdID0gdmFsdWVzLm1hcCh2YWx1ZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgaXRlbSA9IGV4YWN0UGF0Y2godmFsdWUsIFsnaWQnLCAnZmllbGRzJ10pO1xuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gc3RhYmxlSWQoaXRlbS5pZCksIGZpZWxkcyA9IHBhdGNoRmllbGRzKGl0ZW0uZmllbGRzKTtcbiAgICAgICAgICAgICAgICBpZiAobmFtZSA9PT0gJ2FkZGl0aW9ucycgJiYgc2V0RmllbGRzLnNvbWUoayA9PiAhT2JqZWN0Lmhhc093bihmaWVsZHMsIGspKSlcbiAgICAgICAgICAgICAgICAgICAgZmFpbCgnZmllbGRzJywgJ05ldyBzZXRzIHJlcXVpcmUgY29tcGxldGUgdmFsdWVzJywgJ0lOVkFMSURfU0VTU0lPTl9QQVRDSCcpO1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGlkLCBmaWVsZHMgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICBjb25zdCBpZHMgPSAocmVzdWx0W25hbWVdID8/IFtdKS5tYXAoaXRlbSA9PiB0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycgPyBpdGVtIDogaXRlbS5pZCk7XG4gICAgICAgIGlmIChuZXcgU2V0KGlkcykuc2l6ZSAhPT0gaWRzLmxlbmd0aClcbiAgICAgICAgICAgIGZhaWwobmFtZSwgYER1cGxpY2F0ZSAke25hbWV9YCwgJ0lOVkFMSURfU0VTU0lPTl9QQVRDSCcpO1xuICAgIH1cbiAgICBjb25zdCB0YXJnZXRzID0gWy4uLihyZXN1bHQudXBkYXRlcyA/PyBbXSksIC4uLihyZXN1bHQuYWRkaXRpb25zID8/IFtdKSwgLi4uKHJlc3VsdC5yZW1vdmFscyA/PyBbXSldLm1hcChpdGVtID0+IHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJyA/IGl0ZW0gOiBpdGVtLmlkKTtcbiAgICBpZiAobmV3IFNldCh0YXJnZXRzKS5zaXplICE9PSB0YXJnZXRzLmxlbmd0aCB8fCAhT2JqZWN0LmtleXMocmVzdWx0KS5sZW5ndGgpXG4gICAgICAgIGZhaWwoJ2NoYW5nZXMnLCAnT3ZlcmxhcHBpbmcgb3IgZW1wdHkgcGF0Y2gnLCAnSU5WQUxJRF9TRVNTSU9OX1BBVENIJyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWNvbmZsaWN0cy5qcy5tYXAiLCJleHBvcnQgZnVuY3Rpb24gcmlyVG9TdG9yZWRScGUocmlyKSB7XG4gICAgcmV0dXJuIHsga2luZDogJ3N0b3JlZC1ycGUnLCB2YWx1ZTogMTAgLSByaXIudmFsdWUgfTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzdG9yZWRScGVUb1JpcihycGUpIHtcbiAgICByZXR1cm4geyBraW5kOiAnaW5mZXJyZWQtcmlyJywgdmFsdWU6IDEwIC0gcnBlLnZhbHVlIH07XG59XG4vKiogTnVsbGFibGUgZm9ybSBhZGFwdGVycyBwcmVzZXJ2ZSBhYnNlbmNlIGFuZCB0aGUgZXhpc3RpbmcgYXJpdGhtZXRpYyBleGFjdGx5LlxuICogVGhleSBkbyBub3QgY2xhbXAgaW1wb3J0ZWQgaGlzdG9yaWNhbCB2YWx1ZXMgdG8gdG9kYXkncyBVSSBidXR0b25zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1SaXJUb1N0b3JlZFJwZShyaXIpIHtcbiAgICByZXR1cm4gcmlyID09IG51bGwgPyBudWxsIDogcmlyVG9TdG9yZWRScGUoeyBraW5kOiAndXNlci1yaXInLCB2YWx1ZTogcmlyIH0pLnZhbHVlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlZFJwZVRvRm9ybVJpcihycGUpIHtcbiAgICByZXR1cm4gcnBlID09IG51bGwgPyBudWxsIDogc3RvcmVkUnBlVG9SaXIoeyBraW5kOiAnc3RvcmVkLXJwZScsIHZhbHVlOiBycGUgfSkudmFsdWU7XG59XG4vLyBwYXJzZUZsb2F0IHBlcmZvcm1zIFRvU3RyaW5nIHdpdGggdGhlIHN0cmluZyBoaW50LiBTdHJpbmcoU3ltYm9sKSBoYXMgYVxuLy8gc3BlY2lhbCBleGVtcHRpb24gdGhhdCBwYXJzZUZsb2F0IGRvZXMgbm90OiBwcmVzZXJ2ZSB0aGF0IFR5cGVFcnJvciB0b28uXG5mdW5jdGlvbiBzaG9ydGN1dEZsb2F0KHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N5bWJvbCcpXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IGEgU3ltYm9sIHZhbHVlIHRvIGEgc3RyaW5nJyk7XG4gICAgcmV0dXJuIHBhcnNlRmxvYXQoU3RyaW5nKHZhbHVlKSk7XG59XG4vKiogVW5ib3VuZGVkIGhpc3RvcmljYWwgaGVscGVyOyBOT1QgdGhlIFNob3J0Y3V0IHJlcXVlc3QgdmFsaWRhdG9yLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRMZWdhY3lTaG9ydGN1dFJpcihyYXdSaXIpIHtcbiAgICByZXR1cm4gcmF3UmlyICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKHNob3J0Y3V0RmxvYXQocmF3UmlyKSkgPyAxMCAtIHNob3J0Y3V0RmxvYXQocmF3UmlyKSA6IG51bGw7XG59XG4vKiogRXhhY3QgbGVnYWN5IGxvZy1zZXQgcG9saWN5OiBwZXJtaXNzaXZlIHBhcnNlRmxvYXQsIHJpciBwcmlvcml0eSwgZ2FwICg0LDYpXG4gKiByZWplY3RlZCwgbWlzc2luZyA9PiBSSVIwL1JQRTEwLiBObyBtb2Rlcm4gQVBJIG9yIGJhY2t1cCBtYXkgdXNlIHRoaXMgcGFyc2VyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGVnYWN5U2hvcnRjdXRFZmZvcnQoYm9keSkge1xuICAgIGNvbnN0IGludmFsaWQgPSB7IHN0YXRlOiAnaW52YWxpZCcsIGVycm9yOiAnUklSIGludsOhbGlkbyAodXNhIDAtNCwgcmVwcyBlbiByZWPDoW1hcmEpJyB9O1xuICAgIGNvbnN0IGhhc1JpciA9IGJvZHkucmlyICE9IG51bGwgJiYgU3RyaW5nKGJvZHkucmlyKS50cmltKCkgIT09ICcnO1xuICAgIGNvbnN0IGhhc1JwZSA9IGJvZHkucnBlICE9IG51bGwgJiYgU3RyaW5nKGJvZHkucnBlKS50cmltKCkgIT09ICcnO1xuICAgIGlmIChoYXNSaXIpIHtcbiAgICAgICAgY29uc3QgcmF3UmlyID0gc2hvcnRjdXRGbG9hdChib2R5LnJpcik7XG4gICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHJhd1JpcikgfHwgcmF3UmlyIDwgMCB8fCByYXdSaXIgPiA0KVxuICAgICAgICAgICAgcmV0dXJuIGludmFsaWQ7XG4gICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW50ZXJwcmV0ZWQnLCBjb250ZXh0OiAnbGVnYWN5LXNob3J0Y3V0JywgaW50ZXJwcmV0YXRpb246ICdleHBsaWNpdC1yaXInLCByYXdSaXIsIHN0b3JlZFJwZTogMTAgLSByYXdSaXIgfTtcbiAgICB9XG4gICAgaWYgKGhhc1JwZSkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBzaG9ydGN1dEZsb2F0KGJvZHkucnBlKTtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSlcbiAgICAgICAgICAgIHJldHVybiBpbnZhbGlkO1xuICAgICAgICBpZiAocGFyc2VkID49IDAgJiYgcGFyc2VkIDw9IDQpXG4gICAgICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2xlZ2FjeS1zaG9ydGN1dCcsIGludGVycHJldGF0aW9uOiAnbGVnYWN5LXJwZS1hcy1yaXInLCByYXdSaXI6IHBhcnNlZCwgc3RvcmVkUnBlOiAxMCAtIHBhcnNlZCB9O1xuICAgICAgICBpZiAocGFyc2VkID49IDYgJiYgcGFyc2VkIDw9IDEwKVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdGU6ICdpbnRlcnByZXRlZCcsIGNvbnRleHQ6ICdsZWdhY3ktc2hvcnRjdXQnLCBpbnRlcnByZXRhdGlvbjogJ3N0b3JlZC1ycGUnLCByYXdSaXI6IDEwIC0gcGFyc2VkLCBzdG9yZWRScGU6IHBhcnNlZCB9O1xuICAgICAgICByZXR1cm4gaW52YWxpZDtcbiAgICB9XG4gICAgcmV0dXJuIHsgc3RhdGU6ICdpbnRlcnByZXRlZCcsIGNvbnRleHQ6ICdsZWdhY3ktc2hvcnRjdXQnLCBpbnRlcnByZXRhdGlvbjogJ21pc3NpbmctZGVmYXVsdCcsIHJhd1JpcjogMCwgc3RvcmVkUnBlOiAxMCB9O1xufVxuLyoqIHYxIHJlcXVlc3QgcmVwcmVzZW50YXRpb24sIE5PVCBmdWxsIFNldExvZyB2YWxpZGF0aW9uLiBUaGUgZXhpc3Rpbmcgc2FuaXRpemVyXG4gKiBzdGlsbCBlbmZvcmNlcyBzdG9yZWQgcmFuZ2UgMC4uMTAgYW5kIG1hbmRhdG9yeSBlZmZvcnQgZm9yIHBvc2l0aXZlIHdvcmsuXG4gKiBObyBzb3VyY2UgcGFyYW1ldGVyOiBzb3VyY2U9c2hvcnRjdXQgY2Fubm90IGFjdGl2YXRlIGxlZ2FjeSBpbnRlcnByZXRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNhbm9uaWNhbFdvcmtvdXRFZmZvcnQoc2V0KSB7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBbJ3JwZScsICdyaXInXSkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHNldFtmaWVsZF07XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IChmaWVsZCA9PT0gJ3JwZScgJiYgdmFsdWUgPT09IG51bGwpKVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNGaW5pdGUodmFsdWUpIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSlcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW52YWxpZCcsIGZpZWxkLCBtZXNzYWdlOiBgSW52YWxpZCAke2ZpZWxkfWAgfTtcbiAgICB9XG4gICAgaWYgKHNldC5yaXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCByaXIgPSBzZXQucmlyO1xuICAgICAgICBpZiAodHlwZW9mIHJpciAhPT0gJ251bWJlcicgfHwgcmlyIDwgMCB8fCByaXIgPiA0KVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdGU6ICdpbnZhbGlkJywgZmllbGQ6ICdyaXInLCBtZXNzYWdlOiAncmlyIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDAgdG8gNCcgfTtcbiAgICAgICAgaWYgKHNldC5ycGUgIT09IHVuZGVmaW5lZCAmJiBzZXQucnBlICE9PSAxMCAtIHJpcilcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW52YWxpZCcsIGZpZWxkOiAncnBlJywgbWVzc2FnZTogJ3JpciBhbmQgcnBlIGNvbmZsaWN0JyB9O1xuICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2Nhbm9uaWNhbC13b3Jrb3V0Jywgc3RvcmVkUnBlOiAxMCAtIHJpciB9O1xuICAgIH1cbiAgICAvLyBOYXJyb3cgdW5rbm93biBpbmRlcGVuZGVudGx5OyB0aGUgbG9vcCBhYm92ZSBwcmVzZXJ2ZXMgZXJyb3IgcHJlY2VkZW5jZS5cbiAgICBpZiAodHlwZW9mIHNldC5ycGUgPT09ICdudW1iZXInKVxuICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2Nhbm9uaWNhbC13b3Jrb3V0Jywgc3RvcmVkUnBlOiBzZXQucnBlIH07XG4gICAgcmV0dXJuIHsgc3RhdGU6ICdtaXNzaW5nJywgY29udGV4dDogJ2Nhbm9uaWNhbC13b3Jrb3V0Jywgc3RvcmVkUnBlOiBzZXQucnBlID09PSBudWxsID8gbnVsbCA6IHVuZGVmaW5lZCB9O1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZWZmb3J0LmpzLm1hcCIsImltcG9ydCB7IHBhcnNlQ2Fub25pY2FsV29ya291dEVmZm9ydCB9IGZyb20gJy4uL2RvbWFpbi90cmFpbmluZy9lZmZvcnQuanMnO1xuaW1wb3J0IHsgY2Fub25pY2FsSW5zdGFudCwgZmFpbCwgaWRlbnRpZmllciwgaXNSZWNvcmQsIGlzU2Vzc2lvblZlcnNpb24sIHJlY29yZCB9IGZyb20gJy4uL3ZhbGlkYXRpb24vcHJpbWl0aXZlcy5qcyc7XG5leHBvcnQgZnVuY3Rpb24gaXNTZXNzaW9uU2V0Vmlldyh2YWx1ZSkge1xuICAgIGlmICghaXNSZWNvcmQodmFsdWUpKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIFsnd2VpZ2h0JywgJ3JlcHMnLCAncnBlJywgJ3dlaWdodFJpZ2h0JywgJ3JlcHNSaWdodCddLmV2ZXJ5KGtleSA9PiB7XG4gICAgICAgIGNvbnN0IG51bWJlciA9IHZhbHVlW2tleV07XG4gICAgICAgIGlmICghWyd3ZWlnaHQnLCAncmVwcyddLmluY2x1ZGVzKGtleSkgJiYgKG51bWJlciA9PT0gdW5kZWZpbmVkIHx8IG51bWJlciA9PT0gbnVsbCkpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBudW1iZXIgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShudW1iZXIpICYmIG51bWJlciA+PSAwXG4gICAgICAgICAgICAmJiBudW1iZXIgPD0gKGtleSA9PT0gJ3JwZScgPyAxMCA6IGtleS5pbmNsdWRlcygncmVwcycpID8gMTAwMCA6IDIwMDApXG4gICAgICAgICAgICAmJiAoa2V5LnN0YXJ0c1dpdGgoJ3dlaWdodCcpIHx8IE51bWJlci5pc0ludGVnZXIobnVtYmVyKSk7XG4gICAgfSkgJiYgKHZhbHVlLmNvbXBsZXRlZCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2YWx1ZS5jb21wbGV0ZWQgPT09ICdib29sZWFuJylcbiAgICAgICAgJiYgKHZhbHVlLmlkID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLmlkID09PSAnc3RyaW5nJyAmJiAhIXZhbHVlLmlkKVxuICAgICAgICAmJiAodmFsdWUuc2V0TnVtYmVyID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnNldE51bWJlciA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzSW50ZWdlcih2YWx1ZS5zZXROdW1iZXIpICYmIHZhbHVlLnNldE51bWJlciA+IDApXG4gICAgICAgICYmICh2YWx1ZS53b3Jrb3V0TG9nSWQgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUud29ya291dExvZ0lkID09PSAnc3RyaW5nJyk7XG59XG4vKiogQSBjaGVjayBvbmx5OiByZXR1cm5zIHRoZSBvcmlnaW5hbCBvYmplY3QsIGluY2x1ZGluZyBoaXN0b3JpY2FsIGV4dGVuc2lvbiBmaWVsZHMuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTZXRWYWx1ZXModmFsdWUpIHtcbiAgICBpZiAoIWlzUmVjb3JkKHZhbHVlKSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBbJ3dlaWdodCcsICdyZXBzJywgJ3JwZScsICd3ZWlnaHRSaWdodCcsICdyZXBzUmlnaHQnXS5ldmVyeShrZXkgPT4ge1xuICAgICAgICBjb25zdCBudW1iZXIgPSB2YWx1ZVtrZXldO1xuICAgICAgICBpZiAoWydycGUnLCAnd2VpZ2h0UmlnaHQnLCAncmVwc1JpZ2h0J10uaW5jbHVkZXMoa2V5KSAmJiBudW1iZXIgPT09IG51bGwpXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBudW1iZXIgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShudW1iZXIpICYmIG51bWJlciA+PSAwXG4gICAgICAgICAgICAmJiBudW1iZXIgPD0gKGtleSA9PT0gJ3JwZScgPyAxMCA6IGtleS5pbmNsdWRlcygncmVwcycpID8gMTAwMCA6IDIwMDApXG4gICAgICAgICAgICAmJiAoa2V5LnN0YXJ0c1dpdGgoJ3dlaWdodCcpIHx8IE51bWJlci5pc0ludGVnZXIobnVtYmVyKSk7XG4gICAgfSkgJiYgdHlwZW9mIHZhbHVlLmNvbXBsZXRlZCA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGlzU2V0TG9nKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzU2V0VmFsdWVzKHZhbHVlKSAmJiBpc1JlY29yZCh2YWx1ZSkgJiYgdHlwZW9mIHZhbHVlLmlkID09PSAnc3RyaW5nJyAmJiB2YWx1ZS5pZC5sZW5ndGggPiAwXG4gICAgICAgICYmIHR5cGVvZiB2YWx1ZS5zZXROdW1iZXIgPT09ICdudW1iZXInICYmIE51bWJlci5pc0ludGVnZXIodmFsdWUuc2V0TnVtYmVyKSAmJiB2YWx1ZS5zZXROdW1iZXIgPiAwXG4gICAgICAgICYmICh2YWx1ZS53b3Jrb3V0TG9nSWQgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUud29ya291dExvZ0lkID09PSAnc3RyaW5nJyk7XG59XG5leHBvcnQgZnVuY3Rpb24gaXNXb3Jrb3V0TG9nKHZhbHVlKSB7XG4gICAgcmV0dXJuIGlzUmVjb3JkKHZhbHVlKSAmJiB0eXBlb2YgdmFsdWUuaWQgPT09ICdzdHJpbmcnICYmICEhdmFsdWUuaWQgJiYgdHlwZW9mIHZhbHVlLmV4ZXJjaXNlSWQgPT09ICdzdHJpbmcnICYmICEhdmFsdWUuZXhlcmNpc2VJZFxuICAgICAgICAmJiB0eXBlb2YgdmFsdWUuZGF0ZSA9PT0gJ3N0cmluZycgJiYgTnVtYmVyLmlzRmluaXRlKERhdGUucGFyc2UodmFsdWUuZGF0ZSkpICYmIG5ldyBEYXRlKHZhbHVlLmRhdGUpLnRvSVNPU3RyaW5nKCkgPT09IHZhbHVlLmRhdGVcbiAgICAgICAgJiYgKHR5cGVvZiB2YWx1ZS5ub3RlcyA9PT0gJ3N0cmluZycgfHwgdmFsdWUubm90ZXMgPT09IG51bGwpICYmIEFycmF5LmlzQXJyYXkodmFsdWUuc2V0cykgJiYgdmFsdWUuc2V0cy5ldmVyeShpc1NldExvZyk7XG59XG5leHBvcnQgZnVuY3Rpb24gaXNTZXNzaW9uUmVzcG9uc2UodmFsdWUpIHtcbiAgICBpZiAoIWlzUmVjb3JkKHZhbHVlKSB8fCAhaXNTZXNzaW9uVmVyc2lvbih2YWx1ZS5zZXNzaW9uVmVyc2lvbikgfHwgIWlzUmVjb3JkKHZhbHVlLndvcmtvdXRMb2cpKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgY29uc3QgbG9nID0gdmFsdWUud29ya291dExvZztcbiAgICByZXR1cm4gdHlwZW9mIGxvZy5pZCA9PT0gJ3N0cmluZycgJiYgISFsb2cuaWQgJiYgKGxvZy5leGVyY2lzZUlkID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIGxvZy5leGVyY2lzZUlkID09PSAnc3RyaW5nJylcbiAgICAgICAgJiYgKGxvZy5kYXRlID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIGxvZy5kYXRlID09PSAnc3RyaW5nJyAmJiBOdW1iZXIuaXNGaW5pdGUoRGF0ZS5wYXJzZShsb2cuZGF0ZSkpICYmIG5ldyBEYXRlKGxvZy5kYXRlKS50b0lTT1N0cmluZygpID09PSBsb2cuZGF0ZSlcbiAgICAgICAgJiYgKGxvZy5ub3RlcyA9PT0gdW5kZWZpbmVkIHx8IGxvZy5ub3RlcyA9PT0gbnVsbCB8fCB0eXBlb2YgbG9nLm5vdGVzID09PSAnc3RyaW5nJylcbiAgICAgICAgJiYgQXJyYXkuaXNBcnJheShsb2cuc2V0cykgJiYgbG9nLnNldHMuZXZlcnkoaXNTZXNzaW9uU2V0Vmlldyk7XG59XG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25SZXNwb25zZSh2YWx1ZSkge1xuICAgIGlmICghaXNTZXNzaW9uUmVzcG9uc2UodmFsdWUpKVxuICAgICAgICBmYWlsKCdyZXNwb25zZScsICdJbmNvbXBhdGlibGUgc2Vzc2lvbiByZXNwb25zZScsICdJTkNPTVBBVElCTEVfT1BFUkFUSU9OJyk7XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuLy8gUmVxdWVzdCBzZXJpZXMgYXJlIG5vcm1hbGl6ZWQgb25seSBhdCB0aGUgZXN0YWJsaXNoZWQgSFRUUCBib3VuZGFyeS4gVGhlXG4vLyBjYWxsZXIgc3VwcGxpZXMgdGhlIGV4aXN0aW5nIHNhbml0aXplciBzbyBsZWdhY3kgc3BvcnRpbmcgcnVsZXMgc3RheSBzaW5nbGUuXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNldElucHV0KHZhbHVlKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSlcbiAgICAgICAgZmFpbCgnc2V0cycsICdzZXRzIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICByZXR1cm4gdmFsdWUubWFwKHJhdyA9PiB7XG4gICAgICAgIGNvbnN0IHNldCA9IHJlY29yZChyYXcsICdzZXQnKTtcbiAgICAgICAgaWYgKE9iamVjdC5rZXlzKHNldCkuc29tZShrZXkgPT4gc2V0W2tleV0gIT09IHVuZGVmaW5lZCAmJiAhWyd3ZWlnaHQnLCAncmVwcycsICdycGUnLCAncmlyJywgJ3dlaWdodFJpZ2h0JywgJ3JlcHNSaWdodCcsICdjb21wbGV0ZWQnXS5pbmNsdWRlcyhrZXkpKSlcbiAgICAgICAgICAgIGZhaWwoJ3NldCcsICdVbmtub3duIHNldCBmaWVsZCcpO1xuICAgICAgICBmb3IgKGNvbnN0IG5hbWUgb2YgWyd3ZWlnaHQnLCAncmVwcycsICd3ZWlnaHRSaWdodCcsICdyZXBzUmlnaHQnLCAncnBlJywgJ3JpciddKSB7XG4gICAgICAgICAgICBpZiAoc2V0W25hbWVdID09PSB1bmRlZmluZWQgfHwgKHNldFtuYW1lXSA9PT0gbnVsbCAmJiAhWyd3ZWlnaHQnLCAncmVwcycsICdyaXInXS5pbmNsdWRlcyhuYW1lKSkpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBudW1iZXIgPSBzZXRbbmFtZV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIG51bWJlciAhPT0gJ251bWJlcicgfHwgIU51bWJlci5pc0Zpbml0ZShudW1iZXIpIHx8IChuYW1lICE9PSAnd2VpZ2h0JyAmJiBuYW1lICE9PSAnd2VpZ2h0UmlnaHQnICYmICFOdW1iZXIuaXNJbnRlZ2VyKG51bWJlcikpKVxuICAgICAgICAgICAgICAgIGZhaWwobmFtZSwgYEludmFsaWQgJHtuYW1lfWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzZXQuY29tcGxldGVkICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHNldC5jb21wbGV0ZWQgIT09ICdib29sZWFuJylcbiAgICAgICAgICAgIGZhaWwoJ2NvbXBsZXRlZCcsICdjb21wbGV0ZWQgbXVzdCBiZSBib29sZWFuJyk7XG4gICAgICAgIGNvbnN0IGVmZm9ydCA9IHBhcnNlQ2Fub25pY2FsV29ya291dEVmZm9ydChzZXQpO1xuICAgICAgICBpZiAoZWZmb3J0LnN0YXRlID09PSAnaW52YWxpZCcpXG4gICAgICAgICAgICBmYWlsKGVmZm9ydC5maWVsZCwgZWZmb3J0Lm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm4geyAuLi5zZXQsIHJwZTogZWZmb3J0LnN0b3JlZFJwZSB9O1xuICAgIH0pO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRTZXNzaW9uSWRlbnRpdHkodmFsdWUpIHsgcmV0dXJuIGlkZW50aWZpZXIodmFsdWUsICdsb2dJZCcpOyB9XG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25EYXRlKHZhbHVlKSB7IHJldHVybiBjYW5vbmljYWxJbnN0YW50KHZhbHVlLCAnZGF0ZScpOyB9XG4vLyMgc291cmNlTWFwcGluZ1VSTD13b3Jrb3V0U2Vzc2lvbnMuanMubWFwIiwiaW1wb3J0IHsgZXhhY3QsIGZhaWwsIGlkZW50aWZpZXIsIGluc3RhbnQsIGlzU2Vzc2lvblZlcnNpb24sIG9wZXJhdGlvbklkLCByZWNvcmQsIHRleHQgfSBmcm9tICcuLi92YWxpZGF0aW9uL3ByaW1pdGl2ZXMuanMnO1xuaW1wb3J0IHsgcGFyc2VDaGFuZ2VzLCBwYXJzZVJlc29sdXRpb24gfSBmcm9tICcuL2NvbmZsaWN0cy5qcyc7XG5pbXBvcnQgeyByZWFkU2V0SW5wdXQgfSBmcm9tICcuL3dvcmtvdXRTZXNzaW9ucy5qcyc7XG5leHBvcnQgY29uc3Qgb3BlcmF0aW9uS2luZHMgPSBbJ3dvcmtvdXQuY3JlYXRlJywgJ3dvcmtvdXQuYXBwZW5kU2V0JywgJ3dvcmtvdXQucmVwbGFjZVNldHMnLCAnd29ya291dC5kZWxldGUnLCAncmVzdC5jcmVhdGUnXTtcbmV4cG9ydCBmdW5jdGlvbiBpc09wZXJhdGlvbktpbmQodmFsdWUpIHtcbiAgICByZXR1cm4gb3BlcmF0aW9uS2luZHMuc29tZShraW5kID0+IGtpbmQgPT09IHZhbHVlKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVdvcmtvdXRPcGVyYXRpb24odmFsdWUsIGNvbnRleHQpIHtcbiAgICBjb25zdCBpbnB1dCA9IHJlY29yZCh2YWx1ZSwgJ09wZXJhdGlvbicpO1xuICAgIGNvbnN0IGNvbW1vbiA9IFsnb3BlcmF0aW9uSWQnLCAna2luZCcsICdzb3VyY2UnLCAncGVyZm9ybWVkQXQnXTtcbiAgICBjb25zdCBraW5kID0gaW5wdXQua2luZDtcbiAgICBpZiAoIWlzT3BlcmF0aW9uS2luZChraW5kKSlcbiAgICAgICAgZmFpbCgna2luZCcsICdVbnN1cHBvcnRlZCBvcGVyYXRpb24ga2luZCcpO1xuICAgIGNvbnN0IGZpZWxkcyA9IHsgJ3dvcmtvdXQuY3JlYXRlJzogWydleGVyY2lzZUlkJywgJ3NldHMnLCAnbm90ZXMnXSwgJ3dvcmtvdXQuYXBwZW5kU2V0JzogWydsb2dJZCcsICdleHBlY3RlZFZlcnNpb24nLCAnc2V0cyddLFxuICAgICAgICAnd29ya291dC5yZXBsYWNlU2V0cyc6IFsnbG9nSWQnLCAnZXhwZWN0ZWRWZXJzaW9uJywgJ3NldHMnLCAnY2hhbmdlcycsICdyZXNvbHV0aW9uJ10sICd3b3Jrb3V0LmRlbGV0ZSc6IFsnbG9nSWQnLCAnZXhwZWN0ZWRWZXJzaW9uJywgJ3Jlc29sdXRpb24nXSwgJ3Jlc3QuY3JlYXRlJzogWydub3RlJ10gfTtcbiAgICBleGFjdChpbnB1dCwgWy4uLmNvbW1vbiwgLi4uZmllbGRzW2tpbmRdXSwgJ29wZXJhdGlvbicpO1xuICAgIGNvbnN0IGlkID0gb3BlcmF0aW9uSWQoaW5wdXQub3BlcmF0aW9uSWQpLCBwZXJmb3JtZWRBdCA9IGluc3RhbnQoaW5wdXQucGVyZm9ybWVkQXQpO1xuICAgIGlmIChpbnB1dC5zb3VyY2UgIT09ICdwd2EnICYmIGlucHV0LnNvdXJjZSAhPT0gJ3Nob3J0Y3V0JylcbiAgICAgICAgZmFpbCgnc291cmNlJywgJ3NvdXJjZSBtdXN0IGJlIHB3YSBvciBzaG9ydGN1dCcpO1xuICAgIGNvbnN0IGlkZW50aXR5ID0geyBvcGVyYXRpb25JZDogaWQsIHNvdXJjZTogaW5wdXQuc291cmNlLCBwZXJmb3JtZWRBdCwgcGVyZm9ybWVkRGF5OiBjb250ZXh0Lm1leGljb0NpdHlEYXRlU3RyKG5ldyBEYXRlKHBlcmZvcm1lZEF0KSkgfTtcbiAgICBpZiAoa2luZCA9PT0gJ3Jlc3QuY3JlYXRlJylcbiAgICAgICAgcmV0dXJuIHsgLi4uaWRlbnRpdHksIGtpbmQsIG5vdGU6IHRleHQoaW5wdXQubm90ZSwgJ0TDrWEgZGUgZGVzY2Fuc28nLCAnbm90ZScpIH07XG4gICAgY29uc3QgcmVzb3VyY2VJZCA9IGlkZW50aWZpZXIoa2luZCA9PT0gJ3dvcmtvdXQuY3JlYXRlJyA/IGlucHV0LmV4ZXJjaXNlSWQgOiBpbnB1dC5sb2dJZCwga2luZCA9PT0gJ3dvcmtvdXQuY3JlYXRlJyA/ICdleGVyY2lzZUlkJyA6ICdsb2dJZCcpO1xuICAgIGNvbnN0IHZlcnNpb24gPSBpbnB1dC5leHBlY3RlZFZlcnNpb247XG4gICAgaWYgKGtpbmQgIT09ICd3b3Jrb3V0LmNyZWF0ZScgJiYgIWlzU2Vzc2lvblZlcnNpb24odmVyc2lvbikpXG4gICAgICAgIGZhaWwoJ2V4cGVjdGVkVmVyc2lvbicsICdleHBlY3RlZFZlcnNpb24gbXVzdCBiZSB0aGUgY3VycmVudCBzZXNzaW9uVmVyc2lvbicpO1xuICAgIGNvbnN0IHJlc29sdXRpb24gPSBpbnB1dC5yZXNvbHV0aW9uID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBwYXJzZVJlc29sdXRpb24oaW5wdXQucmVzb2x1dGlvbik7XG4gICAgaWYgKHJlc29sdXRpb24/Lm9yaWdpbmFsT3BlcmF0aW9uSWQgPT09IGlkKVxuICAgICAgICBmYWlsKCdyZXNvbHV0aW9uJywgJ0EgcmVzb2x1dGlvbiByZXF1aXJlcyBhIG5ldyBvcGVyYXRpb25JZCcpO1xuICAgIC8vIFRoaXMgc2Vjb25kIGJyYW5jaCBuYXJyb3dzIHRoZSB2ZXJzaW9uIHdpdGhvdXQgYXNzZXJ0aW5nIHVuY2hlY2tlZCBkYXRhLlxuICAgIGlmIChraW5kID09PSAnd29ya291dC5kZWxldGUnICYmIGlzU2Vzc2lvblZlcnNpb24odmVyc2lvbikpXG4gICAgICAgIHJldHVybiB7IC4uLmlkZW50aXR5LCBraW5kLCBsb2dJZDogcmVzb3VyY2VJZCwgZXhwZWN0ZWRWZXJzaW9uOiB2ZXJzaW9uLCAuLi4ocmVzb2x1dGlvbiA/IHsgcmVzb2x1dGlvbiB9IDoge30pIH07XG4gICAgaWYgKGtpbmQgPT09ICd3b3Jrb3V0LnJlcGxhY2VTZXRzJyAmJiBpbnB1dC5jaGFuZ2VzICE9PSB1bmRlZmluZWQgJiYgaXNTZXNzaW9uVmVyc2lvbih2ZXJzaW9uKSkge1xuICAgICAgICBpZiAoaW5wdXQuc2V0cyAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgZmFpbCgnc2V0cycsICdVc2UgY2hhbmdlcyBvciBzZXRzLCBuZXZlciBib3RoJyk7XG4gICAgICAgIHJldHVybiB7IC4uLmlkZW50aXR5LCBraW5kLCBsb2dJZDogcmVzb3VyY2VJZCwgZXhwZWN0ZWRWZXJzaW9uOiB2ZXJzaW9uLCBjaGFuZ2VzOiBwYXJzZUNoYW5nZXMoaW5wdXQuY2hhbmdlcyksIC4uLihyZXNvbHV0aW9uID8geyByZXNvbHV0aW9uIH0gOiB7fSkgfTtcbiAgICB9XG4gICAgaWYgKGlucHV0LnJlc29sdXRpb24gIT09IHVuZGVmaW5lZClcbiAgICAgICAgZmFpbCgncmVzb2x1dGlvbicsICdSZXNvbHV0aW9uIHJlcXVpcmVzIGEgcGFydGlhbCBwYXRjaCcpO1xuICAgIGNvbnN0IHBhcnNlZCA9IGNvbnRleHQuc2FuaXRpemVTZXRzKHJlYWRTZXRJbnB1dChpbnB1dC5zZXRzKSk7XG4gICAgaWYgKHBhcnNlZC5lcnJvcilcbiAgICAgICAgZmFpbCgnc2V0cycsIHBhcnNlZC5lcnJvcik7XG4gICAgaWYgKCFwYXJzZWQuc2V0cylcbiAgICAgICAgZmFpbCgnc2V0cycsICdzZXRzIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICBjb25zdCBzZXRzID0gcGFyc2VkLnNldHM7XG4gICAgaWYgKGtpbmQgPT09ICd3b3Jrb3V0LmFwcGVuZFNldCcgJiYgc2V0cy5sZW5ndGggIT09IDEpXG4gICAgICAgIGZhaWwoJ3NldHMnLCAnYXBwZW5kU2V0IHJlcXVpcmVzIGV4YWN0bHkgb25lIHNldCcpO1xuICAgIGlmIChraW5kID09PSAnd29ya291dC5jcmVhdGUnKSB7XG4gICAgICAgIGlmICghc2V0cy5zb21lKHNldCA9PiBzZXQud2VpZ2h0ID4gMCAmJiBzZXQucmVwcyA+IDApKVxuICAgICAgICAgICAgZmFpbCgnc2V0cycsICdBdCBsZWFzdCBvbmUgc2V0IHdpdGggd29yayBpcyByZXF1aXJlZCcpO1xuICAgICAgICByZXR1cm4geyAuLi5pZGVudGl0eSwga2luZCwgZXhlcmNpc2VJZDogcmVzb3VyY2VJZCwgbm90ZXM6IHRleHQoaW5wdXQubm90ZXMsIG51bGwsICdub3RlcycpLCBzZXRzIH07XG4gICAgfVxuICAgIGlmICgoa2luZCA9PT0gJ3dvcmtvdXQuYXBwZW5kU2V0JyB8fCBraW5kID09PSAnd29ya291dC5yZXBsYWNlU2V0cycpICYmIGlzU2Vzc2lvblZlcnNpb24odmVyc2lvbikpXG4gICAgICAgIHJldHVybiB7IC4uLmlkZW50aXR5LCBraW5kLCBsb2dJZDogcmVzb3VyY2VJZCwgZXhwZWN0ZWRWZXJzaW9uOiB2ZXJzaW9uLCBzZXRzIH07XG4gICAgcmV0dXJuIGZhaWwoJ2tpbmQnLCAnVW5zdXBwb3J0ZWQgb3BlcmF0aW9uIGtpbmQnKTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXdvcmtvdXRPcGVyYXRpb25zLmpzLm1hcCIsImltcG9ydCB7IGlzUmVjb3JkIH0gZnJvbSAnLi4vdmFsaWRhdGlvbi9wcmltaXRpdmVzLmpzJztcbmltcG9ydCB7IENvbnRyYWN0VmFsaWRhdGlvbkVycm9yIH0gZnJvbSAnLi4vdmFsaWRhdGlvbi9yZXN1bHRzLmpzJztcbmV4cG9ydCBjbGFzcyBSb3V0aW5lVmFsaWRhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICAgIHN0YXR1cyA9IDQwMDtcbiAgICBkZXRhaWxzO1xuICAgIGNvbnN0cnVjdG9yKHBhdGgsIG1lc3NhZ2UpIHtcbiAgICAgICAgc3VwZXIoYCR7cGF0aH06ICR7bWVzc2FnZX1gKTtcbiAgICAgICAgdGhpcy5kZXRhaWxzID0gW3sgcGF0aCwgbWVzc2FnZSB9XTtcbiAgICB9XG59XG5jb25zdCBJTlRfTUFYID0gMjE0NzQ4MzY0NztcbmZ1bmN0aW9uIGZhaWwocGF0aCwgbWVzc2FnZSkgeyB0aHJvdyBuZXcgUm91dGluZVZhbGlkYXRpb25FcnJvcihwYXRoLCBtZXNzYWdlKTsgfVxuZnVuY3Rpb24gdGV4dCh2YWx1ZSwgcGF0aCkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnIHx8ICF2YWx1ZS50cmltKCkpXG4gICAgICAgIGZhaWwocGF0aCwgJ2RlYmUgc2VyIHRleHRvIG5vIHZhY8OtbycpO1xuICAgIHJldHVybiB2YWx1ZS50cmltKCk7XG59XG5mdW5jdGlvbiBudWxsYWJsZVRleHQodmFsdWUsIHBhdGgpIHtcbiAgICBpZiAodmFsdWUgPT09IG51bGwpXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKVxuICAgICAgICBmYWlsKHBhdGgsICdkZWJlIHNlciB0ZXh0byBvIG51bGwnKTtcbiAgICByZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiBpbnRlZ2VyKHZhbHVlLCBwYXRoLCBtaW4gPSAwKSB7XG4gICAgY29uc3QgbiA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgL15bKy1dPyg/OlxcZCsoPzpcXC5cXGQqKT98XFwuXFxkKykoPzpbZUVdWystXT9cXGQrKT8kLy50ZXN0KHZhbHVlLnRyaW0oKSkgPyBOdW1iZXIodmFsdWUudHJpbSgpKSA6IHZhbHVlO1xuICAgIGlmICh0eXBlb2YgbiAhPT0gJ251bWJlcicgfHwgIU51bWJlci5pc0ludGVnZXIobikgfHwgbiA8IG1pbiB8fCBuID4gSU5UX01BWClcbiAgICAgICAgZmFpbChwYXRoLCBgZGViZSBzZXIgdW4gZW50ZXJvIGVudHJlICR7bWlufSB5ICR7SU5UX01BWH1gKTtcbiAgICByZXR1cm4gbjtcbn1cbmZ1bmN0aW9uIGJvb2xlYW4odmFsdWUsIHBhdGgpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlICE9PSAnYm9vbGVhbicpXG4gICAgICAgIGZhaWwocGF0aCwgJ2RlYmUgc2VyIGJvb2xlYW5vICh0cnVlL2ZhbHNlKScpO1xuICAgIHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHJlcHModmFsdWUsIHBhdGgpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJylcbiAgICAgICAgcmV0dXJuIFN0cmluZyhpbnRlZ2VyKHZhbHVlLCBwYXRoLCAxKSk7XG4gICAgY29uc3QgcyA9IHRleHQodmFsdWUsIHBhdGgpO1xuICAgIGlmICgvXkFNUkFQJC9pLnRlc3QocykpXG4gICAgICAgIHJldHVybiAnQU1SQVAnO1xuICAgIGNvbnN0IG1hdGNoID0gcy5tYXRjaCgvXihcXGQrKSg/OlxccypbLeKAk+KAlF1cXHMqKFxcZCspKT8kLyk7XG4gICAgaWYgKCFtYXRjaClcbiAgICAgICAgZmFpbChwYXRoLCAndXNhIHJlcGV0aWNpb25lcyBwb3NpdGl2YXMsIHVuIHJhbmdvIGNvbW8gNC02IG8gQU1SQVAnKTtcbiAgICBjb25zdCBsb3cgPSBpbnRlZ2VyKG1hdGNoWzFdLCBwYXRoLCAxKSwgaGlnaCA9IG1hdGNoWzJdID09PSB1bmRlZmluZWQgPyBsb3cgOiBpbnRlZ2VyKG1hdGNoWzJdLCBwYXRoLCAxKTtcbiAgICBpZiAobG93ID4gaGlnaClcbiAgICAgICAgZmFpbChwYXRoLCAnZWwgaW5pY2lvIGRlbCByYW5nbyBubyBwdWVkZSBzdXBlcmFyIGVsIGZpbmFsJyk7XG4gICAgcmV0dXJuIG1hdGNoWzJdID09PSB1bmRlZmluZWQgPyBTdHJpbmcobG93KSA6IGAke2xvd30tJHtoaWdofWA7XG59XG5leHBvcnQgY29uc3QgbXVzY2xlR3JvdXBzID0gWydQZWNobycsICdFc3BhbGRhJywgJ0hvbWJyb3MnLCAnUGllcm5hcycsICdCw61jZXBzJywgJ1Ryw61jZXBzJywgJ0FudGVicmF6b3MnLCAnQ29yZSddO1xuZnVuY3Rpb24ga2V5KHZhbHVlKSB7IHJldHVybiB2YWx1ZS50b0xvd2VyQ2FzZSgpLm5vcm1hbGl6ZSgnTkZEJykucmVwbGFjZSgvW1xcdTAzMDAtXFx1MDM2Zl0vZywgJycpOyB9XG5jb25zdCBtdXNjbGVzID0gbmV3IE1hcChtdXNjbGVHcm91cHMubWFwKHZhbHVlID0+IFtrZXkodmFsdWUpLCB2YWx1ZV0pKTtcblsnY2hlc3QnLCAnYmFjaycsICdzaG91bGRlcnMnLCAnbGVncycsICdiaWNlcHMnLCAndHJpY2VwcycsICdmb3JlYXJtcycsICdjb3JlJ10uZm9yRWFjaCgodmFsdWUsIGkpID0+IG11c2NsZXMuc2V0KHZhbHVlLCBtdXNjbGVHcm91cHNbaV0pKTtcbm11c2NsZXMuc2V0KCdjb3JlIC8gYWJkb21lbicsICdDb3JlJyk7XG5mdW5jdGlvbiBtdXNjbGUodmFsdWUsIHBhdGgpIHtcbiAgICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09ICcnIHx8IHZhbHVlID09PSAnZGVmYXVsdCcpXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBtdXNjbGVzLmdldChrZXkodGV4dCh2YWx1ZSwgcGF0aCkpKTtcbiAgICBpZiAoIW5vcm1hbGl6ZWQpXG4gICAgICAgIGZhaWwocGF0aCwgJ2dydXBvIG11c2N1bGFyIGZ1ZXJhIGRlbCBjYXTDoWxvZ28gYWN0dWFsJyk7XG4gICAgcmV0dXJuIG5vcm1hbGl6ZWQ7XG59XG5mdW5jdGlvbiBhbGlhcyhpbnB1dCwgY2Fub25pY2FsLCBsZWdhY3ksIG5vcm1hbGl6ZSwgZmFsbGJhY2ssIHBhdGgpIHtcbiAgICBjb25zdCBoYXNDYW5vbmljYWwgPSBpbnB1dFtjYW5vbmljYWxdICE9PSB1bmRlZmluZWQsIGhhc0xlZ2FjeSA9IGlucHV0W2xlZ2FjeV0gIT09IHVuZGVmaW5lZDtcbiAgICBpZiAoIWhhc0Nhbm9uaWNhbCAmJiAhaGFzTGVnYWN5KVxuICAgICAgICByZXR1cm4gZmFsbGJhY2s7XG4gICAgY29uc3QgYSA9IGhhc0Nhbm9uaWNhbCA/IG5vcm1hbGl6ZShpbnB1dFtjYW5vbmljYWxdLCBgJHtwYXRofS4ke2Nhbm9uaWNhbH1gKSA6IGZhbGxiYWNrO1xuICAgIGNvbnN0IGIgPSBoYXNMZWdhY3kgPyBub3JtYWxpemUoaW5wdXRbbGVnYWN5XSwgYCR7cGF0aH0uJHtsZWdhY3l9YCkgOiBmYWxsYmFjaztcbiAgICBpZiAoaGFzQ2Fub25pY2FsICYmIGhhc0xlZ2FjeSAmJiBhICE9PSBiKVxuICAgICAgICBmYWlsKGAke3BhdGh9LiR7Y2Fub25pY2FsfWAsIGBjb25mbGljdG8gZW50cmUgJHtjYW5vbmljYWx9IHkgJHtsZWdhY3l9YCk7XG4gICAgcmV0dXJuIGhhc0Nhbm9uaWNhbCA/IGEgOiBiO1xufVxuLyoqIFBoYXNlIDEuNCBub3JtYWxpemVyIHJlbG9jYXRlZCwgbm90IGEgY29tcGV0aW5nIG5vcm1hbGl6ZXIuIFVua25vd24gaW5wdXRcbiAqIGZpZWxkcyBhcmUgcHJvdmVuYW5jZS9leHRlbnNpb25zOyBvbmx5IGl0cyBoaXN0b3JpY2FsIHBlcnNpc3RlbmNlIHByb2plY3Rpb25cbiAqIGxlYXZlcyB0aGlzIGV4cGxpY2l0IGJvdW5kYXJ5LiBUaGUgaW5wdXQgb2JqZWN0IGlzIG5ldmVyIGNoYW5nZWQuICovXG5leHBvcnQgZnVuY3Rpb24gbm9ybWFsaXplSW1wb3J0ZWRFeGVyY2lzZShpbnB1dCwgaW5kZXggPSAwLCBwYXRoID0gJ2V4ZXJjaXNlJykge1xuICAgIGlmICghaXNSZWNvcmQoaW5wdXQpKVxuICAgICAgICBmYWlsKHBhdGgsICdkZWJlIHNlciB1biBvYmpldG8nKTtcbiAgICByZXR1cm4geyBuYW1lOiB0ZXh0KGlucHV0Lm5hbWUsIGAke3BhdGh9Lm5hbWVgKSwgbXVzY2xlR3JvdXA6IGFsaWFzKGlucHV0LCAnbXVzY2xlR3JvdXAnLCAnbXVzY2xlJywgbXVzY2xlLCBudWxsLCBwYXRoKSxcbiAgICAgICAgdGFyZ2V0U2V0czogYWxpYXMoaW5wdXQsICd0YXJnZXRTZXRzJywgJ3NldHMnLCAodiwgcCkgPT4gaW50ZWdlcih2LCBwLCAxKSwgMywgcGF0aCksXG4gICAgICAgIHRhcmdldFJlcHM6IGFsaWFzKGlucHV0LCAndGFyZ2V0UmVwcycsICdyZXBzJywgcmVwcywgJzgtMTInLCBwYXRoKSxcbiAgICAgICAgcmVzdFNlY29uZHM6IGFsaWFzKGlucHV0LCAncmVzdFNlY29uZHMnLCAncmVzdCcsICh2LCBwKSA9PiB2ID09PSBudWxsID8gbnVsbCA6IGludGVnZXIodiwgcCksIG51bGwsIHBhdGgpLFxuICAgICAgICBpc1VuaWxhdGVyYWw6IGlucHV0LmlzVW5pbGF0ZXJhbCAhPT0gdW5kZWZpbmVkID8gYm9vbGVhbihpbnB1dC5pc1VuaWxhdGVyYWwsIGAke3BhdGh9LmlzVW5pbGF0ZXJhbGApIDogZmFsc2UsXG4gICAgICAgIG5vdGU6IGlucHV0Lm5vdGUgIT09IHVuZGVmaW5lZCA/IG51bGxhYmxlVGV4dChpbnB1dC5ub3RlLCBgJHtwYXRofS5ub3RlYCkgOiBudWxsLFxuICAgICAgICBvcmRlcjogaW5wdXQub3JkZXIgIT09IHVuZGVmaW5lZCA/IGludGVnZXIoaW5wdXQub3JkZXIsIGAke3BhdGh9Lm9yZGVyYCkgOiBpbmRleCB9O1xufVxuZnVuY3Rpb24gaXNJbXBvcnRlZEV4ZXJjaXNlKHZhbHVlKSB7XG4gICAgaWYgKCFpc1JlY29yZCh2YWx1ZSkpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplSW1wb3J0ZWRFeGVyY2lzZSh2YWx1ZSk7XG4gICAgICAgIHJldHVybiBPYmplY3QuZW50cmllcyhub3JtYWxpemVkKS5ldmVyeSgoW2ZpZWxkLCBleHBlY3RlZF0pID0+IHZhbHVlW2ZpZWxkXSA9PT0gZXhwZWN0ZWQpO1xuICAgIH1cbiAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgaWYgKGVycm9yIGluc3RhbmNlb2YgUm91dGluZVZhbGlkYXRpb25FcnJvcilcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufVxuZXhwb3J0IGZ1bmN0aW9uIGlzUm91dGluZUltcG9ydFJlc3BvbnNlKHZhbHVlKSB7XG4gICAgaWYgKCFpc1JlY29yZCh2YWx1ZSkgfHwgIWlzUmVjb3JkKHZhbHVlLnJvdXRpbmUpKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgY29uc3Qgcm91dGluZSA9IHZhbHVlLnJvdXRpbmU7XG4gICAgcmV0dXJuIHR5cGVvZiByb3V0aW5lLm5hbWUgPT09ICdzdHJpbmcnICYmIChyb3V0aW5lLmRlc2NyaXB0aW9uID09PSBudWxsIHx8IHR5cGVvZiByb3V0aW5lLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJylcbiAgICAgICAgJiYgQXJyYXkuaXNBcnJheShyb3V0aW5lLmRheXMpICYmIHJvdXRpbmUuZGF5cy5ldmVyeShkYXkgPT4gaXNSZWNvcmQoZGF5KSAmJiB0eXBlb2YgZGF5LmRheU5hbWUgPT09ICdzdHJpbmcnXG4gICAgICAgICYmIChkYXkud2Vla2RheSA9PT0gbnVsbCB8fCB0eXBlb2YgZGF5LndlZWtkYXkgPT09ICdudW1iZXInICYmIE51bWJlci5pc0ludGVnZXIoZGF5LndlZWtkYXkpICYmIGRheS53ZWVrZGF5ID49IDAgJiYgZGF5LndlZWtkYXkgPD0gNilcbiAgICAgICAgJiYgdHlwZW9mIGRheS5pc1Jlc3REYXkgPT09ICdib29sZWFuJyAmJiB0eXBlb2YgZGF5Lm9yZGVyID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNJbnRlZ2VyKGRheS5vcmRlcikgJiYgZGF5Lm9yZGVyID49IDBcbiAgICAgICAgJiYgQXJyYXkuaXNBcnJheShkYXkuZXhlcmNpc2VzKSAmJiBkYXkuZXhlcmNpc2VzLmV2ZXJ5KGlzSW1wb3J0ZWRFeGVyY2lzZSkpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRSb3V0aW5lSW1wb3J0UmVzcG9uc2UodmFsdWUpIHtcbiAgICBpZiAoIWlzUm91dGluZUltcG9ydFJlc3BvbnNlKHZhbHVlKSlcbiAgICAgICAgdGhyb3cgbmV3IENvbnRyYWN0VmFsaWRhdGlvbkVycm9yKCdJTkNPTVBBVElCTEVfQVBJX1JFU1BPTlNFJywgJ3JvdXRpbmUnLCAnUmVzcHVlc3RhIGRlIGltcG9ydGFjacOzbiBpbmNvbXBhdGlibGU7IGNvbnNlcnZhIGVsIEpTT04gb3JpZ2luYWwuJyk7XG4gICAgcmV0dXJuIHZhbHVlO1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cm91dGluZXMuanMubWFwIl0sIm5hbWVzIjpbImZhaWwiLCJrZXkiLCJpbnRlZ2VyIiwidGV4dCIsInZhbHVlIiwicmVzb2x1dGlvbiJdLCJtYXBwaW5ncyI6Ijs7QUFBTyxNQUFNLGdDQUFnQyxNQUFNO0FBQUEsRUFDL0M7QUFBQSxFQUNBO0FBQUEsRUFDQSxZQUFZLE1BQU0sTUFBTSxTQUFTO0FBQzdCLFVBQU0sT0FBTztBQUNiLFNBQUssT0FBTztBQUNaLFNBQUssT0FBTztBQUNaLFNBQUssU0FBUyxDQUFDLEVBQUUsTUFBTSxRQUFPLENBQUU7QUFBQSxFQUNwQztBQUNKO0FDUk8sU0FBU0EsT0FBSyxNQUFNLFNBQVMsT0FBTyxxQkFBcUI7QUFDNUQsUUFBTSxJQUFJLHdCQUF3QixNQUFNLE1BQU0sT0FBTztBQUN6RDtBQUNPLFNBQVMsU0FBUyxPQUFPO0FBQzVCLFNBQU8sVUFBVSxRQUFRLE9BQU8sVUFBVSxZQUFZLENBQUMsTUFBTSxRQUFRLEtBQUs7QUFDOUU7QUFDTyxTQUFTLE9BQU8sT0FBTyxNQUFNO0FBQ2hDLE1BQUksQ0FBQyxTQUFTLEtBQUs7QUFDZkEsV0FBSyxNQUFNLEdBQUcsSUFBSSxvQkFBb0I7QUFDMUMsU0FBTztBQUNYO0FBQ08sU0FBUyxNQUFNLE9BQU8sU0FBUyxNQUFNLGlCQUFpQixNQUFNO0FB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
