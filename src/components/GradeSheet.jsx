import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import CollegeNameHeading from './CollegeNameHeading';
import gradeSheetData from '../data/gradeSheetData.json';
import { fetchMarksheetsByRollNo } from '../services/marksheetService';
import './GradeSheet.css';
import { normalizeDeptKey, getPGRowMarks, sumPGTotals, toNum, resolveSemesterClassification } from '../utils/marksheetUtils';
import { buildPGCourseLine } from '../utils/finalGradeSheetMapper';

const SEMESTER_CHOICES = [
  { value: '1', label: '1st Semester', hint: 'Major CP-1 & CP-2' },
  { value: '2', label: '2nd Semester', hint: 'Major CP-3 & CP-4' },
  { value: '3', label: '3rd Semester', hint: 'Major CP-5, CP-6 & CP-7' },
];

const labelUgPaper = (courseType, selectedSem, majorCount) => {
  const normalizedType = String(courseType || '').toLowerCase();
  if (normalizedType.startsWith('major')) {
    if (selectedSem === '3') return `CORE-1 MAJOR-${majorCount + 4}`;
    if (selectedSem === '2') return `CORE-1 MAJOR-${majorCount + 2}`;
    return `CORE-1 MAJOR-${majorCount}`;
  }
  if (normalizedType.startsWith('minor')) {
    return selectedSem === '3' ? 'CORE-2 MINOR-3' : selectedSem === '2' ? 'CORE-2 MINOR-2' : 'CORE-2 MINOR-1';
  }
  if (
    normalizedType.includes('mdc') ||
    normalizedType.includes('multi disciplinary') ||
    normalizedType.includes('multidisciplinary')
  ) {
    return selectedSem === '3' ? 'MDC-3' : selectedSem === '2' ? 'MDC-2' : 'MDC-1';
  }
  if (normalizedType.includes('aec')) {
    return selectedSem === '3' ? 'AEC-3' : selectedSem === '2' ? 'AEC-2' : 'AEC-1';
  }
  if (normalizedType.includes('vac')) {
    return selectedSem === '3' ? 'VAC-2' : 'VAC-1';
  }
  if (normalizedType.includes('sec')) {
    return selectedSem === '2' ? 'SEC-I' : 'SEC';
  }
  return String(courseType || '').toUpperCase();
};

export default function GradeSheet({ user }) {
  const navigate = useNavigate();
  const [data, setData] = useState(gradeSheetData);
  const [marksheetData, setMarksheetData] = useState(null);
  const [selectedYear, setSelectedYear] = useState('2024');
  const [selectedSem, setSelectedSem] = useState('1');
  const [showGradeSheet, setShowGradeSheet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const gradeSheetRef = useRef(null);

  useEffect(() => {
    if (!showGradeSheet || !selectedYear || !selectedSem) {
      setLoading(false);
      return;
    }
    fetchStudentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedSem, selectedYear, showGradeSheet]);

  const isPGUser = String(user?.studentType || '').toUpperCase() === 'PG';

  const deptKeyForPgTable = useMemo(
    () => normalizeDeptKey(marksheetData?.department ?? data?.studentInfo?.course ?? ''),
    [marksheetData?.department, data?.studentInfo?.course]
  );

  const buildSecondSemMarksheetData = (secondSemRow) => {
    const isBBA =
      String(secondSemRow?.Department || '').toUpperCase().includes('BBA') ||
      secondSemRow?.['CC-201'] != null;

    const ugSubjects = [
      { key: 'Major-3', courseType: 'Major-3', subjectCode: 'MAJOR-3' },
      { key: 'Major-4', courseType: 'Major-4', subjectCode: 'MAJOR-4' },
      { key: 'MINOR-2(20)', courseType: 'Minor-2', subjectCode: 'MINOR-2' },
      { key: 'Multi Disciplinary-2', courseType: 'MDC-2', subjectCode: 'MDC-2' },
      { key: 'AEC-2', courseType: 'AEC-2', subjectCode: 'AEC-2' },
      { key: 'SEC-I', courseType: 'SEC-I', subjectCode: 'SEC-I' },
    ];

    const bbaKeys = [
      'CC-201',
      'CC-202',
      'CC-203',
      'AEC-201',
      'SEC-201',
      'MDC-201',
      'VAC-201-I.C',
    ];

    // BBA 2nd-sem JSON has no per-subject CreditPoint; credits follow curriculum (total 27, same scale as BBA 1st sem).
    const bbaSem2CreditsByCode = {
      'CC-201': 4,
      'CC-202': 4,
      'CC-203': 4,
      'AEC-201': 4,
      'SEC-201': 4,
      'MDC-201': 4,
      'VAC-201-I.C': 3,
    };

    let courses = [];

    if (isBBA) {
      courses = bbaKeys
        .map((key) => {
          const s = secondSemRow?.[key];
          if (!s || typeof s !== 'object') return null;
          const gradePoint = toNum(s['Grade Point']);
          const creditPointFromJson =
            toNum(s.CreditPoint) ?? toNum(s['Credit Point']) ?? toNum(s.creditPoint);
          const prescribed = bbaSem2CreditsByCode[key];
          let creditVal = null;
          let creditPointVal = null;

          if (creditPointFromJson !== null) {
            creditPointVal = creditPointFromJson;
            if (gradePoint === 0 && creditPointFromJson === 0) {
              creditVal = 0;
            } else if (gradePoint !== null && gradePoint !== 0) {
              creditVal = creditPointFromJson / gradePoint;
            } else if (prescribed != null) {
              creditVal = prescribed;
            }
          } else if (prescribed != null && gradePoint !== null) {
            creditVal = prescribed;
            creditPointVal = prescribed * gradePoint;
          }

          return {
            subjectCode: key,
            courseType: key,
            subjectName: s.Subject || '',
            credit: creditVal === null ? '' : Number(creditVal.toFixed(0)),
            grade: s.Grade || '',
            gradePoint: gradePoint ?? '',
            creditPoint: creditPointVal === null ? '' : Number(creditPointVal.toFixed(0)),
            internal: toNum(s['MidsemMark(10/20)'] ?? s.internal ?? s.midsem),
            theory: toNum(s.FinalMark ?? s.theory ?? s.endsem),
            marks: toNum(s.TotalMark ?? s.marks),
          };
        })
        .filter(Boolean);
    } else {
      courses = ugSubjects
        .map(({ key, courseType, subjectCode }) => {
          const s = secondSemRow?.[key];
          if (!s) return null;

          const gradePoint = toNum(s['Grade Point']);
          const creditPoint = toNum(s.CreditPoint);
          const derivedCredit =
            gradePoint === 0 && creditPoint === 0
              ? 0
              : gradePoint !== null && gradePoint !== 0 && creditPoint !== null
                ? creditPoint / gradePoint
                : null;

          return {
            subjectCode,
            courseType,
            subjectName: s.Subject || '',
            credit: derivedCredit === null ? '' : Number(derivedCredit.toFixed(0)),
            grade: s.Grade || '',
            gradePoint: gradePoint ?? '',
            creditPoint: creditPoint ?? '',
            internal: toNum(s['MidsemMark(10/20)'] ?? s.internal ?? s.midsem),
            theory: toNum(s.FinalMark ?? s.theory ?? s.endsem),
            marks: toNum(s.TotalMark ?? s.marks),
          };
        })
        .filter(Boolean);
    }

    const totalGradePoints = courses.reduce(
      (sum, c) => sum + (typeof c.gradePoint === 'number' ? c.gradePoint : 0),
      0
    );

    const sumRowCredits = courses.reduce(
      (sum, c) => sum + (typeof c.credit === 'number' ? c.credit : 0),
      0
    );
    const sumRowCreditPoints = courses.reduce(
      (sum, c) => sum + (typeof c.creditPoint === 'number' ? c.creditPoint : 0),
      0
    );

    let totalCreditsOut = toNum(secondSemRow?.TotalCredit);
    let totalCreditPointsOut = toNum(secondSemRow?.TotalCreditPoint);
    let sgpaOut = toNum(secondSemRow?.SGPA);

    if (isBBA) {
      if (totalCreditsOut === null && sumRowCredits > 0) totalCreditsOut = sumRowCredits;
      if (totalCreditPointsOut === null && sumRowCreditPoints > 0) {
        totalCreditPointsOut = sumRowCreditPoints;
      }
      if (
        sgpaOut === null &&
        totalCreditsOut != null &&
        totalCreditPointsOut != null &&
        totalCreditsOut > 0
      ) {
        sgpaOut = Number((totalCreditPointsOut / totalCreditsOut).toFixed(2));
      }
    }

    return {
      courses,
      totalCredits: totalCreditsOut ?? '',
      totalCreditPoints: totalCreditPointsOut ?? '',
      totalGradePoints: Number(totalGradePoints.toFixed(2)),
      sgpa: sgpaOut ?? '',
      publicationDate: data.publicationDate,
      classification: resolveSemesterClassification(secondSemRow?.Classification, courses),
    };
  };

  const buildPGSecondSemMarksheetData = (pgRow) => {
    const courses = Array.isArray(pgRow?.courses)
      ? pgRow.courses.map((c) => ({
          subjectCode: c.courseType || '',
          courseType: c.courseType || '',
          subjectName: c.subjectName || '',
          credit: c.credit ?? '',
          grade: c.grade ?? '',
          gradePoint: c.gradePoint ?? '',
          creditPoint: c.creditPoint ?? '',
          // keep raw marks for reference in table (if table shows)
          marks: c.marks ?? '',
          midsem: c.midsem ?? '',
          endsem: c.endsem ?? '',
          practical: c.practical ?? '',
        }))
      : [];

    const totalGradePoints = courses.reduce(
      (sum, c) => sum + (typeof c.gradePoint === 'number' ? c.gradePoint : 0),
      0
    );

    return {
      courses,
      totalCredits: pgRow?.totalCredits ?? '',
      totalCreditPoints: pgRow?.totalCreditPoints ?? '',
      totalGradePoints: Number(totalGradePoints.toFixed(2)),
      sgpa: pgRow?.sgpa ?? '',
      publicationDate: data.publicationDate,
      classification: resolveSemesterClassification(pgRow?.classification, courses),
    };
  };

  const formatCourseName = (v) => {
    const s = v == null ? '' : String(v).trim();
    if (!s) return '';
    // Prefer keeping acronyms as-is (e.g., ODIA), but normalize mixed-case words.
    if (/^[A-Z\s-]+$/.test(s)) return s;
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  };

  const detectMediumOfExam = (departmentOrCourse) => {
    const raw = departmentOrCourse == null ? '' : String(departmentOrCourse).trim();
    const u = raw.toUpperCase();
    if (!u) return 'ENGLISH';
    if (u.includes('ODIA')) return 'ODIA';
    if (u.includes('CHEM') || u.includes('GEO') || u.includes('MATH') || u.includes('COMMERCE')) {
      return 'ENGLISH';
    }
    return 'ENGLISH';
  };

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      setErrorMessage('');
      // Prevent showing previous semester's data if the new fetch fails
      setMarksheetData(null);
      const autonomousRollNo = user?.autonomousRollNo || user?.['Autonomous Roll No'];
      
      if (!autonomousRollNo) {
        console.log('No autonomous roll number found, using default data');
        setLoading(false);
        return;
      }

      if (selectedSem === '2') {
        const { secondSem2024: secondSemRow, pgSecondSem2024 } =
          await fetchMarksheetsByRollNo(autonomousRollNo);

        // PG 2nd sem (camelCase row from pg2ndsem2024)
        if (pgSecondSem2024) {
          setMarksheetData(buildPGSecondSemMarksheetData(pgSecondSem2024));

          const courseName = formatCourseName(pgSecondSem2024.department || pgSecondSem2024.course);
          const detectedLanguage = detectMediumOfExam(courseName || pgSecondSem2024.department || pgSecondSem2024.course);

          setData((prevData) => ({
            ...prevData,
            studentInfo: {
              ...prevData.studentInfo,
              name: pgSecondSem2024.applicantName || prevData.studentInfo.name,
              examRollNo: pgSecondSem2024.collegeRollNo || prevData.studentInfo.examRollNo,
              registrationNo:
                pgSecondSem2024.autonomousRollNo || prevData.studentInfo.registrationNo,
              mediumOfExam: detectedLanguage || prevData.studentInfo.mediumOfExam,
              course: courseName ? buildPGCourseLine(courseName, user?.course) : prevData.studentInfo.course,
              coreTwo: '',
            },
          }));

          return;
        }

        if (secondSemRow) {
          const apiStudentInfo = {
            name: secondSemRow['Name of the Students'],
            autonomousRollNo: secondSemRow['Autonomous Roll No'],
            rollNo: secondSemRow['Roll No'],
            department: secondSemRow.Department,
          };

          setMarksheetData(buildSecondSemMarksheetData(secondSemRow));

          const isBbaRow =
            String(secondSemRow?.Department || '').toUpperCase().includes('BBA') ||
            secondSemRow?.['CC-201'] != null;
          const majorSubject = isBbaRow
            ? secondSemRow?.['CC-201']?.Subject || ''
            : secondSemRow?.['Major-3']?.Subject || secondSemRow?.['Major-4']?.Subject || '';
          const minorSubject = isBbaRow
            ? secondSemRow?.['CC-202']?.Subject || ''
            : secondSemRow?.['MINOR-2(20)']?.Subject || '';
          const aecSubject = isBbaRow
            ? secondSemRow?.['AEC-201']?.Subject || ''
            : secondSemRow?.['AEC-2']?.Subject || '';
          const detectedLanguage =
            String(aecSubject).toLowerCase().includes('odia')
              ? 'ODIA'
              : detectMediumOfExam(apiStudentInfo.department);

          setData(prevData => ({
            ...prevData,
            studentInfo: {
              ...prevData.studentInfo,
              name: apiStudentInfo.name || prevData.studentInfo.name,
              examRollNo: apiStudentInfo.rollNo || prevData.studentInfo.examRollNo,
              registrationNo: apiStudentInfo.autonomousRollNo || prevData.studentInfo.registrationNo,
              mediumOfExam: detectedLanguage || prevData.studentInfo.mediumOfExam,
              course: isBbaRow
                ? 'BBA'
                : majorSubject
                  ? `CORE-1: ${String(majorSubject).toUpperCase()}`
                  : prevData.studentInfo.course,
              coreTwo: minorSubject ? `CORE-2: ${String(minorSubject).toUpperCase()}` : prevData.studentInfo.coreTwo,
            }
          }));
        }
        return;
      }

      const { marksheets, studentInfo: apiStudentInfo } = await fetchMarksheetsByRollNo(autonomousRollNo);
      const semMarksheet = (marksheets || []).find((m) => String(m.semester) === String(selectedSem));

      if (!semMarksheet) {
        setErrorMessage(`No grade sheet is available for semester ${selectedSem}.`);
        return;
      }

      if (apiStudentInfo) {
        let publicationDate = data.publicationDate;
        if (semMarksheet.createdAt) {
          const date = new Date(semMarksheet.createdAt);
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          publicationDate = `${day}/${month}/${year}`;
        }

        setMarksheetData({
          courses: semMarksheet.courses || [],
          totalCredits: semMarksheet.totalCredits || 0,
          totalCreditPoints: semMarksheet.totalCreditPoints || 0,
          totalGradePoints: Number(((semMarksheet.courses || []).reduce((sum, c) => sum + (typeof c?.gradePoint === 'number' ? c.gradePoint : 0), 0)).toFixed(2)),
          sgpa: semMarksheet.sgpa || 0,
          publicationDate,
          classification: resolveSemesterClassification(
            semMarksheet.classification,
            semMarksheet.courses || []
          )
        });

        const deptFromApi = formatCourseName(apiStudentInfo?.department);
        const looksPG = isPGUser;
        const looksBBA = String(apiStudentInfo?.department || user?.Department || user?.department || '')
          .toUpperCase()
          .includes('BBA');
        const language = looksPG ? detectMediumOfExam(deptFromApi || apiStudentInfo?.department) : 'ENGLISH';
        const courseInfo = looksPG
          ? deptFromApi
            ? buildPGCourseLine(deptFromApi, user?.course)
            : data.studentInfo.course
          : looksBBA
            ? 'BBA'
          : (() => {
              const majorCourse = (semMarksheet.courses || []).find((course) =>
                String(course.courseType || '').toLowerCase().startsWith('major')
              );
              return majorCourse?.subjectName
                ? `CORE-1: ${String(majorCourse.subjectName).toUpperCase()}`
                : data.studentInfo.course;
            })();

        let coreTwoInfo = data.studentInfo.coreTwo;
        if (!looksPG) {
          if (semMarksheet.courses && semMarksheet.courses.length > 0) {
            const minorCourse = semMarksheet.courses.find((course) =>
              course.courseType && course.courseType.toLowerCase().startsWith('minor')
            );
            coreTwoInfo = minorCourse?.subjectName ? `CORE-2: ${minorCourse.subjectName.toUpperCase()}` : '';
          }
        } else {
          coreTwoInfo = '';
        }

        setData((prevData) => ({
          ...prevData,
          studentInfo: {
            ...prevData.studentInfo,
            name: apiStudentInfo.name || prevData.studentInfo.name,
            examRollNo: apiStudentInfo.rollNo || prevData.studentInfo.examRollNo,
            registrationNo: apiStudentInfo.autonomousRollNo || prevData.studentInfo.registrationNo,
            mediumOfExam: language,
            course: courseInfo,
            coreTwo: coreTwoInfo
          }
        }));
      }
    } catch (err) {
      console.error('Error fetching student data:', err);
      setErrorMessage(err?.message || 'Failed to load gradesheet data');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = () => {
    if (gradeSheetRef.current) {
      setDownloading(true);

      const originalWidth = gradeSheetRef.current.style.width;
      const originalMaxWidth = gradeSheetRef.current.style.maxWidth;
      const originalPadding = gradeSheetRef.current.style.padding;
      const originalMargin = gradeSheetRef.current.style.margin;

      gradeSheetRef.current.style.width = '700px';
      gradeSheetRef.current.style.maxWidth = '700px';
      gradeSheetRef.current.style.padding = '15px';
      gradeSheetRef.current.style.margin = '0';
      gradeSheetRef.current.classList.add('pdf-compact');

      html2canvas(gradeSheetRef.current, {
        scale: 2,
        width: 700,
        height: undefined,
        useCORS: true,
        allowTaint: true,
      })
        .then((canvas) => {
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF('p', 'mm', 'a4');
          const imgWidth = 190;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const maxHeight = 270;

          if (imgHeight <= maxHeight) {
            const yOffset = (297 - imgHeight) / 2;
            pdf.addImage(imgData, 'PNG', 10, yOffset, imgWidth, imgHeight);
          } else {
            const scaleFactor = maxHeight / imgHeight;
            const scaledWidth = imgWidth * scaleFactor;
            const scaledHeight = maxHeight;
            const xOffset = (210 - scaledWidth) / 2;
            const yOffset = (297 - scaledHeight) / 2;
            pdf.addImage(imgData, 'PNG', xOffset, yOffset, scaledWidth, scaledHeight);
          }

          const filename = `grade_sheet_${data.studentInfo.name || 'student'}_${marksheetData?.publicationDate || 'result'}.pdf`.replace(/\s+/g, '_');
          pdf.save(filename);

          gradeSheetRef.current.style.width = originalWidth;
          gradeSheetRef.current.style.maxWidth = originalMaxWidth;
          gradeSheetRef.current.style.padding = originalPadding;
          gradeSheetRef.current.style.margin = originalMargin;
          gradeSheetRef.current.classList.remove('pdf-compact');
          setDownloading(false);
        })
        .catch((error) => {
          console.error('Error generating PDF:', error);
          alert('Failed to generate PDF. Please try again.');
          setDownloading(false);
        });
    }
  };

  if (!showGradeSheet) {
    return (
      <div className="gs-picker-page">
        <div className="gs-picker-shell">
          <header className="gs-picker-top">
            <button type="button" onClick={() => navigate('/dashboard')} className="gs-picker-back">
              ← Back to dashboard
            </button>
            <p className="gs-picker-kicker">Examination records</p>
            <h1>Grade sheet</h1>
            <p className="gs-picker-lead">
              Choose the admission batch and semester to open the official result.
            </p>
          </header>

          <section className="gs-picker-card">
            <div className="gs-picker-step">
              <span className="gs-picker-step-no">1</span>
              <div>
                <h2>Admission batch</h2>
                <p>Select the year you were admitted.</p>
              </div>
            </div>
            <div className="gs-choice-grid">
              <button
                type="button"
                className={`gs-choice${selectedYear === '2024' ? ' is-active' : ''}`}
                onClick={() => setSelectedYear('2024')}
              >
                <strong>2024</strong>
                <span>Admission batch</span>
              </button>
            </div>

            <div className="gs-picker-step">
              <span className="gs-picker-step-no">2</span>
              <div>
                <h2>Semester</h2>
                <p>Open the grade sheet for one examination.</p>
              </div>
            </div>
            <div className="gs-choice-grid gs-choice-grid--sem">
              {SEMESTER_CHOICES.map((sem) => (
                <button
                  key={sem.value}
                  type="button"
                  className={`gs-choice${selectedSem === sem.value ? ' is-active' : ''}`}
                  onClick={() => setSelectedSem(sem.value)}
                >
                  <strong>{sem.label}</strong>
                  <span>{sem.hint}</span>
                </button>
              ))}
            </div>

            <div className="gs-picker-actions">
              <button
                type="button"
                className="gs-picker-cta"
                disabled={!selectedYear || !selectedSem}
                onClick={() => setShowGradeSheet(true)}
              >
                View grade sheet
              </button>
              {!selectedYear ? (
                <span className="gs-picker-hint">Select an admission batch to continue.</span>
              ) : (
                <span className="gs-picker-hint">
                  {SEMESTER_CHOICES.find((s) => s.value === selectedSem)?.label} · Batch {selectedYear}
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    );
  }


  return (
    <div className="grade-sheet-container">
      <div className="grade-sheet-header">
        <button onClick={() => navigate('/dashboard')} className="btn-back">
          ← Back to Dashboard
        </button>
        <h1>Grade Sheet</h1>
        <select
          value={selectedSem}
          onChange={(e) => setSelectedSem(e.target.value)}
          disabled={loading || downloading}
          style={{ marginLeft: '12px', padding: '8px' }}
        >
          <option value="1">1st Sem</option>
          <option value="2">2nd Sem</option>
          <option value="3">3rd Sem</option>
        </select>
        <button
          onClick={generatePDF}
          className="download-pdf-btn"
          disabled={downloading || loading}
        >
          {downloading ? 'Generating PDF...' : 'Download PDF'}
        </button>
        <button
          onClick={() => {
            setShowGradeSheet(false);
            setErrorMessage('');
            setMarksheetData(null);
          }}
          className="btn-back"
          style={{ marginLeft: '12px' }}
          disabled={downloading}
        >
          Change Year/Sem
        </button>
      </div>

      {errorMessage ? (
        <div style={{ margin: '12px 0', padding: '10px 12px', border: '1px solid #f5c2c7', background: '#f8d7da', color: '#842029', borderRadius: '6px' }}>
          {errorMessage}
        </div>
      ) : null}

      <div className="grade-sheet-document" ref={gradeSheetRef}>
        <div className="document-header">
          <img src="/college.png" alt="College Logo" className="college-logo" />
          <div className="document-header-text">
            <CollegeNameHeading as="h1" className="exam-title" />
            <h2 className="document-type">{isPGUser ? 'MARK SHEET CUM GRADE SHEET' : 'GRADE SHEET'}</h2>
            <p className="document-subtitle">
              {selectedSem === '3'
                ? `THIRD-SEMESTER EXAMINATION(ADMISSION-BATCH${selectedYear})`
                : selectedSem === '2'
                  ? `SECOND-SEMESTER EXAMINATION(ADMISSION-BATCH${selectedYear})`
                  : `FIRST-SEMESTER(ADMISSION-BATCH${selectedYear})`}
            </p>
            <p className="document-subtitle examination-year">EXAMINATION YEAR 2026</p>
          </div>
          <div className="document-header-spacer" aria-hidden="true"></div>
        </div>

        <div className="student-info-block">
          <div className="info-left-column">
            <div className="info-row">
              <span className="label">Name</span>
              <span className="colon">:</span>
              <span className="value">{data.studentInfo.name}</span>
            </div>
            <div className="info-row">
              <span className="label">Course</span>
              <span className="colon">:</span>
              <span className="value">{data.studentInfo.course}</span>
            </div>
            <div className="info-row">
              <span className="label"></span>
              <span className="colon"></span>
              <span className="value">{data.studentInfo.coreTwo}</span>
            </div>
            <div className="info-row">
              <span className="label">College</span>
              <span className="colon">:</span>
              <span className="value">{data.studentInfo.college}</span>
            </div>
          </div>

          <div className="info-right-column">
            <div className="info-row">
              <span className="label">Exam Roll No.</span>
              <span className="colon">:</span>
              <span className="value">{data.studentInfo.registrationNo}</span>
            </div>
            <div className="info-row">
              <span className="label">College Roll No.</span>
              <span className="colon">:</span>
              <span className="value">{data.studentInfo.examRollNo}</span>
            </div>
            <div className="info-row">
              <span className="label">Medium of Exam</span>
              <span className="colon">:</span>
              <span className="value">{data.studentInfo.mediumOfExam}</span>
            </div>
          </div>
        </div>

        <div className="grade-table-container">
          {(() => {
            const isPGLayout = isPGUser;
            const tableClass = `grade-table${isPGLayout ? ' pg-marksheet-table' : ''}`;
            return (
              <table className={tableClass}>
                <thead>
                  {isPGLayout ? (
                    <>
                      <tr>
                        <th rowSpan={2}>SUBJECT</th>
                        <th rowSpan={2}>COURSE</th>
                        <th colSpan={2}>MID SEM</th>
                        <th colSpan={2}>END SEM</th>
                        <th colSpan={2}>TOTAL</th>
                        <th rowSpan={2}>CREDIT</th>
                        <th rowSpan={2}>GRADE</th>
                        <th rowSpan={2}>GP</th>
                        <th rowSpan={2}>CP</th>
                      </tr>
                      <tr>
                        <th>FM</th>
                        <th>MS</th>
                        <th>FM</th>
                        <th>MS</th>
                        <th>FM</th>
                        <th>MS</th>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <th>SUBJECT</th>
                      <th>COURSE</th>
                      <th>CREDIT</th>
                      <th>GRADE</th>
                      <th>GRADE POINT</th>
                      <th>CREDIT POINT</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {marksheetData ? (
                    <>
                      {(() => {
                        let majorCount = 0;
                        return marksheetData.courses.map((course, index) => {
                          const courseType = course.courseType || '';
                          if (String(courseType).toLowerCase().startsWith('major')) {
                            majorCount += 1;
                          }
                          const displayCourseType = isPGUser
                            ? String(courseType).toUpperCase()
                            : labelUgPaper(courseType, selectedSem, majorCount);

                          return (
                            <tr key={index}>
                              <td>{course.subjectName}</td>
                              <td>{displayCourseType}</td>
                              {isPGLayout ? (
                                <>
                                  {(() => {
                                    const semIndex = Math.max(0, Number(selectedSem) - 1);
                                    const m = getPGRowMarks(course, deptKeyForPgTable, { semesterIndex: semIndex });
                                    return (
                                      <>
                                        <td>{m.midFm}</td>
                                        <td>{m.midMs}</td>
                                        <td>{m.endFm}</td>
                                        <td>{m.endMs}</td>
                                        <td>{m.totalFm}</td>
                                        <td><strong>{m.totalMs}</strong></td>
                                      </>
                                    );
                                  })()}
                                  <td>{course.credit}</td>
                                  <td>{course.grade}</td>
                                  <td>{course.gradePoint}</td>
                                  <td>{course.creditPoint}</td>
                                </>
                              ) : (
                                <>
                                  <td>{course.credit}</td>
                                  <td>{course.grade}</td>
                                  <td>{course.gradePoint}</td>
                                  <td>{course.creditPoint}</td>
                                </>
                              )}
                            </tr>
                          );
                        });
                      })()}
                      <tr className="total-row">
                        <td colSpan={2} className="total-label">TOTAL</td>
                        {isPGLayout ? (
                          <>
                            {(() => {
                              const semIndex = Math.max(0, Number(selectedSem) - 1);
                              const t = sumPGTotals(marksheetData?.courses || [], deptKeyForPgTable, {
                                semesterIndex: semIndex,
                              });
                              return (
                                <>
                                  <td><strong>{t.midFm}</strong></td>
                                  <td><strong>{t.midMs}</strong></td>
                                  <td><strong>{t.endFm}</strong></td>
                                  <td><strong>{t.endMs}</strong></td>
                                  <td><strong>{t.totalFm}</strong></td>
                                  <td><strong>{t.totalMs}</strong></td>
                                </>
                              );
                            })()}
                            <td>{marksheetData.totalCredits}</td>
                            <td></td>
                            <td>{marksheetData.totalGradePoints ?? ''}</td>
                            <td>{marksheetData.totalCreditPoints}</td>
                          </>
                        ) : (
                          <>
                            <td>{marksheetData.totalCredits}</td>
                            <td></td>
                            <td>{marksheetData.totalGradePoints ?? ''}</td>
                            <td>{marksheetData.totalCreditPoints}</td>
                          </>
                        )}
                      </tr>
                    </>
                  ) : (
                    <>
                      {data.gradeDetails.map((subject, index) => (
                        <tr key={index}>
                          <td>{subject.courseTitle || subject.course}</td>
                          <td>{subject.course}</td>
                          <td>{subject.credit}</td>
                          <td>{subject.grade}</td>
                          <td>{subject.gradePoint}</td>
                          <td>{subject.creditPoint}</td>
                        </tr>
                      ))}
                      <tr className="total-row">
                        <td colSpan={2} className="total-label">TOTAL</td>
                        <td>{data.totals.totalCredits}</td>
                        <td></td>
                        <td></td>
                        <td>{data.totals.totalCreditPoints}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            );
          })()}
        </div>

        <div className="result-sgpa-section">
          <div className="result-left">
            <span className="label">Result</span>
            <span className="colon">:</span>
            <span className="value result-value">{marksheetData ? marksheetData.classification : data.result}</span>
          </div>
          <div className="sgpa-right">
            <span className="label">SGPA</span>
            <span className="colon">:</span>
            <span className="value sgpa-value">{marksheetData ? marksheetData.sgpa : data.sgpa}</span>
          </div>
        </div>

        <div className="grading-system-container">
          <table className="grading-system-table">
            <thead>
              <tr>
                <th colSpan="3" className="grading-system-title">GRADING SYSTEM</th>
              </tr>
              <tr>
                <th>Grade</th>
                <th>Marks Secured from 100</th>
                <th>Grade Points</th>
              </tr>
            </thead>
            <tbody>
              {data.gradingSystem.map((grade, index) => (
                <tr key={index}>
                  <td>{grade.grade}</td>
                  <td>{grade.marksRange}</td>
                  <td>{grade.gradePoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grade-sheet-footer">
          <div className="controller-signature">
            <img src="/EXAMINER.jpg" alt="Controller of Examinations Signature" className="signature-image" />
            <div className="signature-label">CONTROLLER OF EXAMINATIONS</div>
          </div>
          <div className="principal-signature">
            <img src="/PRINCIPAL.jpg" alt="Principal Signature" className="signature-image" />
            <div className="signature-label">Principal Signature</div>
          </div>
        </div>

        <div className="disclaimer">
          {data.disclaimer}
        </div>
      </div>
    </div>
  );
}
