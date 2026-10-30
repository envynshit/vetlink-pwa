import { useState } from 'react'

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export default function Login({ email, password, setEmail, setPassword, onLogin, onChangePassword }) {
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      if (requiresPasswordChange) {
        if (newPassword.length < 8) throw new Error('Use at least 8 characters.')
        if (!/[A-Za-z]/.test(newPassword)) throw new Error('Include at least one letter.')
        if (!/[0-9]/.test(newPassword)) throw new Error('Include at least one number.')
        if (!/[^A-Za-z0-9\s]/.test(newPassword)) throw new Error('Include at least one special character.')
        // eslint-disable-next-line no-control-regex
        if (/\s|[\u0000-\u001f\u007f]/.test(newPassword)) throw new Error('Spaces and control characters are not allowed.')
        if (newPassword !== confirmPassword) throw new Error('The new passwords do not match.')
        await onChangePassword({ currentPassword: password, newPassword })
        setPassword('')
      } else {
        const result = await onLogin({ email, password })
        if (result?.must_change_password) setRequiresPasswordChange(true)
      }
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="login-card">
      <div className="brand-row" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div className="brand-mark" aria-label="VetLink">V</div>
        <div>
          <p className="brand-name">VetLink</p>
          <p className="brand-caption">Clinical workspace</p>
        </div>
      </div>

      <div className="hero-copy">
        <p className="eyebrow" style={{ textAlign: 'center' }}>{requiresPasswordChange ? 'Set a new password' : 'Welcome back'}</p>
      </div>

      <form className="login-form" onSubmit={handleSubmit}>
        {!requiresPasswordChange ? (
          <>
            <label>
              <span>Work email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clinic.com" autoComplete="username" required />
            </label>
            <label>
              <span>Password</span>
              <div className="password-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowPassword((prev) => !prev)
                  }}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
            <button className="primary-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </>
        ) : (
          <>
            <label>
              <span>New password</span>
              <div className="password-input-wrapper">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowNewPassword((prev) => !prev)
                  }}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
            <label>
              <span>Confirm new password</span>
              <div className="password-input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowConfirmPassword((prev) => !prev)
                  }}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
            <p className="id-auto-note">Use at least 8 characters, including a letter, a number, and a special character. Spaces are not allowed.</p>
            <button className="primary-btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating password...' : 'Update password'}
            </button>
          </>
        )}
        {error && <p role="alert" className="login-error">{error}</p>}
      </form>

      <p className="login-note">Access is limited to registered VetLink clinic staff.</p>
    </section>
  )
}