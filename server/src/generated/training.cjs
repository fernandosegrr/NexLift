// GENERATED from TypeScript by npm run build:typed; do not edit.
"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
function rirToStoredRpe(rir) {
  return { kind: "stored-rpe", value: 10 - rir.value };
}
function storedRpeToRir(rpe) {
  return { kind: "inferred-rir", value: 10 - rpe.value };
}
function formRirToStoredRpe(rir) {
  return rir == null ? null : rirToStoredRpe({ value: rir }).value;
}
function storedRpeToFormRir(rpe) {
  return rpe == null ? null : storedRpeToRir({ value: rpe }).value;
}
function shortcutFloat(value) {
  if (typeof value === "symbol")
    throw new TypeError("Cannot convert a Symbol value to a string");
  return parseFloat(String(value));
}
function convertLegacyShortcutRir(rawRir) {
  return rawRir != null && Number.isFinite(shortcutFloat(rawRir)) ? 10 - shortcutFloat(rawRir) : null;
}
function parseLegacyShortcutEffort(body) {
  const invalid = { state: "invalid", error: "RIR inválido (usa 0-4, reps en recámara)" };
  const hasRir = body.rir != null && String(body.rir).trim() !== "";
  const hasRpe = body.rpe != null && String(body.rpe).trim() !== "";
  if (hasRir) {
    const rawRir = shortcutFloat(body.rir);
    if (!Number.isFinite(rawRir) || rawRir < 0 || rawRir > 4)
      return invalid;
    return { state: "interpreted", context: "legacy-shortcut", interpretation: "explicit-rir", rawRir, storedRpe: 10 - rawRir };
  }
  if (hasRpe) {
    const parsed = shortcutFloat(body.rpe);
    if (!Number.isFinite(parsed))
      return invalid;
    if (parsed >= 0 && parsed <= 4)
      return { state: "interpreted", context: "legacy-shortcut", interpretation: "legacy-rpe-as-rir", rawRir: parsed, storedRpe: 10 - parsed };
    if (parsed >= 6 && parsed <= 10)
      return { state: "interpreted", context: "legacy-shortcut", interpretation: "stored-rpe", rawRir: 10 - parsed, storedRpe: parsed };
    return invalid;
  }
  return { state: "interpreted", context: "legacy-shortcut", interpretation: "missing-default", rawRir: 0, storedRpe: 10 };
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
function cappedEpley1RM(weight, reps) {
  const w = Number(weight) || 0;
  let r = Number(reps) || 0;
  if (w <= 0 || r <= 0)
    return 0;
  if (r === 1)
    return w;
  if (r > 36)
    r = 36;
  return w * (1 + r / 30);
}
function personalRecordEpley1RM(weightKg, repetitions) {
  return repetitions > 1 && repetitions < 37 ? weightKg * (1 + repetitions / 30) : weightKg;
}
function selectHistoricalPersonalRecord(logs) {
  let best = null;
  for (const log of logs) {
    for (const s of log.sets) {
      const candidates = [{ w: s.weight, r: s.reps }];
      if (s.weightRight != null || s.repsRight != null) {
        candidates.push({ w: s.weightRight ?? s.weight, r: s.repsRight ?? s.reps });
      }
      for (const c of candidates) {
        const w = Number(c.w) || 0;
        const r = Number(c.r) || 0;
        if (w <= 0 || r <= 0)
          continue;
        const est = personalRecordEpley1RM(w, r);
        if (!best || est > best.est1RM)
          best = { weight: w, reps: r, est1RM: est, date: log.date };
      }
    }
  }
  return best;
}
function abstain(mode, reason) {
  return { recommendation: null, explanation: { mode, rule: "abstain", reason } };
}
function allHaveKnownRir(sets) {
  return !sets.some((s) => s.rir == null || !Number.isFinite(s.rir));
}
function weightGrid(increment, base) {
  return Math.abs(base % increment) < 0.01 ? increment : 0.5;
}
function legacyArithmeticNumber(value) {
  if (typeof value === "object" && value !== null || typeof value === "function") {
    const exotic = Reflect.get(value, Symbol.toPrimitive);
    if (exotic != null) {
      if (typeof exotic !== "function")
        throw new TypeError("Cannot convert object to primitive value");
      const primitive = Reflect.apply(exotic, value, ["number"]);
      if (Object(primitive) === primitive)
        throw new TypeError("Cannot convert object to primitive value");
      return legacyArithmeticNumber(primitive);
    }
    for (const key of ["valueOf", "toString"]) {
      const method = Reflect.get(value, key);
      if (typeof method !== "function")
        continue;
      const primitive = Reflect.apply(method, value, []);
      if (Object(primitive) !== primitive)
        return legacyArithmeticNumber(primitive);
    }
    throw new TypeError("Cannot convert object to primitive value");
  }
  if (typeof value === "bigint")
    throw new TypeError("Cannot mix BigInt and other types, use explicit conversions");
  return Number(value);
}
function adjustRepRangeForPhase(lo, hi, phase) {
  if (phase === "intensification") {
    const newLo = Math.max(1, Math.round(lo * 0.5));
    return { lo: newLo, hi: Math.max(newLo, Math.round(hi * 0.5)) };
  }
  if (phase === "accumulation") {
    return { lo, hi: Math.round(hi * 1.5) };
  }
  return { lo, hi };
}
function parseRepRange(targetReps) {
  const nums = String(targetReps || "").match(/\d+/g);
  if (!nums)
    return { lo: 8, hi: 12 };
  const a = parseInt(nums[0], 10);
  const b = nums[1] ? parseInt(nums[1], 10) : a;
  return { lo: Math.min(a, b), hi: Math.max(a, b) };
}
const LEGS_NAME_RE = /sentadilla|prensa|hack|femoral|cuadr[ií]cep|aductor|abductor|gemelo|pantorrilla|zancada|b[uú]lgara|hip\s*thrust|peso\s*muerto|deadlift|\bleg\b|extensi[oó]n(es)?\s+de\s+cu[aá]/i;
function resolveWeightIncrement(muscleGroup, exerciseName = "") {
  if (muscleGroup === "Piernas" || muscleGroup === "legs")
    return 5;
  if (!muscleGroup && LEGS_NAME_RE.test(exerciseName || ""))
    return 5;
  return 2.5;
}
function effectiveWorkoutSet(set) {
  const w = Number(set.weight) || 0;
  const r = Number(set.reps) || 0;
  const hasRight = set.weightRight != null || set.repsRight != null;
  const wR = set.weightRight != null ? Number(set.weightRight) : w;
  const rR = set.repsRight != null ? Number(set.repsRight) : r;
  const rir = set.rpe != null ? storedRpeToRir({ value: legacyArithmeticNumber(set.rpe) }).value : set.rir != null ? set.rir : null;
  return {
    weight: hasRight ? Math.min(w, wR) : w,
    reps: hasRight ? Math.min(r, rR) : r,
    rir
  };
}
function roundWorkoutWeight(w, increment, base) {
  const grid = Math.abs(base % increment) < 0.01 ? increment : 0.5;
  return Math.round(w / grid) * grid;
}
function pickWorkReference(working, lo) {
  if (!working || working.length === 0)
    return null;
  const nonEgo = lo > 3 ? working.filter((s) => s.reps >= 3) : working;
  const baseWorking = nonEgo.length > 0 ? nonEgo : working;
  const maxW = Math.max(...baseWorking.map((s) => s.weight));
  const main = baseWorking.filter((s) => s.weight >= maxW * 0.75);
  const pool = main.length > 0 ? main : baseWorking;
  const topWeight = Math.max(...pool.map((s) => s.weight));
  const atTopWeight = pool.filter((s) => Math.abs(s.weight - topWeight) < 0.01);
  const hasHeavyTopSet = atTopWeight.some((s) => s.rir != null && Number(s.rir) <= 1);
  let refWeight;
  if (hasHeavyTopSet) {
    refWeight = topWeight;
  } else {
    let candidates = pool.filter((s) => s.reps >= lo);
    if (candidates.length === 0) {
      const maxReps = Math.max(...pool.map((s) => s.reps));
      candidates = pool.filter((s) => s.reps === maxReps);
    }
    if (candidates.length === 0)
      candidates = pool;
    refWeight = Math.max(...candidates.map((s) => s.weight));
  }
  const sameWeight = pool.filter((s) => Math.abs(s.weight - refWeight) < 0.01);
  const refReps = Math.max(...sameWeight.map((s) => s.reps));
  const knownRir = sameWeight.map((s) => s.rir).filter((v) => v != null);
  const rir = knownRir.length ? Math.min(...knownRir.map(legacyArithmeticNumber)) : null;
  const minReps = Math.min(...sameWeight.map((s) => s.reps));
  return { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight: sameWeight };
}
function evaluateWorkoutSuggestion(sessions, targetReps, increment, phase = null) {
  if (!sessions || sessions.length === 0)
    return abstain("inter", "empty-history");
  const resolvedPhase = phase && typeof phase === "object" ? phase.phase ?? null : phase ?? null;
  const parsedRange = parseRepRange(targetReps);
  const { lo, hi } = adjustRepRangeForPhase(parsedRange.lo, parsedRange.hi, resolvedPhase);
  const working = (sessions[0].sets || []).map(effectiveWorkoutSet).filter((s) => s.weight > 0 && s.reps > 0);
  if (working.length === 0)
    return abstain("inter", "no-positive-work");
  const ref = pickWorkReference(working, lo);
  if (!ref)
    return abstain("inter", "no-reference");
  const { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight } = ref;
  const allHitTop = setsAtWeight.every((s) => s.reps >= hi);
  const topSetPassed = setsAtWeight.find((s) => s.reps >= hi && s.rir != null && Number(s.rir) <= 1);
  let weight, reps, rationale;
  let rule;
  if (topSetPassed || allHitTop) {
    rule = topSetPassed && !allHitTop ? "top-set-passed" : "all-hit-top";
    weight = roundWorkoutWeight(refWeight + increment, increment, refWeight);
    reps = lo;
    if (topSetPassed && !allHitTop) {
      rationale = `Top Set superado (${refWeight}kg × ${topSetPassed.reps} a RIR ${topSetPassed.rir}): sube a ${weight}kg y reinicia en ${lo}.`;
    } else {
      rationale = setsAtWeight.length > 1 ? `Todas las series a ${refWeight}kg llegaron a ≥${hi} reps: sube a ${weight}kg y reinicia en ${lo}.` : `Alcanzaste ${refReps} reps con ${refWeight}kg (tope del rango): sube a ${weight}kg y reinicia en ${lo}.`;
    }
  } else if (refReps >= hi) {
    rule = "equalize-reps";
    weight = refWeight;
    reps = Math.min(hi, minReps + 1);
    rationale = `La mejor serie fue ${refWeight}kg × ${refReps}, pero no todas llegaron a ${hi}: mantén ${weight}kg y apunta a ${reps} en todas.`;
  } else {
    rule = refReps < lo ? "below-range-hold" : "progress-reps";
    const bump = rir != null && rir >= 3 ? 2 : 1;
    weight = refWeight;
    reps = Math.min(hi, refReps + bump);
    if (refReps < lo) {
      rationale = rir != null ? `Trabajo de referencia ${refWeight}kg × ${refReps} (RIR ${rir}), por debajo del rango ${lo}–${hi}: mantén el peso y apunta a ${reps} reps.` : `Trabajo de referencia ${refWeight}kg × ${refReps}, por debajo del rango ${lo}–${hi}: mantén el peso y apunta a ${reps} reps.`;
    } else {
      rationale = rir != null ? `Hiciste ${refWeight}kg × ${refReps} (RIR ${rir}): mantén el peso y apunta a ${reps} reps.` : `Hiciste ${refWeight}kg × ${refReps}: mantén el peso y apunta a ${reps} reps.`;
    }
  }
  if (weight <= 0 || reps <= 0)
    return abstain("inter", "nonpositive-result");
  return {
    recommendation: { weight, reps, rationale, basedOn: sessions.length, phase: resolvedPhase },
    explanation: {
      mode: "inter",
      rule,
      range: { lo, hi },
      historyCount: sessions.length,
      usedSessionIndex: 0,
      positiveSetCount: working.length,
      reference: { weight: refWeight, reps: refReps, minReps, rir, setsAtWeight: setsAtWeight.length },
      increment,
      rawWeight: topSetPassed || allHitTop ? refWeight + increment : refWeight,
      roundingGrid: topSetPassed || allHitTop ? weightGrid(increment, refWeight) : null,
      weightDelta: weight - refWeight,
      resultWeight: weight,
      limitations: ["first-session-only", "caller-order", "completed-not-filtered"]
    }
  };
}
function evaluateNextSetFromToday(completedToday, optsOrTargetReps = {}, legacyIncrement = 2.5, legacyPhase = null) {
  if (!completedToday || completedToday.length === 0)
    return abstain("intra", "empty-today");
  let lo = 8, hi = 12, increment = 2.5;
  let phase = null;
  if (typeof optsOrTargetReps === "string") {
    const parsed = parseRepRange(optsOrTargetReps);
    lo = parsed.lo;
    hi = parsed.hi;
    increment = typeof legacyIncrement === "number" ? legacyIncrement : 2.5;
    phase = legacyPhase && typeof legacyPhase === "object" ? legacyPhase.phase ?? null : legacyPhase ?? null;
  } else if (optsOrTargetReps && typeof optsOrTargetReps === "object") {
    lo = optsOrTargetReps.lo ?? 8;
    hi = optsOrTargetReps.hi ?? 12;
    increment = optsOrTargetReps.increment ?? 2.5;
    phase = optsOrTargetReps.phase ?? null;
  }
  const sets = completedToday.map((s) => ({
    weight: Number(s.weight) || 0,
    reps: Number(s.reps) || 0,
    rir: s.rir != null && s.rir !== "" ? Number(s.rir) : null
  })).filter((s) => s.weight > 0 && s.reps > 0);
  if (!sets.length)
    return abstain("intra", "no-positive-work");
  if (!allHaveKnownRir(sets))
    return abstain("intra", "missing-finite-rir");
  const knownSets = sets;
  const range = adjustRepRangeForPhase(lo, hi, phase);
  const adjLo = range.lo;
  const adjHi = range.hi;
  const last = knownSets[knownSets.length - 1];
  const first = knownSets[0];
  const minRir = Math.min(...knownSets.map((s) => s.rir));
  const avgRir = knownSets.reduce((a, s) => a + s.rir, 0) / sets.length;
  const rirDrop = first.rir - last.rir;
  const repDrop = first.reps - last.reps;
  let weight = last.weight;
  let reps = last.reps;
  let rationale;
  let rule;
  let rawWeight = last.weight;
  let roundingGrid = null;
  if (sets.length === 1 && first.rir <= 0) {
    rule = "first-failure-backoff";
    const rawBackoff = first.weight * 0.875;
    rawWeight = rawBackoff;
    roundingGrid = weightGrid(increment, first.weight);
    const roundedBackoff = roundWorkoutWeight(rawBackoff, increment, first.weight);
    weight = roundedBackoff < first.weight ? Math.max(increment > 0 ? increment : 0.5, roundedBackoff) : roundWorkoutWeight(Math.max(0.5, first.weight - Math.max(increment, 0.5)), increment, first.weight);
    reps = first.reps < adjHi ? Math.min(adjHi, Math.max(adjLo, first.reps + 2)) : first.reps + 1;
    rationale = `Top Set al fallo (RIR 0) → Back-off Set (-12.5%): ${weight} kg × ${reps} reps.`;
  } else if (last.rir <= 0 || last.reps < adjLo) {
    rule = last.rir <= 0 ? "last-failure-step" : "below-range-step";
    rawWeight = Math.max(0, last.weight - increment);
    roundingGrid = weightGrid(increment, last.weight);
    const stepped = roundWorkoutWeight(Math.max(0, last.weight - increment), increment, last.weight);
    weight = stepped < last.weight ? Math.max(increment > 0 ? increment : 0.5, stepped) : roundWorkoutWeight(Math.max(0.5, last.weight - Math.max(increment, 0.5)), increment, last.weight);
    reps = Math.min(adjHi, Math.max(adjLo, last.reps));
    rationale = last.rir <= 0 ? `Hoy RIR ${last.rir} en alguna serie → baja a ${weight} kg × ${reps}.` : `Reps bajo el rango ${adjLo}–${adjHi} → baja a ${weight} kg × ${reps}.`;
  } else if (last.rir === 1 || rirDrop >= 2 || repDrop >= 2 && last.rir <= 2) {
    rule = "fatigue-hold";
    weight = last.weight;
    reps = Math.min(adjHi, Math.max(adjLo, last.reps));
    rationale = `Fatiga de hoy (RIR min ${minRir}) → mantén ${weight} kg × ${reps}.`;
  } else if (avgRir >= 2.5 && minRir >= 2 && last.reps >= adjLo) {
    rule = "comfortable-reps";
    weight = last.weight;
    const bump = avgRir >= 3 ? 2 : 1;
    reps = Math.min(adjHi, last.reps + bump);
    if (reps > last.reps) {
      rationale = `Series de hoy cómodas (RIR min ${minRir}) → ${weight} kg × ${reps} (+${reps - last.reps} rep).`;
    } else {
      rationale = `Techo del rango ${adjLo}–${adjHi} con RIR alto → mantén ${weight} kg × ${reps}; la próxima sesión sube peso.`;
    }
  } else {
    rule = "neutral-hold";
    weight = last.weight;
    reps = Math.min(adjHi, Math.max(adjLo, last.reps));
    rationale = `Según series de hoy (RIR min ${minRir}) → ${weight} kg × ${reps}.`;
  }
  if (weight <= 0 || reps <= 0)
    return abstain("intra", "nonpositive-result");
  return {
    recommendation: { weight, reps, rationale, phase, source: "intra" },
    explanation: {
      mode: "intra",
      rule,
      range: { lo: adjLo, hi: adjHi },
      positiveSetCount: sets.length,
      first: { ...first },
      last: { ...last },
      minRir,
      avgRir,
      rirDrop,
      repDrop,
      increment,
      rawWeight,
      roundingGrid,
      resultWeight: weight,
      weightDelta: weight - last.weight,
      fallbackStep: roundingGrid != null && (rule === "first-failure-backoff" ? !(roundWorkoutWeight(rawWeight, increment, first.weight) < first.weight) : !(roundWorkoutWeight(rawWeight, increment, last.weight) < last.weight)),
      limitations: ["caller-order", "caller-completion-filter", "rir-required"]
    }
  };
}
function computeWorkoutSuggestion(sessions, targetReps, increment, phase = null) {
  return evaluateWorkoutSuggestion(sessions, targetReps, increment, phase).recommendation;
}
function suggestNextSetFromToday(completedToday, optsOrTargetReps = {}, legacyIncrement = 2.5, legacyPhase = null) {
  return evaluateNextSetFromToday(completedToday, optsOrTargetReps, legacyIncrement, legacyPhase).recommendation;
}
const TRAINING_TIMEZONE = "America/Mexico_City";
const civilFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TRAINING_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
const offsetFormatter = new Intl.DateTimeFormat("en-US", { timeZone: TRAINING_TIMEZONE, timeZoneName: "shortOffset" });
function trainingCivilDate(instant) {
  return civilFormatter.format(instant instanceof Date ? instant : new Date(instant));
}
function trainingUtcOffsetMinutes(instant) {
  const part = offsetFormatter.formatToParts(instant).find((p) => p.type === "timeZoneName")?.value || "GMT-6";
  const match = part.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!match)
    return -360;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (parseInt(match[2], 10) * 60 + (match[3] ? parseInt(match[3], 10) : 0));
}
function civilDayOfWeek(dateStr) {
  return (/* @__PURE__ */ new Date(`${dateStr}T12:00:00Z`)).getUTCDay();
}
function shiftTrainingCivilDate(dateStr, days) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !Number.isInteger(days))
    throw new RangeError("Invalid civil date/day count");
  const anchor = /* @__PURE__ */ new Date(`${dateStr}T12:00:00Z`);
  if (!Number.isFinite(anchor.getTime()) || anchor.toISOString().slice(0, 10) !== dateStr)
    throw new RangeError("Invalid civil date");
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}
function lastTrainingCivilDays(n, instant) {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError("Invalid civil day count");
  const today = trainingCivilDate(instant), days = [];
  for (let i = n - 1; i >= 0; i--)
    days.push(shiftTrainingCivilDate(today, -i));
  return days;
}
function legacyTrainingDayBounds(instant) {
  const dateStr = trainingCivilDate(instant), offsetMin = trainingUtcOffsetMinutes(instant);
  const sign = offsetMin <= 0 ? "-" : "+", abs = Math.abs(offsetMin);
  const offsetStr = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  const start = /* @__PURE__ */ new Date(`${dateStr}T00:00:00${offsetStr}`);
  return { start, end: new Date(start.getTime() + 864e5), dateStr };
}
function civilMidnight(dateStr) {
  const utc = (/* @__PURE__ */ new Date(`${dateStr}T00:00:00Z`)).getTime();
  let candidate = utc;
  for (let i = 0; i < 4; i++) {
    const next = utc - trainingUtcOffsetMinutes(new Date(candidate)) * 6e4;
    if (next === candidate)
      return new Date(next);
    candidate = next;
  }
  throw new RangeError("CDMX midnight did not resolve");
}
function trainingCivilDayBounds(instant) {
  const dateStr = trainingCivilDate(instant);
  return { start: civilMidnight(dateStr), end: civilMidnight(shiftTrainingCivilDate(dateStr, 1)), dateStr };
}
function trainingCivilWeek(instant) {
  const dateStr = trainingCivilDate(instant), weekday = civilDayOfWeek(dateStr);
  const startDay = shiftTrainingCivilDate(dateStr, -((weekday + 6) % 7));
  return { startDay, endDayExclusive: shiftTrainingCivilDate(startDay, 7) };
}
function addTrainingLoad(total, s, policy) {
  const pdf = policy === "legacy-pdf-zero-fallback";
  const w = pdf ? Number(s.weight) || 0 : Number(s.weight || 0);
  const r = pdf ? Number(s.reps) || 0 : Number(s.reps || 0);
  total += w * r;
  if (policy === "recorded-sides") {
    total += Number(s.weightRight || 0) * Number(s.repsRight || 0);
  } else if (policy !== "left-only" && (s.weightRight != null || s.repsRight != null)) {
    total += pdf ? (Number(s.weightRight) || w) * (Number(s.repsRight) || r) : Number(s.weightRight ?? s.weight ?? 0) * Number(s.repsRight ?? s.reps ?? 0);
  }
  return total;
}
function trainingLoadVolume(sets, policy) {
  let total = 0;
  for (const s of sets)
    total = addTrainingLoad(total, s, policy);
  return total;
}
function trainingSessionLoadSummary(sessions) {
  let total = 0, sets = 0;
  for (const session of sessions)
    for (const s of session.sets || []) {
      total = addTrainingLoad(total, s, "inherit-missing-right");
      sets++;
    }
  return { volume: total, sets };
}
function getActiveTrainingBlock(blocks) {
  const started = (blocks || []).filter((b) => b.startedAt != null);
  if (!started.length)
    return null;
  return started.reduce((latest, b) => b.startedAt && latest.startedAt && b.startedAt.getTime() > latest.startedAt.getTime() ? b : latest, started[0]);
}
function elapsedWeekInBlock(block, now) {
  if (!block?.startedAt)
    return null;
  const daysSince = Math.floor((now.getTime() - block.startedAt.getTime()) / 864e5);
  return Math.floor(daysSince / 7) + 1;
}
function routinePhaseStatusAt(routine, now) {
  const activeBlock = getActiveTrainingBlock(routine.blocks || []);
  if (activeBlock)
    return { isDeload: activeBlock.phase === "deload", source: "block", phase: activeBlock.phase, block: activeBlock };
  if (routine.adaptiveDeloadUntil && routine.adaptiveDeloadUntil.getTime() > now.getTime()) {
    return { isDeload: true, source: "adaptive", phase: "deload", until: routine.adaptiveDeloadUntil };
  }
  return { isDeload: false, source: null, phase: null };
}
const STOPWORDS = /* @__PURE__ */ new Set(["de", "del", "la", "el", "los", "las", "en", "o", "u", "y", "a", "con", "al", "para", "una", "un"]);
const MUSCLE_WORDS = /* @__PURE__ */ new Set([
  "biceps",
  "triceps",
  "pecho",
  "pectoral",
  "pectorales",
  "espalda",
  "dorsal",
  "dorsales",
  "hombro",
  "hombros",
  "deltoides",
  "pierna",
  "piernas",
  "cuadriceps",
  "cuadricep",
  "femoral",
  "femorales",
  "gluteo",
  "gluteos",
  "gemelo",
  "gemelos",
  "pantorrilla",
  "pantorrillas",
  "core",
  "abdomen",
  "abdominales",
  "abs",
  "trapecio",
  "trapecios",
  "antebrazo",
  "antebrazos",
  "aductor",
  "aductores",
  "abductor",
  "abductores"
]);
function stripMuscleParentheticals(s) {
  return s.replace(/\(([^)]*)\)/g, (_, inner) => {
    const words = inner.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[\s,/]+/).filter(Boolean);
    const allMuscle = words.length > 0 && words.every((w) => MUSCLE_WORDS.has(w));
    return allMuscle ? " " : ` ${inner} `;
  });
}
const SYNONYMS = {
  elev: "elevacion",
  elevaciones: "elevacion",
  elevacion: "elevacion",
  lateral: "lateral",
  laterales: "lateral",
  lat: "lateral",
  ext: "extension",
  extension: "extension",
  extensiones: "extension",
  flex: "flexion",
  flexion: "flexion",
  flexiones: "flexion",
  curls: "curl",
  curl: "curl",
  cruce: "cruce",
  cruces: "cruce",
  maq: "maquina",
  maquina: "maquina",
  mancuerna: "mancuerna",
  mancuernas: "mancuerna",
  post: "posterior",
  posterior: "posterior",
  ant: "anterior",
  anterior: "anterior",
  unilat: "unilateral",
  unilateral: "unilateral",
  bilat: "bilateral",
  bilateral: "bilateral",
  pierna: "pierna",
  piernas: "pierna",
  inverso: "inverso",
  inversos: "inverso",
  sentado: "sentado",
  sentada: "sentado"
};
function normalizeExerciseName(name) {
  return stripMuscleParentheticals(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^[a-z]?\d+[.):\-\s]+/i, "").replace(/[()'"´`.,;/]/g, " ").replace(/\s+/g, " ").trim();
}
function canonicalExerciseKey(name) {
  const tokens = normalizeExerciseName(name).split(" ").filter((t) => t && !STOPWORDS.has(t)).map((t) => SYNONYMS[t] || t);
  return tokens.join(" ");
}
function isSameExercise(a, b) {
  return canonicalExerciseKey(a) === canonicalExerciseKey(b);
}
function effectiveSet(set) {
  const w = parseFloat(`${set.weight}`);
  const r = parseInt(`${set.reps}`);
  if (!w || !r)
    return null;
  const hasRight = set.weightRight != null || set.repsRight != null;
  const weight = hasRight ? Math.min(w, parseFloat(`${set.weightRight ?? w}`)) : w;
  const reps = hasRight ? Math.min(r, parseInt(`${set.repsRight ?? r}`)) : r;
  return { weight, reps };
}
function groupTrainingHistory(history, dayKey) {
  const pending = /* @__PURE__ */ new Map();
  (history || []).forEach((workout) => {
    const rawName = workout.exercise?.name;
    if (!rawName)
      return;
    const key = canonicalExerciseKey(rawName);
    if (!key)
      return;
    let g = pending.get(key);
    if (!g) {
      g = { names: /* @__PURE__ */ new Set(), muscleGroup: null, byDate: {} };
      pending.set(key, g);
    }
    g.names.add(rawName);
    if (!g.muscleGroup && workout.exercise?.muscleGroup)
      g.muscleGroup = workout.exercise.muscleGroup;
    const dateKey = dayKey(workout.date);
    (workout.sets || []).forEach((set) => {
      const eff = effectiveSet(set);
      if (!eff)
        return;
      (g.byDate[dateKey] || (g.byDate[dateKey] = [])).push(eff);
    });
  });
  const groups = /* @__PURE__ */ new Map();
  for (const [key, g] of pending) {
    const sessions = Object.keys(g.byDate).sort().map((dateKey) => {
      const sets = g.byDate[dateKey];
      let best = { weight: 0, reps: 0, rm: 0 };
      for (const s of sets) {
        const rm = cappedEpley1RM(s.weight, s.reps);
        if (rm > best.rm)
          best = { weight: s.weight, reps: s.reps, rm };
      }
      return { date: dateKey, best1RM: best.rm, weight: best.weight, reps: best.reps, sets };
    });
    groups.set(key, { names: g.names, muscleGroup: g.muscleGroup, sessions });
  }
  return groups;
}
function best1RMRecent(sessions, n = 3) {
  if (!sessions || !sessions.length)
    return 0;
  const recent = sessions.slice(-n);
  return Math.max(0, ...recent.map((s) => s.best1RM || 0));
}
function bestOneRepMaxForTarget(sessions, targetReps, n = 3) {
  if (!sessions || !sessions.length)
    return 0;
  const maxEligibleReps = (Number(targetReps) || 1) + 1;
  const eligible = [];
  for (const s of sessions) {
    const daySets = s.sets && s.sets.length ? s.sets : [{ weight: s.weight, reps: s.reps }];
    const bestEligibleRM = Math.max(0, ...daySets.filter((x) => Number(x.reps) <= maxEligibleReps).map((x) => cappedEpley1RM(x.weight, x.reps)));
    if (bestEligibleRM > 0)
      eligible.push(bestEligibleRM);
  }
  const recent = eligible.slice(-n);
  return recent.length ? Math.max(...recent) : 0;
}
function detectPlateau(sessions, { minSessions = 4, windowSize = 6 } = {}) {
  if (!sessions || sessions.length < minSessions) {
    return { isPlateaued: false, sessionsConsidered: sessions?.length || 0, olderBest1RM: 0, recentBest1RM: 0 };
  }
  const sampleWindow = sessions.slice(-Math.min(windowSize, sessions.length));
  const splitAt = Math.floor(sampleWindow.length / 2);
  const olderHalf = sampleWindow.slice(0, splitAt);
  const recentHalf = sampleWindow.slice(splitAt);
  const olderBest1RM = Math.max(0, ...olderHalf.map((s) => s.best1RM || 0));
  const recentBest1RM = Math.max(0, ...recentHalf.map((s) => s.best1RM || 0));
  return {
    isPlateaued: recentBest1RM <= olderBest1RM,
    sessionsConsidered: sampleWindow.length,
    olderBest1RM,
    recentBest1RM
  };
}
function detectPlateauForExercise(workoutLogs) {
  const byDay = /* @__PURE__ */ new Map();
  for (const log of workoutLogs) {
    const dayKey = trainingCivilDate(log.date);
    let best = byDay.get(dayKey) || 0;
    for (const set of log.sets) {
      const eff = effectiveWorkoutSet(set);
      if (eff.weight <= 0 || eff.reps <= 0)
        continue;
      const rm = personalRecordEpley1RM(eff.weight, eff.reps);
      if (rm > best)
        best = rm;
    }
    byDay.set(dayKey, best);
  }
  const sessions = [...byDay.keys()].sort().map((day) => ({ best1RM: byDay.get(day) || 0 }));
  return detectPlateau(sessions).isPlateaued;
}
function linearRegression(dataPoints) {
  if (!dataPoints || dataPoints.length < 2)
    return { slope: 0, r2: 0 };
  const n = dataPoints.length;
  const sumX = dataPoints.reduce((sum, p) => sum + p.x, 0);
  const sumY = dataPoints.reduce((sum, p) => sum + p.y, 0);
  const sumXY = dataPoints.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = dataPoints.reduce((sum, p) => sum + p.x * p.x, 0);
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0)
    return { slope: 0, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const yMean = sumY / n;
  const ssTotal = dataPoints.reduce((sum, p) => sum + Math.pow(p.y - yMean, 2), 0);
  const ssResidual = dataPoints.reduce((sum, p) => sum + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;
  return { slope, r2 };
}
exports.adjustRepRangeForPhase = adjustRepRangeForPhase;
exports.best1RMRecent = best1RMRecent;
exports.bestOneRepMaxForTarget = bestOneRepMaxForTarget;
exports.canonicalExerciseKey = canonicalExerciseKey;
exports.cappedEpley1RM = cappedEpley1RM;
exports.civilDayOfWeek = civilDayOfWeek;
exports.computeWorkoutSuggestion = computeWorkoutSuggestion;
exports.convertLegacyShortcutRir = convertLegacyShortcutRir;
exports.detectPlateau = detectPlateau;
exports.detectPlateauForExercise = detectPlateauForExercise;
exports.effectiveWorkoutSet = effectiveWorkoutSet;
exports.elapsedWeekInBlock = elapsedWeekInBlock;
exports.evaluateNextSetFromToday = evaluateNextSetFromToday;
exports.evaluateWorkoutSuggestion = evaluateWorkoutSuggestion;
exports.formRirToStoredRpe = formRirToStoredRpe;
exports.getActiveTrainingBlock = getActiveTrainingBlock;
exports.groupTrainingHistory = groupTrainingHistory;
exports.isSameExercise = isSameExercise;
exports.lastTrainingCivilDays = lastTrainingCivilDays;
exports.legacyTrainingDayBounds = legacyTrainingDayBounds;
exports.linearRegression = linearRegression;
exports.normalizeExerciseName = normalizeExerciseName;
exports.parseCanonicalWorkoutEffort = parseCanonicalWorkoutEffort;
exports.parseLegacyShortcutEffort = parseLegacyShortcutEffort;
exports.parseRepRange = parseRepRange;
exports.personalRecordEpley1RM = personalRecordEpley1RM;
exports.pickWorkReference = pickWorkReference;
exports.resolveWeightIncrement = resolveWeightIncrement;
exports.rirToStoredRpe = rirToStoredRpe;
exports.roundWorkoutWeight = roundWorkoutWeight;
exports.routinePhaseStatusAt = routinePhaseStatusAt;
exports.selectHistoricalPersonalRecord = selectHistoricalPersonalRecord;
exports.shiftTrainingCivilDate = shiftTrainingCivilDate;
exports.storedRpeToFormRir = storedRpeToFormRir;
exports.storedRpeToRir = storedRpeToRir;
exports.suggestNextSetFromToday = suggestNextSetFromToday;
exports.trainingCivilDate = trainingCivilDate;
exports.trainingCivilDayBounds = trainingCivilDayBounds;
exports.trainingCivilWeek = trainingCivilWeek;
exports.trainingLoadVolume = trainingLoadVolume;
exports.trainingSessionLoadSummary = trainingSessionLoadSummary;
exports.trainingUtcOffsetMinutes = trainingUtcOffsetMinutes;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhaW5pbmcuY2pzIiwic291cmNlcyI6WyIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9kb21haW4vdHJhaW5pbmcvZWZmb3J0LmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvZG9tYWluL3RyYWluaW5nL3BlcmZvcm1hbmNlLmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvZG9tYWluL3RyYWluaW5nL3BlcnNvbmFsUmVjb3Jkcy5qcyIsIi4uLy4uLy4uL3BhY2thZ2VzL3NoYXJlZC9kaXN0L2RvbWFpbi90cmFpbmluZy9zbWFydExvYWRpbmcuanMiLCIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9kb21haW4vdHJhaW5pbmcvY2FsZW5kYXIuanMiLCIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9kb21haW4vdHJhaW5pbmcvdm9sdW1lLmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvZG9tYWluL3RyYWluaW5nL21lc29jeWNsZXMuanMiLCIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9kb21haW4vdHJhaW5pbmcvZXhlcmNpc2VJZGVudGl0eS5qcyIsIi4uLy4uLy4uL3BhY2thZ2VzL3NoYXJlZC9kaXN0L2RvbWFpbi90cmFpbmluZy9wcm9ncmVzcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gcmlyVG9TdG9yZWRScGUocmlyKSB7XG4gICAgcmV0dXJuIHsga2luZDogJ3N0b3JlZC1ycGUnLCB2YWx1ZTogMTAgLSByaXIudmFsdWUgfTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzdG9yZWRScGVUb1JpcihycGUpIHtcbiAgICByZXR1cm4geyBraW5kOiAnaW5mZXJyZWQtcmlyJywgdmFsdWU6IDEwIC0gcnBlLnZhbHVlIH07XG59XG4vKiogTnVsbGFibGUgZm9ybSBhZGFwdGVycyBwcmVzZXJ2ZSBhYnNlbmNlIGFuZCB0aGUgZXhpc3RpbmcgYXJpdGhtZXRpYyBleGFjdGx5LlxuICogVGhleSBkbyBub3QgY2xhbXAgaW1wb3J0ZWQgaGlzdG9yaWNhbCB2YWx1ZXMgdG8gdG9kYXkncyBVSSBidXR0b25zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1SaXJUb1N0b3JlZFJwZShyaXIpIHtcbiAgICByZXR1cm4gcmlyID09IG51bGwgPyBudWxsIDogcmlyVG9TdG9yZWRScGUoeyBraW5kOiAndXNlci1yaXInLCB2YWx1ZTogcmlyIH0pLnZhbHVlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlZFJwZVRvRm9ybVJpcihycGUpIHtcbiAgICByZXR1cm4gcnBlID09IG51bGwgPyBudWxsIDogc3RvcmVkUnBlVG9SaXIoeyBraW5kOiAnc3RvcmVkLXJwZScsIHZhbHVlOiBycGUgfSkudmFsdWU7XG59XG4vLyBwYXJzZUZsb2F0IHBlcmZvcm1zIFRvU3RyaW5nIHdpdGggdGhlIHN0cmluZyBoaW50LiBTdHJpbmcoU3ltYm9sKSBoYXMgYVxuLy8gc3BlY2lhbCBleGVtcHRpb24gdGhhdCBwYXJzZUZsb2F0IGRvZXMgbm90OiBwcmVzZXJ2ZSB0aGF0IFR5cGVFcnJvciB0b28uXG5mdW5jdGlvbiBzaG9ydGN1dEZsb2F0KHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N5bWJvbCcpXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IGEgU3ltYm9sIHZhbHVlIHRvIGEgc3RyaW5nJyk7XG4gICAgcmV0dXJuIHBhcnNlRmxvYXQoU3RyaW5nKHZhbHVlKSk7XG59XG4vKiogVW5ib3VuZGVkIGhpc3RvcmljYWwgaGVscGVyOyBOT1QgdGhlIFNob3J0Y3V0IHJlcXVlc3QgdmFsaWRhdG9yLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRMZWdhY3lTaG9ydGN1dFJpcihyYXdSaXIpIHtcbiAgICByZXR1cm4gcmF3UmlyICE9IG51bGwgJiYgTnVtYmVyLmlzRmluaXRlKHNob3J0Y3V0RmxvYXQocmF3UmlyKSkgPyAxMCAtIHNob3J0Y3V0RmxvYXQocmF3UmlyKSA6IG51bGw7XG59XG4vKiogRXhhY3QgbGVnYWN5IGxvZy1zZXQgcG9saWN5OiBwZXJtaXNzaXZlIHBhcnNlRmxvYXQsIHJpciBwcmlvcml0eSwgZ2FwICg0LDYpXG4gKiByZWplY3RlZCwgbWlzc2luZyA9PiBSSVIwL1JQRTEwLiBObyBtb2Rlcm4gQVBJIG9yIGJhY2t1cCBtYXkgdXNlIHRoaXMgcGFyc2VyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGVnYWN5U2hvcnRjdXRFZmZvcnQoYm9keSkge1xuICAgIGNvbnN0IGludmFsaWQgPSB7IHN0YXRlOiAnaW52YWxpZCcsIGVycm9yOiAnUklSIGludsOhbGlkbyAodXNhIDAtNCwgcmVwcyBlbiByZWPDoW1hcmEpJyB9O1xuICAgIGNvbnN0IGhhc1JpciA9IGJvZHkucmlyICE9IG51bGwgJiYgU3RyaW5nKGJvZHkucmlyKS50cmltKCkgIT09ICcnO1xuICAgIGNvbnN0IGhhc1JwZSA9IGJvZHkucnBlICE9IG51bGwgJiYgU3RyaW5nKGJvZHkucnBlKS50cmltKCkgIT09ICcnO1xuICAgIGlmIChoYXNSaXIpIHtcbiAgICAgICAgY29uc3QgcmF3UmlyID0gc2hvcnRjdXRGbG9hdChib2R5LnJpcik7XG4gICAgICAgIGlmICghTnVtYmVyLmlzRmluaXRlKHJhd1JpcikgfHwgcmF3UmlyIDwgMCB8fCByYXdSaXIgPiA0KVxuICAgICAgICAgICAgcmV0dXJuIGludmFsaWQ7XG4gICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW50ZXJwcmV0ZWQnLCBjb250ZXh0OiAnbGVnYWN5LXNob3J0Y3V0JywgaW50ZXJwcmV0YXRpb246ICdleHBsaWNpdC1yaXInLCByYXdSaXIsIHN0b3JlZFJwZTogMTAgLSByYXdSaXIgfTtcbiAgICB9XG4gICAgaWYgKGhhc1JwZSkge1xuICAgICAgICBjb25zdCBwYXJzZWQgPSBzaG9ydGN1dEZsb2F0KGJvZHkucnBlKTtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSlcbiAgICAgICAgICAgIHJldHVybiBpbnZhbGlkO1xuICAgICAgICBpZiAocGFyc2VkID49IDAgJiYgcGFyc2VkIDw9IDQpXG4gICAgICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2xlZ2FjeS1zaG9ydGN1dCcsIGludGVycHJldGF0aW9uOiAnbGVnYWN5LXJwZS1hcy1yaXInLCByYXdSaXI6IHBhcnNlZCwgc3RvcmVkUnBlOiAxMCAtIHBhcnNlZCB9O1xuICAgICAgICBpZiAocGFyc2VkID49IDYgJiYgcGFyc2VkIDw9IDEwKVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdGU6ICdpbnRlcnByZXRlZCcsIGNvbnRleHQ6ICdsZWdhY3ktc2hvcnRjdXQnLCBpbnRlcnByZXRhdGlvbjogJ3N0b3JlZC1ycGUnLCByYXdSaXI6IDEwIC0gcGFyc2VkLCBzdG9yZWRScGU6IHBhcnNlZCB9O1xuICAgICAgICByZXR1cm4gaW52YWxpZDtcbiAgICB9XG4gICAgcmV0dXJuIHsgc3RhdGU6ICdpbnRlcnByZXRlZCcsIGNvbnRleHQ6ICdsZWdhY3ktc2hvcnRjdXQnLCBpbnRlcnByZXRhdGlvbjogJ21pc3NpbmctZGVmYXVsdCcsIHJhd1JpcjogMCwgc3RvcmVkUnBlOiAxMCB9O1xufVxuLyoqIHYxIHJlcXVlc3QgcmVwcmVzZW50YXRpb24sIE5PVCBmdWxsIFNldExvZyB2YWxpZGF0aW9uLiBUaGUgZXhpc3Rpbmcgc2FuaXRpemVyXG4gKiBzdGlsbCBlbmZvcmNlcyBzdG9yZWQgcmFuZ2UgMC4uMTAgYW5kIG1hbmRhdG9yeSBlZmZvcnQgZm9yIHBvc2l0aXZlIHdvcmsuXG4gKiBObyBzb3VyY2UgcGFyYW1ldGVyOiBzb3VyY2U9c2hvcnRjdXQgY2Fubm90IGFjdGl2YXRlIGxlZ2FjeSBpbnRlcnByZXRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNhbm9uaWNhbFdvcmtvdXRFZmZvcnQoc2V0KSB7XG4gICAgZm9yIChjb25zdCBmaWVsZCBvZiBbJ3JwZScsICdyaXInXSkge1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHNldFtmaWVsZF07XG4gICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IChmaWVsZCA9PT0gJ3JwZScgJiYgdmFsdWUgPT09IG51bGwpKVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNGaW5pdGUodmFsdWUpIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKHZhbHVlKSlcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW52YWxpZCcsIGZpZWxkLCBtZXNzYWdlOiBgSW52YWxpZCAke2ZpZWxkfWAgfTtcbiAgICB9XG4gICAgaWYgKHNldC5yaXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb25zdCByaXIgPSBzZXQucmlyO1xuICAgICAgICBpZiAodHlwZW9mIHJpciAhPT0gJ251bWJlcicgfHwgcmlyIDwgMCB8fCByaXIgPiA0KVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdGU6ICdpbnZhbGlkJywgZmllbGQ6ICdyaXInLCBtZXNzYWdlOiAncmlyIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDAgdG8gNCcgfTtcbiAgICAgICAgaWYgKHNldC5ycGUgIT09IHVuZGVmaW5lZCAmJiBzZXQucnBlICE9PSAxMCAtIHJpcilcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW52YWxpZCcsIGZpZWxkOiAncnBlJywgbWVzc2FnZTogJ3JpciBhbmQgcnBlIGNvbmZsaWN0JyB9O1xuICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2Nhbm9uaWNhbC13b3Jrb3V0Jywgc3RvcmVkUnBlOiAxMCAtIHJpciB9O1xuICAgIH1cbiAgICAvLyBOYXJyb3cgdW5rbm93biBpbmRlcGVuZGVudGx5OyB0aGUgbG9vcCBhYm92ZSBwcmVzZXJ2ZXMgZXJyb3IgcHJlY2VkZW5jZS5cbiAgICBpZiAodHlwZW9mIHNldC5ycGUgPT09ICdudW1iZXInKVxuICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2Nhbm9uaWNhbC13b3Jrb3V0Jywgc3RvcmVkUnBlOiBzZXQucnBlIH07XG4gICAgcmV0dXJuIHsgc3RhdGU6ICdtaXNzaW5nJywgY29udGV4dDogJ2Nhbm9uaWNhbC13b3Jrb3V0Jywgc3RvcmVkUnBlOiBzZXQucnBlID09PSBudWxsID8gbnVsbCA6IHVuZGVmaW5lZCB9O1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZWZmb3J0LmpzLm1hcCIsIi8qKlxuICogSGlzdG9yaWNhbCBoaXN0b3J5L2dvYWwgZXN0aW1hdGUsIGluIGtnLiBUaGlzIGlzIE5PVCB0aGUgcGVyc2lzdGVkIFBSIHBvbGljeS5cbiAqIE51bWJlciBjb2VyY2lvbiBhbmQgfHwgMCBkZWxpYmVyYXRlbHkgcHJlc2VydmUgbGVnYWN5IEpTIGNhbGxlcnMgKGluY2x1ZGluZ1xuICogbnVsbC91bmRlZmluZWQpOyBpbnB1dHMgYXJlIHVua25vd24gYmVjYXVzZSB0aGlzIGJvdW5kYXJ5IGFscmVhZHkgY29lcmNlcy5cbiAqIE9uZSByZXAgcmV0dXJucyB3ZWlnaHQ7ID4zNiByZXBzIGFyZSBjYXBwZWQgYXQgMzY7IG5vIHJvdW5kaW5nL3RvbGVyYW5jZS5cbiAqIEZpbml0ZSBub25uZWdhdGl2ZSB0cmFpbmluZyBpbnB1dHMgcHJvZHVjZSBmaW5pdGUgcmVzdWx0cyB3aXRoaW4gQVBJIGxpbWl0cy5cbiAqIE5hTiBiZWNvbWVzIDA7IGluZmluaXRpZXMgYW5kIE51bWJlciBjb252ZXJzaW9uIGV4Y2VwdGlvbnMgcmVtYWluIGhpc3RvcmljYWwuXG4gKiBBbiBlc3RpbWF0ZSBpcyBub3QgYSBtZWFzdXJlZCBtYXhpbXVtIG9yIGEgcGh5c2lvbG9naWNhbCBndWFyYW50ZWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYXBwZWRFcGxleTFSTSh3ZWlnaHQsIHJlcHMpIHtcbiAgICBjb25zdCB3ID0gTnVtYmVyKHdlaWdodCkgfHwgMDtcbiAgICBsZXQgciA9IE51bWJlcihyZXBzKSB8fCAwO1xuICAgIGlmICh3IDw9IDAgfHwgciA8PSAwKVxuICAgICAgICByZXR1cm4gMDtcbiAgICBpZiAociA9PT0gMSlcbiAgICAgICAgcmV0dXJuIHc7XG4gICAgaWYgKHIgPiAzNilcbiAgICAgICAgciA9IDM2O1xuICAgIHJldHVybiB3ICogKDEgKyByIC8gMzApO1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cGVyZm9ybWFuY2UuanMubWFwIiwiLyoqIFBlcnNpc3RlZCBQUiBwb2xpY3ksIG5vdCBjYXBwZWQgaGlzdG9yeS9TbWFydCBMb2FkaW5nIG9yIFBERiBwb2xpY3kuXG4gKiBDYWxsZXIgaGFzIGNvZXJjZWQgcG9zaXRpdmUgd29yay4gMTxyZXBzPDM3IGV4dHJhcG9sYXRlczsgYWxsIG90aGVyIHJlcHNcbiAqIHJldHVybiBsb2FkLiBObyByb3VuZGluZyBvciBlcHNpbG9uLiBEZWNpbWFsIGxlZ2FjeSByZXBzIHJlbWFpbiBjb21wYXRpYmxlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBlcnNvbmFsUmVjb3JkRXBsZXkxUk0od2VpZ2h0S2csIHJlcGV0aXRpb25zKSB7XG4gICAgcmV0dXJuIChyZXBldGl0aW9ucyA+IDEgJiYgcmVwZXRpdGlvbnMgPCAzNykgPyB3ZWlnaHRLZyAqICgxICsgcmVwZXRpdGlvbnMgLyAzMCkgOiB3ZWlnaHRLZztcbn1cbi8qKiBJdGVyYXRlIGV4YWN0bHkgaW4gY2FsbGVyIG9yZGVyLCBsZWZ0IGJlZm9yZSByaWdodCwgc3RyaWN0ID4gcmV0YWlucyBmaXJzdFxuICogYmluYXJ5IHRpZS4gUmlnaHQgbnVsbGlzaCBmaWVsZHMgaW5oZXJpdCBsZWZ0OyB6ZXJvIHJlbWFpbnMgemVyby4gY29tcGxldGVkXG4gKiBpcyBkZWxpYmVyYXRlbHkgbm90IGEgZmlsdGVyLiBDYWxsZXIgYWxvbmUgc2VsZWN0cyBhdXRob3JpemVkIGhpc3RvcnkgYW5kXG4gKiBwZXJzaXN0cyB0aGUgcmVzdWx0IGluc2lkZSBpdHMgU1FMIHRyYW5zYWN0aW9uLiBPKHNldHMpLCBPKDEpIGV4dHJhIHN0YXRlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdEhpc3RvcmljYWxQZXJzb25hbFJlY29yZChsb2dzKSB7XG4gICAgbGV0IGJlc3QgPSBudWxsO1xuICAgIGZvciAoY29uc3QgbG9nIG9mIGxvZ3MpIHtcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIGxvZy5zZXRzKSB7XG4gICAgICAgICAgICBjb25zdCBjYW5kaWRhdGVzID0gW3sgdzogcy53ZWlnaHQsIHI6IHMucmVwcyB9XTtcbiAgICAgICAgICAgIGlmIChzLndlaWdodFJpZ2h0ICE9IG51bGwgfHwgcy5yZXBzUmlnaHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGNhbmRpZGF0ZXMucHVzaCh7IHc6IHMud2VpZ2h0UmlnaHQgPz8gcy53ZWlnaHQsIHI6IHMucmVwc1JpZ2h0ID8/IHMucmVwcyB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZvciAoY29uc3QgYyBvZiBjYW5kaWRhdGVzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdyA9IE51bWJlcihjLncpIHx8IDA7XG4gICAgICAgICAgICAgICAgY29uc3QgciA9IE51bWJlcihjLnIpIHx8IDA7XG4gICAgICAgICAgICAgICAgaWYgKHcgPD0gMCB8fCByIDw9IDApXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIGNvbnN0IGVzdCA9IHBlcnNvbmFsUmVjb3JkRXBsZXkxUk0odywgcik7XG4gICAgICAgICAgICAgICAgaWYgKCFiZXN0IHx8IGVzdCA+IGJlc3QuZXN0MVJNKVxuICAgICAgICAgICAgICAgICAgICBiZXN0ID0geyB3ZWlnaHQ6IHcsIHJlcHM6IHIsIGVzdDFSTTogZXN0LCBkYXRlOiBsb2cuZGF0ZSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBiZXN0O1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cGVyc29uYWxSZWNvcmRzLmpzLm1hcCIsImltcG9ydCB7IHN0b3JlZFJwZVRvUmlyIH0gZnJvbSAnLi9lZmZvcnQuanMnO1xuZnVuY3Rpb24gYWJzdGFpbihtb2RlLCByZWFzb24pIHtcbiAgICByZXR1cm4geyByZWNvbW1lbmRhdGlvbjogbnVsbCwgZXhwbGFuYXRpb246IHsgbW9kZSwgcnVsZTogJ2Fic3RhaW4nLCByZWFzb24gfSB9O1xufVxuZnVuY3Rpb24gYWxsSGF2ZUtub3duUmlyKHNldHMpIHtcbiAgICByZXR1cm4gIXNldHMuc29tZShzID0+IHMucmlyID09IG51bGwgfHwgIU51bWJlci5pc0Zpbml0ZShzLnJpcikpO1xufVxuZnVuY3Rpb24gd2VpZ2h0R3JpZChpbmNyZW1lbnQsIGJhc2UpIHtcbiAgICByZXR1cm4gKE1hdGguYWJzKGJhc2UgJSBpbmNyZW1lbnQpIDwgMC4wMSkgPyBpbmNyZW1lbnQgOiAwLjU7XG59XG4vKiogRUNNQVNjcmlwdCBUb1ByaW1pdGl2ZShudW1iZXIpIHRoZW4gVG9OdW1iZXIsIGZvciB0aGUgb2xkIHN1YnRyYWN0aW9uIGFuZFxuICogTWF0aC5taW4gYm91bmRhcmllcy4gTnVtYmVyKEJpZ0ludCkgaXMgcGVybWlzc2l2ZTsgYXJpdGhtZXRpYyB3YXMgbm90LiBOb1xuICogbm9ybWFsaXphdGlvbiBvZiByYXcgcmlyIGlzIHBlcmZvcm1lZCBieSBlZmZlY3RpdmVXb3Jrb3V0U2V0LiAqL1xuZnVuY3Rpb24gbGVnYWN5QXJpdGhtZXRpY051bWJlcih2YWx1ZSkge1xuICAgIGlmICgodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCkgfHwgdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNvbnN0IGV4b3RpYyA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBTeW1ib2wudG9QcmltaXRpdmUpO1xuICAgICAgICBpZiAoZXhvdGljICE9IG51bGwpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgZXhvdGljICE9PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IG9iamVjdCB0byBwcmltaXRpdmUgdmFsdWUnKTtcbiAgICAgICAgICAgIGNvbnN0IHByaW1pdGl2ZSA9IFJlZmxlY3QuYXBwbHkoZXhvdGljLCB2YWx1ZSwgWydudW1iZXInXSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0KHByaW1pdGl2ZSkgPT09IHByaW1pdGl2ZSlcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdDYW5ub3QgY29udmVydCBvYmplY3QgdG8gcHJpbWl0aXZlIHZhbHVlJyk7XG4gICAgICAgICAgICByZXR1cm4gbGVnYWN5QXJpdGhtZXRpY051bWJlcihwcmltaXRpdmUpO1xuICAgICAgICB9XG4gICAgICAgIGZvciAoY29uc3Qga2V5IG9mIFsndmFsdWVPZicsICd0b1N0cmluZyddKSB7XG4gICAgICAgICAgICBjb25zdCBtZXRob2QgPSBSZWZsZWN0LmdldCh2YWx1ZSwga2V5KTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgbWV0aG9kICE9PSAnZnVuY3Rpb24nKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3QgcHJpbWl0aXZlID0gUmVmbGVjdC5hcHBseShtZXRob2QsIHZhbHVlLCBbXSk7XG4gICAgICAgICAgICBpZiAoT2JqZWN0KHByaW1pdGl2ZSkgIT09IHByaW1pdGl2ZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gbGVnYWN5QXJpdGhtZXRpY051bWJlcihwcmltaXRpdmUpO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IG9iamVjdCB0byBwcmltaXRpdmUgdmFsdWUnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2JpZ2ludCcpXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBtaXggQmlnSW50IGFuZCBvdGhlciB0eXBlcywgdXNlIGV4cGxpY2l0IGNvbnZlcnNpb25zJyk7XG4gICAgcmV0dXJuIE51bWJlcih2YWx1ZSk7XG59XG4vLyBBanVzdGEgZWwgcmFuZ28gZGUgcmVwcyBvYmpldGl2byBzZWfDum4gbGEgZmFzZSBkZWwgYmxvcXVlIGFjdGl2byAoc2kgaGF5IHVubykuXG4vLyBOTyBtb2RpZmljYSBlbCByYW5nbyBndWFyZGFkbyBkZWwgZWplcmNpY2lvLCBzb2xvIGVsIHVzYWRvIHBhcmEgRVNUQSBzdWdlcmVuY2lhOlxuLy8gaW50ZW5zaWZpY2FjacOzbiBsbyByZWR1Y2UgYSBsYSBtaXRhZCAobcOhcyBwZXNvLCBtZW5vcyByZXBzKSxcbi8vIGFjdW11bGFjacOzbiBzdWJlIGVsIHRlY2hvIDUwJSAobcOhcyByZXBzIGFudGVzIGRlIHN1YmlyIHBlc28pLiBEZXNjYXJnYS9cbi8vIHBlcnNvbmFsaXphZG8vc2luIGJsb3F1ZSBhY3Rpdm86IHJhbmdvIHNpbiBjYW1iaW9zLlxuZXhwb3J0IGZ1bmN0aW9uIGFkanVzdFJlcFJhbmdlRm9yUGhhc2UobG8sIGhpLCBwaGFzZSkge1xuICAgIGlmIChwaGFzZSA9PT0gJ2ludGVuc2lmaWNhdGlvbicpIHtcbiAgICAgICAgY29uc3QgbmV3TG8gPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGxvICogMC41KSk7XG4gICAgICAgIHJldHVybiB7IGxvOiBuZXdMbywgaGk6IE1hdGgubWF4KG5ld0xvLCBNYXRoLnJvdW5kKGhpICogMC41KSkgfTtcbiAgICB9XG4gICAgaWYgKHBoYXNlID09PSAnYWNjdW11bGF0aW9uJykge1xuICAgICAgICByZXR1cm4geyBsbywgaGk6IE1hdGgucm91bmQoaGkgKiAxLjUpIH07XG4gICAgfVxuICAgIHJldHVybiB7IGxvLCBoaSB9O1xufVxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmVwUmFuZ2UodGFyZ2V0UmVwcykge1xuICAgIGNvbnN0IG51bXMgPSBTdHJpbmcodGFyZ2V0UmVwcyB8fCAnJykubWF0Y2goL1xcZCsvZyk7XG4gICAgaWYgKCFudW1zKVxuICAgICAgICByZXR1cm4geyBsbzogOCwgaGk6IDEyIH07XG4gICAgY29uc3QgYSA9IHBhcnNlSW50KG51bXNbMF0sIDEwKTtcbiAgICBjb25zdCBiID0gbnVtc1sxXSA/IHBhcnNlSW50KG51bXNbMV0sIDEwKSA6IGE7XG4gICAgcmV0dXJuIHsgbG86IE1hdGgubWluKGEsIGIpLCBoaTogTWF0aC5tYXgoYSwgYikgfTtcbn1cbi8vIEluY3JlbWVudG8gZGUgY2FyZ2E6IDVrZyBwaWVybmFzLCAyLjVrZyByZXN0by4gU2kgbXVzY2xlR3JvdXAgZmFsdGEsIGluZmllcmVcbi8vIHBvciBub21icmUgKG1pc21hIFJFR0VYIHF1ZSBzZXJ2ZXIvc3JjL2xvZ2ljLmpzKS5cbmNvbnN0IExFR1NfTkFNRV9SRSA9IC9zZW50YWRpbGxhfHByZW5zYXxoYWNrfGZlbW9yYWx8Y3VhZHJbacOtXWNlcHxhZHVjdG9yfGFiZHVjdG9yfGdlbWVsb3xwYW50b3JyaWxsYXx6YW5jYWRhfGJbdcO6XWxnYXJhfGhpcFxccyp0aHJ1c3R8cGVzb1xccyptdWVydG98ZGVhZGxpZnR8XFxibGVnXFxifGV4dGVuc2lbb8OzXW4oZXMpP1xccytkZVxccytjdVthw6FdL2k7XG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVdlaWdodEluY3JlbWVudChtdXNjbGVHcm91cCwgZXhlcmNpc2VOYW1lID0gJycpIHtcbiAgICAvLyAnUGllcm5hcycgKGNhbsOzbmljbyBFUykgbyAnbGVncycgKGNhdMOhbG9nbyBjbGllbnRlIGVuIGluZ2zDqXMpXG4gICAgaWYgKG11c2NsZUdyb3VwID09PSAnUGllcm5hcycgfHwgbXVzY2xlR3JvdXAgPT09ICdsZWdzJylcbiAgICAgICAgcmV0dXJuIDU7XG4gICAgaWYgKCFtdXNjbGVHcm91cCAmJiBMRUdTX05BTUVfUkUudGVzdChleGVyY2lzZU5hbWUgfHwgJycpKVxuICAgICAgICByZXR1cm4gNTtcbiAgICByZXR1cm4gMi41O1xufVxuLy8gRW4gdW5pbGF0ZXJhbCB1c2EgZWwgbGFkbyBkw6liaWwgKGVsIHF1ZSBsaW1pdGEgbGEgcHJvZ3Jlc2nDs24pLlxuZXhwb3J0IGZ1bmN0aW9uIGVmZmVjdGl2ZVdvcmtvdXRTZXQoc2V0KSB7XG4gICAgY29uc3QgdyA9IE51bWJlcihzZXQud2VpZ2h0KSB8fCAwO1xuICAgIGNvbnN0IHIgPSBOdW1iZXIoc2V0LnJlcHMpIHx8IDA7XG4gICAgY29uc3QgaGFzUmlnaHQgPSBzZXQud2VpZ2h0UmlnaHQgIT0gbnVsbCB8fCBzZXQucmVwc1JpZ2h0ICE9IG51bGw7XG4gICAgY29uc3Qgd1IgPSBzZXQud2VpZ2h0UmlnaHQgIT0gbnVsbCA/IE51bWJlcihzZXQud2VpZ2h0UmlnaHQpIDogdztcbiAgICBjb25zdCByUiA9IHNldC5yZXBzUmlnaHQgIT0gbnVsbCA/IE51bWJlcihzZXQucmVwc1JpZ2h0KSA6IHI7XG4gICAgY29uc3QgcmlyID0gc2V0LnJwZSAhPSBudWxsID8gc3RvcmVkUnBlVG9SaXIoeyBraW5kOiAnc3RvcmVkLXJwZScsIHZhbHVlOiBsZWdhY3lBcml0aG1ldGljTnVtYmVyKHNldC5ycGUpIH0pLnZhbHVlIDogKHNldC5yaXIgIT0gbnVsbCA/IHNldC5yaXIgOiBudWxsKTtcbiAgICByZXR1cm4ge1xuICAgICAgICB3ZWlnaHQ6IGhhc1JpZ2h0ID8gTWF0aC5taW4odywgd1IpIDogdyxcbiAgICAgICAgcmVwczogaGFzUmlnaHQgPyBNYXRoLm1pbihyLCByUikgOiByLFxuICAgICAgICByaXJcbiAgICB9O1xufVxuZXhwb3J0IGZ1bmN0aW9uIHJvdW5kV29ya291dFdlaWdodCh3LCBpbmNyZW1lbnQsIGJhc2UpIHtcbiAgICBjb25zdCBncmlkID0gKE1hdGguYWJzKGJhc2UgJSBpbmNyZW1lbnQpIDwgMC4wMSkgPyBpbmNyZW1lbnQgOiAwLjU7XG4gICAgcmV0dXJuIE1hdGgucm91bmQodyAvIGdyaWQpICogZ3JpZDtcbn1cbi8qKlxuICogU2VyaWUgZGUgVFJBQkFKTyBkZSBsYSDDumx0aW1hIHNlc2nDs24gKG5vIHNpbmdsZSBkZSB0b3BlIG5pIGRyb3Agc2V0KS5cbiAqIEluY2x1eWUgcHJvdGVjY2nDs24gY29udHJhIFNpbmdsZXMvRG91YmxlcyAocmVwcyA8IDMpIGN1YW5kbyBsbyA+IDMuXG4gKiBMYSBwb2zDrXRpY2EgaGlzdMOzcmljYSBjb21wbGV0YSBlc3TDoSBlbiBkb2NzL1RSQUlOSU5HLVNNQVJULUxPQURJTkcubWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwaWNrV29ya1JlZmVyZW5jZSh3b3JraW5nLCBsbykge1xuICAgIGlmICghd29ya2luZyB8fCB3b3JraW5nLmxlbmd0aCA9PT0gMClcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgLy8gUHJvdGVjY2nDs24gY29udHJhIFNpbmdsZXMvRG91YmxlcyAoRWdvIExpZnRpbmcpOiBpZ25vcmEgc2VyaWVzIGRlIDEgbyAyIHJlcHNcbiAgICAvLyBhIG1lbm9zIHF1ZSBlbCByYW5nbyBvYmpldGl2byBkZSBsYSBydXRpbmEgc2VhIGV4cGzDrWNpdGFtZW50ZSBkZSBmdWVyemEgbcOheGltYSAobG8gPD0gMykuXG4gICAgY29uc3Qgbm9uRWdvID0gbG8gPiAzID8gd29ya2luZy5maWx0ZXIocyA9PiBzLnJlcHMgPj0gMykgOiB3b3JraW5nO1xuICAgIGNvbnN0IGJhc2VXb3JraW5nID0gbm9uRWdvLmxlbmd0aCA+IDAgPyBub25FZ28gOiB3b3JraW5nO1xuICAgIGNvbnN0IG1heFcgPSBNYXRoLm1heCguLi5iYXNlV29ya2luZy5tYXAocyA9PiBzLndlaWdodCkpO1xuICAgIGNvbnN0IG1haW4gPSBiYXNlV29ya2luZy5maWx0ZXIocyA9PiBzLndlaWdodCA+PSBtYXhXICogMC43NSk7XG4gICAgY29uc3QgcG9vbCA9IG1haW4ubGVuZ3RoID4gMCA/IG1haW4gOiBiYXNlV29ya2luZztcbiAgICAvLyBTaSBleGlzdGUgdW4gVG9wIFNldCBwZXNhZG8gZGUgYWx0YSBpbnRlbnNpZGFkIChSSVIgPD0gMSAvIFJQRSA+PSA5KSBhbCBwZXNvIG3DoXhpbW9cbiAgICAvLyBkZWwgcG9vbCB2w6FsaWRvLCBhbmNsYXIgZW4gZXNlIHBlc28gcGFyYSBxdWUgdW4gQmFjay1vZmYgc2V0IG5vIGxvIGVjbGlwc2UuXG4gICAgY29uc3QgdG9wV2VpZ2h0ID0gTWF0aC5tYXgoLi4ucG9vbC5tYXAocyA9PiBzLndlaWdodCkpO1xuICAgIGNvbnN0IGF0VG9wV2VpZ2h0ID0gcG9vbC5maWx0ZXIocyA9PiBNYXRoLmFicyhzLndlaWdodCAtIHRvcFdlaWdodCkgPCAwLjAxKTtcbiAgICBjb25zdCBoYXNIZWF2eVRvcFNldCA9IGF0VG9wV2VpZ2h0LnNvbWUocyA9PiBzLnJpciAhPSBudWxsICYmIE51bWJlcihzLnJpcikgPD0gMSk7XG4gICAgbGV0IHJlZldlaWdodDtcbiAgICBpZiAoaGFzSGVhdnlUb3BTZXQpIHtcbiAgICAgICAgcmVmV2VpZ2h0ID0gdG9wV2VpZ2h0O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgbGV0IGNhbmRpZGF0ZXMgPSBwb29sLmZpbHRlcihzID0+IHMucmVwcyA+PSBsbyk7XG4gICAgICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgY29uc3QgbWF4UmVwcyA9IE1hdGgubWF4KC4uLnBvb2wubWFwKHMgPT4gcy5yZXBzKSk7XG4gICAgICAgICAgICBjYW5kaWRhdGVzID0gcG9vbC5maWx0ZXIocyA9PiBzLnJlcHMgPT09IG1heFJlcHMpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICAgIGNhbmRpZGF0ZXMgPSBwb29sO1xuICAgICAgICByZWZXZWlnaHQgPSBNYXRoLm1heCguLi5jYW5kaWRhdGVzLm1hcChzID0+IHMud2VpZ2h0KSk7XG4gICAgfVxuICAgIGNvbnN0IHNhbWVXZWlnaHQgPSBwb29sLmZpbHRlcihzID0+IE1hdGguYWJzKHMud2VpZ2h0IC0gcmVmV2VpZ2h0KSA8IDAuMDEpO1xuICAgIGNvbnN0IHJlZlJlcHMgPSBNYXRoLm1heCguLi5zYW1lV2VpZ2h0Lm1hcChzID0+IHMucmVwcykpO1xuICAgIGNvbnN0IGtub3duUmlyID0gc2FtZVdlaWdodC5tYXAocyA9PiBzLnJpcikuZmlsdGVyKHYgPT4gdiAhPSBudWxsKTtcbiAgICBjb25zdCByaXIgPSBrbm93blJpci5sZW5ndGggPyBNYXRoLm1pbiguLi5rbm93blJpci5tYXAobGVnYWN5QXJpdGhtZXRpY051bWJlcikpIDogbnVsbDtcbiAgICBjb25zdCBtaW5SZXBzID0gTWF0aC5taW4oLi4uc2FtZVdlaWdodC5tYXAocyA9PiBzLnJlcHMpKTtcbiAgICByZXR1cm4geyB3ZWlnaHQ6IHJlZldlaWdodCwgcmVwczogcmVmUmVwcywgbWluUmVwcywgcmlyLCBzZXRzQXRXZWlnaHQ6IHNhbWVXZWlnaHQgfTtcbn1cbi8qKlxuICogU3VnZXJlbmNpYSBwb3IgVG9wIFNldCArIEJhY2stb2ZmIC8gRG9ibGUgUHJvZ3Jlc2nDs24uIGBzZXNzaW9uc2Agb3JkZW5hZG8gREVTQyBwb3IgZmVjaGEuXG4gKiAtIERlc2Jsb3F1ZWEgaW5jcmVtZW50byBkZSBwZXNvIHNpIGVsIFRvcCBTZXQgYWxjYW56w7MgPj0gaGkgcmVwcyBjb24gUklSIDw9IDEgKFJQRSA5LTEwKSxcbiAqICAgbyBzaSB0b2RhcyBsYXMgc2VyaWVzIGFsIHBlc28gZGUgdHJhYmFqbyBhbGNhbnphcm9uID49IGhpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXZhbHVhdGVXb3Jrb3V0U3VnZ2VzdGlvbihzZXNzaW9ucywgdGFyZ2V0UmVwcywgaW5jcmVtZW50LCBwaGFzZSA9IG51bGwpIHtcbiAgICBpZiAoIXNlc3Npb25zIHx8IHNlc3Npb25zLmxlbmd0aCA9PT0gMClcbiAgICAgICAgcmV0dXJuIGFic3RhaW4oJ2ludGVyJywgJ2VtcHR5LWhpc3RvcnknKTtcbiAgICBjb25zdCByZXNvbHZlZFBoYXNlID0gKHBoYXNlICYmIHR5cGVvZiBwaGFzZSA9PT0gJ29iamVjdCcpID8gKHBoYXNlLnBoYXNlID8/IG51bGwpIDogKHBoYXNlID8/IG51bGwpO1xuICAgIGNvbnN0IHBhcnNlZFJhbmdlID0gcGFyc2VSZXBSYW5nZSh0YXJnZXRSZXBzKTtcbiAgICBjb25zdCB7IGxvLCBoaSB9ID0gYWRqdXN0UmVwUmFuZ2VGb3JQaGFzZShwYXJzZWRSYW5nZS5sbywgcGFyc2VkUmFuZ2UuaGksIHJlc29sdmVkUGhhc2UpO1xuICAgIGNvbnN0IHdvcmtpbmcgPSAoc2Vzc2lvbnNbMF0uc2V0cyB8fCBbXSlcbiAgICAgICAgLm1hcChlZmZlY3RpdmVXb3Jrb3V0U2V0KVxuICAgICAgICAuZmlsdGVyKHMgPT4gcy53ZWlnaHQgPiAwICYmIHMucmVwcyA+IDApO1xuICAgIGlmICh3b3JraW5nLmxlbmd0aCA9PT0gMClcbiAgICAgICAgcmV0dXJuIGFic3RhaW4oJ2ludGVyJywgJ25vLXBvc2l0aXZlLXdvcmsnKTtcbiAgICBjb25zdCByZWYgPSBwaWNrV29ya1JlZmVyZW5jZSh3b3JraW5nLCBsbyk7XG4gICAgaWYgKCFyZWYpXG4gICAgICAgIHJldHVybiBhYnN0YWluKCdpbnRlcicsICduby1yZWZlcmVuY2UnKTtcbiAgICBjb25zdCB7IHdlaWdodDogcmVmV2VpZ2h0LCByZXBzOiByZWZSZXBzLCBtaW5SZXBzLCByaXIsIHNldHNBdFdlaWdodCB9ID0gcmVmO1xuICAgIGNvbnN0IGFsbEhpdFRvcCA9IHNldHNBdFdlaWdodC5ldmVyeShzID0+IHMucmVwcyA+PSBoaSk7XG4gICAgY29uc3QgdG9wU2V0UGFzc2VkID0gc2V0c0F0V2VpZ2h0LmZpbmQocyA9PiBzLnJlcHMgPj0gaGkgJiYgcy5yaXIgIT0gbnVsbCAmJiBOdW1iZXIocy5yaXIpIDw9IDEpO1xuICAgIGxldCB3ZWlnaHQsIHJlcHMsIHJhdGlvbmFsZTtcbiAgICBsZXQgcnVsZTtcbiAgICBpZiAodG9wU2V0UGFzc2VkIHx8IGFsbEhpdFRvcCkge1xuICAgICAgICBydWxlID0gdG9wU2V0UGFzc2VkICYmICFhbGxIaXRUb3AgPyAndG9wLXNldC1wYXNzZWQnIDogJ2FsbC1oaXQtdG9wJztcbiAgICAgICAgd2VpZ2h0ID0gcm91bmRXb3Jrb3V0V2VpZ2h0KHJlZldlaWdodCArIGluY3JlbWVudCwgaW5jcmVtZW50LCByZWZXZWlnaHQpO1xuICAgICAgICByZXBzID0gbG87XG4gICAgICAgIGlmICh0b3BTZXRQYXNzZWQgJiYgIWFsbEhpdFRvcCkge1xuICAgICAgICAgICAgcmF0aW9uYWxlID0gYFRvcCBTZXQgc3VwZXJhZG8gKCR7cmVmV2VpZ2h0fWtnIMOXICR7dG9wU2V0UGFzc2VkLnJlcHN9IGEgUklSICR7dG9wU2V0UGFzc2VkLnJpcn0pOiBzdWJlIGEgJHt3ZWlnaHR9a2cgeSByZWluaWNpYSBlbiAke2xvfS5gO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmF0aW9uYWxlID0gc2V0c0F0V2VpZ2h0Lmxlbmd0aCA+IDFcbiAgICAgICAgICAgICAgICA/IGBUb2RhcyBsYXMgc2VyaWVzIGEgJHtyZWZXZWlnaHR9a2cgbGxlZ2Fyb24gYSDiiaUke2hpfSByZXBzOiBzdWJlIGEgJHt3ZWlnaHR9a2cgeSByZWluaWNpYSBlbiAke2xvfS5gXG4gICAgICAgICAgICAgICAgOiBgQWxjYW56YXN0ZSAke3JlZlJlcHN9IHJlcHMgY29uICR7cmVmV2VpZ2h0fWtnICh0b3BlIGRlbCByYW5nbyk6IHN1YmUgYSAke3dlaWdodH1rZyB5IHJlaW5pY2lhIGVuICR7bG99LmA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAocmVmUmVwcyA+PSBoaSkge1xuICAgICAgICBydWxlID0gJ2VxdWFsaXplLXJlcHMnO1xuICAgICAgICB3ZWlnaHQgPSByZWZXZWlnaHQ7XG4gICAgICAgIHJlcHMgPSBNYXRoLm1pbihoaSwgbWluUmVwcyArIDEpO1xuICAgICAgICByYXRpb25hbGUgPSBgTGEgbWVqb3Igc2VyaWUgZnVlICR7cmVmV2VpZ2h0fWtnIMOXICR7cmVmUmVwc30sIHBlcm8gbm8gdG9kYXMgbGxlZ2Fyb24gYSAke2hpfTogbWFudMOpbiAke3dlaWdodH1rZyB5IGFwdW50YSBhICR7cmVwc30gZW4gdG9kYXMuYDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJ1bGUgPSByZWZSZXBzIDwgbG8gPyAnYmVsb3ctcmFuZ2UtaG9sZCcgOiAncHJvZ3Jlc3MtcmVwcyc7XG4gICAgICAgIGNvbnN0IGJ1bXAgPSAocmlyICE9IG51bGwgJiYgcmlyID49IDMpID8gMiA6IDE7XG4gICAgICAgIHdlaWdodCA9IHJlZldlaWdodDtcbiAgICAgICAgcmVwcyA9IE1hdGgubWluKGhpLCByZWZSZXBzICsgYnVtcCk7XG4gICAgICAgIGlmIChyZWZSZXBzIDwgbG8pIHtcbiAgICAgICAgICAgIHJhdGlvbmFsZSA9IHJpciAhPSBudWxsXG4gICAgICAgICAgICAgICAgPyBgVHJhYmFqbyBkZSByZWZlcmVuY2lhICR7cmVmV2VpZ2h0fWtnIMOXICR7cmVmUmVwc30gKFJJUiAke3Jpcn0pLCBwb3IgZGViYWpvIGRlbCByYW5nbyAke2xvfeKAkyR7aGl9OiBtYW50w6luIGVsIHBlc28geSBhcHVudGEgYSAke3JlcHN9IHJlcHMuYFxuICAgICAgICAgICAgICAgIDogYFRyYWJham8gZGUgcmVmZXJlbmNpYSAke3JlZldlaWdodH1rZyDDlyAke3JlZlJlcHN9LCBwb3IgZGViYWpvIGRlbCByYW5nbyAke2xvfeKAkyR7aGl9OiBtYW50w6luIGVsIHBlc28geSBhcHVudGEgYSAke3JlcHN9IHJlcHMuYDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJhdGlvbmFsZSA9IHJpciAhPSBudWxsXG4gICAgICAgICAgICAgICAgPyBgSGljaXN0ZSAke3JlZldlaWdodH1rZyDDlyAke3JlZlJlcHN9IChSSVIgJHtyaXJ9KTogbWFudMOpbiBlbCBwZXNvIHkgYXB1bnRhIGEgJHtyZXBzfSByZXBzLmBcbiAgICAgICAgICAgICAgICA6IGBIaWNpc3RlICR7cmVmV2VpZ2h0fWtnIMOXICR7cmVmUmVwc306IG1hbnTDqW4gZWwgcGVzbyB5IGFwdW50YSBhICR7cmVwc30gcmVwcy5gO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmICh3ZWlnaHQgPD0gMCB8fCByZXBzIDw9IDApXG4gICAgICAgIHJldHVybiBhYnN0YWluKCdpbnRlcicsICdub25wb3NpdGl2ZS1yZXN1bHQnKTtcbiAgICByZXR1cm4geyByZWNvbW1lbmRhdGlvbjogeyB3ZWlnaHQsIHJlcHMsIHJhdGlvbmFsZSwgYmFzZWRPbjogc2Vzc2lvbnMubGVuZ3RoLCBwaGFzZTogcmVzb2x2ZWRQaGFzZSB9LFxuICAgICAgICBleHBsYW5hdGlvbjogeyBtb2RlOiAnaW50ZXInLCBydWxlLCByYW5nZTogeyBsbywgaGkgfSwgaGlzdG9yeUNvdW50OiBzZXNzaW9ucy5sZW5ndGgsXG4gICAgICAgICAgICB1c2VkU2Vzc2lvbkluZGV4OiAwLCBwb3NpdGl2ZVNldENvdW50OiB3b3JraW5nLmxlbmd0aCxcbiAgICAgICAgICAgIHJlZmVyZW5jZTogeyB3ZWlnaHQ6IHJlZldlaWdodCwgcmVwczogcmVmUmVwcywgbWluUmVwcywgcmlyLCBzZXRzQXRXZWlnaHQ6IHNldHNBdFdlaWdodC5sZW5ndGggfSxcbiAgICAgICAgICAgIGluY3JlbWVudCwgcmF3V2VpZ2h0OiB0b3BTZXRQYXNzZWQgfHwgYWxsSGl0VG9wID8gcmVmV2VpZ2h0ICsgaW5jcmVtZW50IDogcmVmV2VpZ2h0LFxuICAgICAgICAgICAgcm91bmRpbmdHcmlkOiB0b3BTZXRQYXNzZWQgfHwgYWxsSGl0VG9wID8gd2VpZ2h0R3JpZChpbmNyZW1lbnQsIHJlZldlaWdodCkgOiBudWxsLFxuICAgICAgICAgICAgd2VpZ2h0RGVsdGE6IHdlaWdodCAtIHJlZldlaWdodCwgcmVzdWx0V2VpZ2h0OiB3ZWlnaHQsXG4gICAgICAgICAgICBsaW1pdGF0aW9uczogWydmaXJzdC1zZXNzaW9uLW9ubHknLCAnY2FsbGVyLW9yZGVyJywgJ2NvbXBsZXRlZC1ub3QtZmlsdGVyZWQnXSB9IH07XG59XG4vKipcbiAqIEF1dG9ycmVndWxhY2nDs24gSU5UUkEtc2VzacOzbjogc3VnaWVyZSBsYSBzaWd1aWVudGUgc2VyaWUgbWlyYW5kbyBUT0RBUyBsYXNcbiAqIHNlcmllcyBjb21wbGV0YWRhcyBIT1kgZGVsIG1pc21vIGVqZXJjaWNpby4gUmVxdWllcmUgUklSIGVuIGNhZGEgdW5hLlxuICogQSBkaWZlcmVuY2lhIGRlIGNvbXB1dGVXb3Jrb3V0U3VnZ2VzdGlvbiAoZW50cmUgc2VzaW9uZXMpLCBTw40gcHVlZGUgYmFqYXIgcGVzby5cbiAqXG4gKiBTaSBsYSBTZXJpZSAxIChUb3AgU2V0KSBzZSByZWdpc3RyYSBhbCBmYWxsbyBhYnNvbHV0byAoUklSID09PSAwIC8gUlBFID09PSAxMCksXG4gKiBjYWxjdWxhIGF1dG9tw6F0aWNhbWVudGUgdW4gQmFjay1vZmYgU2V0ICgtMTIuNSUgZGUgcGVzbykgYXB1bnRhbmRvIGFsIHRlY2hvXG4gKiBkZWwgcmFuZ28gKCsxIG8gKzIgcmVwcyByZXNwZWN0byBhbCBUb3AgU2V0KS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV2YWx1YXRlTmV4dFNldEZyb21Ub2RheShjb21wbGV0ZWRUb2RheSwgb3B0c09yVGFyZ2V0UmVwcyA9IHt9LCBsZWdhY3lJbmNyZW1lbnQgPSAyLjUsIGxlZ2FjeVBoYXNlID0gbnVsbCkge1xuICAgIGlmICghY29tcGxldGVkVG9kYXkgfHwgY29tcGxldGVkVG9kYXkubGVuZ3RoID09PSAwKVxuICAgICAgICByZXR1cm4gYWJzdGFpbignaW50cmEnLCAnZW1wdHktdG9kYXknKTtcbiAgICBsZXQgbG8gPSA4LCBoaSA9IDEyLCBpbmNyZW1lbnQgPSAyLjU7XG4gICAgbGV0IHBoYXNlID0gbnVsbDtcbiAgICBpZiAodHlwZW9mIG9wdHNPclRhcmdldFJlcHMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlUmVwUmFuZ2Uob3B0c09yVGFyZ2V0UmVwcyk7XG4gICAgICAgIGxvID0gcGFyc2VkLmxvO1xuICAgICAgICBoaSA9IHBhcnNlZC5oaTtcbiAgICAgICAgaW5jcmVtZW50ID0gdHlwZW9mIGxlZ2FjeUluY3JlbWVudCA9PT0gJ251bWJlcicgPyBsZWdhY3lJbmNyZW1lbnQgOiAyLjU7XG4gICAgICAgIHBoYXNlID0gKGxlZ2FjeVBoYXNlICYmIHR5cGVvZiBsZWdhY3lQaGFzZSA9PT0gJ29iamVjdCcpID8gKGxlZ2FjeVBoYXNlLnBoYXNlID8/IG51bGwpIDogKGxlZ2FjeVBoYXNlID8/IG51bGwpO1xuICAgIH1cbiAgICBlbHNlIGlmIChvcHRzT3JUYXJnZXRSZXBzICYmIHR5cGVvZiBvcHRzT3JUYXJnZXRSZXBzID09PSAnb2JqZWN0Jykge1xuICAgICAgICBsbyA9IG9wdHNPclRhcmdldFJlcHMubG8gPz8gODtcbiAgICAgICAgaGkgPSBvcHRzT3JUYXJnZXRSZXBzLmhpID8/IDEyO1xuICAgICAgICBpbmNyZW1lbnQgPSBvcHRzT3JUYXJnZXRSZXBzLmluY3JlbWVudCA/PyAyLjU7XG4gICAgICAgIHBoYXNlID0gb3B0c09yVGFyZ2V0UmVwcy5waGFzZSA/PyBudWxsO1xuICAgIH1cbiAgICBjb25zdCBzZXRzID0gY29tcGxldGVkVG9kYXlcbiAgICAgICAgLm1hcChzID0+ICh7XG4gICAgICAgIHdlaWdodDogTnVtYmVyKHMud2VpZ2h0KSB8fCAwLFxuICAgICAgICByZXBzOiBOdW1iZXIocy5yZXBzKSB8fCAwLFxuICAgICAgICByaXI6IHMucmlyICE9IG51bGwgJiYgcy5yaXIgIT09ICcnID8gTnVtYmVyKHMucmlyKSA6IG51bGxcbiAgICB9KSlcbiAgICAgICAgLmZpbHRlcihzID0+IHMud2VpZ2h0ID4gMCAmJiBzLnJlcHMgPiAwKTtcbiAgICBpZiAoIXNldHMubGVuZ3RoKVxuICAgICAgICByZXR1cm4gYWJzdGFpbignaW50cmEnLCAnbm8tcG9zaXRpdmUtd29yaycpO1xuICAgIC8vIFJJUiBvYmxpZ2F0b3JpbyBlbiBUT0RBUyBsYXMgc2VyaWVzIGRlIGhveSB1c2FkYXMgcGFyYSBlbCBjw6FsY3Vsb1xuICAgIGlmICghYWxsSGF2ZUtub3duUmlyKHNldHMpKVxuICAgICAgICByZXR1cm4gYWJzdGFpbignaW50cmEnLCAnbWlzc2luZy1maW5pdGUtcmlyJyk7XG4gICAgY29uc3Qga25vd25TZXRzID0gc2V0cztcbiAgICBjb25zdCByYW5nZSA9IGFkanVzdFJlcFJhbmdlRm9yUGhhc2UobG8sIGhpLCBwaGFzZSk7XG4gICAgY29uc3QgYWRqTG8gPSByYW5nZS5sbztcbiAgICBjb25zdCBhZGpIaSA9IHJhbmdlLmhpO1xuICAgIGNvbnN0IGxhc3QgPSBrbm93blNldHNba25vd25TZXRzLmxlbmd0aCAtIDFdO1xuICAgIGNvbnN0IGZpcnN0ID0ga25vd25TZXRzWzBdO1xuICAgIGNvbnN0IG1pblJpciA9IE1hdGgubWluKC4uLmtub3duU2V0cy5tYXAocyA9PiBzLnJpcikpO1xuICAgIGNvbnN0IGF2Z1JpciA9IGtub3duU2V0cy5yZWR1Y2UoKGEsIHMpID0+IGEgKyBzLnJpciwgMCkgLyBzZXRzLmxlbmd0aDtcbiAgICBjb25zdCByaXJEcm9wID0gZmlyc3QucmlyIC0gbGFzdC5yaXI7XG4gICAgY29uc3QgcmVwRHJvcCA9IGZpcnN0LnJlcHMgLSBsYXN0LnJlcHM7XG4gICAgbGV0IHdlaWdodCA9IGxhc3Qud2VpZ2h0O1xuICAgIGxldCByZXBzID0gbGFzdC5yZXBzO1xuICAgIGxldCByYXRpb25hbGU7XG4gICAgbGV0IHJ1bGU7XG4gICAgbGV0IHJhd1dlaWdodCA9IGxhc3Qud2VpZ2h0O1xuICAgIGxldCByb3VuZGluZ0dyaWQgPSBudWxsO1xuICAgIGlmIChzZXRzLmxlbmd0aCA9PT0gMSAmJiBmaXJzdC5yaXIgPD0gMCkge1xuICAgICAgICBydWxlID0gJ2ZpcnN0LWZhaWx1cmUtYmFja29mZic7XG4gICAgICAgIC8vIFNlcmllIDEgKFRvcCBTZXQpIGFsIGZhbGxvIGFic29sdXRvIChSSVIgMCAvIFJQRSAxMCkg4oaSIEJhY2stb2ZmIFNldCAoLTEyLjUlLCBlbnRyZSAxMC0xNSUpXG4gICAgICAgIGNvbnN0IHJhd0JhY2tvZmYgPSBmaXJzdC53ZWlnaHQgKiAwLjg3NTtcbiAgICAgICAgcmF3V2VpZ2h0ID0gcmF3QmFja29mZjtcbiAgICAgICAgcm91bmRpbmdHcmlkID0gd2VpZ2h0R3JpZChpbmNyZW1lbnQsIGZpcnN0LndlaWdodCk7XG4gICAgICAgIGNvbnN0IHJvdW5kZWRCYWNrb2ZmID0gcm91bmRXb3Jrb3V0V2VpZ2h0KHJhd0JhY2tvZmYsIGluY3JlbWVudCwgZmlyc3Qud2VpZ2h0KTtcbiAgICAgICAgd2VpZ2h0ID0gcm91bmRlZEJhY2tvZmYgPCBmaXJzdC53ZWlnaHRcbiAgICAgICAgICAgID8gTWF0aC5tYXgoaW5jcmVtZW50ID4gMCA/IGluY3JlbWVudCA6IDAuNSwgcm91bmRlZEJhY2tvZmYpXG4gICAgICAgICAgICA6IHJvdW5kV29ya291dFdlaWdodChNYXRoLm1heCgwLjUsIGZpcnN0LndlaWdodCAtIE1hdGgubWF4KGluY3JlbWVudCwgMC41KSksIGluY3JlbWVudCwgZmlyc3Qud2VpZ2h0KTtcbiAgICAgICAgcmVwcyA9IGZpcnN0LnJlcHMgPCBhZGpIaVxuICAgICAgICAgICAgPyBNYXRoLm1pbihhZGpIaSwgTWF0aC5tYXgoYWRqTG8sIGZpcnN0LnJlcHMgKyAyKSlcbiAgICAgICAgICAgIDogZmlyc3QucmVwcyArIDE7XG4gICAgICAgIHJhdGlvbmFsZSA9IGBUb3AgU2V0IGFsIGZhbGxvIChSSVIgMCkg4oaSIEJhY2stb2ZmIFNldCAoLTEyLjUlKTogJHt3ZWlnaHR9IGtnIMOXICR7cmVwc30gcmVwcy5gO1xuICAgIH1cbiAgICBlbHNlIGlmIChsYXN0LnJpciA8PSAwIHx8IGxhc3QucmVwcyA8IGFkakxvKSB7XG4gICAgICAgIHJ1bGUgPSBsYXN0LnJpciA8PSAwID8gJ2xhc3QtZmFpbHVyZS1zdGVwJyA6ICdiZWxvdy1yYW5nZS1zdGVwJztcbiAgICAgICAgcmF3V2VpZ2h0ID0gTWF0aC5tYXgoMCwgbGFzdC53ZWlnaHQgLSBpbmNyZW1lbnQpO1xuICAgICAgICByb3VuZGluZ0dyaWQgPSB3ZWlnaHRHcmlkKGluY3JlbWVudCwgbGFzdC53ZWlnaHQpO1xuICAgICAgICAvLyBTZXJpZSBzdWJzZWN1ZW50ZSBhbCBmYWxsbyBvIHBvciBkZWJham8gZGVsIHN1ZWxvIGRlbCByYW5nbzogYmFqYSB1biBpbmNyZW1lbnRvXG4gICAgICAgIGNvbnN0IHN0ZXBwZWQgPSByb3VuZFdvcmtvdXRXZWlnaHQoTWF0aC5tYXgoMCwgbGFzdC53ZWlnaHQgLSBpbmNyZW1lbnQpLCBpbmNyZW1lbnQsIGxhc3Qud2VpZ2h0KTtcbiAgICAgICAgd2VpZ2h0ID0gc3RlcHBlZCA8IGxhc3Qud2VpZ2h0XG4gICAgICAgICAgICA/IE1hdGgubWF4KGluY3JlbWVudCA+IDAgPyBpbmNyZW1lbnQgOiAwLjUsIHN0ZXBwZWQpXG4gICAgICAgICAgICA6IHJvdW5kV29ya291dFdlaWdodChNYXRoLm1heCgwLjUsIGxhc3Qud2VpZ2h0IC0gTWF0aC5tYXgoaW5jcmVtZW50LCAwLjUpKSwgaW5jcmVtZW50LCBsYXN0LndlaWdodCk7XG4gICAgICAgIHJlcHMgPSBNYXRoLm1pbihhZGpIaSwgTWF0aC5tYXgoYWRqTG8sIGxhc3QucmVwcykpO1xuICAgICAgICByYXRpb25hbGUgPSBsYXN0LnJpciA8PSAwXG4gICAgICAgICAgICA/IGBIb3kgUklSICR7bGFzdC5yaXJ9IGVuIGFsZ3VuYSBzZXJpZSDihpIgYmFqYSBhICR7d2VpZ2h0fSBrZyDDlyAke3JlcHN9LmBcbiAgICAgICAgICAgIDogYFJlcHMgYmFqbyBlbCByYW5nbyAke2FkakxvfeKAkyR7YWRqSGl9IOKGkiBiYWphIGEgJHt3ZWlnaHR9IGtnIMOXICR7cmVwc30uYDtcbiAgICB9XG4gICAgZWxzZSBpZiAobGFzdC5yaXIgPT09IDEgfHwgcmlyRHJvcCA+PSAyIHx8IChyZXBEcm9wID49IDIgJiYgbGFzdC5yaXIgPD0gMikpIHtcbiAgICAgICAgcnVsZSA9ICdmYXRpZ3VlLWhvbGQnO1xuICAgICAgICAvLyBGYXRpZ2E6IG1pc21vIHBlc28sIG5vIGVtcHVqYXIgcmVwc1xuICAgICAgICB3ZWlnaHQgPSBsYXN0LndlaWdodDtcbiAgICAgICAgcmVwcyA9IE1hdGgubWluKGFkakhpLCBNYXRoLm1heChhZGpMbywgbGFzdC5yZXBzKSk7XG4gICAgICAgIHJhdGlvbmFsZSA9IGBGYXRpZ2EgZGUgaG95IChSSVIgbWluICR7bWluUmlyfSkg4oaSIG1hbnTDqW4gJHt3ZWlnaHR9IGtnIMOXICR7cmVwc30uYDtcbiAgICB9XG4gICAgZWxzZSBpZiAoYXZnUmlyID49IDIuNSAmJiBtaW5SaXIgPj0gMiAmJiBsYXN0LnJlcHMgPj0gYWRqTG8pIHtcbiAgICAgICAgcnVsZSA9ICdjb21mb3J0YWJsZS1yZXBzJztcbiAgICAgICAgLy8gQ8OzbW9kbzogbWlzbW8gcGVzbywgKzEvKzIgcmVwcyAoZG9ibGUgcHJvZ3Jlc2nDs24gaW50cmEtc2VzacOzbiDigJQgbm8gY2xvbmFyIGxhIHNlcmllIGFudGVyaW9yKVxuICAgICAgICB3ZWlnaHQgPSBsYXN0LndlaWdodDtcbiAgICAgICAgY29uc3QgYnVtcCA9IGF2Z1JpciA+PSAzID8gMiA6IDE7XG4gICAgICAgIHJlcHMgPSBNYXRoLm1pbihhZGpIaSwgbGFzdC5yZXBzICsgYnVtcCk7XG4gICAgICAgIGlmIChyZXBzID4gbGFzdC5yZXBzKSB7XG4gICAgICAgICAgICByYXRpb25hbGUgPSBgU2VyaWVzIGRlIGhveSBjw7Ntb2RhcyAoUklSIG1pbiAke21pblJpcn0pIOKGkiAke3dlaWdodH0ga2cgw5cgJHtyZXBzfSAoKyR7cmVwcyAtIGxhc3QucmVwc30gcmVwKS5gO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgLy8gWWEgZW4gZWwgdGVjaG8gZGVsIHJhbmdvIGNvbiBSSVIgYWx0bzogbGEgc3ViaWRhIGRlIHBlc28gZXMgZW50cmUgc2VzaW9uZXNcbiAgICAgICAgICAgIHJhdGlvbmFsZSA9IGBUZWNobyBkZWwgcmFuZ28gJHthZGpMb33igJMke2FkakhpfSBjb24gUklSIGFsdG8g4oaSIG1hbnTDqW4gJHt3ZWlnaHR9IGtnIMOXICR7cmVwc307IGxhIHByw7N4aW1hIHNlc2nDs24gc3ViZSBwZXNvLmA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJ1bGUgPSAnbmV1dHJhbC1ob2xkJztcbiAgICAgICAgLy8gTmV1dHJvIChSSVIgfjIpOiBtaXNtbyBwZXNvOyBzaSBhw7puIG5vIGxsZWdhcyBhbCB0ZWNobywgcGlkZSBhbCBtZW5vcyBsYXN0LnJlcHNcbiAgICAgICAgd2VpZ2h0ID0gbGFzdC53ZWlnaHQ7XG4gICAgICAgIHJlcHMgPSBNYXRoLm1pbihhZGpIaSwgTWF0aC5tYXgoYWRqTG8sIGxhc3QucmVwcykpO1xuICAgICAgICByYXRpb25hbGUgPSBgU2Vnw7puIHNlcmllcyBkZSBob3kgKFJJUiBtaW4gJHttaW5SaXJ9KSDihpIgJHt3ZWlnaHR9IGtnIMOXICR7cmVwc30uYDtcbiAgICB9XG4gICAgaWYgKHdlaWdodCA8PSAwIHx8IHJlcHMgPD0gMClcbiAgICAgICAgcmV0dXJuIGFic3RhaW4oJ2ludHJhJywgJ25vbnBvc2l0aXZlLXJlc3VsdCcpO1xuICAgIHJldHVybiB7IHJlY29tbWVuZGF0aW9uOiB7IHdlaWdodCwgcmVwcywgcmF0aW9uYWxlLCBwaGFzZSwgc291cmNlOiAnaW50cmEnIH0sXG4gICAgICAgIGV4cGxhbmF0aW9uOiB7IG1vZGU6ICdpbnRyYScsIHJ1bGUsIHJhbmdlOiB7IGxvOiBhZGpMbywgaGk6IGFkakhpIH0sIHBvc2l0aXZlU2V0Q291bnQ6IHNldHMubGVuZ3RoLFxuICAgICAgICAgICAgZmlyc3Q6IHsgLi4uZmlyc3QgfSwgbGFzdDogeyAuLi5sYXN0IH0sIG1pblJpciwgYXZnUmlyLCByaXJEcm9wLCByZXBEcm9wLFxuICAgICAgICAgICAgaW5jcmVtZW50LCByYXdXZWlnaHQsIHJvdW5kaW5nR3JpZCwgcmVzdWx0V2VpZ2h0OiB3ZWlnaHQsIHdlaWdodERlbHRhOiB3ZWlnaHQgLSBsYXN0LndlaWdodCxcbiAgICAgICAgICAgIGZhbGxiYWNrU3RlcDogcm91bmRpbmdHcmlkICE9IG51bGwgJiYgKHJ1bGUgPT09ICdmaXJzdC1mYWlsdXJlLWJhY2tvZmYnXG4gICAgICAgICAgICAgICAgPyAhKHJvdW5kV29ya291dFdlaWdodChyYXdXZWlnaHQsIGluY3JlbWVudCwgZmlyc3Qud2VpZ2h0KSA8IGZpcnN0LndlaWdodClcbiAgICAgICAgICAgICAgICA6ICEocm91bmRXb3Jrb3V0V2VpZ2h0KHJhd1dlaWdodCwgaW5jcmVtZW50LCBsYXN0LndlaWdodCkgPCBsYXN0LndlaWdodCkpLFxuICAgICAgICAgICAgbGltaXRhdGlvbnM6IFsnY2FsbGVyLW9yZGVyJywgJ2NhbGxlci1jb21wbGV0aW9uLWZpbHRlcicsICdyaXItcmVxdWlyZWQnXSB9IH07XG59XG4vKiogU3RhYmxlIHB1YmxpYyBwcm9qZWN0aW9ucy4gRXhwbGFuYXRpb25zIHJlbWFpbiBpbnRlcm5hbCBhbmQgYXJlIG5ldmVyIGFkZGVkXG4gKiB0byBVSSBEVE9zLCBwZXJzaXN0ZWQgc3VnZ2VzdGlvbnMsIG9wZXJhdGlvbnMsIHJlY2VpcHRzIG9yIHJlcXVlc3QgaGFzaGVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVXb3Jrb3V0U3VnZ2VzdGlvbihzZXNzaW9ucywgdGFyZ2V0UmVwcywgaW5jcmVtZW50LCBwaGFzZSA9IG51bGwpIHtcbiAgICByZXR1cm4gZXZhbHVhdGVXb3Jrb3V0U3VnZ2VzdGlvbihzZXNzaW9ucywgdGFyZ2V0UmVwcywgaW5jcmVtZW50LCBwaGFzZSkucmVjb21tZW5kYXRpb247XG59XG5leHBvcnQgZnVuY3Rpb24gc3VnZ2VzdE5leHRTZXRGcm9tVG9kYXkoY29tcGxldGVkVG9kYXksIG9wdHNPclRhcmdldFJlcHMgPSB7fSwgbGVnYWN5SW5jcmVtZW50ID0gMi41LCBsZWdhY3lQaGFzZSA9IG51bGwpIHtcbiAgICByZXR1cm4gZXZhbHVhdGVOZXh0U2V0RnJvbVRvZGF5KGNvbXBsZXRlZFRvZGF5LCBvcHRzT3JUYXJnZXRSZXBzLCBsZWdhY3lJbmNyZW1lbnQsIGxlZ2FjeVBoYXNlKS5yZWNvbW1lbmRhdGlvbjtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXNtYXJ0TG9hZGluZy5qcy5tYXAiLCIvKiogQ2l2aWwgQ0RNWCByZWFkaW5ncyBhcmUgZGlzdGluY3QgZnJvbSBlbGFwc2VkIGR1cmF0aW9ucyBhbmQgVVRDIGluc3RhbnRzLlxuICogTm8gY2xvY2sgaGVyZTogYWRhcHRlcnMgc3VwcGx5IG5vdy4gTGVnYWN5IGJvdW5kcyByZW1haW4gdGhlIHdyaXRlIHBvbGljeS4gKi9cbmV4cG9ydCBjb25zdCBUUkFJTklOR19USU1FWk9ORSA9ICdBbWVyaWNhL01leGljb19DaXR5JztcbmNvbnN0IGNpdmlsRm9ybWF0dGVyID0gbmV3IEludGwuRGF0ZVRpbWVGb3JtYXQoJ2VuLUNBJywge1xuICAgIHRpbWVab25lOiBUUkFJTklOR19USU1FWk9ORSwgeWVhcjogJ251bWVyaWMnLCBtb250aDogJzItZGlnaXQnLCBkYXk6ICcyLWRpZ2l0J1xufSk7XG5jb25zdCBvZmZzZXRGb3JtYXR0ZXIgPSBuZXcgSW50bC5EYXRlVGltZUZvcm1hdCgnZW4tVVMnLCB7IHRpbWVab25lOiBUUkFJTklOR19USU1FWk9ORSwgdGltZVpvbmVOYW1lOiAnc2hvcnRPZmZzZXQnIH0pO1xuZXhwb3J0IGZ1bmN0aW9uIHRyYWluaW5nQ2l2aWxEYXRlKGluc3RhbnQpIHtcbiAgICByZXR1cm4gY2l2aWxGb3JtYXR0ZXIuZm9ybWF0KGluc3RhbnQgaW5zdGFuY2VvZiBEYXRlID8gaW5zdGFudCA6IG5ldyBEYXRlKGluc3RhbnQpKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiB0cmFpbmluZ1V0Y09mZnNldE1pbnV0ZXMoaW5zdGFudCkge1xuICAgIGNvbnN0IHBhcnQgPSBvZmZzZXRGb3JtYXR0ZXIuZm9ybWF0VG9QYXJ0cyhpbnN0YW50KS5maW5kKHAgPT4gcC50eXBlID09PSAndGltZVpvbmVOYW1lJyk/LnZhbHVlIHx8ICdHTVQtNic7XG4gICAgY29uc3QgbWF0Y2ggPSBwYXJ0Lm1hdGNoKC9HTVQoWystXSkoXFxkKykoPzo6KFxcZCspKT8vKTtcbiAgICBpZiAoIW1hdGNoKVxuICAgICAgICByZXR1cm4gLTM2MDtcbiAgICBjb25zdCBzaWduID0gbWF0Y2hbMV0gPT09ICctJyA/IC0xIDogMTtcbiAgICByZXR1cm4gc2lnbiAqIChwYXJzZUludChtYXRjaFsyXSwgMTApICogNjAgKyAobWF0Y2hbM10gPyBwYXJzZUludChtYXRjaFszXSwgMTApIDogMCkpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGNpdmlsRGF5T2ZXZWVrKGRhdGVTdHIpIHtcbiAgICByZXR1cm4gbmV3IERhdGUoYCR7ZGF0ZVN0cn1UMTI6MDA6MDBaYCkuZ2V0VVRDRGF5KCk7XG59XG5leHBvcnQgZnVuY3Rpb24gc2hpZnRUcmFpbmluZ0NpdmlsRGF0ZShkYXRlU3RyLCBkYXlzKSB7XG4gICAgaWYgKCEvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdChkYXRlU3RyKSB8fCAhTnVtYmVyLmlzSW50ZWdlcihkYXlzKSlcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgY2l2aWwgZGF0ZS9kYXkgY291bnQnKTtcbiAgICBjb25zdCBhbmNob3IgPSBuZXcgRGF0ZShgJHtkYXRlU3RyfVQxMjowMDowMFpgKTtcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShhbmNob3IuZ2V0VGltZSgpKSB8fCBhbmNob3IudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCkgIT09IGRhdGVTdHIpXG4gICAgICAgIHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIGNpdmlsIGRhdGUnKTtcbiAgICBhbmNob3Iuc2V0VVRDRGF0ZShhbmNob3IuZ2V0VVRDRGF0ZSgpICsgZGF5cyk7XG4gICAgcmV0dXJuIGFuY2hvci50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBsYXN0VHJhaW5pbmdDaXZpbERheXMobiwgaW5zdGFudCkge1xuICAgIGlmICghTnVtYmVyLmlzSW50ZWdlcihuKSB8fCBuIDwgMClcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgY2l2aWwgZGF5IGNvdW50Jyk7XG4gICAgY29uc3QgdG9kYXkgPSB0cmFpbmluZ0NpdmlsRGF0ZShpbnN0YW50KSwgZGF5cyA9IFtdO1xuICAgIGZvciAobGV0IGkgPSBuIC0gMTsgaSA+PSAwOyBpLS0pXG4gICAgICAgIGRheXMucHVzaChzaGlmdFRyYWluaW5nQ2l2aWxEYXRlKHRvZGF5LCAtaSkpO1xuICAgIHJldHVybiBkYXlzO1xufVxuLyoqIEhpc3RvcmljYWwgcXVlcnkvd3JpdGUgY29tcGF0aWJpbGl0eS4gTWF5IGJlIHdyb25nIG9uIGEgMjMvMjUtaG91ciBkYXkuXG4gKiBEZWxpYmVyYXRlbHkgbmFtZWQsIG5ldmVyIHNpbGVudGx5IHN1YnN0aXR1dGVkIGluIG9wZXJhdGlvbnMgb3IgaGFzaGVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxlZ2FjeVRyYWluaW5nRGF5Qm91bmRzKGluc3RhbnQpIHtcbiAgICBjb25zdCBkYXRlU3RyID0gdHJhaW5pbmdDaXZpbERhdGUoaW5zdGFudCksIG9mZnNldE1pbiA9IHRyYWluaW5nVXRjT2Zmc2V0TWludXRlcyhpbnN0YW50KTtcbiAgICBjb25zdCBzaWduID0gb2Zmc2V0TWluIDw9IDAgPyAnLScgOiAnKycsIGFicyA9IE1hdGguYWJzKG9mZnNldE1pbik7XG4gICAgY29uc3Qgb2Zmc2V0U3RyID0gYCR7c2lnbn0ke1N0cmluZyhNYXRoLmZsb29yKGFicyAvIDYwKSkucGFkU3RhcnQoMiwgJzAnKX06JHtTdHJpbmcoYWJzICUgNjApLnBhZFN0YXJ0KDIsICcwJyl9YDtcbiAgICBjb25zdCBzdGFydCA9IG5ldyBEYXRlKGAke2RhdGVTdHJ9VDAwOjAwOjAwJHtvZmZzZXRTdHJ9YCk7XG4gICAgcmV0dXJuIHsgc3RhcnQsIGVuZDogbmV3IERhdGUoc3RhcnQuZ2V0VGltZSgpICsgODY0MDAwMDApLCBkYXRlU3RyIH07XG59XG5mdW5jdGlvbiBjaXZpbE1pZG5pZ2h0KGRhdGVTdHIpIHtcbiAgICBjb25zdCB1dGMgPSBuZXcgRGF0ZShgJHtkYXRlU3RyfVQwMDowMDowMFpgKS5nZXRUaW1lKCk7XG4gICAgbGV0IGNhbmRpZGF0ZSA9IHV0YztcbiAgICAvLyBDRE1YIHRyYW5zaXRpb25zIG9jY3VycmVkIGFmdGVyIG1pZG5pZ2h0LiBSZXNvbHZlIG9mZnNldCBhdCBtaWRuaWdodCBpdHNlbGYsXG4gICAgLy8gaW5kZXBlbmRlbnRseSBmb3IgYm90aCBkYXRlczsgbmV2ZXIgYWRkIDI0aCB0byBhIGxvY2FsIG1pZG5pZ2h0LlxuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgNDsgaSsrKSB7XG4gICAgICAgIGNvbnN0IG5leHQgPSB1dGMgLSB0cmFpbmluZ1V0Y09mZnNldE1pbnV0ZXMobmV3IERhdGUoY2FuZGlkYXRlKSkgKiA2MDAwMDtcbiAgICAgICAgaWYgKG5leHQgPT09IGNhbmRpZGF0ZSlcbiAgICAgICAgICAgIHJldHVybiBuZXcgRGF0ZShuZXh0KTtcbiAgICAgICAgY2FuZGlkYXRlID0gbmV4dDtcbiAgICB9XG4gICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0NETVggbWlkbmlnaHQgZGlkIG5vdCByZXNvbHZlJyk7XG59XG5leHBvcnQgZnVuY3Rpb24gdHJhaW5pbmdDaXZpbERheUJvdW5kcyhpbnN0YW50KSB7XG4gICAgY29uc3QgZGF0ZVN0ciA9IHRyYWluaW5nQ2l2aWxEYXRlKGluc3RhbnQpO1xuICAgIHJldHVybiB7IHN0YXJ0OiBjaXZpbE1pZG5pZ2h0KGRhdGVTdHIpLCBlbmQ6IGNpdmlsTWlkbmlnaHQoc2hpZnRUcmFpbmluZ0NpdmlsRGF0ZShkYXRlU3RyLCAxKSksIGRhdGVTdHIgfTtcbn1cbi8qKiBNb25kYXkuLlN1bmRheSBib3VuZHMsIGluY2x1ZGluZyBTdW5kYXlzIGFuZCB5ZWFyL21vbnRoIGNyb3NzaW5ncy4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0cmFpbmluZ0NpdmlsV2VlayhpbnN0YW50KSB7XG4gICAgY29uc3QgZGF0ZVN0ciA9IHRyYWluaW5nQ2l2aWxEYXRlKGluc3RhbnQpLCB3ZWVrZGF5ID0gY2l2aWxEYXlPZldlZWsoZGF0ZVN0cik7XG4gICAgY29uc3Qgc3RhcnREYXkgPSBzaGlmdFRyYWluaW5nQ2l2aWxEYXRlKGRhdGVTdHIsIC0oKHdlZWtkYXkgKyA2KSAlIDcpKTtcbiAgICByZXR1cm4geyBzdGFydERheSwgZW5kRGF5RXhjbHVzaXZlOiBzaGlmdFRyYWluaW5nQ2l2aWxEYXRlKHN0YXJ0RGF5LCA3KSB9O1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9Y2FsZW5kYXIuanMubWFwIiwiZnVuY3Rpb24gYWRkVHJhaW5pbmdMb2FkKHRvdGFsLCBzLCBwb2xpY3kpIHtcbiAgICBjb25zdCBwZGYgPSBwb2xpY3kgPT09ICdsZWdhY3ktcGRmLXplcm8tZmFsbGJhY2snO1xuICAgIGNvbnN0IHcgPSBwZGYgPyBOdW1iZXIocy53ZWlnaHQpIHx8IDAgOiBOdW1iZXIocy53ZWlnaHQgfHwgMCk7XG4gICAgY29uc3QgciA9IHBkZiA/IE51bWJlcihzLnJlcHMpIHx8IDAgOiBOdW1iZXIocy5yZXBzIHx8IDApO1xuICAgIHRvdGFsICs9IHcgKiByO1xuICAgIGlmIChwb2xpY3kgPT09ICdyZWNvcmRlZC1zaWRlcycpIHtcbiAgICAgICAgdG90YWwgKz0gTnVtYmVyKHMud2VpZ2h0UmlnaHQgfHwgMCkgKiBOdW1iZXIocy5yZXBzUmlnaHQgfHwgMCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHBvbGljeSAhPT0gJ2xlZnQtb25seScgJiYgKHMud2VpZ2h0UmlnaHQgIT0gbnVsbCB8fCBzLnJlcHNSaWdodCAhPSBudWxsKSkge1xuICAgICAgICB0b3RhbCArPSBwZGYgPyAoTnVtYmVyKHMud2VpZ2h0UmlnaHQpIHx8IHcpICogKE51bWJlcihzLnJlcHNSaWdodCkgfHwgcilcbiAgICAgICAgICAgIDogTnVtYmVyKHMud2VpZ2h0UmlnaHQgPz8gcy53ZWlnaHQgPz8gMCkgKiBOdW1iZXIocy5yZXBzUmlnaHQgPz8gcy5yZXBzID8/IDApO1xuICAgIH1cbiAgICByZXR1cm4gdG90YWw7XG59XG5leHBvcnQgZnVuY3Rpb24gdHJhaW5pbmdMb2FkVm9sdW1lKHNldHMsIHBvbGljeSkge1xuICAgIGxldCB0b3RhbCA9IDA7XG4gICAgZm9yIChjb25zdCBzIG9mIHNldHMpXG4gICAgICAgIHRvdGFsID0gYWRkVHJhaW5pbmdMb2FkKHRvdGFsLCBzLCBwb2xpY3kpO1xuICAgIHJldHVybiB0b3RhbDtcbn1cbmV4cG9ydCBmdW5jdGlvbiB0cmFpbmluZ1Nlc3Npb25Mb2FkU3VtbWFyeShzZXNzaW9ucykge1xuICAgIC8vIEtlZXAgc2VxdWVudGlhbCBhZGRpdGlvbiBhY3Jvc3Mgc2Vzc2lvbnMgKGRvIG5vdCBzdW0gcGVyLXNlc3Npb24gc3VidG90YWxzKS5cbiAgICBsZXQgdG90YWwgPSAwLCBzZXRzID0gMDtcbiAgICBmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpXG4gICAgICAgIGZvciAoY29uc3QgcyBvZiBzZXNzaW9uLnNldHMgfHwgW10pIHtcbiAgICAgICAgICAgIHRvdGFsID0gYWRkVHJhaW5pbmdMb2FkKHRvdGFsLCBzLCAnaW5oZXJpdC1taXNzaW5nLXJpZ2h0Jyk7XG4gICAgICAgICAgICBzZXRzKys7XG4gICAgICAgIH1cbiAgICByZXR1cm4geyB2b2x1bWU6IHRvdGFsLCBzZXRzIH07XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD12b2x1bWUuanMubWFwIiwiZXhwb3J0IGZ1bmN0aW9uIGdldEFjdGl2ZVRyYWluaW5nQmxvY2soYmxvY2tzKSB7XG4gICAgY29uc3Qgc3RhcnRlZCA9IChibG9ja3MgfHwgW10pLmZpbHRlcihiID0+IGIuc3RhcnRlZEF0ICE9IG51bGwpO1xuICAgIGlmICghc3RhcnRlZC5sZW5ndGgpXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIHJldHVybiBzdGFydGVkLnJlZHVjZSgobGF0ZXN0LCBiKSA9PiAoYi5zdGFydGVkQXQgJiYgbGF0ZXN0LnN0YXJ0ZWRBdCAmJiBiLnN0YXJ0ZWRBdC5nZXRUaW1lKCkgPiBsYXRlc3Quc3RhcnRlZEF0LmdldFRpbWUoKSA/IGIgOiBsYXRlc3QpLCBzdGFydGVkWzBdKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBlbGFwc2VkV2Vla0luQmxvY2soYmxvY2ssIG5vdykge1xuICAgIGlmICghYmxvY2s/LnN0YXJ0ZWRBdClcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgY29uc3QgZGF5c1NpbmNlID0gTWF0aC5mbG9vcigobm93LmdldFRpbWUoKSAtIGJsb2NrLnN0YXJ0ZWRBdC5nZXRUaW1lKCkpIC8gODY0MDAwMDApO1xuICAgIHJldHVybiBNYXRoLmZsb29yKGRheXNTaW5jZSAvIDcpICsgMTtcbn1cbmV4cG9ydCBmdW5jdGlvbiByb3V0aW5lUGhhc2VTdGF0dXNBdChyb3V0aW5lLCBub3cpIHtcbiAgICBjb25zdCBhY3RpdmVCbG9jayA9IGdldEFjdGl2ZVRyYWluaW5nQmxvY2socm91dGluZS5ibG9ja3MgfHwgW10pO1xuICAgIGlmIChhY3RpdmVCbG9jaylcbiAgICAgICAgcmV0dXJuIHsgaXNEZWxvYWQ6IGFjdGl2ZUJsb2NrLnBoYXNlID09PSAnZGVsb2FkJywgc291cmNlOiAnYmxvY2snLCBwaGFzZTogYWN0aXZlQmxvY2sucGhhc2UsIGJsb2NrOiBhY3RpdmVCbG9jayB9O1xuICAgIGlmIChyb3V0aW5lLmFkYXB0aXZlRGVsb2FkVW50aWwgJiYgcm91dGluZS5hZGFwdGl2ZURlbG9hZFVudGlsLmdldFRpbWUoKSA+IG5vdy5nZXRUaW1lKCkpIHtcbiAgICAgICAgcmV0dXJuIHsgaXNEZWxvYWQ6IHRydWUsIHNvdXJjZTogJ2FkYXB0aXZlJywgcGhhc2U6ICdkZWxvYWQnLCB1bnRpbDogcm91dGluZS5hZGFwdGl2ZURlbG9hZFVudGlsIH07XG4gICAgfVxuICAgIHJldHVybiB7IGlzRGVsb2FkOiBmYWxzZSwgc291cmNlOiBudWxsLCBwaGFzZTogbnVsbCB9O1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9bWVzb2N5Y2xlcy5qcy5tYXAiLCJjb25zdCBTVE9QV09SRFMgPSBuZXcgU2V0KFsnZGUnLCAnZGVsJywgJ2xhJywgJ2VsJywgJ2xvcycsICdsYXMnLCAnZW4nLCAnbycsICd1JywgJ3knLCAnYScsICdjb24nLCAnYWwnLCAncGFyYScsICd1bmEnLCAndW4nXSk7XG4vLyBHcnVwb3MgbXVzY3VsYXJlczogY3VhbmRvIGFwYXJlY2VuIEVOVFJFIFBBUsOJTlRFU0lTIHNvbiB1bmEgYWNsYXJhY2nDs25cbi8vIHJlZHVuZGFudGUgKFwiY3VybCBtYXJ0aWxsbyAoYsOtY2VwcylcIikgeSBkZWJlbiBpZ25vcmFyc2UuIEZ1ZXJhIGRlIHBhcsOpbnRlc2lzXG4vLyBzw60gcHVlZGVuIHNlciBwYXJ0ZSBkZWwgbm9tYnJlIChcImN1cmwgZmVtb3JhbFwiKSwgYXPDrSBxdWUgTk8gc2UgdG9jYW4gYWjDrS5cbmNvbnN0IE1VU0NMRV9XT1JEUyA9IG5ldyBTZXQoW1xuICAgICdiaWNlcHMnLCAndHJpY2VwcycsICdwZWNobycsICdwZWN0b3JhbCcsICdwZWN0b3JhbGVzJywgJ2VzcGFsZGEnLCAnZG9yc2FsJywgJ2RvcnNhbGVzJyxcbiAgICAnaG9tYnJvJywgJ2hvbWJyb3MnLCAnZGVsdG9pZGVzJywgJ3BpZXJuYScsICdwaWVybmFzJywgJ2N1YWRyaWNlcHMnLCAnY3VhZHJpY2VwJyxcbiAgICAnZmVtb3JhbCcsICdmZW1vcmFsZXMnLCAnZ2x1dGVvJywgJ2dsdXRlb3MnLCAnZ2VtZWxvJywgJ2dlbWVsb3MnLCAncGFudG9ycmlsbGEnLCAncGFudG9ycmlsbGFzJyxcbiAgICAnY29yZScsICdhYmRvbWVuJywgJ2FiZG9taW5hbGVzJywgJ2FicycsICd0cmFwZWNpbycsICd0cmFwZWNpb3MnLCAnYW50ZWJyYXpvJywgJ2FudGVicmF6b3MnLFxuICAgICdhZHVjdG9yJywgJ2FkdWN0b3JlcycsICdhYmR1Y3RvcicsICdhYmR1Y3RvcmVzJyxcbl0pO1xuLy8gUXVpdGEgbG9zIHBhcsOpbnRlc2lzIGN1eW8gY29udGVuaWRvIGVzIHNvbG8gdW4gZ3J1cG8gbXVzY3VsYXIgKGFjbGFyYWNpw7NuKS5cbi8vIEVsIHJlc3RvIGRlIHBhcsOpbnRlc2lzIChlcXVpcGFtaWVudG8sIHZhcmlhbnRlKSBzZSBjb25zZXJ2YSBzaW4gbG9zIHPDrW1ib2xvcy5cbmZ1bmN0aW9uIHN0cmlwTXVzY2xlUGFyZW50aGV0aWNhbHMocykge1xuICAgIHJldHVybiBzLnJlcGxhY2UoL1xcKChbXildKilcXCkvZywgKF8sIGlubmVyKSA9PiB7XG4gICAgICAgIGNvbnN0IHdvcmRzID0gaW5uZXIudG9Mb3dlckNhc2UoKS5ub3JtYWxpemUoJ05GRCcpLnJlcGxhY2UoL1vMgC3Nr10vZywgJycpXG4gICAgICAgICAgICAuc3BsaXQoL1tcXHMsL10rLykuZmlsdGVyKEJvb2xlYW4pO1xuICAgICAgICBjb25zdCBhbGxNdXNjbGUgPSB3b3Jkcy5sZW5ndGggPiAwICYmIHdvcmRzLmV2ZXJ5KHcgPT4gTVVTQ0xFX1dPUkRTLmhhcyh3KSk7XG4gICAgICAgIHJldHVybiBhbGxNdXNjbGUgPyAnICcgOiBgICR7aW5uZXJ9IGA7XG4gICAgfSk7XG59XG4vLyBTaW7Ds25pbW9zIC8gYWJyZXZpYXR1cmFzIC8gcGx1cmFsZXMg4oaSIGZvcm1hIGNhbsOzbmljYS4gQ29uc2VydmFkb3IgYSBwcm9ww7NzaXRvLlxuY29uc3QgU1lOT05ZTVMgPSB7XG4gICAgZWxldjogJ2VsZXZhY2lvbicsIGVsZXZhY2lvbmVzOiAnZWxldmFjaW9uJywgZWxldmFjaW9uOiAnZWxldmFjaW9uJyxcbiAgICBsYXRlcmFsOiAnbGF0ZXJhbCcsIGxhdGVyYWxlczogJ2xhdGVyYWwnLCBsYXQ6ICdsYXRlcmFsJyxcbiAgICBleHQ6ICdleHRlbnNpb24nLCBleHRlbnNpb246ICdleHRlbnNpb24nLCBleHRlbnNpb25lczogJ2V4dGVuc2lvbicsXG4gICAgZmxleDogJ2ZsZXhpb24nLCBmbGV4aW9uOiAnZmxleGlvbicsIGZsZXhpb25lczogJ2ZsZXhpb24nLFxuICAgIGN1cmxzOiAnY3VybCcsIGN1cmw6ICdjdXJsJyxcbiAgICBjcnVjZTogJ2NydWNlJywgY3J1Y2VzOiAnY3J1Y2UnLFxuICAgIG1hcTogJ21hcXVpbmEnLCBtYXF1aW5hOiAnbWFxdWluYScsXG4gICAgbWFuY3Vlcm5hOiAnbWFuY3Vlcm5hJywgbWFuY3Vlcm5hczogJ21hbmN1ZXJuYScsXG4gICAgcG9zdDogJ3Bvc3RlcmlvcicsIHBvc3RlcmlvcjogJ3Bvc3RlcmlvcicsXG4gICAgYW50OiAnYW50ZXJpb3InLCBhbnRlcmlvcjogJ2FudGVyaW9yJyxcbiAgICB1bmlsYXQ6ICd1bmlsYXRlcmFsJywgdW5pbGF0ZXJhbDogJ3VuaWxhdGVyYWwnLFxuICAgIGJpbGF0OiAnYmlsYXRlcmFsJywgYmlsYXRlcmFsOiAnYmlsYXRlcmFsJyxcbiAgICBwaWVybmE6ICdwaWVybmEnLCBwaWVybmFzOiAncGllcm5hJyxcbiAgICBpbnZlcnNvOiAnaW52ZXJzbycsIGludmVyc29zOiAnaW52ZXJzbycsXG4gICAgc2VudGFkbzogJ3NlbnRhZG8nLCBzZW50YWRhOiAnc2VudGFkbycsXG59O1xuLy8gTm9ybWFsaXphY2nDs24gbGlnZXJhIHBhcmEgbW9zdHJhci9jb21wYXJhciBkZSBmb3JtYSBiw6FzaWNhOlxuLy8gbWluw7pzY3VsYXMsIHNpbiB0aWxkZXMsIHNpbiBwcmVmaWpvIGRlIG9yZGVuIChcIkExLlwiLCBcIjEpXCIpLCBwdW50dWFjacOzbiDihpIgZXNwYWNpby5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVFeGVyY2lzZU5hbWUobmFtZSkge1xuICAgIHJldHVybiBzdHJpcE11c2NsZVBhcmVudGhldGljYWxzKG5hbWUgfHwgJycpXG4gICAgICAgIC50b0xvd2VyQ2FzZSgpXG4gICAgICAgIC5ub3JtYWxpemUoJ05GRCcpLnJlcGxhY2UoL1vMgC3Nr10vZywgJycpIC8vIHF1aXRhIHRpbGRlc1xuICAgICAgICAucmVwbGFjZSgvXlthLXpdP1xcZCtbLik6XFwtXFxzXSsvaSwgJycpIC8vIHByZWZpam8gZGUgb3JkZW46IFwiYTEuXCIsIFwiMSlcIiwgXCIzIC0gXCJcbiAgICAgICAgLnJlcGxhY2UoL1soKSdcIsK0YC4sOy9dL2csICcgJykgLy8gcHVudHVhY2nDs24g4oaSIGVzcGFjaW9cbiAgICAgICAgLnJlcGxhY2UoL1xccysvZywgJyAnKVxuICAgICAgICAudHJpbSgpO1xufVxuLy8gQ2xhdmUgY2Fuw7NuaWNhIHJvYnVzdGEgcGFyYSBBR1JVUEFSIHZhcmlhbnRlcyBkZWwgbWlzbW8gZWplcmNpY2lvLlxuLy8gUXVpdGEgcmVsbGVubyB5IHVuaWZpY2Egc2luw7NuaW1vcy9wbHVyYWxlcy4gTm8gcmVvcmRlbmEgdG9rZW5zIHBhcmEgbm9cbi8vIGZ1c2lvbmFyIG1vdmltaWVudG9zIGRpc3RpbnRvcyBwb3IgYWNjaWRlbnRlLlxuZXhwb3J0IGZ1bmN0aW9uIGNhbm9uaWNhbEV4ZXJjaXNlS2V5KG5hbWUpIHtcbiAgICBjb25zdCB0b2tlbnMgPSBub3JtYWxpemVFeGVyY2lzZU5hbWUobmFtZSlcbiAgICAgICAgLnNwbGl0KCcgJylcbiAgICAgICAgLmZpbHRlcih0ID0+IHQgJiYgIVNUT1BXT1JEUy5oYXModCkpXG4gICAgICAgIC5tYXAodCA9PiBTWU5PTllNU1t0XSB8fCB0KTtcbiAgICByZXR1cm4gdG9rZW5zLmpvaW4oJyAnKTtcbn1cbi8vIMK/U29uIGVsIG1pc21vIGVqZXJjaWNpbyAocG9yIG5vbWJyZSk/XG5leHBvcnQgZnVuY3Rpb24gaXNTYW1lRXhlcmNpc2UoYSwgYikge1xuICAgIHJldHVybiBjYW5vbmljYWxFeGVyY2lzZUtleShhKSA9PT0gY2Fub25pY2FsRXhlcmNpc2VLZXkoYik7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1leGVyY2lzZUlkZW50aXR5LmpzLm1hcCIsImltcG9ydCB7IGNhbm9uaWNhbEV4ZXJjaXNlS2V5IH0gZnJvbSAnLi9leGVyY2lzZUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGNhcHBlZEVwbGV5MVJNIGFzIGVwbGV5MVJNIH0gZnJvbSAnLi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBwZXJzb25hbFJlY29yZEVwbGV5MVJNIH0gZnJvbSAnLi9wZXJzb25hbFJlY29yZHMuanMnO1xuaW1wb3J0IHsgZWZmZWN0aXZlV29ya291dFNldCB9IGZyb20gJy4vc21hcnRMb2FkaW5nLmpzJztcbmltcG9ydCB7IHRyYWluaW5nQ2l2aWxEYXRlIH0gZnJvbSAnLi9jYWxlbmRhci5qcyc7XG5mdW5jdGlvbiBlZmZlY3RpdmVTZXQoc2V0KSB7XG4gICAgY29uc3QgdyA9IHBhcnNlRmxvYXQoYCR7c2V0LndlaWdodH1gKTtcbiAgICBjb25zdCByID0gcGFyc2VJbnQoYCR7c2V0LnJlcHN9YCk7XG4gICAgaWYgKCF3IHx8ICFyKVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBoYXNSaWdodCA9IHNldC53ZWlnaHRSaWdodCAhPSBudWxsIHx8IHNldC5yZXBzUmlnaHQgIT0gbnVsbDtcbiAgICBjb25zdCB3ZWlnaHQgPSBoYXNSaWdodCA/IE1hdGgubWluKHcsIHBhcnNlRmxvYXQoYCR7c2V0LndlaWdodFJpZ2h0ID8/IHd9YCkpIDogdztcbiAgICBjb25zdCByZXBzID0gaGFzUmlnaHQgPyBNYXRoLm1pbihyLCBwYXJzZUludChgJHtzZXQucmVwc1JpZ2h0ID8/IHJ9YCkpIDogcjtcbiAgICByZXR1cm4geyB3ZWlnaHQsIHJlcHMgfTtcbn1cbi8vIEFncnVwYSBlbCBoaXN0b3JpYWwgZGUgd29ya291dHMgcG9yIGVqZXJjaWNpbyBDQU7Dk05JQ08gKGNvbnNvbGlkYW5kbyB2YXJpYW50ZXNcbi8vIGRlIG5vbWJyZSkuIERldnVlbHZlIHVuIE1hcDogY2xhdmUgY2Fuw7NuaWNhIC0+IHsgbmFtZXMsIG11c2NsZUdyb3VwLCBzZXNzaW9ucyB9XG4vLyBkb25kZSBzZXNzaW9ucyA9IFt7IGRhdGUsIGJlc3QxUk0sIHdlaWdodCwgcmVwcyB9XSBvcmRlbmFkYXMgcG9yIGZlY2hhIChhc2MpLlxuLy8gVW5hIFwic2VzacOzblwiIGVzIHVuIGTDrWEgbG9jYWwgZGlzdGludG8gKG5vIHNlIHBhcnRlIHVuYSBzZXNpw7NuIG5vY3R1cm5hIGVuIGRvcykuXG5leHBvcnQgZnVuY3Rpb24gZ3JvdXBUcmFpbmluZ0hpc3RvcnkoaGlzdG9yeSwgZGF5S2V5KSB7XG4gICAgY29uc3QgcGVuZGluZyA9IG5ldyBNYXAoKTtcbiAgICAoaGlzdG9yeSB8fCBbXSkuZm9yRWFjaCh3b3Jrb3V0ID0+IHtcbiAgICAgICAgY29uc3QgcmF3TmFtZSA9IHdvcmtvdXQuZXhlcmNpc2U/Lm5hbWU7XG4gICAgICAgIGlmICghcmF3TmFtZSlcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgY29uc3Qga2V5ID0gY2Fub25pY2FsRXhlcmNpc2VLZXkocmF3TmFtZSk7XG4gICAgICAgIGlmICgha2V5KVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBsZXQgZyA9IHBlbmRpbmcuZ2V0KGtleSk7XG4gICAgICAgIGlmICghZykge1xuICAgICAgICAgICAgZyA9IHsgbmFtZXM6IG5ldyBTZXQoKSwgbXVzY2xlR3JvdXA6IG51bGwsIGJ5RGF0ZToge30gfTtcbiAgICAgICAgICAgIHBlbmRpbmcuc2V0KGtleSwgZyk7XG4gICAgICAgIH1cbiAgICAgICAgZy5uYW1lcy5hZGQocmF3TmFtZSk7XG4gICAgICAgIGlmICghZy5tdXNjbGVHcm91cCAmJiB3b3Jrb3V0LmV4ZXJjaXNlPy5tdXNjbGVHcm91cClcbiAgICAgICAgICAgIGcubXVzY2xlR3JvdXAgPSB3b3Jrb3V0LmV4ZXJjaXNlLm11c2NsZUdyb3VwO1xuICAgICAgICBjb25zdCBkYXRlS2V5ID0gZGF5S2V5KHdvcmtvdXQuZGF0ZSk7XG4gICAgICAgICh3b3Jrb3V0LnNldHMgfHwgW10pLmZvckVhY2goc2V0ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGVmZiA9IGVmZmVjdGl2ZVNldChzZXQpO1xuICAgICAgICAgICAgaWYgKCFlZmYpXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgKGcuYnlEYXRlW2RhdGVLZXldIHx8IChnLmJ5RGF0ZVtkYXRlS2V5XSA9IFtdKSkucHVzaChlZmYpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgICBjb25zdCBncm91cHMgPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBba2V5LCBnXSBvZiBwZW5kaW5nKSB7XG4gICAgICAgIGNvbnN0IHNlc3Npb25zID0gT2JqZWN0LmtleXMoZy5ieURhdGUpLnNvcnQoKS5tYXAoZGF0ZUtleSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzZXRzID0gZy5ieURhdGVbZGF0ZUtleV07XG4gICAgICAgICAgICBsZXQgYmVzdCA9IHsgd2VpZ2h0OiAwLCByZXBzOiAwLCBybTogMCB9O1xuICAgICAgICAgICAgZm9yIChjb25zdCBzIG9mIHNldHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBybSA9IGVwbGV5MVJNKHMud2VpZ2h0LCBzLnJlcHMpO1xuICAgICAgICAgICAgICAgIGlmIChybSA+IGJlc3Qucm0pXG4gICAgICAgICAgICAgICAgICAgIGJlc3QgPSB7IHdlaWdodDogcy53ZWlnaHQsIHJlcHM6IHMucmVwcywgcm0gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7IGRhdGU6IGRhdGVLZXksIGJlc3QxUk06IGJlc3Qucm0sIHdlaWdodDogYmVzdC53ZWlnaHQsIHJlcHM6IGJlc3QucmVwcywgc2V0cyB9O1xuICAgICAgICB9KTtcbiAgICAgICAgZ3JvdXBzLnNldChrZXksIHsgbmFtZXM6IGcubmFtZXMsIG11c2NsZUdyb3VwOiBnLm11c2NsZUdyb3VwLCBzZXNzaW9ucyB9KTtcbiAgICB9XG4gICAgcmV0dXJuIGdyb3Vwcztcbn1cbi8vIDFSTSBcImFjdHVhbFwiIHJvYnVzdG86IGVsIG1lam9yIGRlIGxhcyDDumx0aW1hcyBOIHNlc2lvbmVzIChldml0YSBxdWUgdW4gbWFsIGTDrWFcbi8vIGh1bmRhIGVsIHB1bnRvIGRlIHBhcnRpZGEgbyBxdWUgdW4gcGljbyBhbnRpZ3VvIGxvIGluZmxlKS4gw5pzYWxvIHBhcmEgdGVuZGVuY2lhc1xuLy8gZ2VuZXJhbGVzIChwLiBlai4gbGEgcGVuZGllbnRlIGRlIHByb2dyZXNvKTsgcGFyYSBqdXpnYXIgc2kgc2UgQ1VNUExJw5MgdW5hIG1ldGFcbi8vIGNvbmNyZXRhIHVzYSBiZXN0T25lUmVwTWF4Rm9yVGFyZ2V0LCBxdWUgZXMgbcOhcyBjb25zZXJ2YWRvci5cbmV4cG9ydCBmdW5jdGlvbiBiZXN0MVJNUmVjZW50KHNlc3Npb25zLCBuID0gMykge1xuICAgIGlmICghc2Vzc2lvbnMgfHwgIXNlc3Npb25zLmxlbmd0aClcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgY29uc3QgcmVjZW50ID0gc2Vzc2lvbnMuc2xpY2UoLW4pO1xuICAgIHJldHVybiBNYXRoLm1heCgwLCAuLi5yZWNlbnQubWFwKHMgPT4gcy5iZXN0MVJNIHx8IDApKTtcbn1cbi8vIDFSTSBcImNlcmNhbm8gYSBsYSBtZXRhXCI6IGVsIG1lam9yIEVwbGV5IGVudHJlIHNlcmllcyBjb24gcmVwcyA8PSB0YXJnZXRSZXBzICsgMSxcbi8vIGRlIGxhcyDDumx0aW1hcyBOIHNlc2lvbmVzIHF1ZSBTw40gdGVuZ2FuIHVuYSBzZXJpZSBhc8OtIGRlIGNlcmNhbmEgYWwgb2JqZXRpdm8uXG4vL1xuLy8gUG9yIHF1w6k6IGVsIEVwbGV5IGRlIHVuYSBzZXJpZSBzdWJtw6F4aW1hIGRlIG11Y2hhcyByZXBzIChwLiBlai4gMTAwa2cgeDcpIHB1ZWRlXG4vLyBzdXBlcmFyIGVuIHRlb3LDrWEgZWwgZGUgdW4gaW50ZW50byByZWFsIGNlcmNhbm8gYWwgbcOheGltbyAocC4gZWouIDExNWtnIHgxIHJlYWwsXG4vLyBhIFJQRSAxMCkgc29sbyBwb3JxdWUgbGEgZsOzcm11bGEgZXh0cmFwb2xhIG11Y2hvIG3DoXMgbGVqb3MuIFNpIGVzYSBzZXJpZSBkZSA3XG4vLyByZXBzIG9jdXJyacOzIGVsIG1pc21vIGTDrWEgcXVlIHVuIGludGVudG8gcmVhbCBkZSAxIHJlcCwgdG9tYXIgXCJlbCBtZWpvciBFcGxleVxuLy8gZGVsIGTDrWFcIiBzZSBxdWVkYSBjb24gbGEgZXh0cmFwb2xhY2nDs24gZW4gdmV6IGRlbCBkYXRvIHJlYWwuIExpbWl0YXIgbGFzIHNlcmllc1xuLy8gZWxlZ2libGVzIGEgbGFzIGNlcmNhbmFzIGVuIHJlcHMgYWwgb2JqZXRpdm8gZXZpdGEgZXNlIGZhbHNvIHBvc2l0aXZvIHkgaGFjZSBxdWVcbi8vIFwiY3VtcGxpZG9cIiBzb2xvIGRlcGVuZGEgZGUgZXNmdWVyem9zIGdlbnVpbmFtZW50ZSBjZXJjYW5vcyBhIGVzYSBleGlnZW5jaWEuXG4vLyBTZXNpb25lcyBzaW4gbmluZ3VuYSBzZXJpZSBlbGVnaWJsZSBlc2UgZMOtYSBubyBjdWVudGFuIGNvbW8gZXZpZGVuY2lhIChuaSBhXG4vLyBmYXZvciBuaSBlbiBjb250cmEpIHBhcmEgZXN0YSBtZXRhLlxuZXhwb3J0IGZ1bmN0aW9uIGJlc3RPbmVSZXBNYXhGb3JUYXJnZXQoc2Vzc2lvbnMsIHRhcmdldFJlcHMsIG4gPSAzKSB7XG4gICAgaWYgKCFzZXNzaW9ucyB8fCAhc2Vzc2lvbnMubGVuZ3RoKVxuICAgICAgICByZXR1cm4gMDtcbiAgICBjb25zdCBtYXhFbGlnaWJsZVJlcHMgPSAoTnVtYmVyKHRhcmdldFJlcHMpIHx8IDEpICsgMTtcbiAgICBjb25zdCBlbGlnaWJsZSA9IFtdO1xuICAgIGZvciAoY29uc3QgcyBvZiBzZXNzaW9ucykge1xuICAgICAgICBjb25zdCBkYXlTZXRzID0gKHMuc2V0cyAmJiBzLnNldHMubGVuZ3RoKSA/IHMuc2V0cyA6IFt7IHdlaWdodDogcy53ZWlnaHQsIHJlcHM6IHMucmVwcyB9XTtcbiAgICAgICAgY29uc3QgYmVzdEVsaWdpYmxlUk0gPSBNYXRoLm1heCgwLCAuLi5kYXlTZXRzLmZpbHRlcih4ID0+IE51bWJlcih4LnJlcHMpIDw9IG1heEVsaWdpYmxlUmVwcykubWFwKHggPT4gZXBsZXkxUk0oeC53ZWlnaHQsIHgucmVwcykpKTtcbiAgICAgICAgaWYgKGJlc3RFbGlnaWJsZVJNID4gMClcbiAgICAgICAgICAgIGVsaWdpYmxlLnB1c2goYmVzdEVsaWdpYmxlUk0pO1xuICAgIH1cbiAgICBjb25zdCByZWNlbnQgPSBlbGlnaWJsZS5zbGljZSgtbik7XG4gICAgcmV0dXJuIHJlY2VudC5sZW5ndGggPyBNYXRoLm1heCguLi5yZWNlbnQpIDogMDtcbn1cbi8vIFBsYXRlYXU6IGxhIG1lam9yIG1hcmNhIGRlIGxhIG1pdGFkIHJlY2llbnRlIGRlIGxhIHZlbnRhbmEgbm8gU1VQRVJBIGEgbGEgZGUgbGFcbi8vIG1pdGFkIGFudGlndWEgKHVuIGVtcGF0ZSBjdWVudGEgY29tbyBlc3RhbmNhbWllbnRvLCBubyBjb21vIHByb2dyZXNvKS4gVmVudGFuYSA9XG4vLyDDumx0aW1hcyBtaW4od2luZG93U2l6ZSwgY291bnQpIHNlc2lvbmVzOyBzcGxpdCBmbG9vci9jZWlsICg2LT4zKzMsIDUtPjIrMywgNC0+MisyKS5cbi8vIFJlcXVpZXJlID49bWluU2Vzc2lvbnMgc2VzaW9uZXMgdG90YWxlcyBwYXJhIHRlbmVyIHNlw7FhbCAoc2kgbm8sIGlzUGxhdGVhdWVkPWZhbHNlKS5cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RQbGF0ZWF1KHNlc3Npb25zLCB7IG1pblNlc3Npb25zID0gNCwgd2luZG93U2l6ZSA9IDYgfSA9IHt9KSB7XG4gICAgaWYgKCFzZXNzaW9ucyB8fCBzZXNzaW9ucy5sZW5ndGggPCBtaW5TZXNzaW9ucykge1xuICAgICAgICByZXR1cm4geyBpc1BsYXRlYXVlZDogZmFsc2UsIHNlc3Npb25zQ29uc2lkZXJlZDogc2Vzc2lvbnM/Lmxlbmd0aCB8fCAwLCBvbGRlckJlc3QxUk06IDAsIHJlY2VudEJlc3QxUk06IDAgfTtcbiAgICB9XG4gICAgY29uc3Qgc2FtcGxlV2luZG93ID0gc2Vzc2lvbnMuc2xpY2UoLU1hdGgubWluKHdpbmRvd1NpemUsIHNlc3Npb25zLmxlbmd0aCkpO1xuICAgIGNvbnN0IHNwbGl0QXQgPSBNYXRoLmZsb29yKHNhbXBsZVdpbmRvdy5sZW5ndGggLyAyKTtcbiAgICBjb25zdCBvbGRlckhhbGYgPSBzYW1wbGVXaW5kb3cuc2xpY2UoMCwgc3BsaXRBdCk7XG4gICAgY29uc3QgcmVjZW50SGFsZiA9IHNhbXBsZVdpbmRvdy5zbGljZShzcGxpdEF0KTtcbiAgICBjb25zdCBvbGRlckJlc3QxUk0gPSBNYXRoLm1heCgwLCAuLi5vbGRlckhhbGYubWFwKHMgPT4gcy5iZXN0MVJNIHx8IDApKTtcbiAgICBjb25zdCByZWNlbnRCZXN0MVJNID0gTWF0aC5tYXgoMCwgLi4ucmVjZW50SGFsZi5tYXAocyA9PiBzLmJlc3QxUk0gfHwgMCkpO1xuICAgIHJldHVybiB7XG4gICAgICAgIGlzUGxhdGVhdWVkOiByZWNlbnRCZXN0MVJNIDw9IG9sZGVyQmVzdDFSTSxcbiAgICAgICAgc2Vzc2lvbnNDb25zaWRlcmVkOiBzYW1wbGVXaW5kb3cubGVuZ3RoLFxuICAgICAgICBvbGRlckJlc3QxUk0sXG4gICAgICAgIHJlY2VudEJlc3QxUk1cbiAgICB9O1xufVxuLyoqIENhbGxlciBjaG9vc2VzIElEL25hbWUgZ3JvdXBpbmcgYW5kIFNRTCBzYW1wbGVXaW5kb3cuIEVtcHR5IGNpdmlsIGRheXMgYW5kXG4gKiBpbmNvbXBsZXRlIHNldHMgY291bnQgYnkgY29tcGF0aWJpbGl0eTsgdGhpcyBpcyBub3QgYSBmYXRpZ3VlIGRpYWdub3Npcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RQbGF0ZWF1Rm9yRXhlcmNpc2Uod29ya291dExvZ3MpIHtcbiAgICBjb25zdCBieURheSA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGxvZyBvZiB3b3Jrb3V0TG9ncykge1xuICAgICAgICBjb25zdCBkYXlLZXkgPSB0cmFpbmluZ0NpdmlsRGF0ZShsb2cuZGF0ZSk7XG4gICAgICAgIGxldCBiZXN0ID0gYnlEYXkuZ2V0KGRheUtleSkgfHwgMDtcbiAgICAgICAgZm9yIChjb25zdCBzZXQgb2YgbG9nLnNldHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGVmZiA9IGVmZmVjdGl2ZVdvcmtvdXRTZXQoc2V0KTtcbiAgICAgICAgICAgIGlmIChlZmYud2VpZ2h0IDw9IDAgfHwgZWZmLnJlcHMgPD0gMClcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIGNvbnN0IHJtID0gcGVyc29uYWxSZWNvcmRFcGxleTFSTShlZmYud2VpZ2h0LCBlZmYucmVwcyk7XG4gICAgICAgICAgICBpZiAocm0gPiBiZXN0KVxuICAgICAgICAgICAgICAgIGJlc3QgPSBybTtcbiAgICAgICAgfVxuICAgICAgICBieURheS5zZXQoZGF5S2V5LCBiZXN0KTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvbnMgPSBbLi4uYnlEYXkua2V5cygpXS5zb3J0KCkubWFwKGRheSA9PiAoeyBiZXN0MVJNOiBieURheS5nZXQoZGF5KSB8fCAwIH0pKTtcbiAgICByZXR1cm4gZGV0ZWN0UGxhdGVhdShzZXNzaW9ucykuaXNQbGF0ZWF1ZWQ7XG59XG5leHBvcnQgZnVuY3Rpb24gbGluZWFyUmVncmVzc2lvbihkYXRhUG9pbnRzKSB7XG4gICAgaWYgKCFkYXRhUG9pbnRzIHx8IGRhdGFQb2ludHMubGVuZ3RoIDwgMilcbiAgICAgICAgcmV0dXJuIHsgc2xvcGU6IDAsIHIyOiAwIH07XG4gICAgY29uc3QgbiA9IGRhdGFQb2ludHMubGVuZ3RoO1xuICAgIGNvbnN0IHN1bVggPSBkYXRhUG9pbnRzLnJlZHVjZSgoc3VtLCBwKSA9PiBzdW0gKyBwLngsIDApO1xuICAgIGNvbnN0IHN1bVkgPSBkYXRhUG9pbnRzLnJlZHVjZSgoc3VtLCBwKSA9PiBzdW0gKyBwLnksIDApO1xuICAgIGNvbnN0IHN1bVhZID0gZGF0YVBvaW50cy5yZWR1Y2UoKHN1bSwgcCkgPT4gc3VtICsgcC54ICogcC55LCAwKTtcbiAgICBjb25zdCBzdW1YMiA9IGRhdGFQb2ludHMucmVkdWNlKChzdW0sIHApID0+IHN1bSArIHAueCAqIHAueCwgMCk7XG4gICAgY29uc3QgZGVub21pbmF0b3IgPSBuICogc3VtWDIgLSBzdW1YICogc3VtWDtcbiAgICBpZiAoZGVub21pbmF0b3IgPT09IDApXG4gICAgICAgIHJldHVybiB7IHNsb3BlOiAwLCByMjogMCB9O1xuICAgIGNvbnN0IHNsb3BlID0gKG4gKiBzdW1YWSAtIHN1bVggKiBzdW1ZKSAvIGRlbm9taW5hdG9yO1xuICAgIGNvbnN0IGludGVyY2VwdCA9IChzdW1ZIC0gc2xvcGUgKiBzdW1YKSAvIG47XG4gICAgY29uc3QgeU1lYW4gPSBzdW1ZIC8gbjtcbiAgICBjb25zdCBzc1RvdGFsID0gZGF0YVBvaW50cy5yZWR1Y2UoKHN1bSwgcCkgPT4gc3VtICsgTWF0aC5wb3cocC55IC0geU1lYW4sIDIpLCAwKTtcbiAgICBjb25zdCBzc1Jlc2lkdWFsID0gZGF0YVBvaW50cy5yZWR1Y2UoKHN1bSwgcCkgPT4gc3VtICsgTWF0aC5wb3cocC55IC0gKHNsb3BlICogcC54ICsgaW50ZXJjZXB0KSwgMiksIDApO1xuICAgIGNvbnN0IHIyID0gc3NUb3RhbCA+IDAgPyAxIC0gKHNzUmVzaWR1YWwgLyBzc1RvdGFsKSA6IDA7XG4gICAgcmV0dXJuIHsgc2xvcGUsIHIyIH07XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1wcm9ncmVzcy5qcy5tYXAiXSwibmFtZXMiOlsiZXBsZXkxUk0iXSwibWFwcGluZ3MiOiI7O0FBQU8sU0FBUyxlQUFlLEtBQUs7QUFDaEMsU0FBTyxFQUFFLE1BQU0sY0FBYyxPQUFPLEtBQUssSUFBSSxNQUFLO0FBQ3REO0FBQ08sU0FBUyxlQUFlLEtBQUs7QUFDaEMsU0FBTyxFQUFFLE1BQU0sZ0JBQWdCLE9BQU8sS0FBSyxJQUFJLE1BQUs7QUFDeEQ7QUFHTyxTQUFTLG1CQUFtQixLQUFLO0FBQ3BDLFNBQU8sT0FBTyxPQUFPLE9BQU8sZUFBZSxFQUFvQixPQUFPLElBQUcsQ0FBRSxFQUFFO0FBQ2pGO0FBQ08sU0FBUyxtQkFBbUIsS0FBSztBQUNwQyxTQUFPLE9BQU8sT0FBTyxPQUFPLGVBQWUsRUFBc0IsT0FBTyxJQUFHLENBQUUsRUFBRTtBQUNuRjtBQUdBLFNBQVMsY0FBYyxPQUFPO0FBQzFCLE1BQUksT0FBTyxVQUFV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
