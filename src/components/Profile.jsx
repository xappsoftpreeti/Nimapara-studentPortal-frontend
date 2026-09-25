import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import config from '../config';
import { isTokenValid, clearAuth } from '../utils/auth';
import './Profile.css';

export default function Profile({ user }) {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(user);
  const [profileImage, setProfileImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    // Check if token exists and is valid before fetching
    const token = localStorage.getItem('token');
    
    if (!token) {
      setError('You are not logged in. Please login again.');
      setTimeout(() => {
        clearAuth();
      }, 2000);
      return;
    }
    
    // Validate token
    if (!isTokenValid(token)) {
      console.error('Token is invalid or expired');
      setError('Your session has expired. Please login again.');
      setTimeout(() => {
        clearAuth();
      }, 2000);
      return;
    }
    
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('You are not logged in. Please login again.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }
      
      console.log('Fetching profile with token length:', token.length);
      
      const response = await axios.get(
        `${config.API_BASE_URL}${config.API_ENDPOINTS.PROFILE}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      console.log('Profile data received:', response.data);
      
      if (response.data) {
        setProfileData(response.data);
        const storageKey = `profileImage_${user?.autonomousRollNo || response.data.autonomousRollNo}`;
        const localImage = localStorage.getItem(storageKey);
        setProfileImage(localImage || null);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
      console.error('Error response:', err.response);
      console.error('Error status:', err.response?.status);
      console.error('Error data:', err.response?.data);
      
      if (err.response?.status === 401) {
        const errorMsg = err.response?.data?.message || 'Authentication failed';
        if (errorMsg.includes('expired') || errorMsg.includes('Token') || errorMsg.includes('not valid')) {
          setError('Your session has expired. Please login again.');
          setTimeout(() => {
            clearAuth();
          }, 2000);
        } else {
          setError(errorMsg);
        }
      } else {
        setError(err.response?.data?.message || 'Failed to load profile data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image size should be less than 2MB');
      return;
    }

    try {
      setUploading(true);
      setError('');
      setSuccess('');

      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Image = e.target.result;

        try {
          const storageKey = `profileImage_${user?.autonomousRollNo}`;
          localStorage.setItem(storageKey, base64Image);
          setProfileImage(base64Image);
          setSuccess('Profile photo saved on this device. It is not stored in the database.');
          setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
          console.error('Error saving image:', err);
          setError('Failed to save image on this device. Please try again.');
        } finally {
          setUploading(false);
        }
      };

      reader.onerror = () => {
        setError('Failed to read image file');
        setUploading(false);
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Error processing image:', err);
      setError('Failed to process image');
      setUploading(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!window.confirm('Are you sure you want to remove your profile image?')) {
      return;
    }

    try {
      setUploading(true);
      setError('');
      setSuccess('');

      const storageKey = `profileImage_${user?.autonomousRollNo}`;
      localStorage.removeItem(storageKey);
      setProfileImage(null);
      setSuccess('Profile image removed from this device.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error deleting image:', err);
      setError(err.response?.data?.message || 'Failed to delete image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const getStudentType = () => {
    if (profileData?.autonomousRollNo?.includes('BBA')) return 'BBA Student';
    if (profileData?.autonomousRollNo?.includes('NAC24')) return 'UG Student';
    if (profileData?.autonomousRollNo?.includes('111NAC')) return 'PG Student';
    return 'Student';
  };

  if (loading) {
    return (
      <div className="profile-container">
        <div className="loading">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <button onClick={() => navigate('/dashboard')} className="back-btn">
          ← Back to Dashboard
        </button>
        <h1>My Profile</h1>
      </div>

      <div className="profile-content">
        <div className="profile-card">
          <div className="profile-photo-section">
            <div className="profile-photo-container">
              {profileImage ? (
                <div className="profile-photo-wrapper">
                  <img 
                    src={profileImage} 
                    alt="Profile" 
                    className="profile-photo"
                  />
                  <div className="profile-photo-overlay">
                    <button 
                      onClick={triggerImageUpload}
                      className="photo-action-btn"
                      disabled={uploading}
                    >
                      {uploading ? 'Uploading...' : 'Change'}
                    </button>
                    <button 
                      onClick={handleDeleteImage}
                      className="photo-action-btn delete"
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="profile-photo-placeholder">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <button 
                    onClick={triggerImageUpload}
                    className="upload-photo-btn"
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                  </button>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <h2>{profileData?.name || profileData?.['Name of the Students'] || profileData?.['Applicant Name'] || 'Student'}</h2>
            <p className="student-type">{getStudentType()}</p>
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              {success}
            </div>
          )}

          <div className="profile-details">
            <h3>Personal Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Name</span>
                <span className="detail-value">{profileData?.name || profileData?.['Name of the Students'] || profileData?.['Applicant Name'] || 'N/A'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">College Roll Number</span>
                <span className="detail-value">{profileData?.autonomousRollNo || 'N/A'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Exam Roll Number</span>
                <span className="detail-value">{profileData?.rollNo || profileData?.['College Roll No'] || profileData?.['Roll No'] || 'N/A'}</span>
              </div>

              <div className="detail-item">
                <span className="detail-label">Date of Birth</span>
                <span className="detail-value">{profileData?.dob || profileData?.['Date of Birth'] || profileData?.['DOB'] || 'N/A'}</span>
              </div>

              {profileData?.Department && (
                <div className="detail-item">
                  <span className="detail-label">Department</span>
                  <span className="detail-value">{profileData.Department}</span>
                </div>
              )}

              {profileData?.Course && (
                <div className="detail-item">
                  <span className="detail-label">Course</span>
                  <span className="detail-value">{profileData.Course}</span>
                </div>
              )}

              {profileData?.['Father Name'] && (
                <div className="detail-item">
                  <span className="detail-label">Father's Name</span>
                  <span className="detail-value">{profileData['Father Name']}</span>
                </div>
              )}

              {profileData?.['Mother Name'] && (
                <div className="detail-item">
                  <span className="detail-label">Mother's Name</span>
                  <span className="detail-value">{profileData['Mother Name']}</span>
                </div>
              )}

              {profileData?.Mobile && (
                <div className="detail-item">
                  <span className="detail-label">Mobile</span>
                  <span className="detail-value">{profileData.Mobile}</span>
                </div>
              )}

              {profileData?.Email && (
                <div className="detail-item">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{profileData.Email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Academic Information */}
          {(profileData?.['Major-3'] || profileData?.['CC-201']) && (
            <div className="profile-details">
              <h3>Academic Information</h3>
              <div className="subjects-info">
                {profileData?.Department === 'BBA' ? (
                  <>
                    {profileData?.['CC-201'] && <div className="subject-chip">CC-201: {profileData['CC-201']}</div>}
                    {profileData?.['CC-202'] && <div className="subject-chip">CC-202: {profileData['CC-202']}</div>}
                    {profileData?.['CC-203'] && <div className="subject-chip">CC-203: {profileData['CC-203']}</div>}
                    {profileData?.['Multi Disciplinary-201'] && <div className="subject-chip">Multi Disciplinary: {profileData['Multi Disciplinary-201']}</div>}
                    {profileData?.['AEC-201'] && <div className="subject-chip">AEC-201: {profileData['AEC-201']}</div>}
                    {profileData?.['SEC-201'] && <div className="subject-chip">SEC-201: {profileData['SEC-201']}</div>}
                  </>
                ) : (
                  <>
                    {profileData?.['Major-3'] && <div className="subject-chip">Major-3: {profileData['Major-3']}</div>}
                    {profileData?.['Major-4'] && <div className="subject-chip">Major-4: {profileData['Major-4']}</div>}
                    {profileData?.['MINOR-2'] && <div className="subject-chip">MINOR-2: {profileData['MINOR-2']}</div>}
                    {profileData?.['Multi Disciplinary-2'] && <div className="subject-chip">Multi Disciplinary: {profileData['Multi Disciplinary-2']}</div>}
                    {profileData?.['AEC-2'] && <div className="subject-chip">AEC-2: {profileData['AEC-2']}</div>}
                    {profileData?.['SEC-I'] && <div className="subject-chip">SEC-I: {profileData['SEC-I']}</div>}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="profile-actions">
          <button onClick={() => navigate('/admit-card')} className="action-btn primary">
            View Admit Card
          </button>
          <button onClick={() => navigate('/dashboard')} className="action-btn secondary">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
