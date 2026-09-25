export function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

/** UI labels for PG result / degree class. */
export const FAIL_RESULT_LABEL = 'FAIL';
export const FIRST_CLASS_LABEL = 'FIRST CLASS';
export const SECOND_CLASS_LABEL = 'SECOND CLASS';
export const PASS_CLASS_LABEL = 'PASS';

const PG_SEMESTER_KEYS = ['sem1', 'sem2', 'sem3', 'sem4'];

/** Final PG degree class from overall percentage (60+ first, 50–59 second, below 50 pass). */
export function resolveDegreeClassFromPercentage(percentage) {
  const pct = toNum(percentage);
  if (pct == null) return null;
  if (pct >= 60) return FIRST_CLASS_LABEL;
  if (pct >= 50) return SECOND_CLASS_LABEL;
  return PASS_CLASS_LABEL;
}

/** True when the letter grade is F (fail). */
export function isFailGrade(grade) {
  return String(grade ?? '').trim().toUpperCase() === 'F';
}

/** True when any item in the list has grade F (checks `gradeKey`, default `grade`). */
export function hasAnyFailGrade(items, gradeKey = 'grade') {
  if (!Array.isArray(items)) return false;
  return items.some((item) => isFailGrade(item?.[gradeKey]));
}

/** True when any subject in sem1–sem4 has grade F. */
export function hasAnyFailInPGSemesters(semesters = {}) {
  for (const key of PG_SEMESTER_KEYS) {
    if (hasAnyFailGrade(semesters[key]?.subjects, 'grade')) return true;
  }
  return false;
}

/** Final PG grade sheet RESULT: FAIL if any F, else degree class from overall %. */
export function resolveFinalPGResult({ percentage, semesters } = {}) {
  if (hasAnyFailInPGSemesters(semesters)) return FAIL_RESULT_LABEL;
  return resolveDegreeClassFromPercentage(percentage) ?? '—';
}

/** Format stored/computed result for UI (F → FAIL). */
export function formatResultLabel(result) {
  const s = result == null ? '' : String(result).trim();
  if (!s) return s;
  return s.toUpperCase() === 'F' ? FAIL_RESULT_LABEL : s;
}

/** Per-semester result: FAIL if any subject failed, otherwise stored classification. */
export function resolveSemesterClassification(classification, items, gradeKey = 'grade') {
  if (hasAnyFailGrade(items, gradeKey)) return FAIL_RESULT_LABEL;
  const stored = classification == null ? '' : String(classification).trim();
  return formatResultLabel(stored) || 'N/A';
}

export function normalizeDeptKey(v) {
  const s = v == null ? '' : String(v).toUpperCase();
  if (s.includes('CHEM')) return 'CHEMISTRY';
  if (s.includes('GEO')) return 'GEOLOGY';
  if (s.includes('MATH')) return 'MATH';
  if (s.includes('COMMERCE') || s === 'COMM' || (s.includes('COMM') && !s.includes('CHEM'))) {
    return 'COMMERCE';
  }
  if (s.includes('ODIA')) return 'ODIA';
  return '';
}

export function getTheoryFullMarksByDept(deptKey) {
  if (deptKey === 'CHEMISTRY') return { midFm: 20, endFm: 50, totalFm: 70 };
  // GEOLOGY, MATH, COMMERCE, ODIA (and default)
  return { midFm: 30, endFm: 70, totalFm: 100 };
}

/** Normalize "Paper 4.4" / PAPER4.4 → PAPER4.4 */
const normalizePaperCode = (value) => {
  const s = String(value ?? '').trim();
  const m = s.match(/^paper\s*(\d+)\.(\d+)$/i);
  if (m) return `PAPER${m[1]}.${m[2]}`;
  return s.replace(/\s/g, '').toUpperCase();
};

/** 4th-sem papers graded out of 100 total (single FM column, no 30+70 split). */
const SEM4_HUNDRED_MARK_PAPERS = {
  ODIA: new Set(['PAPER4.3', 'PAPER4.4']),
  GEOLOGY: new Set(['PAPER4.5']),
};

export const getCoursePaperCode = (course) =>
  normalizePaperCode(course?.paperCode ?? course?.courseType ?? '');

const normalizeChemPaperCode = (raw) => {
  const s = String(raw ?? '').trim().toUpperCase();
  const m = s.match(/^CH-?(\d{3})$/);
  if (m) return `CH-${m[1]}`;
  return normalizePaperCode(s);
};

/** Chemistry practical rows: full mark 50, no mid sem (sem1–sem4 paper codes). */
const CHEMISTRY_PRACTICAL_ONLY_BY_SEM = {
  0: new Set(['PAPER1.4', 'PAPER1.5']),
  1: new Set(['CH-411', 'CH-412']),
  2: new Set(['CH-503', 'CH-504']),
  3: new Set(['CH-512', 'CH-513']),
};

export const isChemistryPracticalOnlyPaper = (course, deptKey, semesterIndex) => {
  if (deptKey !== 'CHEMISTRY' || semesterIndex == null) return false;
  const allowed = CHEMISTRY_PRACTICAL_ONLY_BY_SEM[semesterIndex];
  if (!allowed) return false;

  const code = normalizeChemPaperCode(
    course?.paperCode ?? course?.courseType ?? course?.paper?.code ?? ''
  );
  if (allowed.has(code)) return true;

  const title = String(course?.paperName ?? course?.subjectName ?? course?.paper?.title ?? '')
    .toUpperCase()
    .trim();
  if (semesterIndex === 0 && (title.includes('PRACTICAL') || title === 'ICP-II' || title === 'OCP-II')) {
    return title.includes('INORGANIC CHEMISTRY PRACTICAL') || title.includes('ORGANIC CHEMISTRY PRACTICAL')
      || title === 'ICP-II' || title === 'OCP-II';
  }
  if (semesterIndex === 1 && title.includes('PRACTICAL')) {
    return title.includes('INORGANIC CHEMISTRY PRACTICAL') || title.includes('ORGANIC CHEMISTRY PRACTICAL');
  }
  return false;
};

/**
 * Chemistry practical row: score shown in END SEM (practicalMark or finalMark in DB).
 * Ignore midsemMark/practicalMark when they are 0 but finalMark/totalMark has the real score.
 */
export const getChemistryPracticalEndSemMs = (course) => {
  const practical = toNum(course?.practical ?? course?.practicalMark);
  const end = toNum(
    course?.endsem ?? course?.theory ?? course?.finalMark ?? course?.final
  );
  const total = toNum(course?.marks ?? course?.totalMark);

  if (practical != null && practical > 0) return practical;
  if (end != null && end > 0) return end;
  if (total != null && total > 0) return total;
  if (practical != null) return practical;
  if (end != null) return end;
  if (total != null) return total;
  return '';
};

/** Geology PAPER4.4: midsem + practical; END SEM column shows practical mark. */
export const isGeologySem4Paper44 = (course, deptKey, semesterIndex) => {
  if (deptKey !== 'GEOLOGY') return false;
  const code = getCoursePaperCode(course);
  if (code === 'PAPER4.4' || code === 'PRAC') return true;
  if (semesterIndex === 3) {
    const title = String(course?.paperName ?? course?.subjectName ?? '').toUpperCase();
    if (title === 'PRACTICAL') return true;
  }
  return false;
};

/** Commerce PAPER4.1 project: full mark 200; END SEM shows practical / final mark. */
export const isCommerceSem4ProjectPaper = (course, deptKey, semesterIndex) => {
  if (deptKey !== 'COMMERCE') return false;
  const code = getCoursePaperCode(course);
  if (code === 'PAPER4.1') return true;
  if (code === 'PROJ' || code === 'PROS') return true;
  if (semesterIndex === 3) {
    const title = String(course?.paperName ?? course?.subjectName ?? '').toUpperCase();
    if (title.includes('PROJECT')) return true;
  }
  return false;
};

export const getCommerceProjectEndSemMs = (course) => {
  const mid = toNum(course?.midsem ?? course?.internal);
  const end = toNum(course?.endsem ?? course?.theory);
  const practical = toNum(course?.practical);
  const total = toNum(course?.marks);
  if (practical != null) return practical;
  if (end != null) return end;
  if (mid != null && total != null) return total - mid;
  return '';
};

/** Practical / final mark shown under END SEM for Geology PAPER4.4. */
export const getGeologyPaper44EndSemMs = (course) => {
  const mid = toNum(course?.midsem ?? course?.internal);
  const end = toNum(course?.endsem ?? course?.theory);
  const practical = toNum(course?.practical);
  const total = toNum(course?.marks);
  if (practical != null) return practical;
  if (end != null) return end;
  if (mid != null && total != null) return total - mid;
  return '';
};

const isSem4HundredMarkPaper = (course, deptKey, semesterIndex) => {
  if (isGeologySem4Paper44(course, deptKey, semesterIndex)) return false;
  if (isCommerceSem4ProjectPaper(course, deptKey, semesterIndex)) return false;

  const allowed = SEM4_HUNDRED_MARK_PAPERS[deptKey];
  if (!allowed) return false;

  const code = getCoursePaperCode(course);
  if (allowed.has(code)) return true;

  const title = String(course?.paperName ?? course?.subjectName ?? '').toUpperCase();
  if (deptKey === 'ODIA') {
    return title.includes('DISSERTATION') || title.includes('SEMINAR');
  }
  if (deptKey === 'GEOLOGY') {
    return code === 'PROJ' || title.includes('PROJECT');
  }
  return false;
};

export function getPGRowMarks(course, deptKey, options = {}) {
  const semesterIndex = options.semesterIndex;
  const mid = toNum(course?.midsem ?? course?.internal);
  const end = toNum(course?.endsem ?? course?.theory);
  const practical = toNum(course?.practical);
  const total = toNum(course?.marks);

  /** Commerce PAPER4.1 project: full mark 200; no mid sem; practical in END SEM */
  if (isCommerceSem4ProjectPaper(course, deptKey, semesterIndex)) {
    const endSemMs = getCommerceProjectEndSemMs(course);
    return {
      midFm: '',
      midMs: '',
      endFm: 200,
      endMs: endSemMs === '' ? '' : endSemMs,
      totalFm: 200,
      totalMs: total ?? '',
    };
  }

  /** Geology PAPER4.4: midsem + practical in END SEM; full mark 30+70 = 100 */
  if (isGeologySem4Paper44(course, deptKey, semesterIndex)) {
    const fm = getTheoryFullMarksByDept(deptKey);
    const endSemMs = getGeologyPaper44EndSemMs(course);
    return {
      midFm: fm.midFm,
      midMs: mid ?? '',
      endFm: fm.endFm,
      endMs: endSemMs === '' ? '' : endSemMs,
      totalFm: fm.totalFm,
      totalMs: total ?? '',
    };
  }

  /** ODIA PAPER4.3/4.4; Geology PAPER4.5 (project): full mark 100 */
  if (isSem4HundredMarkPaper(course, deptKey, semesterIndex)) {
    return {
      midFm: '',
      midMs: mid ?? '',
      endFm: 100,
      endMs: end ?? practical ?? total ?? '',
      totalFm: 100,
      totalMs: total ?? practical ?? end ?? '',
    };
  }

  /** Chemistry practical papers (sem1 PAPER1.4/1.5, sem2 CH-411/412, etc.): FM 50, empty mid */
  if (isChemistryPracticalOnlyPaper(course, deptKey, semesterIndex)) {
    let endSemMs = getChemistryPracticalEndSemMs(course);
    if ((endSemMs === '' || endSemMs === 0) && total != null && total > 0) {
      endSemMs = total;
    }
    return {
      midFm: '',
      midMs: '',
      endFm: 50,
      endMs: endSemMs === '' ? '' : endSemMs,
      totalFm: 50,
      totalMs: total != null && total > 0 ? total : endSemMs === '' ? '' : endSemMs,
    };
  }

  const practicalMarks = practical !== null && practical > 0 ? practical : null;
  if (practicalMarks !== null) {
    return {
      midFm: '',
      midMs: '',
      endFm: 50,
      endMs: practicalMarks,
      totalFm: 50,
      totalMs: total ?? practicalMarks,
    };
  }

  const fm = getTheoryFullMarksByDept(deptKey);
  return {
    midFm: fm.midFm,
    midMs: mid != null && mid > 0 ? mid : '',
    endFm: fm.endFm,
    endMs: end ?? '',
    totalFm: fm.totalFm,
    totalMs: total ?? '',
  };
}

/** UG NEP theory papers are typically 20 mid + 80 end; VAC / no-internal papers are 100. */
export function getUGRowMarks(course) {
  const mid = toNum(course?.midsem ?? course?.internal);
  const end = toNum(course?.endsem ?? course?.theory);
  const tot = toNum(course?.marks);
  const type = String(course?.courseType || '').toLowerCase();
  const hundredOnly = type.includes('vac') || mid == null;

  if (hundredOnly) {
    const endMs = end ?? tot ?? '';
    return {
      midFm: '',
      midMs: '',
      endFm: 100,
      endMs: endMs,
      totalFm: 100,
      totalMs: tot ?? endMs,
    };
  }

  return {
    midFm: 20,
    midMs: mid,
    endFm: 80,
    endMs: end ?? '',
    totalFm: 100,
    totalMs: tot ?? '',
  };
}

export function formatSplitFullMark(marks) {
  if (marks.midFm === '' || marks.midFm == null) {
    return marks.endFm != null && marks.endFm !== '' ? String(marks.endFm) : '';
  }
  return `${marks.midFm}+${marks.endFm}`;
}

export function sumUGTotals(courses) {
  const totals = { midFm: 0, midMs: 0, endFm: 0, endMs: 0, totalFm: 0, totalMs: 0 };
  if (!Array.isArray(courses)) return totals;
  for (const c of courses) {
    const m = getUGRowMarks(c);
    totals.midFm += toNum(m.midFm) ?? 0;
    totals.midMs += toNum(m.midMs) ?? 0;
    totals.endFm += toNum(m.endFm) ?? 0;
    totals.endMs += toNum(m.endMs) ?? 0;
    totals.totalFm += toNum(m.totalFm) ?? 0;
    totals.totalMs += toNum(m.totalMs) ?? 0;
  }
  return totals;
}

export function sumPGTotals(courses, deptKey, options = {}) {
  const totals = { midFm: 0, midMs: 0, endFm: 0, endMs: 0, totalFm: 0, totalMs: 0 };
  if (!Array.isArray(courses)) return totals;

  for (const c of courses) {
    const m = getPGRowMarks(c, deptKey, options);
    totals.midFm += toNum(m.midFm) ?? 0;
    totals.midMs += toNum(m.midMs) ?? 0;
    totals.endFm += toNum(m.endFm) ?? 0;
    totals.endMs += toNum(m.endMs) ?? 0;
    totals.totalFm += toNum(m.totalFm) ?? 0;
    totals.totalMs += toNum(m.totalMs) ?? 0;
  }
  return totals;
}

