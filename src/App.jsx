import { useEffect, useState } from 'react'
import heroImg from './assets/hero.png'
import vetlinkLogo from './assets/vetlink-logo.png'
import './App.css'
import Login from './pages/Login'
import ClinicalAnalysis from './pages/ClinicalAnalysis'
import Patients from './pages/Patients'
import Staff from './pages/Staff'
import Sync from './pages/Sync'
import NewPatient from './pages/NewPatient'
import Settings from './pages/Settings'
import Treatment from './pages/Treatment'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

const steps = [
  'Log in securely to access your workspace',
  'Capture a clear image of the affected area',
  'Upload it from your camera or gallery',
  'Review the support summary and next steps',
]

function App() {
  const [image, setImage] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [activeView, setActiveView] = useState('clinic')
  const [showNewPatient, setShowNewPatient] = useState(false)
  const [treatmentCaseData, setTreatmentCaseData] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem('vetlink_auth_token') || '')
  const [currentUser, setCurrentUser] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(sessionStorage.getItem('vetlink_auth_token')))
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (isStandalone) {
      setIsInstalled(true)
    }

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      alert(
        'To install VetLink:\n\n' +
        '• On Chrome / Edge: Click the install icon in the address bar, or select "Install VetLink" from the browser menu (⋮).\n' +
        '• On iOS Safari: Tap the Share button and select "Add to Home Screen".'
      )
      return
    }

    try {
      deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      if (choiceResult?.outcome === 'accepted') {
        setIsInstalled(true)
      }
    } catch (err) {
      console.error('Failed to trigger PWA install prompt:', err)
    } finally {
      setDeferredPrompt(null)
    }
  }

  useEffect(() => {
    if (!authToken) return

    fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session expired')
        return response.json()
      })
      .then((user) => {
        setCurrentUser(user)
        if (!user.must_change_password) setLoggedIn(true)
      })
      .catch(() => {
        sessionStorage.removeItem('vetlink_auth_token')
        setAuthToken('')
        setCurrentUser(null)
      })
      .finally(() => setIsCheckingSession(false))
  }, [authToken])

  const handleImageChange = (event) => {
    const selectedImage = event.target.files?.[0]

    if (!selectedImage) {
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    const nextPreviewUrl = URL.createObjectURL(selectedImage)
    setImage(selectedImage)
    setPreviewUrl(nextPreviewUrl)
    setResult(null)
  }

  const handleAnalyze = () => {
    if (!image) {
      return
    }

    setIsAnalyzing(true)
    setResult(null)

    window.setTimeout(() => {
      setResult({
        title: 'Possible irritant contact dermatitis',
        confidence: 'High confidence',
        summary:
          'The lesion pattern suggests a non-infectious skin irritation. Keep the area clean and monitor for improvement over 48 hours.',
        nextSteps: ['Avoid further irritation', 'Use gentle cleansing', 'Contact a veterinarian if it spreads'],
      })
      setIsAnalyzing(false)
    }, 1200)
  }

  const handleOfflineLogin = (role = 'Clinic Admin') => {
    const offlineUser = {
      id: 'ST-001',
      name: 'Dr. Sarah Lin (Offline Demo)',
      role: role,
      email: email || 'dr.sarah.lin@clinic.vet',
      isOffline: true,
    }
    setCurrentUser(offlineUser)
    setLoggedIn(true)
  }

  const handleLogin = async ({ email: loginEmail, password: loginPassword }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Unable to sign in')

      sessionStorage.setItem('vetlink_auth_token', result.access_token)
      setAuthToken(result.access_token)
      setCurrentUser({ ...result.user, must_change_password: result.must_change_password })
      if (!result.must_change_password) setLoggedIn(true)
      return result
    } catch (err) {
      // If backend server is unreachable (Failed to fetch), allow seamless offline demo login!
      if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('NetworkError') || err.message?.includes('Failed to fetch')) {
        console.warn('Backend server unreachable. Logging in with local offline session.')
        handleOfflineLogin('Clinic Admin')
        return { offline: true }
      }
      throw err
    }
  }

  const handleChangePassword = async ({ currentPassword, newPassword }) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.detail || 'Unable to change password')
    setCurrentUser((user) => ({ ...user, must_change_password: false }))
    setLoggedIn(true)
  }

  const handleLogout = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      })
    } catch {
      // Clear the local session even when the server cannot be reached.
    } finally {
      sessionStorage.removeItem('vetlink_auth_token')
      setAuthToken('')
      setCurrentUser(null)
      setLoggedIn(false)
      setActiveView('clinic')
      setShowNewPatient(false)
      setShowSettings(false)
    }
  }

  // --- Global Theme Engine (applies to body, sidebar, header, and all views) ---
  useEffect(() => {
    const applyGlobalTheme = () => {
      const savedTheme = localStorage.getItem('vetlink_theme') || 'system'
      const root = document.documentElement
      if (savedTheme === 'dark') {
        root.setAttribute('data-theme', 'dark')
      } else if (savedTheme === 'light') {
        root.setAttribute('data-theme', 'light')
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        if (prefersDark) {
          root.setAttribute('data-theme', 'dark')
        } else {
          root.removeAttribute('data-theme')
        }
      }
    }

    applyGlobalTheme()

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      const saved = localStorage.getItem('vetlink_theme') || 'system'
      if (saved === 'system') applyGlobalTheme()
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    window.addEventListener('vetlink-theme-change', applyGlobalTheme)

    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange)
      window.removeEventListener('vetlink-theme-change', applyGlobalTheme)
    }
  }, [])

  // --- Shared Tablet Exam Room Inactivity Auto-Lock ---
  useEffect(() => {
    if (!loggedIn) return

    let timeoutId = null

    const checkAndResetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId)

      const storedMinutes = parseInt(localStorage.getItem('vetlink_inactivity_timeout') || '0', 10)
      if (storedMinutes > 0) {
        timeoutId = setTimeout(() => {
          alert(`VetLink Auto-Lock: Session locked after ${storedMinutes} minutes of inactivity on this shared device.`)
          handleLogout()
        }, storedMinutes * 60 * 1000)
      }
    }

    checkAndResetTimer()

    const userActivityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart']
    const handleActivity = () => checkAndResetTimer()

    userActivityEvents.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    )
    window.addEventListener('vetlink-timeout-change', checkAndResetTimer)

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      userActivityEvents.forEach((evt) =>
        window.removeEventListener(evt, handleActivity)
      )
      window.removeEventListener('vetlink-timeout-change', checkAndResetTimer)
    }
  }, [loggedIn])

  return (
    <main className={`app-shell ${!loggedIn ? 'auth-shell' : ''}`}>
      {isCheckingSession ? (
        <div className="auth-loading" role="status">Checking your session...</div>
      ) : !loggedIn ? (
        <Login
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          onLogin={handleLogin}
          onChangePassword={handleChangePassword}
        />
      ) : (
        <div className="dashboard-shell">
          <aside className="dashboard-sidebar">
            <div className="sidebar-brand-header">
              <div className="brand-logo-row">
                <div className="brand-icon-bubble" style={{ background: 'transparent', boxShadow: 'none' }}>
                  <img
                    src={vetlinkLogo}
                    alt="VetLink Logo"
                    style={{ width: '38px', height: '38px', objectFit: 'contain', display: 'block' }}
                  />
                </div>
                <div className="brand-text-wrap">
                  <h1 className="brand-title">VetLink</h1>
                  <span className="brand-subtitle">Animal Skin Disease Support</span>
                </div>
              </div>

              <div className="sidebar-doctor-card">
                <div className="doctor-avatar">
                  {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'V'}
                </div>
                <div className="doctor-info">
                  <span className="doctor-name">{currentUser?.name || 'Dr. Emily Chen, DVM'}</span>
                  <span className="doctor-role">{currentUser?.role || 'Attending Veterinarian'}</span>
                </div>
              </div>
            </div>

            <nav className="sidebar-nav">
              <button
                type="button"
                className={"nav-item " + (activeView === 'clinic' && !showNewPatient ? 'active' : '')}
                onClick={() => { setActiveView('clinic'); setShowNewPatient(false); setShowSettings(false); }}
              >
                <div className="nav-item-label">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  <span>Clinical Analysis</span>
                </div>
              </button>
              <button
                type="button"
                className={"nav-item " + (activeView === 'patients' && !showNewPatient ? 'active' : '')}
                onClick={() => { setActiveView('patients'); setShowNewPatient(false); setShowSettings(false); }}
              >
                <div className="nav-item-label">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span>Patient Records</span>
                </div>
              </button>
              {currentUser?.role === 'Clinic Admin' && (
                <button
                  type="button"
                  className={"nav-item " + (activeView === 'staff' && !showNewPatient ? 'active' : '')}
                  onClick={() => { setActiveView('staff'); setShowNewPatient(false); setShowSettings(false); }}
                >
                  <div className="nav-item-label">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>Manage Staff</span>
                  </div>
                </button>
              )}
              {(currentUser?.role === 'Clinic Admin' || currentUser?.role?.toLowerCase().includes('vet') || !currentUser?.role) && (
                <button
                  type="button"
                  className={"nav-item " + (activeView === 'treatment' && !showNewPatient && !showSettings ? 'active' : '')}
                  onClick={() => { setTreatmentCaseData(null); setActiveView('treatment'); setShowNewPatient(false); setShowSettings(false); }}
                >
                  <div className="nav-item-label">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.5 20.5l10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z" />
                      <path d="m8.5 8.5 7 7" />
                    </svg>
                    <span>Treatment Protocols</span>
                  </div>
                </button>
              )}
              <button
                type="button"
                className={"nav-item " + (activeView === 'sync' && !showNewPatient ? 'active' : '')}
                onClick={() => { setActiveView('sync'); setShowNewPatient(false); setShowSettings(false); }}
              >
                <div className="nav-item-label">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  <span>Sync</span>
                </div>
                <span className="nav-sync-badge">Offline Ready</span>
              </button>
            </nav>

            <div className="sidebar-actions">
              <button
                type="button"
                className="action-btn blue new-patient-btn"
                onClick={() => setShowNewPatient(true)}
              >
                + New Patient
              </button>
              {isInstalled ? (
                <button type="button" className="action-btn secondary install-status-btn" disabled title="VetLink is installed on this device">
                  ✓ App Installed
                </button>
              ) : (
                <button
                  type="button"
                  className="action-btn secondary install-status-btn"
                  onClick={handleInstallClick}
                  title="Install VetLink on your device"
                >
                  Install PWA
                </button>
              )}
            </div>
          </aside>

          <section className="dashboard-panel">
            <header className="dashboard-header">
              <div className="header-title-wrap">
                <div className="mobile-header-brand">
                  <img src={vetlinkLogo} alt="VetLink" className="mobile-header-logo" />
                  <span className="mobile-header-title">VetLink</span>
                </div>
                <h2>{showSettings ? 'Settings' : showNewPatient ? 'New Patient' : {
                  clinic: 'Clinical Analysis',
                  patients: 'Patient Records',
                  staff: 'Manage Staff',
                  treatment: 'Treatment Protocols',
                  sync: 'Sync',
                }[activeView]}</h2>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="header-icon-btn notification-btn"
                  title="Notifications & Alerts"
                  onClick={() => alert('All clinical records synchronized locally. No pending alerts.')}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="notification-dot" />
                </button>
                <button
                  type="button"
                  className="header-icon-btn"
                  title="Settings"
                  onClick={() => { setShowSettings(true); setShowNewPatient(false); }}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="header-icon-btn logout-btn"
                  title="Log out"
                  onClick={() => setShowLogoutConfirm(true)}
                >
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            </header>

            {showSettings ? (
              <Settings
                currentUser={currentUser}
                onBack={() => setShowSettings(false)}
              />
            ) : showNewPatient ? (
              <NewPatient
                currentUser={currentUser}
                onBack={() => setShowNewPatient(false)}
                onViewPending={() => { setActiveView('patients'); setShowNewPatient(false); }}
                authToken={authToken}
                apiBaseUrl={API_BASE_URL}
                isOffline={currentUser?.isOffline}
                onCapture={(payload) => {
                  setShowNewPatient(false)
                  setTreatmentCaseData(payload)
                  setActiveView('treatment')
                }}
              />
            ) : (
              <>
                {activeView === 'clinic' && (
                  <ClinicalAnalysis
                    onNewPatient={() => setShowNewPatient(true)}
                    onViewPatients={() => { setActiveView('patients'); setShowNewPatient(false); }}
                    currentUser={currentUser}
                  />
                )}
                {activeView === 'patients' && (
                  <Patients
                    authToken={authToken}
                    apiBaseUrl={API_BASE_URL}
                    isOffline={currentUser?.isOffline}
                    currentUser={currentUser}
                    onProceedToTreatment={(caseData) => {
                      setTreatmentCaseData(caseData)
                      setActiveView('treatment')
                    }}
                  />
                )}
                {activeView === 'staff' && currentUser?.role === 'Clinic Admin' && <Staff authToken={authToken} apiBaseUrl={API_BASE_URL} />}
                {activeView === 'treatment' && (
                  <Treatment
                    currentUser={currentUser}
                    caseData={treatmentCaseData}
                    onBack={() => {
                      setTreatmentCaseData(null)
                      setActiveView('patients')
                    }}
                  />
                )}
                {activeView === 'sync' && <Sync authToken={authToken} apiBaseUrl={API_BASE_URL} currentUser={currentUser} />}
              </>
            )}
          </section>

          {/* Mobile Bottom Navigation Bar (PWA standard for screens <= 768px) */}
          <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
            <button
              type="button"
              className={"mobile-nav-item " + (activeView === 'clinic' && !showNewPatient && !showSettings ? 'active' : '')}
              onClick={() => { setActiveView('clinic'); setShowNewPatient(false); setShowSettings(false); }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
              <span>Clinic</span>
            </button>

            <button
              type="button"
              className={"mobile-nav-item " + (activeView === 'patients' && !showNewPatient && !showSettings ? 'active' : '')}
              onClick={() => { setActiveView('patients'); setShowNewPatient(false); setShowSettings(false); }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span>Patients</span>
            </button>

            <button
              type="button"
              className={"mobile-nav-item mobile-intake-fab " + (showNewPatient ? 'active' : '')}
              onClick={() => { setShowNewPatient(true); setShowSettings(false); }}
              title="Add New Patient Intake"
            >
              <div className="fab-circle">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <span>Intake</span>
            </button>

            {currentUser?.role === 'Clinic Admin' && (
              <button
                type="button"
                className={"mobile-nav-item " + (activeView === 'staff' && !showNewPatient && !showSettings ? 'active' : '')}
                onClick={() => { setActiveView('staff'); setShowNewPatient(false); setShowSettings(false); }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                </svg>
                <span>Staff</span>
              </button>
            )}

            <button
              type="button"
              className={"mobile-nav-item " + (activeView === 'sync' && !showNewPatient && !showSettings ? 'active' : '')}
              onClick={() => { setActiveView('sync'); setShowNewPatient(false); setShowSettings(false); }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>Sync</span>
            </button>
          </nav>

          {showLogoutConfirm && (
            <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title">
              <div className="modal-dialog" style={{ maxWidth: '440px' }}>
                <header className="modal-header">
                  <h3 id="logout-confirm-title">Confirm Logout</h3>
                  <button
                    type="button"
                    className="modal-close-btn"
                    onClick={() => setShowLogoutConfirm(false)}
                    aria-label="Close dialog"
                  >
                    ✕
                  </button>
                </header>
                <div className="modal-form">
                  <p style={{ margin: 0, fontSize: '0.96rem', color: 'var(--text-h)', fontWeight: 600 }}>
                    Are you sure you want to log out?
                  </p>
                  <div className="modal-actions" style={{ marginTop: '8px' }}>
                    <button
                      type="button"
                      className="small-outline"
                      onClick={() => setShowLogoutConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() => {
                        setShowLogoutConfirm(false)
                        handleLogout()
                      }}
                    >
                      Log Out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}

export default App