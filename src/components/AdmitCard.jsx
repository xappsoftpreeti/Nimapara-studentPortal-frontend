import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import axios from 'axios';
import config from '../config';
import './AdmitCard.css';
import CollegeNameHeading from './CollegeNameHeading';

const AdmitCard = ({ user }) => {
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [profileImage, setProfileImage] = useState(null);
  const admitCardRef = useRef(null);
  
  // ABC ID and Photo Upload states
  const [abcId, setAbcId] = useState('');
  const [isSubmittingAbc, setIsSubmittingAbc] = useState(false);
  const [abcMessage, setAbcMessage] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState('');
  const [availableSemesters, setAvailableSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [semesterLoading, setSemesterLoading] = useState(false);
  const fileInputRef = useRef(null);
  // showAbcForm removed â€” ABC ID form is always visible when ABC ID is missing

  const fetchStudentData = async (semesterKey = selectedSemester) => {
    setLoading(!studentData);
    setSemesterLoading(!!studentData);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        autonomousRollNo: user.autonomousRollNo,
      });

      if (semesterKey) {
        params.append('semester', semesterKey);
      }
      if (user?.studentType) {
        params.append('studentType', user.studentType);
      }

      const response = await axios.get(
        `${config.API_BASE_URL}${config.API_ENDPOINTS.ADMIT_CARD}?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log('Admit card API response:', response.data);

      if (response.data && response.data.autonomousRollNo) {
        setStudentData(response.data);
        setAvailableSemesters(response.data.availableSemesters || []);
        setSelectedSemester(response.data.semesterKey || semesterKey || '');
        if (response.data.profileImage) {
          setProfileImage(response.data.profileImage);
        }
      } else {
        setError('Failed to fetch student data');
      }
    } catch (err) {
      console.error('Error fetching student data:', err);
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('Failed to fetch student data. Please try again.');
      }
    } finally {
      setLoading(false);
      setSemesterLoading(false);
    }
  };

  const handleSemesterChange = async (event) => {
    const nextSemester = event.target.value;
    setSelectedSemester(nextSemester);
    await fetchStudentData(nextSemester);
  };
  
  useEffect(() => {
    fetchStudentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generatePDF = async () => {
    if (admitCardRef.current) {
      // Temporarily hide photo info/hints (not needed in PDF)
      const photoInfo = admitCardRef.current.querySelectorAll('.photo-info, .photo-upload-hint');
      const originalDisplayValues = [];
      
      photoInfo.forEach((info, index) => {
        originalDisplayValues[index] = info.style.display;
        info.style.display = 'none';
      });

      // Set compact dimensions for single-page PDF generation
      const originalWidth = admitCardRef.current.style.width;
      const originalMaxWidth = admitCardRef.current.style.maxWidth;
      const originalPadding = admitCardRef.current.style.padding;
      const originalMargin = admitCardRef.current.style.margin;
      
      // Force compact dimensions for single-page PDF
      admitCardRef.current.style.width = '700px';
      admitCardRef.current.style.maxWidth = '700px';
      admitCardRef.current.style.padding = '10px';
      admitCardRef.current.style.margin = '0';

      // Add compact PDF class
      admitCardRef.current.classList.add('pdf-compact');
      
      // Force layout recalculation to ensure proper positioning
      admitCardRef.current.offsetHeight; // Trigger reflow
      
      // Wait a bit for layout to stabilize
      await new Promise(resolve => setTimeout(resolve, 100));

      html2canvas(admitCardRef.current, { 
        scale: 2,
        width: 700,
        height: undefined,
        useCORS: true,
        allowTaint: true
      }).then((canvas) => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");
        
        // Calculate dimensions for single page
        const imgWidth = 190; // A4 width in mm (with margins)
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Check if content fits on one page
        const maxHeight = 270; // A4 height in mm (with margins)
        
        if (imgHeight <= maxHeight) {
          // Single page - center the content
          const yOffset = (297 - imgHeight) / 2; // Center vertically
          pdf.addImage(imgData, "PNG", 10, yOffset, imgWidth, imgHeight);
        } else {
          // If still too large, scale down to fit on one page
          const scaleFactor = maxHeight / imgHeight;
          const scaledWidth = imgWidth * scaleFactor;
          const scaledHeight = maxHeight;
          const xOffset = (210 - scaledWidth) / 2; // Center horizontally
          const yOffset = (297 - scaledHeight) / 2; // Center vertically
          
          pdf.addImage(imgData, "PNG", xOffset, yOffset, scaledWidth, scaledHeight);
        }
        
        pdf.save(`admit_card_${studentData.autonomousRollNo}.pdf`);
        
        // Restore original styles
        admitCardRef.current.style.width = originalWidth;
        admitCardRef.current.style.maxWidth = originalMaxWidth;
        admitCardRef.current.style.padding = originalPadding;
        admitCardRef.current.style.margin = originalMargin;
        
        // Remove compact PDF class
        admitCardRef.current.classList.remove('pdf-compact');
        
        // Restore photo info/hints
        photoInfo.forEach((info, index) => {
          info.style.display = originalDisplayValues[index] || '';
        });
      });
    }
  };


  /**
   * Extracts the 2-digit batch code from a roll number.
   * UG:  NACBCA25015 â†’ '25', 03NAC25001 â†’ '25', 03NAC24001 â†’ '24'
   * PG:  111NAC..., 153NAC..., 155NAC..., 156NAC..., 181NAC..., NACMFC... â†’ 'pg'
   */
  const extractBatchCodeFromRollNo = (rollNo) => {
    const roll = String(rollNo || '').trim().toUpperCase();
    // PG: specific 3-digit institute codes before NAC
    if (
      roll.includes('111NAC') || roll.includes('153NAC') || roll.includes('155NAC') ||
      roll.includes('156NAC') || roll.includes('181NAC') || roll.startsWith('NACMFC')
    ) return 'pg';
    // UG: NAC + course letters + 2-digit batch
    const ugNacFirst = roll.match(/^NAC[A-Z]+(\d{2})/);
    if (ugNacFirst) return ugNacFirst[1];
    // UG: 2-digit college code + NAC + 2-digit batch
    const ugCollegeFirst = roll.match(/^\d{2}NAC(\d{2})/);
    if (ugCollegeFirst) return ugCollegeFirst[1];
    // Standalone BBA
    const bbaMatch = roll.match(/^BBA-(\d{2})-/);
    if (bbaMatch) return bbaMatch[1];
    return null;
  };

  const getBatchYear = () => {
    if (studentData?.batch) return String(studentData.batch).trim();
    const code = extractBatchCodeFromRollNo(studentData?.autonomousRollNo);
    if (code && code !== 'pg') return `20${code}`;
    return '2024';
  };

  const getStudentType = () => {
    if (studentData?.autonomousRollNo?.includes('BBA')) return 'BBA';
    const code = extractBatchCodeFromRollNo(studentData?.autonomousRollNo);
    if (code === 'pg') return 'PG';
    // Both 2024 and 2025 batch UG students
    if (code === '24' || code === '25') return 'UG';
    return 'STUDENT';
  };

  const getStream = () => {
    if (getBatchYear() === '2025' && studentData?.Stream) {
      return studentData.Stream;
    }

    if (!studentData?.Department) return '';

    const department = studentData.Department.trim();
    const deptLower = department.toLowerCase();

    const artsDepartments = ['economics', 'education', 'english', 'history', 'odia', 'political science', 'psychology', 'sanskrit'];
    if (artsDepartments.includes(deptLower)) return 'ARTS';

    const scienceDepartments = ['botany', 'chemistry', 'geology', 'mathematics', 'physics', 'zoology'];
    if (scienceDepartments.includes(deptLower)) return 'SCIENCE';

    return department;
  };

  // Unused function - commented out to avoid linter errors
  // const getSubjects = () => {
  //   if (!studentData) return {};
  //   
  //   // Extract subjects based on student type
  //   const subjects = {};
  //   
  //   if (studentData.Department === 'BBA') {
  //     subjects['Major CP-1'] = studentData['CC-201'] || '';
  //     subjects['Major CP-2'] = studentData['CC-202'] || '';
  //     subjects['Minor P-1'] = studentData['CC-203'] || '';
  //     subjects['MDC-1'] = studentData['Multi Disciplinary-201'] || '';
  //     subjects['AEC'] = studentData['AEC-201'] || '';
  //     subjects['VAC-1'] = studentData['VAC-201-I.C'] || '';
  //   } else if (studentData.Department && studentData.Department !== 'BBA') {
  //     subjects['Major CP-1'] = studentData['Major-3'] || '';
  //     subjects['Major CP-2'] = studentData['Major-4'] || '';
  //     subjects['Minor P-1'] = studentData['MINOR-2'] || '';
  //     subjects['MDC-1'] = studentData['Multi Disciplinary-2'] || '';
  //     subjects['AEC'] = studentData['AEC-2'] || '';
  //     subjects['VAC-1'] = studentData['SEC-I'] || '';
  //   }
  //   
  //   return subjects;
  // };

  const getMajorSubject = () => {
    // Hide major subject for PG students (no department)
    if (!studentData?.Department) return '';
    
    // For BBA and UG students, show the Department
    return studentData.Department || '';
  };

  const isPGStudent = () => {
    // Check if it's a PG student by studentType
    if (
      studentData?.studentType === 'PG2025' ||
      studentData?.studentType === 'PG' ||
      studentData?.studentType === 'PG2ND2025'
    ) {
      return true;
    }
    // Check roll number patterns for PG students
    return studentData?.autonomousRollNo?.includes('111NAC') || 
           studentData?.autonomousRollNo?.includes('153NAC') ||
           studentData?.autonomousRollNo?.includes('155NAC') ||
           studentData?.autonomousRollNo?.includes('156NAC') ||
           studentData?.autonomousRollNo?.includes('181NAC') ||
           studentData?.autonomousRollNo?.includes('NACMFC');
  };

  // Load profile image from localStorage and refresh ABC_ID from database
  useEffect(() => {
    // Load profile image from localStorage first
    const storageKey = `profileImage_${user?.autonomousRollNo}`;
    const savedImage = localStorage.getItem(storageKey);
    if (savedImage) {
      setProfileImage(savedImage);
    } else if (studentData?.profileImage) {
      // Fallback to database image if localStorage doesn't have it
      setProfileImage(studentData.profileImage);
    }

    // Log ABC_ID for debugging
    if (studentData) {
      console.log('ABC_ID check:', {
        ABC_ID: studentData.ABC_ID,
        hasABC_ID: !!(studentData.ABC_ID && studentData.ABC_ID !== null && studentData.ABC_ID !== ''),
        profileImage: !!profileImage || !!savedImage
      });
    }
  }, [studentData, user?.autonomousRollNo]);

  // Debug logging
  useEffect(() => {
    if (studentData) {
      console.log('Student Data:', studentData);
      console.log('Department:', studentData.Department);
      console.log('Department trimmed:', studentData.Department?.trim());
      console.log('Is BBA:', studentData.Department && studentData.Department.trim() === 'BBA');
      console.log('Autonomous Roll No:', studentData.autonomousRollNo);
      console.log('VAC-201-I.C value:', studentData['VAC-201-I.C']);
      console.log('All VAC related fields:', {
        'VAC-201-I.C': studentData['VAC-201-I.C'],
        'VAC-201-I.C (bracket notation)': studentData['VAC-201-I.C'],
        'VAC-201-I.C (dot notation)': studentData['VAC-201-I.C'],
        'VAC-201-I.C (quoted)': studentData['VAC-201-I.C']
      });
      
      // Debug PG student identification
      console.log('Student Type:', getStudentType());
      console.log('Is PG Student:', isPGStudent());
      console.log('Stream:', getStream());
      console.log('Roll Number Pattern Check:', {
        'contains BBA': studentData?.autonomousRollNo?.includes('BBA'),
        'contains NAC24': studentData?.autonomousRollNo?.includes('NAC24'),
        'contains 111NAC': studentData?.autonomousRollNo?.includes('111NAC')
      });
      
      // Log all fields for BBA students
      if (studentData.Department && studentData.Department.trim() === 'BBA') {
        console.log('BBA Student Fields:', {
          'CC-201': studentData['CC-201'],
          'CC-202': studentData['CC-202'],
          'CC-203': studentData['CC-203'],
          'Multi Disciplinary-201': studentData['Multi Disciplinary-201'],
          'AEC-201': studentData['AEC-201'],
          'SEC-201': studentData['SEC-201'],
          'VAC-201-I': studentData['VAC-201-I'],
          'VAC-201-I.C': studentData['VAC-201-I']?.C
        });
        
        // Check if VAC field exists in the object
        console.log('All object keys:', Object.keys(studentData));
        console.log('VAC-201-I field exists:', 'VAC-201-I' in studentData);
        console.log('VAC-201-I value:', studentData['VAC-201-I']);
        console.log('VAC-201-I.C value:', studentData['VAC-201-I']?.C);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentData]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading your admit card...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={fetchStudentData} className="retry-btn">Try Again</button>
      </div>
    );
  }

  if (!studentData) {
    return (
      <div className="no-data-container">
        <h3>No Data Found</h3>
        <p>Unable to retrieve student information.</p>
      </div>
    );
  }

  const majorSubject = getMajorSubject();
  const stream = getStream();
  const isPG = isPGStudent();

  const hasAbcId = !!(studentData?.ABC_ID && studentData.ABC_ID !== null && studentData.ABC_ID !== '');

  // Download requires BOTH profile photo AND ABC ID
  const canDownload = () => !!profileImage && hasAbcId;

  const getDownloadRestrictionMessage = () => {
    const missing = [];
    if (!profileImage) missing.push('upload your profile photo');
    if (!hasAbcId) missing.push('register your ABC ID');
    if (missing.length === 0) return '';
    return `Please ${missing.join(' and ')}`;
  };

  const handleDownloadClick = () => {
    if (!canDownload()) {
      const message = getDownloadRestrictionMessage();
      alert(`Cannot download admit card. ${message}. Please complete these requirements first.`);
      return;
    }
    generatePDF();
  };

  // Handle ABC ID submission
  const handleAbcIdSubmit = async (e) => {
    e.preventDefault();
    
    if (!abcId.trim()) {
      setAbcMessage('Please enter ABC_ID');
      return;
    }

    if (abcId.length < 5) {
      setAbcMessage('ABC_ID must be at least 5 characters');
      return;
    }

    setIsSubmittingAbc(true);
    setAbcMessage('');

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${config.API_BASE_URL}/abc-id/submit`,
        { ABC_ID: abcId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setAbcMessage('ABC ID submitted successfully!');
      setAbcId('');
      
      // Refresh student data to get updated ABC_ID
      await fetchStudentData();
      
      setTimeout(() => setAbcMessage(''), 3000);
    } catch (error) {
      setAbcMessage(error.response?.data?.message || 'Failed to submit ABC_ID');
    } finally {
      setIsSubmittingAbc(false);
    }
  };

  // Handle profile photo upload - Frontend only (localStorage)
  const triggerPhotoUpload = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoMessage('Please select a valid image file');
      return;
    }

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setPhotoMessage('Image size should be less than 2MB');
      return;
    }

    try {
      setUploadingPhoto(true);
      setPhotoMessage('');

      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target.result;

        try {
          // Store in localStorage with student's roll number as key
          const storageKey = `profileImage_${user.autonomousRollNo}`;
          localStorage.setItem(storageKey, base64Image);
          
          // Update state
          setProfileImage(base64Image);
          setPhotoMessage('Profile photo saved successfully!');
          
          setTimeout(() => setPhotoMessage(''), 3000);
        } catch (err) {
          console.error('Error saving image:', err);
          setPhotoMessage('Failed to save image. Please try again.');
        } finally {
          setUploadingPhoto(false);
        }
      };

      reader.onerror = () => {
        setPhotoMessage('Failed to read image file');
        setUploadingPhoto(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error processing image:', err);
      setPhotoMessage('Failed to process image');
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="admit-card-container">
      {!showPreview ? (
        <div className="preview-controls">
          <h2>Your Admit Card</h2>
          <p>Welcome, {studentData.name || studentData['Name of the Students'] || studentData['Applicant Name']}</p>
          <p>Roll No: {studentData.autonomousRollNo}</p>
          <div className="preview-controls-buttons">
            <button
              onClick={() => setShowPreview(true)}
              className="preview-btn"
            >
              View Admit Card
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="return-login-btn"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="preview-container">
          {availableSemesters.length > 0 && (
            <div className="semester-selector">
              <label htmlFor="semester-select">Select Semester</label>
              <select
                id="semester-select"
                value={selectedSemester}
                onChange={handleSemesterChange}
                disabled={semesterLoading}
              >
                {availableSemesters.map((sem) => (
                  <option key={sem.key} value={sem.key}>
                    {sem.label}
                  </option>
                ))}
              </select>
              {semesterLoading && <span className="semester-loading">Updating admit card...</span>}
            </div>
          )}

          <div className="admit-card" ref={admitCardRef}>
            <div className="card-header">
              <div className="logo-box">
                <img src="/college.png" alt="College Logo" className="college-logo"/>
              </div>
              <div className="header-text">
                <CollegeNameHeading as="h2" />
                <h3>ADMIT CARD (BATCH -{getBatchYear()})</h3>
                <h3>{studentData.semesterLabel ? `${studentData.semesterLabel.toUpperCase()} - ` : ''}EXAMINATION-2026</h3>
              </div>
            </div>

            <div className="details-and-subjects">
              <div className="student-details">
                <div className="details-left">
                  {/* Show Stream for batch 2025 students (both UG and PG) or for older UG students */}
                  {(getBatchYear() === '2025' || !isPG) && stream && (
                    <div className="detail-row">
                      <span className="label">STREAM</span>
                      <span className="colon">:</span>
                      <span className="value">
                        {stream}
                      </span>
                    </div>
                  )}
                  <div className="detail-row">
                    <span className="label">EXAM ROLL NUMBER</span>
                    <span className="colon">:</span>
                    <span className="value">{studentData.autonomousRollNo}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">COLLEGE NUMBER</span>
                    <span className="colon">:</span>
                    <span className="value">{studentData.rollNo || studentData['College Roll No'] || studentData['Roll No']}</span>
                    {majorSubject && (
                      <span className="core-subject">
                        DEPARTMENT - {majorSubject}
                      </span>
                    )}
                  </div>
                  <div className="detail-row">
                    <span className="label">ABC ID</span>
                    <span className="colon">:</span>
                    <span className="value">{studentData.ABC_ID}</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">NAME OF THE STUDENT</span>
                    <span className="colon">:</span>
                    <span className="value">
                      {studentData.name || studentData['Name of the Students'] || studentData['Applicant Name']}
                    </span>
                  </div>
                </div>

                <div className="details-right">
                  <div className="photo-container">
                    {profileImage ? (
                      <div className="photo-display">
                        <img src={profileImage} alt="Student Photo" className="student-photo" />
                        <div className="photo-info">
                          <p className="photo-update-hint">
                            To update your photo, go to your <a href="/profile" onClick={(e) => { e.preventDefault(); navigate('/profile'); }}>Profile</a>
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="photo-placeholder">
                        <div className="photo-placeholder-content">
                          <span>PHOTO</span>
                          <p className="photo-upload-hint">
                            Upload your photo in your <a href="/profile" onClick={(e) => { e.preventDefault(); navigate('/profile'); }}>Profile</a>
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {studentData.subjects?.length > 0 ? (
                <div className="subjects-table">
                  <table>
                    <thead>
                      <tr>
                        {studentData.subjects.map((subject) => (
                          <th key={subject.field}>{subject.paper || subject.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {studentData.subjects.map((subject) => (
                          <td key={subject.field}>{subject.subjectName || subject.value || ''}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="course-section">
                  <div className="course-row">
                    <span className="label">SUBJECTS</span>
                    <span className="colon">:</span>
                    <span className="value">No semester subject data available</span>
                  </div>
                </div>
              )}
            </div>

            <div className="undertaking">
              <p>I undertake to abide by the rules printed below.</p>
            </div>

            <div className="signatures">
              <div className="signature-section">
                <div className="principal-sign">
                  <img src="/PRINCIPAL.jpg" alt="Principal Signature" className="signature-image"/>
                  <p>PRINCIPAL/CENTRE SUPERINTENDENT</p>
                </div>
                
                <div className="controller-sign">
                  <div className="student-sign">
                    <div className="signature-box"></div>
                    <p>Signature of the Student in Full</p>
                  </div>
                  <img src="/EXAMINER.jpg" alt="Controller Signature" className="signature-image"/>
                  <p>CONTROLLER OF EXAMINATIONS</p>
                </div>
              </div>
            </div>

            <div className="rules-section">
              <h3>RULES FOR THE GUIDANCE OF THE CANDIDATES</h3>
              <ol>
                <li>The examination shall be held as per the date and time notified earlier.</li>
                <li>Candidate suffering from any infectious disease must intimate the Superintendent and apply for separate sitting arrangement much ahead of the Examination sitting.</li>
                <li>Candidates shall bring their own blue pen and mathematical instruments. They shall not be allowed to exchange the same in the Examination Hall.</li>
                <li>Candidates must come in College Uniform carrying their Identity Card and Examination Admit Card failing which they shall not be allowed to sit for the Examination.</li>
                <li>Candidates must not carry books, notes, purses/wallet with written or blank papers, mobile phones, digital watches or electronic gadgets in to the examination premises.</li>
                <li>Candidates shall be checked at the gate for Examination and in their seats during Examination and they cannot deny such checks as and when necessary.</li>
                <li>Candidates must reach the gate at least 15 minutes before the commencement of the Examination for such checking. No Candidates shall be allowed entry half an hour after the examination starts. The principal/Center Superintendent may condone another half an hour if the case of coming late is genuine. In no circumstances shall one be allowed after one hour.</li>
                <li>A candidate shall not be allowed for temporary absence nor having the hall permanently in the first hour of the Examination.</li>
                <li>A candidate shall not be avail of temporary absence more than two times and beyond three minutes each time. No one shall be allowed temporary absence in the last half an hour. No candidates shall be allowed to leave hall in the last fifteen minutes of the sitting.</li>
                <li>It is candidate's responsibility to handover his/her answer scripts duly stitched to the invigilator.</li>
                <li>Candidates shall write their Roll Nos., Regd. Nos., Subject, Paper etc. in the specified for the purpose writing Roll Nos. or leaving any identification marks anywhere not specified shall be liable to expulsion/booked under malpractices.</li>
                <li>Candidates shall maintain perfect discipline and must not use any incriminating material nor disturb other candidates in the hall.</li>
                <li>Infringement of any of the Examination rules above or as laid in the rules and regulations of Examination shall be punished as per provision.</li>
              </ol>
            </div>
          </div>

          {/* Requirements Section - Always visible when any requirement is missing */}
          {(!profileImage || !hasAbcId) && (
            <div className="requirements-section">
              <h3>Complete Requirements to Download Admit Card</h3>

              {/* Profile Photo Upload */}
              {!profileImage && (
                <div className="requirement-item">
                  <div className="requirement-header">
                    <h4>Upload Profile Photo <span className="mandatory-badge">Required</span></h4>
                  </div>
                  <div className="requirement-content">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      className="requirement-btn"
                      onClick={triggerPhotoUpload}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                    </button>
                    {photoMessage && (
                      <div className={`requirement-message ${photoMessage.includes('success') ? 'success' : 'error'}`}>
                        {photoMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ABC ID Registration - Mandatory */}
              {!hasAbcId && (
                <div className="requirement-item">
                  <div className="requirement-header">
                    <h4>ABC ID Registration <span className="mandatory-badge">Required</span></h4>
                  </div>
                  <div className="requirement-content">
                    <form onSubmit={handleAbcIdSubmit} className="abc-id-form">
                      <input
                        type="text"
                        value={abcId}
                        onChange={(e) => setAbcId(e.target.value)}
                        placeholder="Enter your 12-digit ABC ID"
                        required
                        minLength={5}
                        className="abc-id-input"
                      />
                      <div className="abc-form-actions">
                        <button
                          type="submit"
                          className="requirement-btn primary"
                          disabled={isSubmittingAbc}
                        >
                          {isSubmittingAbc ? 'Submitting...' : 'Register ABC ID'}
                        </button>
                      </div>
                      {abcMessage && (
                        <div className={`requirement-message ${abcMessage.includes('success') ? 'success' : 'error'}`}>
                          {abcMessage}
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="preview-actions">
            <button
              type="button"
              className="edit-btn"
              onClick={() => navigate('/dashboard')}
            >
              Back to Dashboard
            </button>
            <div className="download-section">
              {!canDownload() && (
                <div className="download-restriction-message">
                  <p>{getDownloadRestrictionMessage()}</p>
                  <p className="restriction-hint">
                    Complete the requirements above to download your admit card
                  </p>
                </div>
              )}
              <button
                type="button"
                className={`download-btn ${!canDownload() ? 'disabled' : ''}`}
                onClick={handleDownloadClick}
                disabled={!canDownload()}
                title={!canDownload() ? getDownloadRestrictionMessage() : 'Download admit card as PDF'}
              >
                Download as PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdmitCard;
