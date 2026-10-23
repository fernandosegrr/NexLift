// GENERATED from TypeScript by npm run build:typed; do not edit.
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
export {
  adjustRepRangeForPhase,
  best1RMRecent,
  bestOneRepMaxForTarget,
  canonicalExerciseKey,
  cappedEpley1RM,
  civilDayOfWeek,
  computeWorkoutSuggestion,
  convertLegacyShortcutRir,
  detectPlateau,
  detectPlateauForExercise,
  effectiveWorkoutSet,
  elapsedWeekInBlock,
  evaluateNextSetFromToday,
  evaluateWorkoutSuggestion,
  formRirToStoredRpe,
  getActiveTrainingBlock,
  groupTrainingHistory,
  isSameExercise,
  lastTrainingCivilDays,
  legacyTrainingDayBounds,
  linearRegression,
  normalizeExerciseName,
  parseCanonicalWorkoutEffort,
  parseLegacyShortcutEffort,
  parseRepRange,
  personalRecordEpley1RM,
  pickWorkReference,
  resolveWeightIncrement,
  rirToStoredRpe,
  roundWorkoutWeight,
  routinePhaseStatusAt,
  selectHistoricalPersonalRecord,
  shiftTrainingCivilDate,
  storedRpeToFormRir,
  storedRpeToRir,
  suggestNextSetFromToday,
  trainingCivilDate,
  trainingCivilDayBounds,
  trainingCivilWeek,
  trainingLoadVolume,
  trainingSessionLoadSummary,
  trainingUtcOffsetMinutes
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhaW5pbmcuanMiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3BhY2thZ2VzL3NoYXJlZC9kaXN0L2RvbWFpbi90cmFpbmluZy9lZmZvcnQuanMiLCIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9kb21haW4vdHJhaW5pbmcvcGVyZm9ybWFuY2UuanMiLCIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9kb21haW4vdHJhaW5pbmcvcGVyc29uYWxSZWNvcmRzLmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvZG9tYWluL3RyYWluaW5nL3NtYXJ0TG9hZGluZy5qcyIsIi4uLy4uLy4uL3BhY2thZ2VzL3NoYXJlZC9kaXN0L2RvbWFpbi90cmFpbmluZy9jYWxlbmRhci5qcyIsIi4uLy4uLy4uL3BhY2thZ2VzL3NoYXJlZC9kaXN0L2RvbWFpbi90cmFpbmluZy92b2x1bWUuanMiLCIuLi8uLi8uLi9wYWNrYWdlcy9zaGFyZWQvZGlzdC9kb21haW4vdHJhaW5pbmcvbWVzb2N5Y2xlcy5qcyIsIi4uLy4uLy4uL3BhY2thZ2VzL3NoYXJlZC9kaXN0L2RvbWFpbi90cmFpbmluZy9leGVyY2lzZUlkZW50aXR5LmpzIiwiLi4vLi4vLi4vcGFja2FnZXMvc2hhcmVkL2Rpc3QvZG9tYWluL3RyYWluaW5nL3Byb2dyZXNzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBmdW5jdGlvbiByaXJUb1N0b3JlZFJwZShyaXIpIHtcbiAgICByZXR1cm4geyBraW5kOiAnc3RvcmVkLXJwZScsIHZhbHVlOiAxMCAtIHJpci52YWx1ZSB9O1xufVxuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlZFJwZVRvUmlyKHJwZSkge1xuICAgIHJldHVybiB7IGtpbmQ6ICdpbmZlcnJlZC1yaXInLCB2YWx1ZTogMTAgLSBycGUudmFsdWUgfTtcbn1cbi8qKiBOdWxsYWJsZSBmb3JtIGFkYXB0ZXJzIHByZXNlcnZlIGFic2VuY2UgYW5kIHRoZSBleGlzdGluZyBhcml0aG1ldGljIGV4YWN0bHkuXG4gKiBUaGV5IGRvIG5vdCBjbGFtcCBpbXBvcnRlZCBoaXN0b3JpY2FsIHZhbHVlcyB0byB0b2RheSdzIFVJIGJ1dHRvbnMuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybVJpclRvU3RvcmVkUnBlKHJpcikge1xuICAgIHJldHVybiByaXIgPT0gbnVsbCA/IG51bGwgOiByaXJUb1N0b3JlZFJwZSh7IGtpbmQ6ICd1c2VyLXJpcicsIHZhbHVlOiByaXIgfSkudmFsdWU7XG59XG5leHBvcnQgZnVuY3Rpb24gc3RvcmVkUnBlVG9Gb3JtUmlyKHJwZSkge1xuICAgIHJldHVybiBycGUgPT0gbnVsbCA/IG51bGwgOiBzdG9yZWRScGVUb1Jpcih7IGtpbmQ6ICdzdG9yZWQtcnBlJywgdmFsdWU6IHJwZSB9KS52YWx1ZTtcbn1cbi8vIHBhcnNlRmxvYXQgcGVyZm9ybXMgVG9TdHJpbmcgd2l0aCB0aGUgc3RyaW5nIGhpbnQuIFN0cmluZyhTeW1ib2wpIGhhcyBhXG4vLyBzcGVjaWFsIGV4ZW1wdGlvbiB0aGF0IHBhcnNlRmxvYXQgZG9lcyBub3Q6IHByZXNlcnZlIHRoYXQgVHlwZUVycm9yIHRvby5cbmZ1bmN0aW9uIHNob3J0Y3V0RmxvYXQodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3ltYm9sJylcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ2Fubm90IGNvbnZlcnQgYSBTeW1ib2wgdmFsdWUgdG8gYSBzdHJpbmcnKTtcbiAgICByZXR1cm4gcGFyc2VGbG9hdChTdHJpbmcodmFsdWUpKTtcbn1cbi8qKiBVbmJvdW5kZWQgaGlzdG9yaWNhbCBoZWxwZXI7IE5PVCB0aGUgU2hvcnRjdXQgcmVxdWVzdCB2YWxpZGF0b3IuICovXG5leHBvcnQgZnVuY3Rpb24gY29udmVydExlZ2FjeVNob3J0Y3V0UmlyKHJhd1Jpcikge1xuICAgIHJldHVybiByYXdSaXIgIT0gbnVsbCAmJiBOdW1iZXIuaXNGaW5pdGUoc2hvcnRjdXRGbG9hdChyYXdSaXIpKSA/IDEwIC0gc2hvcnRjdXRGbG9hdChyYXdSaXIpIDogbnVsbDtcbn1cbi8qKiBFeGFjdCBsZWdhY3kgbG9nLXNldCBwb2xpY3k6IHBlcm1pc3NpdmUgcGFyc2VGbG9hdCwgcmlyIHByaW9yaXR5LCBnYXAgKDQsNilcbiAqIHJlamVjdGVkLCBtaXNzaW5nID0+IFJJUjAvUlBFMTAuIE5vIG1vZGVybiBBUEkgb3IgYmFja3VwIG1heSB1c2UgdGhpcyBwYXJzZXIuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMZWdhY3lTaG9ydGN1dEVmZm9ydChib2R5KSB7XG4gICAgY29uc3QgaW52YWxpZCA9IHsgc3RhdGU6ICdpbnZhbGlkJywgZXJyb3I6ICdSSVIgaW52w6FsaWRvICh1c2EgMC00LCByZXBzIGVuIHJlY8OhbWFyYSknIH07XG4gICAgY29uc3QgaGFzUmlyID0gYm9keS5yaXIgIT0gbnVsbCAmJiBTdHJpbmcoYm9keS5yaXIpLnRyaW0oKSAhPT0gJyc7XG4gICAgY29uc3QgaGFzUnBlID0gYm9keS5ycGUgIT0gbnVsbCAmJiBTdHJpbmcoYm9keS5ycGUpLnRyaW0oKSAhPT0gJyc7XG4gICAgaWYgKGhhc1Jpcikge1xuICAgICAgICBjb25zdCByYXdSaXIgPSBzaG9ydGN1dEZsb2F0KGJvZHkucmlyKTtcbiAgICAgICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUocmF3UmlyKSB8fCByYXdSaXIgPCAwIHx8IHJhd1JpciA+IDQpXG4gICAgICAgICAgICByZXR1cm4gaW52YWxpZDtcbiAgICAgICAgcmV0dXJuIHsgc3RhdGU6ICdpbnRlcnByZXRlZCcsIGNvbnRleHQ6ICdsZWdhY3ktc2hvcnRjdXQnLCBpbnRlcnByZXRhdGlvbjogJ2V4cGxpY2l0LXJpcicsIHJhd1Jpciwgc3RvcmVkUnBlOiAxMCAtIHJhd1JpciB9O1xuICAgIH1cbiAgICBpZiAoaGFzUnBlKSB7XG4gICAgICAgIGNvbnN0IHBhcnNlZCA9IHNob3J0Y3V0RmxvYXQoYm9keS5ycGUpO1xuICAgICAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShwYXJzZWQpKVxuICAgICAgICAgICAgcmV0dXJuIGludmFsaWQ7XG4gICAgICAgIGlmIChwYXJzZWQgPj0gMCAmJiBwYXJzZWQgPD0gNClcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW50ZXJwcmV0ZWQnLCBjb250ZXh0OiAnbGVnYWN5LXNob3J0Y3V0JywgaW50ZXJwcmV0YXRpb246ICdsZWdhY3ktcnBlLWFzLXJpcicsIHJhd1JpcjogcGFyc2VkLCBzdG9yZWRScGU6IDEwIC0gcGFyc2VkIH07XG4gICAgICAgIGlmIChwYXJzZWQgPj0gNiAmJiBwYXJzZWQgPD0gMTApXG4gICAgICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2xlZ2FjeS1zaG9ydGN1dCcsIGludGVycHJldGF0aW9uOiAnc3RvcmVkLXJwZScsIHJhd1JpcjogMTAgLSBwYXJzZWQsIHN0b3JlZFJwZTogcGFyc2VkIH07XG4gICAgICAgIHJldHVybiBpbnZhbGlkO1xuICAgIH1cbiAgICByZXR1cm4geyBzdGF0ZTogJ2ludGVycHJldGVkJywgY29udGV4dDogJ2xlZ2FjeS1zaG9ydGN1dCcsIGludGVycHJldGF0aW9uOiAnbWlzc2luZy1kZWZhdWx0JywgcmF3UmlyOiAwLCBzdG9yZWRScGU6IDEwIH07XG59XG4vKiogdjEgcmVxdWVzdCByZXByZXNlbnRhdGlvbiwgTk9UIGZ1bGwgU2V0TG9nIHZhbGlkYXRpb24uIFRoZSBleGlzdGluZyBzYW5pdGl6ZXJcbiAqIHN0aWxsIGVuZm9yY2VzIHN0b3JlZCByYW5nZSAwLi4xMCBhbmQgbWFuZGF0b3J5IGVmZm9ydCBmb3IgcG9zaXRpdmUgd29yay5cbiAqIE5vIHNvdXJjZSBwYXJhbWV0ZXI6IHNvdXJjZT1zaG9ydGN1dCBjYW5ub3QgYWN0aXZhdGUgbGVnYWN5IGludGVycHJldGF0aW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2Fub25pY2FsV29ya291dEVmZm9ydChzZXQpIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIFsncnBlJywgJ3JpciddKSB7XG4gICAgICAgIGNvbnN0IHZhbHVlID0gc2V0W2ZpZWxkXTtcbiAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgKGZpZWxkID09PSAncnBlJyAmJiB2YWx1ZSA9PT0gbnVsbCkpXG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgfHwgIU51bWJlci5pc0Zpbml0ZSh2YWx1ZSkgfHwgIU51bWJlci5pc0ludGVnZXIodmFsdWUpKVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdGU6ICdpbnZhbGlkJywgZmllbGQsIG1lc3NhZ2U6IGBJbnZhbGlkICR7ZmllbGR9YCB9O1xuICAgIH1cbiAgICBpZiAoc2V0LnJpciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnN0IHJpciA9IHNldC5yaXI7XG4gICAgICAgIGlmICh0eXBlb2YgcmlyICE9PSAnbnVtYmVyJyB8fCByaXIgPCAwIHx8IHJpciA+IDQpXG4gICAgICAgICAgICByZXR1cm4geyBzdGF0ZTogJ2ludmFsaWQnLCBmaWVsZDogJ3JpcicsIG1lc3NhZ2U6ICdyaXIgbXVzdCBiZSBhbiBpbnRlZ2VyIGZyb20gMCB0byA0JyB9O1xuICAgICAgICBpZiAoc2V0LnJwZSAhPT0gdW5kZWZpbmVkICYmIHNldC5ycGUgIT09IDEwIC0gcmlyKVxuICAgICAgICAgICAgcmV0dXJuIHsgc3RhdGU6ICdpbnZhbGlkJywgZmllbGQ6ICdycGUnLCBtZXNzYWdlOiAncmlyIGFuZCBycGUgY29uZmxpY3QnIH07XG4gICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW50ZXJwcmV0ZWQnLCBjb250ZXh0OiAnY2Fub25pY2FsLXdvcmtvdXQnLCBzdG9yZWRScGU6IDEwIC0gcmlyIH07XG4gICAgfVxuICAgIC8vIE5hcnJvdyB1bmtub3duIGluZGVwZW5kZW50bHk7IHRoZSBsb29wIGFib3ZlIHByZXNlcnZlcyBlcnJvciBwcmVjZWRlbmNlLlxuICAgIGlmICh0eXBlb2Ygc2V0LnJwZSA9PT0gJ251bWJlcicpXG4gICAgICAgIHJldHVybiB7IHN0YXRlOiAnaW50ZXJwcmV0ZWQnLCBjb250ZXh0OiAnY2Fub25pY2FsLXdvcmtvdXQnLCBzdG9yZWRScGU6IHNldC5ycGUgfTtcbiAgICByZXR1cm4geyBzdGF0ZTogJ21pc3NpbmcnLCBjb250ZXh0OiAnY2Fub25pY2FsLXdvcmtvdXQnLCBzdG9yZWRScGU6IHNldC5ycGUgPT09IG51bGwgPyBudWxsIDogdW5kZWZpbmVkIH07XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1lZmZvcnQuanMubWFwIiwiLyoqXG4gKiBIaXN0b3JpY2FsIGhpc3RvcnkvZ29hbCBlc3RpbWF0ZSwgaW4ga2cuIFRoaXMgaXMgTk9UIHRoZSBwZXJzaXN0ZWQgUFIgcG9saWN5LlxuICogTnVtYmVyIGNvZXJjaW9uIGFuZCB8fCAwIGRlbGliZXJhdGVseSBwcmVzZXJ2ZSBsZWdhY3kgSlMgY2FsbGVycyAoaW5jbHVkaW5nXG4gKiBudWxsL3VuZGVmaW5lZCk7IGlucHV0cyBhcmUgdW5rbm93biBiZWNhdXNlIHRoaXMgYm91bmRhcnkgYWxyZWFkeSBjb2VyY2VzLlxuICogT25lIHJlcCByZXR1cm5zIHdlaWdodDsgPjM2IHJlcHMgYXJlIGNhcHBlZCBhdCAzNjsgbm8gcm91bmRpbmcvdG9sZXJhbmNlLlxuICogRmluaXRlIG5vbm5lZ2F0aXZlIHRyYWluaW5nIGlucHV0cyBwcm9kdWNlIGZpbml0ZSByZXN1bHRzIHdpdGhpbiBBUEkgbGltaXRzLlxuICogTmFOIGJlY29tZXMgMDsgaW5maW5pdGllcyBhbmQgTnVtYmVyIGNvbnZlcnNpb24gZXhjZXB0aW9ucyByZW1haW4gaGlzdG9yaWNhbC5cbiAqIEFuIGVzdGltYXRlIGlzIG5vdCBhIG1lYXN1cmVkIG1heGltdW0gb3IgYSBwaHlzaW9sb2dpY2FsIGd1YXJhbnRlZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNhcHBlZEVwbGV5MVJNKHdlaWdodCwgcmVwcykge1xuICAgIGNvbnN0IHcgPSBOdW1iZXIod2VpZ2h0KSB8fCAwO1xuICAgIGxldCByID0gTnVtYmVyKHJlcHMpIHx8IDA7XG4gICAgaWYgKHcgPD0gMCB8fCByIDw9IDApXG4gICAgICAgIHJldHVybiAwO1xuICAgIGlmIChyID09PSAxKVxuICAgICAgICByZXR1cm4gdztcbiAgICBpZiAociA+IDM2KVxuICAgICAgICByID0gMzY7XG4gICAgcmV0dXJuIHcgKiAoMSArIHIgLyAzMCk7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1wZXJmb3JtYW5jZS5qcy5tYXAiLCIvKiogUGVyc2lzdGVkIFBSIHBvbGljeSwgbm90IGNhcHBlZCBoaXN0b3J5L1NtYXJ0IExvYWRpbmcgb3IgUERGIHBvbGljeS5cbiAqIENhbGxlciBoYXMgY29lcmNlZCBwb3NpdGl2ZSB3b3JrLiAxPHJlcHM8MzcgZXh0cmFwb2xhdGVzOyBhbGwgb3RoZXIgcmVwc1xuICogcmV0dXJuIGxvYWQuIE5vIHJvdW5kaW5nIG9yIGVwc2lsb24uIERlY2ltYWwgbGVnYWN5IHJlcHMgcmVtYWluIGNvbXBhdGlibGUuICovXG5leHBvcnQgZnVuY3Rpb24gcGVyc29uYWxSZWNvcmRFcGxleTFSTSh3ZWlnaHRLZywgcmVwZXRpdGlvbnMpIHtcbiAgICByZXR1cm4gKHJlcGV0aXRpb25zID4gMSAmJiByZXBldGl0aW9ucyA8IDM3KSA/IHdlaWdodEtnICogKDEgKyByZXBldGl0aW9ucyAvIDMwKSA6IHdlaWdodEtnO1xufVxuLyoqIEl0ZXJhdGUgZXhhY3RseSBpbiBjYWxsZXIgb3JkZXIsIGxlZnQgYmVmb3JlIHJpZ2h0LCBzdHJpY3QgPiByZXRhaW5zIGZpcnN0XG4gKiBiaW5hcnkgdGllLiBSaWdodCBudWxsaXNoIGZpZWxkcyBpbmhlcml0IGxlZnQ7IHplcm8gcmVtYWlucyB6ZXJvLiBjb21wbGV0ZWRcbiAqIGlzIGRlbGliZXJhdGVseSBub3QgYSBmaWx0ZXIuIENhbGxlciBhbG9uZSBzZWxlY3RzIGF1dGhvcml6ZWQgaGlzdG9yeSBhbmRcbiAqIHBlcnNpc3RzIHRoZSByZXN1bHQgaW5zaWRlIGl0cyBTUUwgdHJhbnNhY3Rpb24uIE8oc2V0cyksIE8oMSkgZXh0cmEgc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gc2VsZWN0SGlzdG9yaWNhbFBlcnNvbmFsUmVjb3JkKGxvZ3MpIHtcbiAgICBsZXQgYmVzdCA9IG51bGw7XG4gICAgZm9yIChjb25zdCBsb2cgb2YgbG9ncykge1xuICAgICAgICBmb3IgKGNvbnN0IHMgb2YgbG9nLnNldHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBbeyB3OiBzLndlaWdodCwgcjogcy5yZXBzIH1dO1xuICAgICAgICAgICAgaWYgKHMud2VpZ2h0UmlnaHQgIT0gbnVsbCB8fCBzLnJlcHNSaWdodCAhPSBudWxsKSB7XG4gICAgICAgICAgICAgICAgY2FuZGlkYXRlcy5wdXNoKHsgdzogcy53ZWlnaHRSaWdodCA/PyBzLndlaWdodCwgcjogcy5yZXBzUmlnaHQgPz8gcy5yZXBzIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZm9yIChjb25zdCBjIG9mIGNhbmRpZGF0ZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB3ID0gTnVtYmVyKGMudykgfHwgMDtcbiAgICAgICAgICAgICAgICBjb25zdCByID0gTnVtYmVyKGMucikgfHwgMDtcbiAgICAgICAgICAgICAgICBpZiAodyA8PSAwIHx8IHIgPD0gMClcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgY29uc3QgZXN0ID0gcGVyc29uYWxSZWNvcmRFcGxleTFSTSh3LCByKTtcbiAgICAgICAgICAgICAgICBpZiAoIWJlc3QgfHwgZXN0ID4gYmVzdC5lc3QxUk0pXG4gICAgICAgICAgICAgICAgICAgIGJlc3QgPSB7IHdlaWdodDogdywgcmVwczogciwgZXN0MVJNOiBlc3QsIGRhdGU6IGxvZy5kYXRlIH07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGJlc3Q7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1wZXJzb25hbFJlY29yZHMuanMubWFwIiwiaW1wb3J0IHsgc3RvcmVkUnBlVG9SaXIgfSBmcm9tICcuL2VmZm9ydC5qcyc7XG5mdW5jdGlvbiBhYnN0YWluKG1vZGUsIHJlYXNvbikge1xuICAgIHJldHVybiB7IHJlY29tbWVuZGF0aW9uOiBudWxsLCBleHBsYW5hdGlvbjogeyBtb2RlLCBydWxlOiAnYWJzdGFpbicsIHJlYXNvbiB9IH07XG59XG5mdW5jdGlvbiBhbGxIYXZlS25vd25SaXIoc2V0cykge1xuICAgIHJldHVybiAhc2V0cy5zb21lKHMgPT4gcy5yaXIgPT0gbnVsbCB8fCAhTnVtYmVyLmlzRmluaXRlKHMucmlyKSk7XG59XG5mdW5jdGlvbiB3ZWlnaHRHcmlkKGluY3JlbWVudCwgYmFzZSkge1xuICAgIHJldHVybiAoTWF0aC5hYnMoYmFzZSAlIGluY3JlbWVudCkgPCAwLjAxKSA/IGluY3JlbWVudCA6IDAuNTtcbn1cbi8qKiBFQ01BU2NyaXB0IFRvUHJpbWl0aXZlKG51bWJlcikgdGhlbiBUb051bWJlciwgZm9yIHRoZSBvbGQgc3VidHJhY3Rpb24gYW5kXG4gKiBNYXRoLm1pbiBib3VuZGFyaWVzLiBOdW1iZXIoQmlnSW50KSBpcyBwZXJtaXNzaXZlOyBhcml0aG1ldGljIHdhcyBub3QuIE5vXG4gKiBub3JtYWxpemF0aW9uIG9mIHJhdyByaXIgaXMgcGVyZm9ybWVkIGJ5IGVmZmVjdGl2ZVdvcmtvdXRTZXQuICovXG5mdW5jdGlvbiBsZWdhY3lBcml0aG1ldGljTnVtYmVyKHZhbHVlKSB7XG4gICAgaWYgKCh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB8fCB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY29uc3QgZXhvdGljID0gUmVmbGVjdC5nZXQodmFsdWUsIFN5bWJvbC50b1ByaW1pdGl2ZSk7XG4gICAgICAgIGlmIChleG90aWMgIT0gbnVsbCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBleG90aWMgIT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ2Fubm90IGNvbnZlcnQgb2JqZWN0IHRvIHByaW1pdGl2ZSB2YWx1ZScpO1xuICAgICAgICAgICAgY29uc3QgcHJpbWl0aXZlID0gUmVmbGVjdC5hcHBseShleG90aWMsIHZhbHVlLCBbJ251bWJlciddKTtcbiAgICAgICAgICAgIGlmIChPYmplY3QocHJpbWl0aXZlKSA9PT0gcHJpbWl0aXZlKVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0Nhbm5vdCBjb252ZXJ0IG9iamVjdCB0byBwcmltaXRpdmUgdmFsdWUnKTtcbiAgICAgICAgICAgIHJldHVybiBsZWdhY3lBcml0aG1ldGljTnVtYmVyKHByaW1pdGl2ZSk7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBrZXkgb2YgWyd2YWx1ZU9mJywgJ3RvU3RyaW5nJ10pIHtcbiAgICAgICAgICAgIGNvbnN0IG1ldGhvZCA9IFJlZmxlY3QuZ2V0KHZhbHVlLCBrZXkpO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBtZXRob2QgIT09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICBjb25zdCBwcmltaXRpdmUgPSBSZWZsZWN0LmFwcGx5KG1ldGhvZCwgdmFsdWUsIFtdKTtcbiAgICAgICAgICAgIGlmIChPYmplY3QocHJpbWl0aXZlKSAhPT0gcHJpbWl0aXZlKVxuICAgICAgICAgICAgICAgIHJldHVybiBsZWdhY3lBcml0aG1ldGljTnVtYmVyKHByaW1pdGl2ZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ2Fubm90IGNvbnZlcnQgb2JqZWN0IHRvIHByaW1pdGl2ZSB2YWx1ZScpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnYmlnaW50JylcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQ2Fubm90IG1peCBCaWdJbnQgYW5kIG90aGVyIHR5cGVzLCB1c2UgZXhwbGljaXQgY29udmVyc2lvbnMnKTtcbiAgICByZXR1cm4gTnVtYmVyKHZhbHVlKTtcbn1cbi8vIEFqdXN0YSBlbCByYW5nbyBkZSByZXBzIG9iamV0aXZvIHNlZ8O6biBsYSBmYXNlIGRlbCBibG9xdWUgYWN0aXZvIChzaSBoYXkgdW5vKS5cbi8vIE5PIG1vZGlmaWNhIGVsIHJhbmdvIGd1YXJkYWRvIGRlbCBlamVyY2ljaW8sIHNvbG8gZWwgdXNhZG8gcGFyYSBFU1RBIHN1Z2VyZW5jaWE6XG4vLyBpbnRlbnNpZmljYWNpw7NuIGxvIHJlZHVjZSBhIGxhIG1pdGFkIChtw6FzIHBlc28sIG1lbm9zIHJlcHMpLFxuLy8gYWN1bXVsYWNpw7NuIHN1YmUgZWwgdGVjaG8gNTAlIChtw6FzIHJlcHMgYW50ZXMgZGUgc3ViaXIgcGVzbykuIERlc2NhcmdhL1xuLy8gcGVyc29uYWxpemFkby9zaW4gYmxvcXVlIGFjdGl2bzogcmFuZ28gc2luIGNhbWJpb3MuXG5leHBvcnQgZnVuY3Rpb24gYWRqdXN0UmVwUmFuZ2VGb3JQaGFzZShsbywgaGksIHBoYXNlKSB7XG4gICAgaWYgKHBoYXNlID09PSAnaW50ZW5zaWZpY2F0aW9uJykge1xuICAgICAgICBjb25zdCBuZXdMbyA9IE1hdGgubWF4KDEsIE1hdGgucm91bmQobG8gKiAwLjUpKTtcbiAgICAgICAgcmV0dXJuIHsgbG86IG5ld0xvLCBoaTogTWF0aC5tYXgobmV3TG8sIE1hdGgucm91bmQoaGkgKiAwLjUpKSB9O1xuICAgIH1cbiAgICBpZiAocGhhc2UgPT09ICdhY2N1bXVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB7IGxvLCBoaTogTWF0aC5yb3VuZChoaSAqIDEuNSkgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgbG8sIGhpIH07XG59XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXBSYW5nZSh0YXJnZXRSZXBzKSB7XG4gICAgY29uc3QgbnVtcyA9IFN0cmluZyh0YXJnZXRSZXBzIHx8ICcnKS5tYXRjaCgvXFxkKy9nKTtcbiAgICBpZiAoIW51bXMpXG4gICAgICAgIHJldHVybiB7IGxvOiA4LCBoaTogMTIgfTtcbiAgICBjb25zdCBhID0gcGFyc2VJbnQobnVtc1swXSwgMTApO1xuICAgIGNvbnN0IGIgPSBudW1zWzFdID8gcGFyc2VJbnQobnVtc1sxXSwgMTApIDogYTtcbiAgICByZXR1cm4geyBsbzogTWF0aC5taW4oYSwgYiksIGhpOiBNYXRoLm1heChhLCBiKSB9O1xufVxuLy8gSW5jcmVtZW50byBkZSBjYXJnYTogNWtnIHBpZXJuYXMsIDIuNWtnIHJlc3RvLiBTaSBtdXNjbGVHcm91cCBmYWx0YSwgaW5maWVyZVxuLy8gcG9yIG5vbWJyZSAobWlzbWEgUkVHRVggcXVlIHNlcnZlci9zcmMvbG9naWMuanMpLlxuY29uc3QgTEVHU19OQU1FX1JFID0gL3NlbnRhZGlsbGF8cHJlbnNhfGhhY2t8ZmVtb3JhbHxjdWFkcltpw61dY2VwfGFkdWN0b3J8YWJkdWN0b3J8Z2VtZWxvfHBhbnRvcnJpbGxhfHphbmNhZGF8Ylt1w7pdbGdhcmF8aGlwXFxzKnRocnVzdHxwZXNvXFxzKm11ZXJ0b3xkZWFkbGlmdHxcXGJsZWdcXGJ8ZXh0ZW5zaVtvw7Ndbihlcyk/XFxzK2RlXFxzK2N1W2HDoV0vaTtcbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlV2VpZ2h0SW5jcmVtZW50KG11c2NsZUdyb3VwLCBleGVyY2lzZU5hbWUgPSAnJykge1xuICAgIC8vICdQaWVybmFzJyAoY2Fuw7NuaWNvIEVTKSBvICdsZWdzJyAoY2F0w6Fsb2dvIGNsaWVudGUgZW4gaW5nbMOpcylcbiAgICBpZiAobXVzY2xlR3JvdXAgPT09ICdQaWVybmFzJyB8fCBtdXNjbGVHcm91cCA9PT0gJ2xlZ3MnKVxuICAgICAgICByZXR1cm4gNTtcbiAgICBpZiAoIW11c2NsZUdyb3VwICYmIExFR1NfTkFNRV9SRS50ZXN0KGV4ZXJjaXNlTmFtZSB8fCAnJykpXG4gICAgICAgIHJldHVybiA1O1xuICAgIHJldHVybiAyLjU7XG59XG4vLyBFbiB1bmlsYXRlcmFsIHVzYSBlbCBsYWRvIGTDqWJpbCAoZWwgcXVlIGxpbWl0YSBsYSBwcm9ncmVzacOzbikuXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0aXZlV29ya291dFNldChzZXQpIHtcbiAgICBjb25zdCB3ID0gTnVtYmVyKHNldC53ZWlnaHQpIHx8IDA7XG4gICAgY29uc3QgciA9IE51bWJlcihzZXQucmVwcykgfHwgMDtcbiAgICBjb25zdCBoYXNSaWdodCA9IHNldC53ZWlnaHRSaWdodCAhPSBudWxsIHx8IHNldC5yZXBzUmlnaHQgIT0gbnVsbDtcbiAgICBjb25zdCB3UiA9IHNldC53ZWlnaHRSaWdodCAhPSBudWxsID8gTnVtYmVyKHNldC53ZWlnaHRSaWdodCkgOiB3O1xuICAgIGNvbnN0IHJSID0gc2V0LnJlcHNSaWdodCAhPSBudWxsID8gTnVtYmVyKHNldC5yZXBzUmlnaHQpIDogcjtcbiAgICBjb25zdCByaXIgPSBzZXQucnBlICE9IG51bGwgPyBzdG9yZWRScGVUb1Jpcih7IGtpbmQ6ICdzdG9yZWQtcnBlJywgdmFsdWU6IGxlZ2FjeUFyaXRobWV0aWNOdW1iZXIoc2V0LnJwZSkgfSkudmFsdWUgOiAoc2V0LnJpciAhPSBudWxsID8gc2V0LnJpciA6IG51bGwpO1xuICAgIHJldHVybiB7XG4gICAgICAgIHdlaWdodDogaGFzUmlnaHQgPyBNYXRoLm1pbih3LCB3UikgOiB3LFxuICAgICAgICByZXBzOiBoYXNSaWdodCA/IE1hdGgubWluKHIsIHJSKSA6IHIsXG4gICAgICAgIHJpclxuICAgIH07XG59XG5leHBvcnQgZnVuY3Rpb24gcm91bmRXb3Jrb3V0V2VpZ2h0KHcsIGluY3JlbWVudCwgYmFzZSkge1xuICAgIGNvbnN0IGdyaWQgPSAoTWF0aC5hYnMoYmFzZSAlIGluY3JlbWVudCkgPCAwLjAxKSA/IGluY3JlbWVudCA6IDAuNTtcbiAgICByZXR1cm4gTWF0aC5yb3VuZCh3IC8gZ3JpZCkgKiBncmlkO1xufVxuLyoqXG4gKiBTZXJpZSBkZSBUUkFCQUpPIGRlIGxhIMO6bHRpbWEgc2VzacOzbiAobm8gc2luZ2xlIGRlIHRvcGUgbmkgZHJvcCBzZXQpLlxuICogSW5jbHV5ZSBwcm90ZWNjacOzbiBjb250cmEgU2luZ2xlcy9Eb3VibGVzIChyZXBzIDwgMykgY3VhbmRvIGxvID4gMy5cbiAqIExhIHBvbMOtdGljYSBoaXN0w7NyaWNhIGNvbXBsZXRhIGVzdMOhIGVuIGRvY3MvVFJBSU5JTkctU01BUlQtTE9BRElORy5tZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBpY2tXb3JrUmVmZXJlbmNlKHdvcmtpbmcsIGxvKSB7XG4gICAgaWYgKCF3b3JraW5nIHx8IHdvcmtpbmcubGVuZ3RoID09PSAwKVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAvLyBQcm90ZWNjacOzbiBjb250cmEgU2luZ2xlcy9Eb3VibGVzIChFZ28gTGlmdGluZyk6IGlnbm9yYSBzZXJpZXMgZGUgMSBvIDIgcmVwc1xuICAgIC8vIGEgbWVub3MgcXVlIGVsIHJhbmdvIG9iamV0aXZvIGRlIGxhIHJ1dGluYSBzZWEgZXhwbMOtY2l0YW1lbnRlIGRlIGZ1ZXJ6YSBtw6F4aW1hIChsbyA8PSAzKS5cbiAgICBjb25zdCBub25FZ28gPSBsbyA+IDMgPyB3b3JraW5nLmZpbHRlcihzID0+IHMucmVwcyA+PSAzKSA6IHdvcmtpbmc7XG4gICAgY29uc3QgYmFzZVdvcmtpbmcgPSBub25FZ28ubGVuZ3RoID4gMCA/IG5vbkVnbyA6IHdvcmtpbmc7XG4gICAgY29uc3QgbWF4VyA9IE1hdGgubWF4KC4uLmJhc2VXb3JraW5nLm1hcChzID0+IHMud2VpZ2h0KSk7XG4gICAgY29uc3QgbWFpbiA9IGJhc2VXb3JraW5nLmZpbHRlcihzID0+IHMud2VpZ2h0ID49IG1heFcgKiAwLjc1KTtcbiAgICBjb25zdCBwb29sID0gbWFpbi5sZW5ndGggPiAwID8gbWFpbiA6IGJhc2VXb3JraW5nO1xuICAgIC8vIFNpIGV4aXN0ZSB1biBUb3AgU2V0IHBlc2FkbyBkZSBhbHRhIGludGVuc2lkYWQgKFJJUiA8PSAxIC8gUlBFID49IDkpIGFsIHBlc28gbcOheGltb1xuICAgIC8vIGRlbCBwb29sIHbDoWxpZG8sIGFuY2xhciBlbiBlc2UgcGVzbyBwYXJhIHF1ZSB1biBCYWNrLW9mZiBzZXQgbm8gbG8gZWNsaXBzZS5cbiAgICBjb25zdCB0b3BXZWlnaHQgPSBNYXRoLm1heCguLi5wb29sLm1hcChzID0+IHMud2VpZ2h0KSk7XG4gICAgY29uc3QgYXRUb3BXZWlnaHQgPSBwb29sLmZpbHRlcihzID0+IE1hdGguYWJzKHMud2VpZ2h0IC0gdG9wV2VpZ2h0KSA8IDAuMDEpO1xuICAgIGNvbnN0IGhhc0hlYXZ5VG9wU2V0ID0gYXRUb3BXZWlnaHQuc29tZShzID0+IHMucmlyICE9IG51bGwgJiYgTnVtYmVyKHMucmlyKSA8PSAxKTtcbiAgICBsZXQgcmVmV2VpZ2h0O1xuICAgIGlmIChoYXNIZWF2eVRvcFNldCkge1xuICAgICAgICByZWZXZWlnaHQgPSB0b3BXZWlnaHQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBsZXQgY2FuZGlkYXRlcyA9IHBvb2wuZmlsdGVyKHMgPT4gcy5yZXBzID49IGxvKTtcbiAgICAgICAgaWYgKGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBjb25zdCBtYXhSZXBzID0gTWF0aC5tYXgoLi4ucG9vbC5tYXAocyA9PiBzLnJlcHMpKTtcbiAgICAgICAgICAgIGNhbmRpZGF0ZXMgPSBwb29sLmZpbHRlcihzID0+IHMucmVwcyA9PT0gbWF4UmVwcyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKVxuICAgICAgICAgICAgY2FuZGlkYXRlcyA9IHBvb2w7XG4gICAgICAgIHJlZldlaWdodCA9IE1hdGgubWF4KC4uLmNhbmRpZGF0ZXMubWFwKHMgPT4gcy53ZWlnaHQpKTtcbiAgICB9XG4gICAgY29uc3Qgc2FtZVdlaWdodCA9IHBvb2wuZmlsdGVyKHMgPT4gTWF0aC5hYnMocy53ZWlnaHQgLSByZWZXZWlnaHQpIDwgMC4wMSk7XG4gICAgY29uc3QgcmVmUmVwcyA9IE1hdGgubWF4KC4uLnNhbWVXZWlnaHQubWFwKHMgPT4gcy5yZXBzKSk7XG4gICAgY29uc3Qga25vd25SaXIgPSBzYW1lV2VpZ2h0Lm1hcChzID0+IHMucmlyKS5maWx0ZXIodiA9PiB2ICE9IG51bGwpO1xuICAgIGNvbnN0IHJpciA9IGtub3duUmlyLmxlbmd0aCA/IE1hdGgubWluKC4uLmtub3duUmlyLm1hcChsZWdhY3lBcml0aG1ldGljTnVtYmVyKSkgOiBudWxsO1xuICAgIGNvbnN0IG1pblJlcHMgPSBNYXRoLm1pbiguLi5zYW1lV2VpZ2h0Lm1hcChzID0+IHMucmVwcykpO1xuICAgIHJldHVybiB7IHdlaWdodDogcmVmV2VpZ2h0LCByZXBzOiByZWZSZXBzLCBtaW5SZXBzLCByaXIsIHNldHNBdFdlaWdodDogc2FtZVdlaWdodCB9O1xufVxuLyoqXG4gKiBTdWdlcmVuY2lhIHBvciBUb3AgU2V0ICsgQmFjay1vZmYgLyBEb2JsZSBQcm9ncmVzacOzbi4gYHNlc3Npb25zYCBvcmRlbmFkbyBERVNDIHBvciBmZWNoYS5cbiAqIC0gRGVzYmxvcXVlYSBpbmNyZW1lbnRvIGRlIHBlc28gc2kgZWwgVG9wIFNldCBhbGNhbnrDsyA+PSBoaSByZXBzIGNvbiBSSVIgPD0gMSAoUlBFIDktMTApLFxuICogICBvIHNpIHRvZGFzIGxhcyBzZXJpZXMgYWwgcGVzbyBkZSB0cmFiYWpvIGFsY2FuemFyb24gPj0gaGkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBldmFsdWF0ZVdvcmtvdXRTdWdnZXN0aW9uKHNlc3Npb25zLCB0YXJnZXRSZXBzLCBpbmNyZW1lbnQsIHBoYXNlID0gbnVsbCkge1xuICAgIGlmICghc2Vzc2lvbnMgfHwgc2Vzc2lvbnMubGVuZ3RoID09PSAwKVxuICAgICAgICByZXR1cm4gYWJzdGFpbignaW50ZXInLCAnZW1wdHktaGlzdG9yeScpO1xuICAgIGNvbnN0IHJlc29sdmVkUGhhc2UgPSAocGhhc2UgJiYgdHlwZW9mIHBoYXNlID09PSAnb2JqZWN0JykgPyAocGhhc2UucGhhc2UgPz8gbnVsbCkgOiAocGhhc2UgPz8gbnVsbCk7XG4gICAgY29uc3QgcGFyc2VkUmFuZ2UgPSBwYXJzZVJlcFJhbmdlKHRhcmdldFJlcHMpO1xuICAgIGNvbnN0IHsgbG8sIGhpIH0gPSBhZGp1c3RSZXBSYW5nZUZvclBoYXNlKHBhcnNlZFJhbmdlLmxvLCBwYXJzZWRSYW5nZS5oaSwgcmVzb2x2ZWRQaGFzZSk7XG4gICAgY29uc3Qgd29ya2luZyA9IChzZXNzaW9uc1swXS5zZXRzIHx8IFtdKVxuICAgICAgICAubWFwKGVmZmVjdGl2ZVdvcmtvdXRTZXQpXG4gICAgICAgIC5maWx0ZXIocyA9PiBzLndlaWdodCA+IDAgJiYgcy5yZXBzID4gMCk7XG4gICAgaWYgKHdvcmtpbmcubGVuZ3RoID09PSAwKVxuICAgICAgICByZXR1cm4gYWJzdGFpbignaW50ZXInLCAnbm8tcG9zaXRpdmUtd29yaycpO1xuICAgIGNvbnN0IHJlZiA9IHBpY2tXb3JrUmVmZXJlbmNlKHdvcmtpbmcsIGxvKTtcbiAgICBpZiAoIXJlZilcbiAgICAgICAgcmV0dXJuIGFic3RhaW4oJ2ludGVyJywgJ25vLXJlZmVyZW5jZScpO1xuICAgIGNvbnN0IHsgd2VpZ2h0OiByZWZXZWlnaHQsIHJlcHM6IHJlZlJlcHMsIG1pblJlcHMsIHJpciwgc2V0c0F0V2VpZ2h0IH0gPSByZWY7XG4gICAgY29uc3QgYWxsSGl0VG9wID0gc2V0c0F0V2VpZ2h0LmV2ZXJ5KHMgPT4gcy5yZXBzID49IGhpKTtcbiAgICBjb25zdCB0b3BTZXRQYXNzZWQgPSBzZXRzQXRXZWlnaHQuZmluZChzID0+IHMucmVwcyA+PSBoaSAmJiBzLnJpciAhPSBudWxsICYmIE51bWJlcihzLnJpcikgPD0gMSk7XG4gICAgbGV0IHdlaWdodCwgcmVwcywgcmF0aW9uYWxlO1xuICAgIGxldCBydWxlO1xuICAgIGlmICh0b3BTZXRQYXNzZWQgfHwgYWxsSGl0VG9wKSB7XG4gICAgICAgIHJ1bGUgPSB0b3BTZXRQYXNzZWQgJiYgIWFsbEhpdFRvcCA/ICd0b3Atc2V0LXBhc3NlZCcgOiAnYWxsLWhpdC10b3AnO1xuICAgICAgICB3ZWlnaHQgPSByb3VuZFdvcmtvdXRXZWlnaHQocmVmV2VpZ2h0ICsgaW5jcmVtZW50LCBpbmNyZW1lbnQsIHJlZldlaWdodCk7XG4gICAgICAgIHJlcHMgPSBsbztcbiAgICAgICAgaWYgKHRvcFNldFBhc3NlZCAmJiAhYWxsSGl0VG9wKSB7XG4gICAgICAgICAgICByYXRpb25hbGUgPSBgVG9wIFNldCBzdXBlcmFkbyAoJHtyZWZXZWlnaHR9a2cgw5cgJHt0b3BTZXRQYXNzZWQucmVwc30gYSBSSVIgJHt0b3BTZXRQYXNzZWQucmlyfSk6IHN1YmUgYSAke3dlaWdodH1rZyB5IHJlaW5pY2lhIGVuICR7bG99LmA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByYXRpb25hbGUgPSBzZXRzQXRXZWlnaHQubGVuZ3RoID4gMVxuICAgICAgICAgICAgICAgID8gYFRvZGFzIGxhcyBzZXJpZXMgYSAke3JlZldlaWdodH1rZyBsbGVnYXJvbiBhIOKJpSR7aGl9IHJlcHM6IHN1YmUgYSAke3dlaWdodH1rZyB5IHJlaW5pY2lhIGVuICR7bG99LmBcbiAgICAgICAgICAgICAgICA6IGBBbGNhbnphc3RlICR7cmVmUmVwc30gcmVwcyBjb24gJHtyZWZXZWlnaHR9a2cgKHRvcGUgZGVsIHJhbmdvKTogc3ViZSBhICR7d2VpZ2h0fWtnIHkgcmVpbmljaWEgZW4gJHtsb30uYDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChyZWZSZXBzID49IGhpKSB7XG4gICAgICAgIHJ1bGUgPSAnZXF1YWxpemUtcmVwcyc7XG4gICAgICAgIHdlaWdodCA9IHJlZldlaWdodDtcbiAgICAgICAgcmVwcyA9IE1hdGgubWluKGhpLCBtaW5SZXBzICsgMSk7XG4gICAgICAgIHJhdGlvbmFsZSA9IGBMYSBtZWpvciBzZXJpZSBmdWUgJHtyZWZXZWlnaHR9a2cgw5cgJHtyZWZSZXBzfSwgcGVybyBubyB0b2RhcyBsbGVnYXJvbiBhICR7aGl9OiBtYW50w6luICR7d2VpZ2h0fWtnIHkgYXB1bnRhIGEgJHtyZXBzfSBlbiB0b2Rhcy5gO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcnVsZSA9IHJlZlJlcHMgPCBsbyA/ICdiZWxvdy1yYW5nZS1ob2xkJyA6ICdwcm9ncmVzcy1yZXBzJztcbiAgICAgICAgY29uc3QgYnVtcCA9IChyaXIgIT0gbnVsbCAmJiByaXIgPj0gMykgPyAyIDogMTtcbiAgICAgICAgd2VpZ2h0ID0gcmVmV2VpZ2h0O1xuICAgICAgICByZXBzID0gTWF0aC5taW4oaGksIHJlZlJlcHMgKyBidW1wKTtcbiAgICAgICAgaWYgKHJlZlJlcHMgPCBsbykge1xuICAgICAgICAgICAgcmF0aW9uYWxlID0gcmlyICE9IG51bGxcbiAgICAgICAgICAgICAgICA/IGBUcmFiYWpvIGRlIHJlZmVyZW5jaWEgJHtyZWZXZWlnaHR9a2cgw5cgJHtyZWZSZXBzfSAoUklSICR7cmlyfSksIHBvciBkZWJham8gZGVsIHJhbmdvICR7bG994oCTJHtoaX06IG1hbnTDqW4gZWwgcGVzbyB5IGFwdW50YSBhICR7cmVwc30gcmVwcy5gXG4gICAgICAgICAgICAgICAgOiBgVHJhYmFqbyBkZSByZWZlcmVuY2lhICR7cmVmV2VpZ2h0fWtnIMOXICR7cmVmUmVwc30sIHBvciBkZWJham8gZGVsIHJhbmdvICR7bG994oCTJHtoaX06IG1hbnTDqW4gZWwgcGVzbyB5IGFwdW50YSBhICR7cmVwc30gcmVwcy5gO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgcmF0aW9uYWxlID0gcmlyICE9IG51bGxcbiAgICAgICAgICAgICAgICA/IGBIaWNpc3RlICR7cmVmV2VpZ2h0fWtnIMOXICR7cmVmUmVwc30gKFJJUiAke3Jpcn0pOiBtYW50w6luIGVsIHBlc28geSBhcHVudGEgYSAke3JlcHN9IHJlcHMuYFxuICAgICAgICAgICAgICAgIDogYEhpY2lzdGUgJHtyZWZXZWlnaHR9a2cgw5cgJHtyZWZSZXBzfTogbWFudMOpbiBlbCBwZXNvIHkgYXB1bnRhIGEgJHtyZXBzfSByZXBzLmA7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHdlaWdodCA8PSAwIHx8IHJlcHMgPD0gMClcbiAgICAgICAgcmV0dXJuIGFic3RhaW4oJ2ludGVyJywgJ25vbnBvc2l0aXZlLXJlc3VsdCcpO1xuICAgIHJldHVybiB7IHJlY29tbWVuZGF0aW9uOiB7IHdlaWdodCwgcmVwcywgcmF0aW9uYWxlLCBiYXNlZE9uOiBzZXNzaW9ucy5sZW5ndGgsIHBoYXNlOiByZXNvbHZlZFBoYXNlIH0sXG4gICAgICAgIGV4cGxhbmF0aW9uOiB7IG1vZGU6ICdpbnRlcicsIHJ1bGUsIHJhbmdlOiB7IGxvLCBoaSB9LCBoaXN0b3J5Q291bnQ6IHNlc3Npb25zLmxlbmd0aCxcbiAgICAgICAgICAgIHVzZWRTZXNzaW9uSW5kZXg6IDAsIHBvc2l0aXZlU2V0Q291bnQ6IHdvcmtpbmcubGVuZ3RoLFxuICAgICAgICAgICAgcmVmZXJlbmNlOiB7IHdlaWdodDogcmVmV2VpZ2h0LCByZXBzOiByZWZSZXBzLCBtaW5SZXBzLCByaXIsIHNldHNBdFdlaWdodDogc2V0c0F0V2VpZ2h0Lmxlbmd0aCB9LFxuICAgICAgICAgICAgaW5jcmVtZW50LCByYXdXZWlnaHQ6IHRvcFNldFBhc3NlZCB8fCBhbGxIaXRUb3AgPyByZWZXZWlnaHQgKyBpbmNyZW1lbnQgOiByZWZXZWlnaHQsXG4gICAgICAgICAgICByb3VuZGluZ0dyaWQ6IHRvcFNldFBhc3NlZCB8fCBhbGxIaXRUb3AgPyB3ZWlnaHRHcmlkKGluY3JlbWVudCwgcmVmV2VpZ2h0KSA6IG51bGwsXG4gICAgICAgICAgICB3ZWlnaHREZWx0YTogd2VpZ2h0IC0gcmVmV2VpZ2h0LCByZXN1bHRXZWlnaHQ6IHdlaWdodCxcbiAgICAgICAgICAgIGxpbWl0YXRpb25zOiBbJ2ZpcnN0LXNlc3Npb24tb25seScsICdjYWxsZXItb3JkZXInLCAnY29tcGxldGVkLW5vdC1maWx0ZXJlZCddIH0gfTtcbn1cbi8qKlxuICogQXV0b3JyZWd1bGFjacOzbiBJTlRSQS1zZXNpw7NuOiBzdWdpZXJlIGxhIHNpZ3VpZW50ZSBzZXJpZSBtaXJhbmRvIFRPREFTIGxhc1xuICogc2VyaWVzIGNvbXBsZXRhZGFzIEhPWSBkZWwgbWlzbW8gZWplcmNpY2lvLiBSZXF1aWVyZSBSSVIgZW4gY2FkYSB1bmEuXG4gKiBBIGRpZmVyZW5jaWEgZGUgY29tcHV0ZVdvcmtvdXRTdWdnZXN0aW9uIChlbnRyZSBzZXNpb25lcyksIFPDjSBwdWVkZSBiYWphciBwZXNvLlxuICpcbiAqIFNpIGxhIFNlcmllIDEgKFRvcCBTZXQpIHNlIHJlZ2lzdHJhIGFsIGZhbGxvIGFic29sdXRvIChSSVIgPT09IDAgLyBSUEUgPT09IDEwKSxcbiAqIGNhbGN1bGEgYXV0b23DoXRpY2FtZW50ZSB1biBCYWNrLW9mZiBTZXQgKC0xMi41JSBkZSBwZXNvKSBhcHVudGFuZG8gYWwgdGVjaG9cbiAqIGRlbCByYW5nbyAoKzEgbyArMiByZXBzIHJlc3BlY3RvIGFsIFRvcCBTZXQpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXZhbHVhdGVOZXh0U2V0RnJvbVRvZGF5KGNvbXBsZXRlZFRvZGF5LCBvcHRzT3JUYXJnZXRSZXBzID0ge30sIGxlZ2FjeUluY3JlbWVudCA9IDIuNSwgbGVnYWN5UGhhc2UgPSBudWxsKSB7XG4gICAgaWYgKCFjb21wbGV0ZWRUb2RheSB8fCBjb21wbGV0ZWRUb2RheS5sZW5ndGggPT09IDApXG4gICAgICAgIHJldHVybiBhYnN0YWluKCdpbnRyYScsICdlbXB0eS10b2RheScpO1xuICAgIGxldCBsbyA9IDgsIGhpID0gMTIsIGluY3JlbWVudCA9IDIuNTtcbiAgICBsZXQgcGhhc2UgPSBudWxsO1xuICAgIGlmICh0eXBlb2Ygb3B0c09yVGFyZ2V0UmVwcyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgY29uc3QgcGFyc2VkID0gcGFyc2VSZXBSYW5nZShvcHRzT3JUYXJnZXRSZXBzKTtcbiAgICAgICAgbG8gPSBwYXJzZWQubG87XG4gICAgICAgIGhpID0gcGFyc2VkLmhpO1xuICAgICAgICBpbmNyZW1lbnQgPSB0eXBlb2YgbGVnYWN5SW5jcmVtZW50ID09PSAnbnVtYmVyJyA/IGxlZ2FjeUluY3JlbWVudCA6IDIuNTtcbiAgICAgICAgcGhhc2UgPSAobGVnYWN5UGhhc2UgJiYgdHlwZW9mIGxlZ2FjeVBoYXNlID09PSAnb2JqZWN0JykgPyAobGVnYWN5UGhhc2UucGhhc2UgPz8gbnVsbCkgOiAobGVnYWN5UGhhc2UgPz8gbnVsbCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKG9wdHNPclRhcmdldFJlcHMgJiYgdHlwZW9mIG9wdHNPclRhcmdldFJlcHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGxvID0gb3B0c09yVGFyZ2V0UmVwcy5sbyA/PyA4O1xuICAgICAgICBoaSA9IG9wdHNPclRhcmdldFJlcHMuaGkgPz8gMTI7XG4gICAgICAgIGluY3JlbWVudCA9IG9wdHNPclRhcmdldFJlcHMuaW5jcmVtZW50ID8/IDIuNTtcbiAgICAgICAgcGhhc2UgPSBvcHRzT3JUYXJnZXRSZXBzLnBoYXNlID8/IG51bGw7XG4gICAgfVxuICAgIGNvbnN0IHNldHMgPSBjb21wbGV0ZWRUb2RheVxuICAgICAgICAubWFwKHMgPT4gKHtcbiAgICAgICAgd2VpZ2h0OiBOdW1iZXIocy53ZWlnaHQpIHx8IDAsXG4gICAgICAgIHJlcHM6IE51bWJlcihzLnJlcHMpIHx8IDAsXG4gICAgICAgIHJpcjogcy5yaXIgIT0gbnVsbCAmJiBzLnJpciAhPT0gJycgPyBOdW1iZXIocy5yaXIpIDogbnVsbFxuICAgIH0pKVxuICAgICAgICAuZmlsdGVyKHMgPT4gcy53ZWlnaHQgPiAwICYmIHMucmVwcyA+IDApO1xuICAgIGlmICghc2V0cy5sZW5ndGgpXG4gICAgICAgIHJldHVybiBhYnN0YWluKCdpbnRyYScsICduby1wb3NpdGl2ZS13b3JrJyk7XG4gICAgLy8gUklSIG9ibGlnYXRvcmlvIGVuIFRPREFTIGxhcyBzZXJpZXMgZGUgaG95IHVzYWRhcyBwYXJhIGVsIGPDoWxjdWxvXG4gICAgaWYgKCFhbGxIYXZlS25vd25SaXIoc2V0cykpXG4gICAgICAgIHJldHVybiBhYnN0YWluKCdpbnRyYScsICdtaXNzaW5nLWZpbml0ZS1yaXInKTtcbiAgICBjb25zdCBrbm93blNldHMgPSBzZXRzO1xuICAgIGNvbnN0IHJhbmdlID0gYWRqdXN0UmVwUmFuZ2VGb3JQaGFzZShsbywgaGksIHBoYXNlKTtcbiAgICBjb25zdCBhZGpMbyA9IHJhbmdlLmxvO1xuICAgIGNvbnN0IGFkakhpID0gcmFuZ2UuaGk7XG4gICAgY29uc3QgbGFzdCA9IGtub3duU2V0c1trbm93blNldHMubGVuZ3RoIC0gMV07XG4gICAgY29uc3QgZmlyc3QgPSBrbm93blNldHNbMF07XG4gICAgY29uc3QgbWluUmlyID0gTWF0aC5taW4oLi4ua25vd25TZXRzLm1hcChzID0+IHMucmlyKSk7XG4gICAgY29uc3QgYXZnUmlyID0ga25vd25TZXRzLnJlZHVjZSgoYSwgcykgPT4gYSArIHMucmlyLCAwKSAvIHNldHMubGVuZ3RoO1xuICAgIGNvbnN0IHJpckRyb3AgPSBmaXJzdC5yaXIgLSBsYXN0LnJpcjtcbiAgICBjb25zdCByZXBEcm9wID0gZmlyc3QucmVwcyAtIGxhc3QucmVwcztcbiAgICBsZXQgd2VpZ2h0ID0gbGFzdC53ZWlnaHQ7XG4gICAgbGV0IHJlcHMgPSBsYXN0LnJlcHM7XG4gICAgbGV0IHJhdGlvbmFsZTtcbiAgICBsZXQgcnVsZTtcbiAgICBsZXQgcmF3V2VpZ2h0ID0gbGFzdC53ZWlnaHQ7XG4gICAgbGV0IHJvdW5kaW5nR3JpZCA9IG51bGw7XG4gICAgaWYgKHNldHMubGVuZ3RoID09PSAxICYmIGZpcnN0LnJpciA8PSAwKSB7XG4gICAgICAgIHJ1bGUgPSAnZmlyc3QtZmFpbHVyZS1iYWNrb2ZmJztcbiAgICAgICAgLy8gU2VyaWUgMSAoVG9wIFNldCkgYWwgZmFsbG8gYWJzb2x1dG8gKFJJUiAwIC8gUlBFIDEwKSDihpIgQmFjay1vZmYgU2V0ICgtMTIuNSUsIGVudHJlIDEwLTE1JSlcbiAgICAgICAgY29uc3QgcmF3QmFja29mZiA9IGZpcnN0LndlaWdodCAqIDAuODc1O1xuICAgICAgICByYXdXZWlnaHQgPSByYXdCYWNrb2ZmO1xuICAgICAgICByb3VuZGluZ0dyaWQgPSB3ZWlnaHRHcmlkKGluY3JlbWVudCwgZmlyc3Qud2VpZ2h0KTtcbiAgICAgICAgY29uc3Qgcm91bmRlZEJhY2tvZmYgPSByb3VuZFdvcmtvdXRXZWlnaHQocmF3QmFja29mZiwgaW5jcmVtZW50LCBmaXJzdC53ZWlnaHQpO1xuICAgICAgICB3ZWlnaHQgPSByb3VuZGVkQmFja29mZiA8IGZpcnN0LndlaWdodFxuICAgICAgICAgICAgPyBNYXRoLm1heChpbmNyZW1lbnQgPiAwID8gaW5jcmVtZW50IDogMC41LCByb3VuZGVkQmFja29mZilcbiAgICAgICAgICAgIDogcm91bmRXb3Jrb3V0V2VpZ2h0KE1hdGgubWF4KDAuNSwgZmlyc3Qud2VpZ2h0IC0gTWF0aC5tYXgoaW5jcmVtZW50LCAwLjUpKSwgaW5jcmVtZW50LCBmaXJzdC53ZWlnaHQpO1xuICAgICAgICByZXBzID0gZmlyc3QucmVwcyA8IGFkakhpXG4gICAgICAgICAgICA/IE1hdGgubWluKGFkakhpLCBNYXRoLm1heChhZGpMbywgZmlyc3QucmVwcyArIDIpKVxuICAgICAgICAgICAgOiBmaXJzdC5yZXBzICsgMTtcbiAgICAgICAgcmF0aW9uYWxlID0gYFRvcCBTZXQgYWwgZmFsbG8gKFJJUiAwKSDihpIgQmFjay1vZmYgU2V0ICgtMTIuNSUpOiAke3dlaWdodH0ga2cgw5cgJHtyZXBzfSByZXBzLmA7XG4gICAgfVxuICAgIGVsc2UgaWYgKGxhc3QucmlyIDw9IDAgfHwgbGFzdC5yZXBzIDwgYWRqTG8pIHtcbiAgICAgICAgcnVsZSA9IGxhc3QucmlyIDw9IDAgPyAnbGFzdC1mYWlsdXJlLXN0ZXAnIDogJ2JlbG93LXJhbmdlLXN0ZXAnO1xuICAgICAgICByYXdXZWlnaHQgPSBNYXRoLm1heCgwLCBsYXN0LndlaWdodCAtIGluY3JlbWVudCk7XG4gICAgICAgIHJvdW5kaW5nR3JpZCA9IHdlaWdodEdyaWQoaW5jcmVtZW50LCBsYXN0LndlaWdodCk7XG4gICAgICAgIC8vIFNlcmllIHN1YnNlY3VlbnRlIGFsIGZhbGxvIG8gcG9yIGRlYmFqbyBkZWwgc3VlbG8gZGVsIHJhbmdvOiBiYWphIHVuIGluY3JlbWVudG9cbiAgICAgICAgY29uc3Qgc3RlcHBlZCA9IHJvdW5kV29ya291dFdlaWdodChNYXRoLm1heCgwLCBsYXN0LndlaWdodCAtIGluY3JlbWVudCksIGluY3JlbWVudCwgbGFzdC53ZWlnaHQpO1xuICAgICAgICB3ZWlnaHQgPSBzdGVwcGVkIDwgbGFzdC53ZWlnaHRcbiAgICAgICAgICAgID8gTWF0aC5tYXgoaW5jcmVtZW50ID4gMCA/IGluY3JlbWVudCA6IDAuNSwgc3RlcHBlZClcbiAgICAgICAgICAgIDogcm91bmRXb3Jrb3V0V2VpZ2h0KE1hdGgubWF4KDAuNSwgbGFzdC53ZWlnaHQgLSBNYXRoLm1heChpbmNyZW1lbnQsIDAuNSkpLCBpbmNyZW1lbnQsIGxhc3Qud2VpZ2h0KTtcbiAgICAgICAgcmVwcyA9IE1hdGgubWluKGFkakhpLCBNYXRoLm1heChhZGpMbywgbGFzdC5yZXBzKSk7XG4gICAgICAgIHJhdGlvbmFsZSA9IGxhc3QucmlyIDw9IDBcbiAgICAgICAgICAgID8gYEhveSBSSVIgJHtsYXN0LnJpcn0gZW4gYWxndW5hIHNlcmllIOKGkiBiYWphIGEgJHt3ZWlnaHR9IGtnIMOXICR7cmVwc30uYFxuICAgICAgICAgICAgOiBgUmVwcyBiYWpvIGVsIHJhbmdvICR7YWRqTG994oCTJHthZGpIaX0g4oaSIGJhamEgYSAke3dlaWdodH0ga2cgw5cgJHtyZXBzfS5gO1xuICAgIH1cbiAgICBlbHNlIGlmIChsYXN0LnJpciA9PT0gMSB8fCByaXJEcm9wID49IDIgfHwgKHJlcERyb3AgPj0gMiAmJiBsYXN0LnJpciA8PSAyKSkge1xuICAgICAgICBydWxlID0gJ2ZhdGlndWUtaG9sZCc7XG4gICAgICAgIC8vIEZhdGlnYTogbWlzbW8gcGVzbywgbm8gZW1wdWphciByZXBzXG4gICAgICAgIHdlaWdodCA9IGxhc3Qud2VpZ2h0O1xuICAgICAgICByZXBzID0gTWF0aC5taW4oYWRqSGksIE1hdGgubWF4KGFkakxvLCBsYXN0LnJlcHMpKTtcbiAgICAgICAgcmF0aW9uYWxlID0gYEZhdGlnYSBkZSBob3kgKFJJUiBtaW4gJHttaW5SaXJ9KSDihpIgbWFudMOpbiAke3dlaWdodH0ga2cgw5cgJHtyZXBzfS5gO1xuICAgIH1cbiAgICBlbHNlIGlmIChhdmdSaXIgPj0gMi41ICYmIG1pblJpciA+PSAyICYmIGxhc3QucmVwcyA+PSBhZGpMbykge1xuICAgICAgICBydWxlID0gJ2NvbWZvcnRhYmxlLXJlcHMnO1xuICAgICAgICAvLyBDw7Ntb2RvOiBtaXNtbyBwZXNvLCArMS8rMiByZXBzIChkb2JsZSBwcm9ncmVzacOzbiBpbnRyYS1zZXNpw7NuIOKAlCBubyBjbG9uYXIgbGEgc2VyaWUgYW50ZXJpb3IpXG4gICAgICAgIHdlaWdodCA9IGxhc3Qud2VpZ2h0O1xuICAgICAgICBjb25zdCBidW1wID0gYXZnUmlyID49IDMgPyAyIDogMTtcbiAgICAgICAgcmVwcyA9IE1hdGgubWluKGFkakhpLCBsYXN0LnJlcHMgKyBidW1wKTtcbiAgICAgICAgaWYgKHJlcHMgPiBsYXN0LnJlcHMpIHtcbiAgICAgICAgICAgIHJhdGlvbmFsZSA9IGBTZXJpZXMgZGUgaG95IGPDs21vZGFzIChSSVIgbWluICR7bWluUmlyfSkg4oaSICR7d2VpZ2h0fSBrZyDDlyAke3JlcHN9ICgrJHtyZXBzIC0gbGFzdC5yZXBzfSByZXApLmA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAvLyBZYSBlbiBlbCB0ZWNobyBkZWwgcmFuZ28gY29uIFJJUiBhbHRvOiBsYSBzdWJpZGEgZGUgcGVzbyBlcyBlbnRyZSBzZXNpb25lc1xuICAgICAgICAgICAgcmF0aW9uYWxlID0gYFRlY2hvIGRlbCByYW5nbyAke2FkakxvfeKAkyR7YWRqSGl9IGNvbiBSSVIgYWx0byDihpIgbWFudMOpbiAke3dlaWdodH0ga2cgw5cgJHtyZXBzfTsgbGEgcHLDs3hpbWEgc2VzacOzbiBzdWJlIHBlc28uYDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcnVsZSA9ICduZXV0cmFsLWhvbGQnO1xuICAgICAgICAvLyBOZXV0cm8gKFJJUiB+Mik6IG1pc21vIHBlc287IHNpIGHDum4gbm8gbGxlZ2FzIGFsIHRlY2hvLCBwaWRlIGFsIG1lbm9zIGxhc3QucmVwc1xuICAgICAgICB3ZWlnaHQgPSBsYXN0LndlaWdodDtcbiAgICAgICAgcmVwcyA9IE1hdGgubWluKGFkakhpLCBNYXRoLm1heChhZGpMbywgbGFzdC5yZXBzKSk7XG4gICAgICAgIHJhdGlvbmFsZSA9IGBTZWfDum4gc2VyaWVzIGRlIGhveSAoUklSIG1pbiAke21pblJpcn0pIOKGkiAke3dlaWdodH0ga2cgw5cgJHtyZXBzfS5gO1xuICAgIH1cbiAgICBpZiAod2VpZ2h0IDw9IDAgfHwgcmVwcyA8PSAwKVxuICAgICAgICByZXR1cm4gYWJzdGFpbignaW50cmEnLCAnbm9ucG9zaXRpdmUtcmVzdWx0Jyk7XG4gICAgcmV0dXJuIHsgcmVjb21tZW5kYXRpb246IHsgd2VpZ2h0LCByZXBzLCByYXRpb25hbGUsIHBoYXNlLCBzb3VyY2U6ICdpbnRyYScgfSxcbiAgICAgICAgZXhwbGFuYXRpb246IHsgbW9kZTogJ2ludHJhJywgcnVsZSwgcmFuZ2U6IHsgbG86IGFkakxvLCBoaTogYWRqSGkgfSwgcG9zaXRpdmVTZXRDb3VudDogc2V0cy5sZW5ndGgsXG4gICAgICAgICAgICBmaXJzdDogeyAuLi5maXJzdCB9LCBsYXN0OiB7IC4uLmxhc3QgfSwgbWluUmlyLCBhdmdSaXIsIHJpckRyb3AsIHJlcERyb3AsXG4gICAgICAgICAgICBpbmNyZW1lbnQsIHJhd1dlaWdodCwgcm91bmRpbmdHcmlkLCByZXN1bHRXZWlnaHQ6IHdlaWdodCwgd2VpZ2h0RGVsdGE6IHdlaWdodCAtIGxhc3Qud2VpZ2h0LFxuICAgICAgICAgICAgZmFsbGJhY2tTdGVwOiByb3VuZGluZ0dyaWQgIT0gbnVsbCAmJiAocnVsZSA9PT0gJ2ZpcnN0LWZhaWx1cmUtYmFja29mZidcbiAgICAgICAgICAgICAgICA/ICEocm91bmRXb3Jrb3V0V2VpZ2h0KHJhd1dlaWdodCwgaW5jcmVtZW50LCBmaXJzdC53ZWlnaHQpIDwgZmlyc3Qud2VpZ2h0KVxuICAgICAgICAgICAgICAgIDogIShyb3VuZFdvcmtvdXRXZWlnaHQocmF3V2VpZ2h0LCBpbmNyZW1lbnQsIGxhc3Qud2VpZ2h0KSA8IGxhc3Qud2VpZ2h0KSksXG4gICAgICAgICAgICBsaW1pdGF0aW9uczogWydjYWxsZXItb3JkZXInLCAnY2FsbGVyLWNvbXBsZXRpb24tZmlsdGVyJywgJ3Jpci1yZXF1aXJlZCddIH0gfTtcbn1cbi8qKiBTdGFibGUgcHVibGljIHByb2plY3Rpb25zLiBFeHBsYW5hdGlvbnMgcmVtYWluIGludGVybmFsIGFuZCBhcmUgbmV2ZXIgYWRkZWRcbiAqIHRvIFVJIERUT3MsIHBlcnNpc3RlZCBzdWdnZXN0aW9ucywgb3BlcmF0aW9ucywgcmVjZWlwdHMgb3IgcmVxdWVzdCBoYXNoZXMuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZVdvcmtvdXRTdWdnZXN0aW9uKHNlc3Npb25zLCB0YXJnZXRSZXBzLCBpbmNyZW1lbnQsIHBoYXNlID0gbnVsbCkge1xuICAgIHJldHVybiBldmFsdWF0ZVdvcmtvdXRTdWdnZXN0aW9uKHNlc3Npb25zLCB0YXJnZXRSZXBzLCBpbmNyZW1lbnQsIHBoYXNlKS5yZWNvbW1lbmRhdGlvbjtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzdWdnZXN0TmV4dFNldEZyb21Ub2RheShjb21wbGV0ZWRUb2RheSwgb3B0c09yVGFyZ2V0UmVwcyA9IHt9LCBsZWdhY3lJbmNyZW1lbnQgPSAyLjUsIGxlZ2FjeVBoYXNlID0gbnVsbCkge1xuICAgIHJldHVybiBldmFsdWF0ZU5leHRTZXRGcm9tVG9kYXkoY29tcGxldGVkVG9kYXksIG9wdHNPclRhcmdldFJlcHMsIGxlZ2FjeUluY3JlbWVudCwgbGVnYWN5UGhhc2UpLnJlY29tbWVuZGF0aW9uO1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9c21hcnRMb2FkaW5nLmpzLm1hcCIsIi8qKiBDaXZpbCBDRE1YIHJlYWRpbmdzIGFyZSBkaXN0aW5jdCBmcm9tIGVsYXBzZWQgZHVyYXRpb25zIGFuZCBVVEMgaW5zdGFudHMuXG4gKiBObyBjbG9jayBoZXJlOiBhZGFwdGVycyBzdXBwbHkgbm93LiBMZWdhY3kgYm91bmRzIHJlbWFpbiB0aGUgd3JpdGUgcG9saWN5LiAqL1xuZXhwb3J0IGNvbnN0IFRSQUlOSU5HX1RJTUVaT05FID0gJ0FtZXJpY2EvTWV4aWNvX0NpdHknO1xuY29uc3QgY2l2aWxGb3JtYXR0ZXIgPSBuZXcgSW50bC5EYXRlVGltZUZvcm1hdCgnZW4tQ0EnLCB7XG4gICAgdGltZVpvbmU6IFRSQUlOSU5HX1RJTUVaT05FLCB5ZWFyOiAnbnVtZXJpYycsIG1vbnRoOiAnMi1kaWdpdCcsIGRheTogJzItZGlnaXQnXG59KTtcbmNvbnN0IG9mZnNldEZvcm1hdHRlciA9IG5ldyBJbnRsLkRhdGVUaW1lRm9ybWF0KCdlbi1VUycsIHsgdGltZVpvbmU6IFRSQUlOSU5HX1RJTUVaT05FLCB0aW1lWm9uZU5hbWU6ICdzaG9ydE9mZnNldCcgfSk7XG5leHBvcnQgZnVuY3Rpb24gdHJhaW5pbmdDaXZpbERhdGUoaW5zdGFudCkge1xuICAgIHJldHVybiBjaXZpbEZvcm1hdHRlci5mb3JtYXQoaW5zdGFudCBpbnN0YW5jZW9mIERhdGUgPyBpbnN0YW50IDogbmV3IERhdGUoaW5zdGFudCkpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHRyYWluaW5nVXRjT2Zmc2V0TWludXRlcyhpbnN0YW50KSB7XG4gICAgY29uc3QgcGFydCA9IG9mZnNldEZvcm1hdHRlci5mb3JtYXRUb1BhcnRzKGluc3RhbnQpLmZpbmQocCA9PiBwLnR5cGUgPT09ICd0aW1lWm9uZU5hbWUnKT8udmFsdWUgfHwgJ0dNVC02JztcbiAgICBjb25zdCBtYXRjaCA9IHBhcnQubWF0Y2goL0dNVChbKy1dKShcXGQrKSg/OjooXFxkKykpPy8pO1xuICAgIGlmICghbWF0Y2gpXG4gICAgICAgIHJldHVybiAtMzYwO1xuICAgIGNvbnN0IHNpZ24gPSBtYXRjaFsxXSA9PT0gJy0nID8gLTEgOiAxO1xuICAgIHJldHVybiBzaWduICogKHBhcnNlSW50KG1hdGNoWzJdLCAxMCkgKiA2MCArIChtYXRjaFszXSA/IHBhcnNlSW50KG1hdGNoWzNdLCAxMCkgOiAwKSk7XG59XG5leHBvcnQgZnVuY3Rpb24gY2l2aWxEYXlPZldlZWsoZGF0ZVN0cikge1xuICAgIHJldHVybiBuZXcgRGF0ZShgJHtkYXRlU3RyfVQxMjowMDowMFpgKS5nZXRVVENEYXkoKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzaGlmdFRyYWluaW5nQ2l2aWxEYXRlKGRhdGVTdHIsIGRheXMpIHtcbiAgICBpZiAoIS9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLy50ZXN0KGRhdGVTdHIpIHx8ICFOdW1iZXIuaXNJbnRlZ2VyKGRheXMpKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW52YWxpZCBjaXZpbCBkYXRlL2RheSBjb3VudCcpO1xuICAgIGNvbnN0IGFuY2hvciA9IG5ldyBEYXRlKGAke2RhdGVTdHJ9VDEyOjAwOjAwWmApO1xuICAgIGlmICghTnVtYmVyLmlzRmluaXRlKGFuY2hvci5nZXRUaW1lKCkpIHx8IGFuY2hvci50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKSAhPT0gZGF0ZVN0cilcbiAgICAgICAgdGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgY2l2aWwgZGF0ZScpO1xuICAgIGFuY2hvci5zZXRVVENEYXRlKGFuY2hvci5nZXRVVENEYXRlKCkgKyBkYXlzKTtcbiAgICByZXR1cm4gYW5jaG9yLnRvSVNPU3RyaW5nKCkuc2xpY2UoMCwgMTApO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGxhc3RUcmFpbmluZ0NpdmlsRGF5cyhuLCBpbnN0YW50KSB7XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKG4pIHx8IG4gPCAwKVxuICAgICAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW52YWxpZCBjaXZpbCBkYXkgY291bnQnKTtcbiAgICBjb25zdCB0b2RheSA9IHRyYWluaW5nQ2l2aWxEYXRlKGluc3RhbnQpLCBkYXlzID0gW107XG4gICAgZm9yIChsZXQgaSA9IG4gLSAxOyBpID49IDA7IGktLSlcbiAgICAgICAgZGF5cy5wdXNoKHNoaWZ0VHJhaW5pbmdDaXZpbERhdGUodG9kYXksIC1pKSk7XG4gICAgcmV0dXJuIGRheXM7XG59XG4vKiogSGlzdG9yaWNhbCBxdWVyeS93cml0ZSBjb21wYXRpYmlsaXR5LiBNYXkgYmUgd3Jvbmcgb24gYSAyMy8yNS1ob3VyIGRheS5cbiAqIERlbGliZXJhdGVseSBuYW1lZCwgbmV2ZXIgc2lsZW50bHkgc3Vic3RpdHV0ZWQgaW4gb3BlcmF0aW9ucyBvciBoYXNoZXMuICovXG5leHBvcnQgZnVuY3Rpb24gbGVnYWN5VHJhaW5pbmdEYXlCb3VuZHMoaW5zdGFudCkge1xuICAgIGNvbnN0IGRhdGVTdHIgPSB0cmFpbmluZ0NpdmlsRGF0ZShpbnN0YW50KSwgb2Zmc2V0TWluID0gdHJhaW5pbmdVdGNPZmZzZXRNaW51dGVzKGluc3RhbnQpO1xuICAgIGNvbnN0IHNpZ24gPSBvZmZzZXRNaW4gPD0gMCA/ICctJyA6ICcrJywgYWJzID0gTWF0aC5hYnMob2Zmc2V0TWluKTtcbiAgICBjb25zdCBvZmZzZXRTdHIgPSBgJHtzaWdufSR7U3RyaW5nKE1hdGguZmxvb3IoYWJzIC8gNjApKS5wYWRTdGFydCgyLCAnMCcpfToke1N0cmluZyhhYnMgJSA2MCkucGFkU3RhcnQoMiwgJzAnKX1gO1xuICAgIGNvbnN0IHN0YXJ0ID0gbmV3IERhdGUoYCR7ZGF0ZVN0cn1UMDA6MDA6MDAke29mZnNldFN0cn1gKTtcbiAgICByZXR1cm4geyBzdGFydCwgZW5kOiBuZXcgRGF0ZShzdGFydC5nZXRUaW1lKCkgKyA4NjQwMDAwMCksIGRhdGVTdHIgfTtcbn1cbmZ1bmN0aW9uIGNpdmlsTWlkbmlnaHQoZGF0ZVN0cikge1xuICAgIGNvbnN0IHV0YyA9IG5ldyBEYXRlKGAke2RhdGVTdHJ9VDAwOjAwOjAwWmApLmdldFRpbWUoKTtcbiAgICBsZXQgY2FuZGlkYXRlID0gdXRjO1xuICAgIC8vIENETVggdHJhbnNpdGlvbnMgb2NjdXJyZWQgYWZ0ZXIgbWlkbmlnaHQuIFJlc29sdmUgb2Zmc2V0IGF0IG1pZG5pZ2h0IGl0c2VsZixcbiAgICAvLyBpbmRlcGVuZGVudGx5IGZvciBib3RoIGRhdGVzOyBuZXZlciBhZGQgMjRoIHRvIGEgbG9jYWwgbWlkbmlnaHQuXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA0OyBpKyspIHtcbiAgICAgICAgY29uc3QgbmV4dCA9IHV0YyAtIHRyYWluaW5nVXRjT2Zmc2V0TWludXRlcyhuZXcgRGF0ZShjYW5kaWRhdGUpKSAqIDYwMDAwO1xuICAgICAgICBpZiAobmV4dCA9PT0gY2FuZGlkYXRlKVxuICAgICAgICAgICAgcmV0dXJuIG5ldyBEYXRlKG5leHQpO1xuICAgICAgICBjYW5kaWRhdGUgPSBuZXh0O1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUmFuZ2VFcnJvcignQ0RNWCBtaWRuaWdodCBkaWQgbm90IHJlc29sdmUnKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiB0cmFpbmluZ0NpdmlsRGF5Qm91bmRzKGluc3RhbnQpIHtcbiAgICBjb25zdCBkYXRlU3RyID0gdHJhaW5pbmdDaXZpbERhdGUoaW5zdGFudCk7XG4gICAgcmV0dXJuIHsgc3RhcnQ6IGNpdmlsTWlkbmlnaHQoZGF0ZVN0ciksIGVuZDogY2l2aWxNaWRuaWdodChzaGlmdFRyYWluaW5nQ2l2aWxEYXRlKGRhdGVTdHIsIDEpKSwgZGF0ZVN0ciB9O1xufVxuLyoqIE1vbmRheS4uU3VuZGF5IGJvdW5kcywgaW5jbHVkaW5nIFN1bmRheXMgYW5kIHllYXIvbW9udGggY3Jvc3NpbmdzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRyYWluaW5nQ2l2aWxXZWVrKGluc3RhbnQpIHtcbiAgICBjb25zdCBkYXRlU3RyID0gdHJhaW5pbmdDaXZpbERhdGUoaW5zdGFudCksIHdlZWtkYXkgPSBjaXZpbERheU9mV2VlayhkYXRlU3RyKTtcbiAgICBjb25zdCBzdGFydERheSA9IHNoaWZ0VHJhaW5pbmdDaXZpbERhdGUoZGF0ZVN0ciwgLSgod2Vla2RheSArIDYpICUgNykpO1xuICAgIHJldHVybiB7IHN0YXJ0RGF5LCBlbmREYXlFeGNsdXNpdmU6IHNoaWZ0VHJhaW5pbmdDaXZpbERhdGUoc3RhcnREYXksIDcpIH07XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1jYWxlbmRhci5qcy5tYXAiLCJmdW5jdGlvbiBhZGRUcmFpbmluZ0xvYWQodG90YWwsIHMsIHBvbGljeSkge1xuICAgIGNvbnN0IHBkZiA9IHBvbGljeSA9PT0gJ2xlZ2FjeS1wZGYtemVyby1mYWxsYmFjayc7XG4gICAgY29uc3QgdyA9IHBkZiA/IE51bWJlcihzLndlaWdodCkgfHwgMCA6IE51bWJlcihzLndlaWdodCB8fCAwKTtcbiAgICBjb25zdCByID0gcGRmID8gTnVtYmVyKHMucmVwcykgfHwgMCA6IE51bWJlcihzLnJlcHMgfHwgMCk7XG4gICAgdG90YWwgKz0gdyAqIHI7XG4gICAgaWYgKHBvbGljeSA9PT0gJ3JlY29yZGVkLXNpZGVzJykge1xuICAgICAgICB0b3RhbCArPSBOdW1iZXIocy53ZWlnaHRSaWdodCB8fCAwKSAqIE51bWJlcihzLnJlcHNSaWdodCB8fCAwKTtcbiAgICB9XG4gICAgZWxzZSBpZiAocG9saWN5ICE9PSAnbGVmdC1vbmx5JyAmJiAocy53ZWlnaHRSaWdodCAhPSBudWxsIHx8IHMucmVwc1JpZ2h0ICE9IG51bGwpKSB7XG4gICAgICAgIHRvdGFsICs9IHBkZiA/IChOdW1iZXIocy53ZWlnaHRSaWdodCkgfHwgdykgKiAoTnVtYmVyKHMucmVwc1JpZ2h0KSB8fCByKVxuICAgICAgICAgICAgOiBOdW1iZXIocy53ZWlnaHRSaWdodCA/PyBzLndlaWdodCA/PyAwKSAqIE51bWJlcihzLnJlcHNSaWdodCA/PyBzLnJlcHMgPz8gMCk7XG4gICAgfVxuICAgIHJldHVybiB0b3RhbDtcbn1cbmV4cG9ydCBmdW5jdGlvbiB0cmFpbmluZ0xvYWRWb2x1bWUoc2V0cywgcG9saWN5KSB7XG4gICAgbGV0IHRvdGFsID0gMDtcbiAgICBmb3IgKGNvbnN0IHMgb2Ygc2V0cylcbiAgICAgICAgdG90YWwgPSBhZGRUcmFpbmluZ0xvYWQodG90YWwsIHMsIHBvbGljeSk7XG4gICAgcmV0dXJuIHRvdGFsO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHRyYWluaW5nU2Vzc2lvbkxvYWRTdW1tYXJ5KHNlc3Npb25zKSB7XG4gICAgLy8gS2VlcCBzZXF1ZW50aWFsIGFkZGl0aW9uIGFjcm9zcyBzZXNzaW9ucyAoZG8gbm90IHN1bSBwZXItc2Vzc2lvbiBzdWJ0b3RhbHMpLlxuICAgIGxldCB0b3RhbCA9IDAsIHNldHMgPSAwO1xuICAgIGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucylcbiAgICAgICAgZm9yIChjb25zdCBzIG9mIHNlc3Npb24uc2V0cyB8fCBbXSkge1xuICAgICAgICAgICAgdG90YWwgPSBhZGRUcmFpbmluZ0xvYWQodG90YWwsIHMsICdpbmhlcml0LW1pc3NpbmctcmlnaHQnKTtcbiAgICAgICAgICAgIHNldHMrKztcbiAgICAgICAgfVxuICAgIHJldHVybiB7IHZvbHVtZTogdG90YWwsIHNldHMgfTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXZvbHVtZS5qcy5tYXAiLCJleHBvcnQgZnVuY3Rpb24gZ2V0QWN0aXZlVHJhaW5pbmdCbG9jayhibG9ja3MpIHtcbiAgICBjb25zdCBzdGFydGVkID0gKGJsb2NrcyB8fCBbXSkuZmlsdGVyKGIgPT4gYi5zdGFydGVkQXQgIT0gbnVsbCk7XG4gICAgaWYgKCFzdGFydGVkLmxlbmd0aClcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIHN0YXJ0ZWQucmVkdWNlKChsYXRlc3QsIGIpID0+IChiLnN0YXJ0ZWRBdCAmJiBsYXRlc3Quc3RhcnRlZEF0ICYmIGIuc3RhcnRlZEF0LmdldFRpbWUoKSA+IGxhdGVzdC5zdGFydGVkQXQuZ2V0VGltZSgpID8gYiA6IGxhdGVzdCksIHN0YXJ0ZWRbMF0pO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGVsYXBzZWRXZWVrSW5CbG9jayhibG9jaywgbm93KSB7XG4gICAgaWYgKCFibG9jaz8uc3RhcnRlZEF0KVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICBjb25zdCBkYXlzU2luY2UgPSBNYXRoLmZsb29yKChub3cuZ2V0VGltZSgpIC0gYmxvY2suc3RhcnRlZEF0LmdldFRpbWUoKSkgLyA4NjQwMDAwMCk7XG4gICAgcmV0dXJuIE1hdGguZmxvb3IoZGF5c1NpbmNlIC8gNykgKyAxO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHJvdXRpbmVQaGFzZVN0YXR1c0F0KHJvdXRpbmUsIG5vdykge1xuICAgIGNvbnN0IGFjdGl2ZUJsb2NrID0gZ2V0QWN0aXZlVHJhaW5pbmdCbG9jayhyb3V0aW5lLmJsb2NrcyB8fCBbXSk7XG4gICAgaWYgKGFjdGl2ZUJsb2NrKVxuICAgICAgICByZXR1cm4geyBpc0RlbG9hZDogYWN0aXZlQmxvY2sucGhhc2UgPT09ICdkZWxvYWQnLCBzb3VyY2U6ICdibG9jaycsIHBoYXNlOiBhY3RpdmVCbG9jay5waGFzZSwgYmxvY2s6IGFjdGl2ZUJsb2NrIH07XG4gICAgaWYgKHJvdXRpbmUuYWRhcHRpdmVEZWxvYWRVbnRpbCAmJiByb3V0aW5lLmFkYXB0aXZlRGVsb2FkVW50aWwuZ2V0VGltZSgpID4gbm93LmdldFRpbWUoKSkge1xuICAgICAgICByZXR1cm4geyBpc0RlbG9hZDogdHJ1ZSwgc291cmNlOiAnYWRhcHRpdmUnLCBwaGFzZTogJ2RlbG9hZCcsIHVudGlsOiByb3V0aW5lLmFkYXB0aXZlRGVsb2FkVW50aWwgfTtcbiAgICB9XG4gICAgcmV0dXJuIHsgaXNEZWxvYWQ6IGZhbHNlLCBzb3VyY2U6IG51bGwsIHBoYXNlOiBudWxsIH07XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1tZXNvY3ljbGVzLmpzLm1hcCIsImNvbnN0IFNUT1BXT1JEUyA9IG5ldyBTZXQoWydkZScsICdkZWwnLCAnbGEnLCAnZWwnLCAnbG9zJywgJ2xhcycsICdlbicsICdvJywgJ3UnLCAneScsICdhJywgJ2NvbicsICdhbCcsICdwYXJhJywgJ3VuYScsICd1biddKTtcbi8vIEdydXBvcyBtdXNjdWxhcmVzOiBjdWFuZG8gYXBhcmVjZW4gRU5UUkUgUEFSw4lOVEVTSVMgc29uIHVuYSBhY2xhcmFjacOzblxuLy8gcmVkdW5kYW50ZSAoXCJjdXJsIG1hcnRpbGxvIChiw61jZXBzKVwiKSB5IGRlYmVuIGlnbm9yYXJzZS4gRnVlcmEgZGUgcGFyw6ludGVzaXNcbi8vIHPDrSBwdWVkZW4gc2VyIHBhcnRlIGRlbCBub21icmUgKFwiY3VybCBmZW1vcmFsXCIpLCBhc8OtIHF1ZSBOTyBzZSB0b2NhbiBhaMOtLlxuY29uc3QgTVVTQ0xFX1dPUkRTID0gbmV3IFNldChbXG4gICAgJ2JpY2VwcycsICd0cmljZXBzJywgJ3BlY2hvJywgJ3BlY3RvcmFsJywgJ3BlY3RvcmFsZXMnLCAnZXNwYWxkYScsICdkb3JzYWwnLCAnZG9yc2FsZXMnLFxuICAgICdob21icm8nLCAnaG9tYnJvcycsICdkZWx0b2lkZXMnLCAncGllcm5hJywgJ3BpZXJuYXMnLCAnY3VhZHJpY2VwcycsICdjdWFkcmljZXAnLFxuICAgICdmZW1vcmFsJywgJ2ZlbW9yYWxlcycsICdnbHV0ZW8nLCAnZ2x1dGVvcycsICdnZW1lbG8nLCAnZ2VtZWxvcycsICdwYW50b3JyaWxsYScsICdwYW50b3JyaWxsYXMnLFxuICAgICdjb3JlJywgJ2FiZG9tZW4nLCAnYWJkb21pbmFsZXMnLCAnYWJzJywgJ3RyYXBlY2lvJywgJ3RyYXBlY2lvcycsICdhbnRlYnJhem8nLCAnYW50ZWJyYXpvcycsXG4gICAgJ2FkdWN0b3InLCAnYWR1Y3RvcmVzJywgJ2FiZHVjdG9yJywgJ2FiZHVjdG9yZXMnLFxuXSk7XG4vLyBRdWl0YSBsb3MgcGFyw6ludGVzaXMgY3V5byBjb250ZW5pZG8gZXMgc29sbyB1biBncnVwbyBtdXNjdWxhciAoYWNsYXJhY2nDs24pLlxuLy8gRWwgcmVzdG8gZGUgcGFyw6ludGVzaXMgKGVxdWlwYW1pZW50bywgdmFyaWFudGUpIHNlIGNvbnNlcnZhIHNpbiBsb3Mgc8OtbWJvbG9zLlxuZnVuY3Rpb24gc3RyaXBNdXNjbGVQYXJlbnRoZXRpY2FscyhzKSB7XG4gICAgcmV0dXJuIHMucmVwbGFjZSgvXFwoKFteKV0qKVxcKS9nLCAoXywgaW5uZXIpID0+IHtcbiAgICAgICAgY29uc3Qgd29yZHMgPSBpbm5lci50b0xvd2VyQ2FzZSgpLm5vcm1hbGl6ZSgnTkZEJykucmVwbGFjZSgvW8yALc2vXS9nLCAnJylcbiAgICAgICAgICAgIC5zcGxpdCgvW1xccywvXSsvKS5maWx0ZXIoQm9vbGVhbik7XG4gICAgICAgIGNvbnN0IGFsbE11c2NsZSA9IHdvcmRzLmxlbmd0aCA+IDAgJiYgd29yZHMuZXZlcnkodyA9PiBNVVNDTEVfV09SRFMuaGFzKHcpKTtcbiAgICAgICAgcmV0dXJuIGFsbE11c2NsZSA/ICcgJyA6IGAgJHtpbm5lcn0gYDtcbiAgICB9KTtcbn1cbi8vIFNpbsOzbmltb3MgLyBhYnJldmlhdHVyYXMgLyBwbHVyYWxlcyDihpIgZm9ybWEgY2Fuw7NuaWNhLiBDb25zZXJ2YWRvciBhIHByb3DDs3NpdG8uXG5jb25zdCBTWU5PTllNUyA9IHtcbiAgICBlbGV2OiAnZWxldmFjaW9uJywgZWxldmFjaW9uZXM6ICdlbGV2YWNpb24nLCBlbGV2YWNpb246ICdlbGV2YWNpb24nLFxuICAgIGxhdGVyYWw6ICdsYXRlcmFsJywgbGF0ZXJhbGVzOiAnbGF0ZXJhbCcsIGxhdDogJ2xhdGVyYWwnLFxuICAgIGV4dDogJ2V4dGVuc2lvbicsIGV4dGVuc2lvbjogJ2V4dGVuc2lvbicsIGV4dGVuc2lvbmVzOiAnZXh0ZW5zaW9uJyxcbiAgICBmbGV4OiAnZmxleGlvbicsIGZsZXhpb246ICdmbGV4aW9uJywgZmxleGlvbmVzOiAnZmxleGlvbicsXG4gICAgY3VybHM6ICdjdXJsJywgY3VybDogJ2N1cmwnLFxuICAgIGNydWNlOiAnY3J1Y2UnLCBjcnVjZXM6ICdjcnVjZScsXG4gICAgbWFxOiAnbWFxdWluYScsIG1hcXVpbmE6ICdtYXF1aW5hJyxcbiAgICBtYW5jdWVybmE6ICdtYW5jdWVybmEnLCBtYW5jdWVybmFzOiAnbWFuY3Vlcm5hJyxcbiAgICBwb3N0OiAncG9zdGVyaW9yJywgcG9zdGVyaW9yOiAncG9zdGVyaW9yJyxcbiAgICBhbnQ6ICdhbnRlcmlvcicsIGFudGVyaW9yOiAnYW50ZXJpb3InLFxuICAgIHVuaWxhdDogJ3VuaWxhdGVyYWwnLCB1bmlsYXRlcmFsOiAndW5pbGF0ZXJhbCcsXG4gICAgYmlsYXQ6ICdiaWxhdGVyYWwnLCBiaWxhdGVyYWw6ICdiaWxhdGVyYWwnLFxuICAgIHBpZXJuYTogJ3BpZXJuYScsIHBpZXJuYXM6ICdwaWVybmEnLFxuICAgIGludmVyc286ICdpbnZlcnNvJywgaW52ZXJzb3M6ICdpbnZlcnNvJyxcbiAgICBzZW50YWRvOiAnc2VudGFkbycsIHNlbnRhZGE6ICdzZW50YWRvJyxcbn07XG4vLyBOb3JtYWxpemFjacOzbiBsaWdlcmEgcGFyYSBtb3N0cmFyL2NvbXBhcmFyIGRlIGZvcm1hIGLDoXNpY2E6XG4vLyBtaW7DunNjdWxhcywgc2luIHRpbGRlcywgc2luIHByZWZpam8gZGUgb3JkZW4gKFwiQTEuXCIsIFwiMSlcIiksIHB1bnR1YWNpw7NuIOKGkiBlc3BhY2lvLlxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUV4ZXJjaXNlTmFtZShuYW1lKSB7XG4gICAgcmV0dXJuIHN0cmlwTXVzY2xlUGFyZW50aGV0aWNhbHMobmFtZSB8fCAnJylcbiAgICAgICAgLnRvTG93ZXJDYXNlKClcbiAgICAgICAgLm5vcm1hbGl6ZSgnTkZEJykucmVwbGFjZSgvW8yALc2vXS9nLCAnJykgLy8gcXVpdGEgdGlsZGVzXG4gICAgICAgIC5yZXBsYWNlKC9eW2Etel0/XFxkK1suKTpcXC1cXHNdKy9pLCAnJykgLy8gcHJlZmlqbyBkZSBvcmRlbjogXCJhMS5cIiwgXCIxKVwiLCBcIjMgLSBcIlxuICAgICAgICAucmVwbGFjZSgvWygpJ1wiwrRgLiw7L10vZywgJyAnKSAvLyBwdW50dWFjacOzbiDihpIgZXNwYWNpb1xuICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnICcpXG4gICAgICAgIC50cmltKCk7XG59XG4vLyBDbGF2ZSBjYW7Ds25pY2Egcm9idXN0YSBwYXJhIEFHUlVQQVIgdmFyaWFudGVzIGRlbCBtaXNtbyBlamVyY2ljaW8uXG4vLyBRdWl0YSByZWxsZW5vIHkgdW5pZmljYSBzaW7Ds25pbW9zL3BsdXJhbGVzLiBObyByZW9yZGVuYSB0b2tlbnMgcGFyYSBub1xuLy8gZnVzaW9uYXIgbW92aW1pZW50b3MgZGlzdGludG9zIHBvciBhY2NpZGVudGUuXG5leHBvcnQgZnVuY3Rpb24gY2Fub25pY2FsRXhlcmNpc2VLZXkobmFtZSkge1xuICAgIGNvbnN0IHRva2VucyA9IG5vcm1hbGl6ZUV4ZXJjaXNlTmFtZShuYW1lKVxuICAgICAgICAuc3BsaXQoJyAnKVxuICAgICAgICAuZmlsdGVyKHQgPT4gdCAmJiAhU1RPUFdPUkRTLmhhcyh0KSlcbiAgICAgICAgLm1hcCh0ID0+IFNZTk9OWU1TW3RdIHx8IHQpO1xuICAgIHJldHVybiB0b2tlbnMuam9pbignICcpO1xufVxuLy8gwr9Tb24gZWwgbWlzbW8gZWplcmNpY2lvIChwb3Igbm9tYnJlKT9cbmV4cG9ydCBmdW5jdGlvbiBpc1NhbWVFeGVyY2lzZShhLCBiKSB7XG4gICAgcmV0dXJuIGNhbm9uaWNhbEV4ZXJjaXNlS2V5KGEpID09PSBjYW5vbmljYWxFeGVyY2lzZUtleShiKTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWV4ZXJjaXNlSWRlbnRpdHkuanMubWFwIiwiaW1wb3J0IHsgY2Fub25pY2FsRXhlcmNpc2VLZXkgfSBmcm9tICcuL2V4ZXJjaXNlSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgY2FwcGVkRXBsZXkxUk0gYXMgZXBsZXkxUk0gfSBmcm9tICcuL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IHBlcnNvbmFsUmVjb3JkRXBsZXkxUk0gfSBmcm9tICcuL3BlcnNvbmFsUmVjb3Jkcy5qcyc7XG5pbXBvcnQgeyBlZmZlY3RpdmVXb3Jrb3V0U2V0IH0gZnJvbSAnLi9zbWFydExvYWRpbmcuanMnO1xuaW1wb3J0IHsgdHJhaW5pbmdDaXZpbERhdGUgfSBmcm9tICcuL2NhbGVuZGFyLmpzJztcbmZ1bmN0aW9uIGVmZmVjdGl2ZVNldChzZXQpIHtcbiAgICBjb25zdCB3ID0gcGFyc2VGbG9hdChgJHtzZXQud2VpZ2h0fWApO1xuICAgIGNvbnN0IHIgPSBwYXJzZUludChgJHtzZXQucmVwc31gKTtcbiAgICBpZiAoIXcgfHwgIXIpXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIGNvbnN0IGhhc1JpZ2h0ID0gc2V0LndlaWdodFJpZ2h0ICE9IG51bGwgfHwgc2V0LnJlcHNSaWdodCAhPSBudWxsO1xuICAgIGNvbnN0IHdlaWdodCA9IGhhc1JpZ2h0ID8gTWF0aC5taW4odywgcGFyc2VGbG9hdChgJHtzZXQud2VpZ2h0UmlnaHQgPz8gd31gKSkgOiB3O1xuICAgIGNvbnN0IHJlcHMgPSBoYXNSaWdodCA/IE1hdGgubWluKHIsIHBhcnNlSW50KGAke3NldC5yZXBzUmlnaHQgPz8gcn1gKSkgOiByO1xuICAgIHJldHVybiB7IHdlaWdodCwgcmVwcyB9O1xufVxuLy8gQWdydXBhIGVsIGhpc3RvcmlhbCBkZSB3b3Jrb3V0cyBwb3IgZWplcmNpY2lvIENBTsOTTklDTyAoY29uc29saWRhbmRvIHZhcmlhbnRlc1xuLy8gZGUgbm9tYnJlKS4gRGV2dWVsdmUgdW4gTWFwOiBjbGF2ZSBjYW7Ds25pY2EgLT4geyBuYW1lcywgbXVzY2xlR3JvdXAsIHNlc3Npb25zIH1cbi8vIGRvbmRlIHNlc3Npb25zID0gW3sgZGF0ZSwgYmVzdDFSTSwgd2VpZ2h0LCByZXBzIH1dIG9yZGVuYWRhcyBwb3IgZmVjaGEgKGFzYykuXG4vLyBVbmEgXCJzZXNpw7NuXCIgZXMgdW4gZMOtYSBsb2NhbCBkaXN0aW50byAobm8gc2UgcGFydGUgdW5hIHNlc2nDs24gbm9jdHVybmEgZW4gZG9zKS5cbmV4cG9ydCBmdW5jdGlvbiBncm91cFRyYWluaW5nSGlzdG9yeShoaXN0b3J5LCBkYXlLZXkpIHtcbiAgICBjb25zdCBwZW5kaW5nID0gbmV3IE1hcCgpO1xuICAgIChoaXN0b3J5IHx8IFtdKS5mb3JFYWNoKHdvcmtvdXQgPT4ge1xuICAgICAgICBjb25zdCByYXdOYW1lID0gd29ya291dC5leGVyY2lzZT8ubmFtZTtcbiAgICAgICAgaWYgKCFyYXdOYW1lKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICBjb25zdCBrZXkgPSBjYW5vbmljYWxFeGVyY2lzZUtleShyYXdOYW1lKTtcbiAgICAgICAgaWYgKCFrZXkpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGxldCBnID0gcGVuZGluZy5nZXQoa2V5KTtcbiAgICAgICAgaWYgKCFnKSB7XG4gICAgICAgICAgICBnID0geyBuYW1lczogbmV3IFNldCgpLCBtdXNjbGVHcm91cDogbnVsbCwgYnlEYXRlOiB7fSB9O1xuICAgICAgICAgICAgcGVuZGluZy5zZXQoa2V5LCBnKTtcbiAgICAgICAgfVxuICAgICAgICBnLm5hbWVzLmFkZChyYXdOYW1lKTtcbiAgICAgICAgaWYgKCFnLm11c2NsZUdyb3VwICYmIHdvcmtvdXQuZXhlcmNpc2U/Lm11c2NsZUdyb3VwKVxuICAgICAgICAgICAgZy5tdXNjbGVHcm91cCA9IHdvcmtvdXQuZXhlcmNpc2UubXVzY2xlR3JvdXA7XG4gICAgICAgIGNvbnN0IGRhdGVLZXkgPSBkYXlLZXkod29ya291dC5kYXRlKTtcbiAgICAgICAgKHdvcmtvdXQuc2V0cyB8fCBbXSkuZm9yRWFjaChzZXQgPT4ge1xuICAgICAgICAgICAgY29uc3QgZWZmID0gZWZmZWN0aXZlU2V0KHNldCk7XG4gICAgICAgICAgICBpZiAoIWVmZilcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAoZy5ieURhdGVbZGF0ZUtleV0gfHwgKGcuYnlEYXRlW2RhdGVLZXldID0gW10pKS5wdXNoKGVmZik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICAgIGNvbnN0IGdyb3VwcyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIGddIG9mIHBlbmRpbmcpIHtcbiAgICAgICAgY29uc3Qgc2Vzc2lvbnMgPSBPYmplY3Qua2V5cyhnLmJ5RGF0ZSkuc29ydCgpLm1hcChkYXRlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHNldHMgPSBnLmJ5RGF0ZVtkYXRlS2V5XTtcbiAgICAgICAgICAgIGxldCBiZXN0ID0geyB3ZWlnaHQ6IDAsIHJlcHM6IDAsIHJtOiAwIH07XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHMgb2Ygc2V0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJtID0gZXBsZXkxUk0ocy53ZWlnaHQsIHMucmVwcyk7XG4gICAgICAgICAgICAgICAgaWYgKHJtID4gYmVzdC5ybSlcbiAgICAgICAgICAgICAgICAgICAgYmVzdCA9IHsgd2VpZ2h0OiBzLndlaWdodCwgcmVwczogcy5yZXBzLCBybSB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgZGF0ZTogZGF0ZUtleSwgYmVzdDFSTTogYmVzdC5ybSwgd2VpZ2h0OiBiZXN0LndlaWdodCwgcmVwczogYmVzdC5yZXBzLCBzZXRzIH07XG4gICAgICAgIH0pO1xuICAgICAgICBncm91cHMuc2V0KGtleSwgeyBuYW1lczogZy5uYW1lcywgbXVzY2xlR3JvdXA6IGcubXVzY2xlR3JvdXAsIHNlc3Npb25zIH0pO1xuICAgIH1cbiAgICByZXR1cm4gZ3JvdXBzO1xufVxuLy8gMVJNIFwiYWN0dWFsXCIgcm9idXN0bzogZWwgbWVqb3IgZGUgbGFzIMO6bHRpbWFzIE4gc2VzaW9uZXMgKGV2aXRhIHF1ZSB1biBtYWwgZMOtYVxuLy8gaHVuZGEgZWwgcHVudG8gZGUgcGFydGlkYSBvIHF1ZSB1biBwaWNvIGFudGlndW8gbG8gaW5mbGUpLiDDmnNhbG8gcGFyYSB0ZW5kZW5jaWFzXG4vLyBnZW5lcmFsZXMgKHAuIGVqLiBsYSBwZW5kaWVudGUgZGUgcHJvZ3Jlc28pOyBwYXJhIGp1emdhciBzaSBzZSBDVU1QTEnDkyB1bmEgbWV0YVxuLy8gY29uY3JldGEgdXNhIGJlc3RPbmVSZXBNYXhGb3JUYXJnZXQsIHF1ZSBlcyBtw6FzIGNvbnNlcnZhZG9yLlxuZXhwb3J0IGZ1bmN0aW9uIGJlc3QxUk1SZWNlbnQoc2Vzc2lvbnMsIG4gPSAzKSB7XG4gICAgaWYgKCFzZXNzaW9ucyB8fCAhc2Vzc2lvbnMubGVuZ3RoKVxuICAgICAgICByZXR1cm4gMDtcbiAgICBjb25zdCByZWNlbnQgPSBzZXNzaW9ucy5zbGljZSgtbik7XG4gICAgcmV0dXJuIE1hdGgubWF4KDAsIC4uLnJlY2VudC5tYXAocyA9PiBzLmJlc3QxUk0gfHwgMCkpO1xufVxuLy8gMVJNIFwiY2VyY2FubyBhIGxhIG1ldGFcIjogZWwgbWVqb3IgRXBsZXkgZW50cmUgc2VyaWVzIGNvbiByZXBzIDw9IHRhcmdldFJlcHMgKyAxLFxuLy8gZGUgbGFzIMO6bHRpbWFzIE4gc2VzaW9uZXMgcXVlIFPDjSB0ZW5nYW4gdW5hIHNlcmllIGFzw60gZGUgY2VyY2FuYSBhbCBvYmpldGl2by5cbi8vXG4vLyBQb3IgcXXDqTogZWwgRXBsZXkgZGUgdW5hIHNlcmllIHN1Ym3DoXhpbWEgZGUgbXVjaGFzIHJlcHMgKHAuIGVqLiAxMDBrZyB4NykgcHVlZGVcbi8vIHN1cGVyYXIgZW4gdGVvcsOtYSBlbCBkZSB1biBpbnRlbnRvIHJlYWwgY2VyY2FubyBhbCBtw6F4aW1vIChwLiBlai4gMTE1a2cgeDEgcmVhbCxcbi8vIGEgUlBFIDEwKSBzb2xvIHBvcnF1ZSBsYSBmw7NybXVsYSBleHRyYXBvbGEgbXVjaG8gbcOhcyBsZWpvcy4gU2kgZXNhIHNlcmllIGRlIDdcbi8vIHJlcHMgb2N1cnJpw7MgZWwgbWlzbW8gZMOtYSBxdWUgdW4gaW50ZW50byByZWFsIGRlIDEgcmVwLCB0b21hciBcImVsIG1lam9yIEVwbGV5XG4vLyBkZWwgZMOtYVwiIHNlIHF1ZWRhIGNvbiBsYSBleHRyYXBvbGFjacOzbiBlbiB2ZXogZGVsIGRhdG8gcmVhbC4gTGltaXRhciBsYXMgc2VyaWVzXG4vLyBlbGVnaWJsZXMgYSBsYXMgY2VyY2FuYXMgZW4gcmVwcyBhbCBvYmpldGl2byBldml0YSBlc2UgZmFsc28gcG9zaXRpdm8geSBoYWNlIHF1ZVxuLy8gXCJjdW1wbGlkb1wiIHNvbG8gZGVwZW5kYSBkZSBlc2Z1ZXJ6b3MgZ2VudWluYW1lbnRlIGNlcmNhbm9zIGEgZXNhIGV4aWdlbmNpYS5cbi8vIFNlc2lvbmVzIHNpbiBuaW5ndW5hIHNlcmllIGVsZWdpYmxlIGVzZSBkw61hIG5vIGN1ZW50YW4gY29tbyBldmlkZW5jaWEgKG5pIGFcbi8vIGZhdm9yIG5pIGVuIGNvbnRyYSkgcGFyYSBlc3RhIG1ldGEuXG5leHBvcnQgZnVuY3Rpb24gYmVzdE9uZVJlcE1heEZvclRhcmdldChzZXNzaW9ucywgdGFyZ2V0UmVwcywgbiA9IDMpIHtcbiAgICBpZiAoIXNlc3Npb25zIHx8ICFzZXNzaW9ucy5sZW5ndGgpXG4gICAgICAgIHJldHVybiAwO1xuICAgIGNvbnN0IG1heEVsaWdpYmxlUmVwcyA9IChOdW1iZXIodGFyZ2V0UmVwcykgfHwgMSkgKyAxO1xuICAgIGNvbnN0IGVsaWdpYmxlID0gW107XG4gICAgZm9yIChjb25zdCBzIG9mIHNlc3Npb25zKSB7XG4gICAgICAgIGNvbnN0IGRheVNldHMgPSAocy5zZXRzICYmIHMuc2V0cy5sZW5ndGgpID8gcy5zZXRzIDogW3sgd2VpZ2h0OiBzLndlaWdodCwgcmVwczogcy5yZXBzIH1dO1xuICAgICAgICBjb25zdCBiZXN0RWxpZ2libGVSTSA9IE1hdGgubWF4KDAsIC4uLmRheVNldHMuZmlsdGVyKHggPT4gTnVtYmVyKHgucmVwcykgPD0gbWF4RWxpZ2libGVSZXBzKS5tYXAoeCA9PiBlcGxleTFSTSh4LndlaWdodCwgeC5yZXBzKSkpO1xuICAgICAgICBpZiAoYmVzdEVsaWdpYmxlUk0gPiAwKVxuICAgICAgICAgICAgZWxpZ2libGUucHVzaChiZXN0RWxpZ2libGVSTSk7XG4gICAgfVxuICAgIGNvbnN0IHJlY2VudCA9IGVsaWdpYmxlLnNsaWNlKC1uKTtcbiAgICByZXR1cm4gcmVjZW50Lmxlbmd0aCA/IE1hdGgubWF4KC4uLnJlY2VudCkgOiAwO1xufVxuLy8gUGxhdGVhdTogbGEgbWVqb3IgbWFyY2EgZGUgbGEgbWl0YWQgcmVjaWVudGUgZGUgbGEgdmVudGFuYSBubyBTVVBFUkEgYSBsYSBkZSBsYVxuLy8gbWl0YWQgYW50aWd1YSAodW4gZW1wYXRlIGN1ZW50YSBjb21vIGVzdGFuY2FtaWVudG8sIG5vIGNvbW8gcHJvZ3Jlc28pLiBWZW50YW5hID1cbi8vIMO6bHRpbWFzIG1pbih3aW5kb3dTaXplLCBjb3VudCkgc2VzaW9uZXM7IHNwbGl0IGZsb29yL2NlaWwgKDYtPjMrMywgNS0+MiszLCA0LT4yKzIpLlxuLy8gUmVxdWllcmUgPj1taW5TZXNzaW9ucyBzZXNpb25lcyB0b3RhbGVzIHBhcmEgdGVuZXIgc2XDsWFsIChzaSBubywgaXNQbGF0ZWF1ZWQ9ZmFsc2UpLlxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdFBsYXRlYXUoc2Vzc2lvbnMsIHsgbWluU2Vzc2lvbnMgPSA0LCB3aW5kb3dTaXplID0gNiB9ID0ge30pIHtcbiAgICBpZiAoIXNlc3Npb25zIHx8IHNlc3Npb25zLmxlbmd0aCA8IG1pblNlc3Npb25zKSB7XG4gICAgICAgIHJldHVybiB7IGlzUGxhdGVhdWVkOiBmYWxzZSwgc2Vzc2lvbnNDb25zaWRlcmVkOiBzZXNzaW9ucz8ubGVuZ3RoIHx8IDAsIG9sZGVyQmVzdDFSTTogMCwgcmVjZW50QmVzdDFSTTogMCB9O1xuICAgIH1cbiAgICBjb25zdCBzYW1wbGVXaW5kb3cgPSBzZXNzaW9ucy5zbGljZSgtTWF0aC5taW4od2luZG93U2l6ZSwgc2Vzc2lvbnMubGVuZ3RoKSk7XG4gICAgY29uc3Qgc3BsaXRBdCA9IE1hdGguZmxvb3Ioc2FtcGxlV2luZG93Lmxlbmd0aCAvIDIpO1xuICAgIGNvbnN0IG9sZGVySGFsZiA9IHNhbXBsZVdpbmRvdy5zbGljZSgwLCBzcGxpdEF0KTtcbiAgICBjb25zdCByZWNlbnRIYWxmID0gc2FtcGxlV2luZG93LnNsaWNlKHNwbGl0QXQpO1xuICAgIGNvbnN0IG9sZGVyQmVzdDFSTSA9IE1hdGgubWF4KDAsIC4uLm9sZGVySGFsZi5tYXAocyA9PiBzLmJlc3QxUk0gfHwgMCkpO1xuICAgIGNvbnN0IHJlY2VudEJlc3QxUk0gPSBNYXRoLm1heCgwLCAuLi5yZWNlbnRIYWxmLm1hcChzID0+IHMuYmVzdDFSTSB8fCAwKSk7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgaXNQbGF0ZWF1ZWQ6IHJlY2VudEJlc3QxUk0gPD0gb2xkZXJCZXN0MVJNLFxuICAgICAgICBzZXNzaW9uc0NvbnNpZGVyZWQ6IHNhbXBsZVdpbmRvdy5sZW5ndGgsXG4gICAgICAgIG9sZGVyQmVzdDFSTSxcbiAgICAgICAgcmVjZW50QmVzdDFSTVxuICAgIH07XG59XG4vKiogQ2FsbGVyIGNob29zZXMgSUQvbmFtZSBncm91cGluZyBhbmQgU1FMIHNhbXBsZVdpbmRvdy4gRW1wdHkgY2l2aWwgZGF5cyBhbmRcbiAqIGluY29tcGxldGUgc2V0cyBjb3VudCBieSBjb21wYXRpYmlsaXR5OyB0aGlzIGlzIG5vdCBhIGZhdGlndWUgZGlhZ25vc2lzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdFBsYXRlYXVGb3JFeGVyY2lzZSh3b3Jrb3V0TG9ncykge1xuICAgIGNvbnN0IGJ5RGF5ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgbG9nIG9mIHdvcmtvdXRMb2dzKSB7XG4gICAgICAgIGNvbnN0IGRheUtleSA9IHRyYWluaW5nQ2l2aWxEYXRlKGxvZy5kYXRlKTtcbiAgICAgICAgbGV0IGJlc3QgPSBieURheS5nZXQoZGF5S2V5KSB8fCAwO1xuICAgICAgICBmb3IgKGNvbnN0IHNldCBvZiBsb2cuc2V0cykge1xuICAgICAgICAgICAgY29uc3QgZWZmID0gZWZmZWN0aXZlV29ya291dFNldChzZXQpO1xuICAgICAgICAgICAgaWYgKGVmZi53ZWlnaHQgPD0gMCB8fCBlZmYucmVwcyA8PSAwKVxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgY29uc3Qgcm0gPSBwZXJzb25hbFJlY29yZEVwbGV5MVJNKGVmZi53ZWlnaHQsIGVmZi5yZXBzKTtcbiAgICAgICAgICAgIGlmIChybSA+IGJlc3QpXG4gICAgICAgICAgICAgICAgYmVzdCA9IHJtO1xuICAgICAgICB9XG4gICAgICAgIGJ5RGF5LnNldChkYXlLZXksIGJlc3QpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9ucyA9IFsuLi5ieURheS5rZXlzKCldLnNvcnQoKS5tYXAoZGF5ID0+ICh7IGJlc3QxUk06IGJ5RGF5LmdldChkYXkpIHx8IDAgfSkpO1xuICAgIHJldHVybiBkZXRlY3RQbGF0ZWF1KHNlc3Npb25zKS5pc1BsYXRlYXVlZDtcbn1cbmV4cG9ydCBmdW5jdGlvbiBsaW5lYXJSZWdyZXNzaW9uKGRhdGFQb2ludHMpIHtcbiAgICBpZiAoIWRhdGFQb2ludHMgfHwgZGF0YVBvaW50cy5sZW5ndGggPCAyKVxuICAgICAgICByZXR1cm4geyBzbG9wZTogMCwgcjI6IDAgfTtcbiAgICBjb25zdCBuID0gZGF0YVBvaW50cy5sZW5ndGg7XG4gICAgY29uc3Qgc3VtWCA9IGRhdGFQb2ludHMucmVkdWNlKChzdW0sIHApID0+IHN1bSArIHAueCwgMCk7XG4gICAgY29uc3Qgc3VtWSA9IGRhdGFQb2ludHMucmVkdWNlKChzdW0sIHApID0+IHN1bSArIHAueSwgMCk7XG4gICAgY29uc3Qgc3VtWFkgPSBkYXRhUG9pbnRzLnJlZHVjZSgoc3VtLCBwKSA9PiBzdW0gKyBwLnggKiBwLnksIDApO1xuICAgIGNvbnN0IHN1bVgyID0gZGF0YVBvaW50cy5yZWR1Y2UoKHN1bSwgcCkgPT4gc3VtICsgcC54ICogcC54LCAwKTtcbiAgICBjb25zdCBkZW5vbWluYXRvciA9IG4gKiBzdW1YMiAtIHN1bVggKiBzdW1YO1xuICAgIGlmIChkZW5vbWluYXRvciA9PT0gMClcbiAgICAgICAgcmV0dXJuIHsgc2xvcGU6IDAsIHIyOiAwIH07XG4gICAgY29uc3Qgc2xvcGUgPSAobiAqIHN1bVhZIC0gc3VtWCAqIHN1bVkpIC8gZGVub21pbmF0b3I7XG4gICAgY29uc3QgaW50ZXJjZXB0ID0gKHN1bVkgLSBzbG9wZSAqIHN1bVgpIC8gbjtcbiAgICBjb25zdCB5TWVhbiA9IHN1bVkgLyBuO1xuICAgIGNvbnN0IHNzVG90YWwgPSBkYXRhUG9pbnRzLnJlZHVjZSgoc3VtLCBwKSA9PiBzdW0gKyBNYXRoLnBvdyhwLnkgLSB5TWVhbiwgMiksIDApO1xuICAgIGNvbnN0IHNzUmVzaWR1YWwgPSBkYXRhUG9pbnRzLnJlZHVjZSgoc3VtLCBwKSA9PiBzdW0gKyBNYXRoLnBvdyhwLnkgLSAoc2xvcGUgKiBwLnggKyBpbnRlcmNlcHQpLCAyKSwgMCk7XG4gICAgY29uc3QgcjIgPSBzc1RvdGFsID4gMCA/IDEgLSAoc3NSZXNpZHVhbCAvIHNzVG90YWwpIDogMDtcbiAgICByZXR1cm4geyBzbG9wZSwgcjIgfTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXByb2dyZXNzLmpzLm1hcCJdLCJuYW1lcyI6WyJlcGxleTFSTSJdLCJtYXBwaW5ncyI6IkFBQU8sU0FBUyxlQUFlLEtBQUs7QUFDaEMsU0FBTyxFQUFFLE1BQU0sY0FBYyxPQUFPLEtBQUssSUFBSSxNQUFLO0FBQ3REO0FBQ08sU0FBUyxlQUFlLEtBQUs7QUFDaEMsU0FBTyxFQUFFLE1BQU0sZ0JBQWdCLE9BQU8sS0FBSyxJQUFJLE1BQUs7QUFDeEQ7QUFHTyxTQUFTLG1CQUFtQixLQUFLO0FBQ3BDLFNBQU8sT0FBTyxPQUFPLE9BQU8sZUFBZSxFQUFvQixPQUFPLElBQUcsQ0FBRSxFQUFFO0FBQ2pGO0FBQ08sU0FBUyxtQkFBbUIsS0FBSztBQUNwQyxTQUFPLE9BQU8sT0FBTyxPQUFPLGVBQWUsRUFBc0IsT0FBTyxJQUFHLENBQUUsRUFBRTtBQUNuRjtBQUdBLFNBQVMsY0FBYyxPQUFPO0FBQzFCLE1BQUksT0FBTyxVQUFVO0FB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
