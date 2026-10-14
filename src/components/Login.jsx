import React, { useState, useEffect } from "react";
import axios from 'axios';
import config from '../config';
import "./Login.css";

// Portal opens for login at 5:00 PM IST on 14 Oct 2026 (PG 2025 Sem 1 result publication)
const LOGIN_OPEN_AT = new Date('2026-10-14T17:00:00+05:30').getTime();

export default function Login({ onLogin }) {
  const [loginOpen, setLoginOpen] = useState(() => Date.now() >= LOGIN_OPEN_AT);
  const [rollNumber, setRollNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loginOpen) return undefined;
    const timer = setInterval(() => {
      if (Date.now() >= LOGIN_OPEN_AT) {
        setLoginOpen(true);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [loginOpen]);

  useEffect(() => {
    const redirectMessage = sessionStorage.getItem('auth_redirect_message');
    if (redirectMessage) {
      setError(redirectMessage);
      sessionStorage.removeItem('auth_redirect_message');
    }
  }, []);

  const handleDateChange = (e) => {
    const input = e.target.value;
    
    // Remove all non-numeric characters
    const numbers = input.replace(/\D/g, '');
    
    // Format as DD-MM-YYYY
    let formatted = '';
    if (numbers.length > 0) {
      // Add first 2 digits (day)
      formatted = numbers.substring(0, 2);
      
      if (numbers.length >= 3) {
        // Add dash and next 2 digits (month)
        formatted += '-' + numbers.substring(2, 4);
      }
      
      if (numbers.length >= 5) {
        // Add dash and remaining digits (year)
        formatted += '-' + numbers.substring(4, 8);
      }
    }
    
    setDateOfBirth(formatted);
    
    // Clear error when user starts typing
    if (error) {
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (Date.now() < LOGIN_OPEN_AT) {
      setLoginOpen(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Validate date input
      if (!dateOfBirth) {
        setError('Please enter your date of birth');
        setLoading(false);
        return;
      }

      // Validate the date format is DD-MM-YYYY
      if (!validateDateFormat(dateOfBirth)) {
        setError('Date must be in DD-MM-YYYY format (e.g., 15-07-2002)');
        setLoading(false);
        return;
      }

      const payload = {
        autonomousRollNo: rollNumber,
        dob: dateOfBirth
      };

      console.log('Sending login payload:', payload);
      const response = await axios.post(`${config.API_BASE_URL}${config.API_ENDPOINTS.LOGIN}`, payload);
      
      console.log('Login API response:', response.data);
      
      // Backend returns 'user' and 'token', not 'student' and 'success'
      if (response.data.token && response.data.user) {
        console.log('Login successful, calling onLogin with:', response.data.user, response.data.token);
        onLogin(response.data.user, response.data.token);
      } else {
        setError(response.data.message || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Cannot reach the server. Make sure the backend is running on port 5001.');
      } else if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.status === 404) {
        setError('Student not found. Please check your Roll No and Date of Birth.');
      } else if (err.response?.status === 401) {
        setError('Invalid credentials. Please check your Roll No and Date of Birth.');
      } else {
        setError('Login failed. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Validate date format (dd-mm-yyyy)
  const validateDateFormat = (dateString) => {
    if (!dateString) return false;
    
    // Check if it matches dd-mm-yyyy format
    const dateRegex = /^(\d{2})-(\d{2})-(\d{4})$/;
    const match = dateString.match(dateRegex);
    
    if (!match) return false;
    
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    
    // Validate day, month, year ranges
    if (day < 1 || day > 31) return false;
    if (month < 1 || month > 12) return false;
    if (year < 1900 || year > 2100) return false;
    
    // Additional validation for specific months
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2) {
      // February - check for leap year
      const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (day > (isLeapYear ? 29 : 28)) return false;
    } else if (day > daysInMonth[month - 1]) {
      return false;
    }
    
    return true;
  };

  return (
    <div className="login-container">
      <div className="login-card">
        {/* College Logo & Name */}
        <div className="college-header">
          <h1 className="system-title">Student Management System</h1>
          <h2 className="login-title">Student Login</h2>
          <p className="login-subtitle">Enter your credentials to access your admit card</p>
        </div>

        {!loginOpen && (
          <div
            className="error-message"
            style={{ background: '#fff8e1', color: '#8a6d00', border: '1px solid #ffe08a', textAlign: 'center' }}
          >
            <strong>PG 2025 – 1st Semester result will be published today (14/10/2026) at 5:00 PM IST.</strong>
            <br />
            Please login after 5:00 PM.
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="rollNumber">College/Autonomous Roll Number</label>
            <input
              id="rollNumber"
              type="text"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="Enter your roll number"
              required
              disabled={loading || !loginOpen}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="dateOfBirth">Date of Birth (DD-MM-YYYY)</label>
            <input
              id="dateOfBirth"
              type="text"
              value={dateOfBirth}
              onChange={handleDateChange}
              placeholder="01-01-2005"
              required
              disabled={loading || !loginOpen}
              maxLength="10"
              inputMode="numeric"
              autoComplete="off"
            />
            <small style={{ fontSize: '12px', color: '#666', marginTop: '4px', display: 'block' }}>
              Enter date as DDMMYYYY (e.g., type 01012005 for 01-01-2005)
            </small>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading || !loginOpen}>
            {loading ? 'Logging in...' : loginOpen ? 'Login' : 'Login opens at 5:00 PM'}
          </button>
        </form>

        {/* Footer */}
        <div className="footer">
          <p>© 2025 Nimapara Autonomous College</p>
        </div>
      </div>
    </div>
  );
}
