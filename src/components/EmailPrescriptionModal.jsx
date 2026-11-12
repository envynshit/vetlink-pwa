import { useState, useEffect } from 'react'
import { updatePatient, logAuditEvent } from '../db/database'

// Isolated hidden iframe printer: Prints without triggering @media print on parent window
function printElementViaIframe(elementHtml, docTitle = 'Official Veterinary Prescription') {
  if (!elementHtml) return

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.visibility = 'hidden'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${docTitle}</title>
        <style>
          @page {
            size: auto;
            margin: 6mm 8mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            padding: 0;
            background: #ffffff !important;
            color: #0f172a !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          #vetlink-rx-paper {
            background: #ffffff !important;
            border: 1.5px solid #0f172a !important;
            border-radius: 6px !important;
            padding: 5mm 6mm !important;
            width: 100% !important;
            max-width: 160mm !important;
            margin: 0 auto !important;
            font-size: 0.78rem !important;
            line-height: 1.35 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .rx-scrollable {
            max-height: none !important;
            overflow: visible !important;
            white-space: pre-wrap !important;
          }
        </style>
      </head>
      <body>
        ${elementHtml}
      </body>
    </html>
  `)
  doc.close()

  iframe.contentWindow.focus()
  setTimeout(() => {
    try {
      iframe.contentWindow.print()
    } catch (err) {
      console.error('Isolated iframe print error:', err)
    } finally {
      setTimeout(() => {
        try {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe)
          }
        } catch (e) {}
      }, 1500)
    }
  }, 250)
}

export default function EmailPrescriptionModal({
  isOpen,
  onClose,
  patient,
  consultation,
  prescription = '',
  clinicalNotes = '',
  diagnosis = '',
  doctorName = '',
  prcLicense,
  ptrNumber,
  currentUser,
  authToken,
  apiBaseUrl = 'http://localhost:8000',
  onPrescriptionSent,
}) {
  const initialEmail = patient?.ownerEmail || ''
  const [recipientEmail, setRecipientEmail] = useState(initialEmail)
  const [emailSubject, setEmailSubject] = useState('')
  const [personalNote, setPersonalNote] = useState('')
  const [saveToPatient, setSaveToPatient] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [allowDuplicate, setAllowDuplicate] = useState(false)
  const [isDuplicateDetected, setIsDuplicateDetected] = useState(false)
  const [duplicateSentTime, setDuplicateSentTime] = useState('')
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false)

  const patientName = patient?.name || 'Patient'
  const patientSpecies = patient?.species || 'Canine'
  const patientBreed = patient?.breed || 'Unknown'
  const patientWeight = patient?.weight ? `${patient.weight} kg` : 'N/A'
  const ownerName = patient?.ownerName || 'Pet Owner'
  const ownerPhone = patient?.ownerPhone || 'N/A'
  const todayStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const cleanRxId = (() => {
    if (patient?.id) {
      const pNum = String(patient.id).replace(/^(PAT-|PT-)/i, '').trim()
      if (pNum) return `RX-${pNum}`
    }
    if (consultation?.id) {
      const raw = String(consultation.id).trim()
      if (!raw.toLowerCase().includes('uuid') && raw.length <= 12) return raw
    }
    return 'RX-1001'
  })()
  const cleanDiagnosis = diagnosis || consultation?.diagnosis || patient?.areaOfConcern || 'Cutaneous Dermatological Condition'
  const cleanDoctor = (() => {
    if (doctorName && doctorName !== 'Dr. Sarah Lin, DVM' && doctorName !== 'Attending Veterinarian') return doctorName
    if (currentUser?.name) return currentUser.name.startsWith('Dr.') ? currentUser.name : `Dr. ${currentUser.name}`
    return 'Attending Veterinarian'
  })()
  const cleanPrcLicense = (prcLicense || currentUser?.prcLicense || '').trim()
  const cleanPtrNumber = ptrNumber || currentUser?.ptrNumber || ''
  const hasPrc = Boolean(cleanPrcLicense && cleanPrcLicense !== 'VET-894102')
  const hasPtr = Boolean(cleanPtrNumber && cleanPtrNumber !== '1948201')

  // Check 24-Hour Duplicate Dispatch Guard
  useEffect(() => {
    if (isOpen) {
      const email = patient?.ownerEmail || ''
      setRecipientEmail(email)
      setEmailSubject(`Official Veterinary Prescription - ${patientName} (${cleanDiagnosis})`)
      setPersonalNote('')
      setStatusMessage('')
      setErrorMessage('')
      setCopied(false)
      setAllowDuplicate(false)

      // Inspect duplicate record in localStorage
      try {
        const cacheKey = `vetlink_rx_dispatch_${patient?.id || cleanRxId}`
        const cachedRaw = localStorage.getItem(cacheKey)
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw)
          const isSameRecipient = (cached.recipient || '').toLowerCase() === email.trim().toLowerCase()
          const isSameRx = (cached.prescription || '').trim() === (prescription || '').trim()
          const isSameDiag = (cached.diagnosis || '').trim() === cleanDiagnosis.trim()
          const sentDate = new Date(cached.timestamp)
          const hoursAgo = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60)

          if (isSameRecipient && isSameRx && isSameDiag && hoursAgo < 24) {
            setIsDuplicateDetected(true)
            setDuplicateSentTime(sentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
          } else {
            setIsDuplicateDetected(false)
          }
        } else {
          setIsDuplicateDetected(false)
        }
      } catch {
        setIsDuplicateDetected(false)
      }
    }
  }, [isOpen, patient, patientName, cleanDiagnosis, cleanRxId, prescription])

  if (!isOpen) return null

  // Generate plain text prescription
  const generatePrescriptionText = () => {
    return [
      '==================================================',
      'VETLINK ANIMAL CARE CLINIC & HOSPITAL',
      'Veterinary Medical Center | Department of Clinical Dermatology',
      '765 J. P. Rizal St., Conception Uno, Marikina City, Philippines, 1807',
      'Mobile: 0945 867 9891 | Email: vetlink.lamuan@gmail.com',
      '==================================================',
      '',
      'OFFICIAL VETERINARY PRESCRIPTION (Rx)',
      '',
      `PATIENT:         ${patientName}`,
      `SPECIES / BREED: ${patientSpecies} | ${patientBreed}`,
      `WEIGHT:          ${patientWeight}`,
      `OWNER:           ${ownerName}`,
      `CONTACT:         ${ownerPhone}`,
      `DATE:            ${todayStr}`,
      `CASE / RX ID:    ${cleanRxId}`,
      '',
      'CLINICAL DIAGNOSIS:',
      cleanDiagnosis,
      '',
      'Rx MEDICATION & DOSAGE DISPENSING ORDER:',
      '--------------------------------------------------',
      prescription || 'No oral or topical medication prescribed.',
      '--------------------------------------------------',
      '',
      'CLINICAL CARE, HOME ADMINISTRATION & RECHECK INSTRUCTIONS:',
      clinicalNotes || 'Follow standard home hygiene and clinical monitoring.',
      '',
      personalNote ? `CLINIC STAFF INSTRUCTIONS TO OWNER:\n"${personalNote}"\n` : '',
      'ATTENDING VETERINARIAN:',
      cleanDoctor,
      hasPrc ? `PRC License No.: ${cleanPrcLicense}` : '',
      hasPtr ? `PTR No.: ${cleanPtrNumber}` : '',
      '',
      '--------------------------------------------------',
      'Notice: Official prescription issued under Republic Act 9268.',
      'Valid for 30 days from date of examination.',
      'Substitution requires attending veterinarian authorization.',
      '==================================================',
    ].filter(Boolean).join('\n')
  }

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  }

  // Persist updated email to patient record
  const syncEmailToPatientRecord = async (targetEmail) => {
    if (saveToPatient && patient?.id && targetEmail && targetEmail !== patient.ownerEmail) {
      try {
        await updatePatient(patient.id, { ownerEmail: targetEmail })
      } catch (err) {
        console.warn('Failed to update owner email in local patient record:', err)
      }
    }
  }

  // Record dispatch in local cache for duplicate prevention
  const recordDispatchCache = (targetEmail) => {
    try {
      const cacheKey = `vetlink_rx_dispatch_${patient?.id || cleanRxId}`
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          recipient: targetEmail,
          diagnosis: cleanDiagnosis,
          prescription: prescription,
          timestamp: new Date().toISOString(),
        })
      )
    } catch {
      // ignore storage errors
    }
  }

  // Option 1: Send via Clinic Cloud Email Endpoint
  const handleSendCloudEmail = async (e) => {
    if (e) e.preventDefault()
    setErrorMessage('')
    setStatusMessage('')

    const trimmedEmail = recipientEmail.trim()
    if (!trimmedEmail) {
      setErrorMessage('Please enter an owner email address.')
      return
    }
    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address (e.g. owner@example.com).')
      return
    }

    if (isDuplicateDetected && !allowDuplicate) {
      setErrorMessage('Duplicate dispatch prevented. Check "Resend identical copy anyway" if you intentionally need to dispatch again.')
      return
    }

    setIsSending(true)
    try {
      await syncEmailToPatientRecord(trimmedEmail)

      const payload = {
        recipient_email: trimmedEmail,
        patient_id: patient?.id || null,
        patient_name: patientName,
        owner_name: ownerName,
        species: patientSpecies,
        breed: patientBreed,
        weight: patient?.weight ? String(patient.weight) : null,
        diagnosis: cleanDiagnosis,
        prescription_text: prescription,
        clinical_notes: personalNote
          ? `${clinicalNotes}\n\nClinic Staff Note: ${personalNote}`
          : clinicalNotes,
        doctor_name: cleanDoctor,
        rx_id: cleanRxId,
        allow_duplicate: allowDuplicate,
        prc_license: cleanPrcLicense,
        ptr_number: cleanPtrNumber,
      }

      const headers = { 'Content-Type': 'application/json' }
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }

      const res = await fetch(`${apiBaseUrl}/api/prescriptions/email`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Server responded with status ${res.status}`)
      }

      const data = await res.json()
      setStatusMessage(data.message || `Official prescription successfully emailed to ${trimmedEmail}.`)
      recordDispatchCache(trimmedEmail)
      setIsDuplicateDetected(false)

      await logAuditEvent({
        action: 'PRESCRIPTION_EMAILED',
        user: currentUser || { name: 'Clinic Staff', role: 'Staff' },
        targetEntity: 'patients',
        targetId: patient?.id || '',
        details: `Dispatched official prescription for ${patientName} to ${trimmedEmail} via Clinic Cloud Email.`,
      })

      if (onPrescriptionSent) {
        onPrescriptionSent(trimmedEmail)
      }
    } catch (err) {
      console.warn('Cloud email dispatch error:', err)
      setErrorMessage(
        `${err.message || 'Cloud delivery could not be completed.'} You can immediately dispatch via your device email app using the button below.`
      )
    } finally {
      setIsSending(false)
    }
  }

  const handlePrintRxPad = () => {
    const rxEl = document.getElementById('vetlink-rx-paper')
    if (rxEl) {
      printElementViaIframe(rxEl.outerHTML, `Prescription_${patientName.replace(/\s+/g, '_')}_${cleanRxId}`)
    } else {
      window.print()
    }
  }

  // Option 2: Download Official Prescription PDF
  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true)
    setErrorMessage('')
    setStatusMessage('')

    const payload = {
      recipient_email: recipientEmail.trim() || 'vetlink.lamuan@gmail.com',
      patient_id: patient?.id || null,
      patient_name: patientName,
      owner_name: ownerName,
      species: patientSpecies,
      breed: patientBreed,
      weight: patient?.weight ? String(patient.weight) : null,
      diagnosis: cleanDiagnosis,
      prescription_text: prescription,
      clinical_notes: personalNote
        ? `${clinicalNotes}\n\nClinic Staff Note: ${personalNote}`
        : clinicalNotes,
      doctor_name: cleanDoctor,
      rx_id: cleanRxId,
      prc_license: cleanPrcLicense,
      ptr_number: cleanPtrNumber,
    }

    try {
      const res = await fetch(`${apiBaseUrl}/api/prescriptions/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Could not generate PDF from server.')
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Prescription_${patientName.replace(/\s+/g, '_')}_${cleanRxId}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      setStatusMessage('Official Prescription PDF downloaded successfully. You can attach it to your email or print it.')
    } catch (err) {
      console.warn('Backend PDF generation error, using printable window:', err)
      setStatusMessage('PDF download initiated via local print preview.')
      handlePrintRxPad()
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  // Option 3A: Open Gmail Web Composer directly in browser
  const handleSendGmailWeb = async () => {
    setErrorMessage('')
    setStatusMessage('')

    const trimmedEmail = recipientEmail.trim()
    if (!trimmedEmail) {
      setErrorMessage('Please enter an owner email address.')
      return
    }
    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    try {
      await syncEmailToPatientRecord(trimmedEmail)
      recordDispatchCache(trimmedEmail)

      const subject = encodeURIComponent(emailSubject || `Official Veterinary Prescription - ${patientName}`)
      const body = encodeURIComponent(generatePrescriptionText())
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(trimmedEmail)}&su=${subject}&body=${body}`

      window.open(gmailUrl, '_blank')
      setStatusMessage(`Gmail Web composer opened for ${trimmedEmail}. You can attach the downloaded Prescription PDF.`)

      await logAuditEvent({
        action: 'PRESCRIPTION_EMAILED',
        user: currentUser || { name: 'Clinic Staff', role: 'Staff' },
        targetEntity: 'patients',
        targetId: patient?.id || '',
        details: `Opened Gmail Web composer for ${patientName} (${trimmedEmail}).`,
      })

      if (onPrescriptionSent) {
        onPrescriptionSent(trimmedEmail)
      }
    } catch (err) {
      setErrorMessage('Could not open Gmail Web: ' + (err.message || 'Unknown error'))
    }
  }

  // Option 3B: Send via Device Email Client (mailto:), 100% Offline Compatible
  const handleSendMailto = async () => {
    setErrorMessage('')
    setStatusMessage('')

    const trimmedEmail = recipientEmail.trim()
    if (!trimmedEmail) {
      setErrorMessage('Please enter an owner email address.')
      return
    }
    if (!validateEmail(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    try {
      await syncEmailToPatientRecord(trimmedEmail)
      recordDispatchCache(trimmedEmail)

      const subject = encodeURIComponent(emailSubject || `Official Veterinary Prescription - ${patientName}`)
      const body = encodeURIComponent(generatePrescriptionText())
      const mailtoUrl = `mailto:${encodeURIComponent(trimmedEmail)}?subject=${subject}&body=${body}`

      window.location.href = mailtoUrl

      setStatusMessage(`Device mail app opened with pre-filled prescription for ${trimmedEmail}.`)

      await logAuditEvent({
        action: 'PRESCRIPTION_EMAILED',
        user: currentUser || { name: 'Clinic Staff', role: 'Staff' },
        targetEntity: 'patients',
        targetId: patient?.id || '',
        details: `Opened prescription mail draft for ${patientName} (${trimmedEmail}) via Device Mail Client.`,
      })

      if (onPrescriptionSent) {
        onPrescriptionSent(trimmedEmail)
      }
    } catch (err) {
      setErrorMessage('Could not open default mail client: ' + (err.message || 'Unknown error'))
    }
  }

  // Copy Plain Text Prescription to Clipboard
  const handleCopyText = async () => {
    try {
      const fullText = generatePrescriptionText()
      await navigator.clipboard.writeText(fullText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setErrorMessage('Clipboard copy failed. Please select text manually from preview.')
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="email-rx-title">
      {/* Isolated Print Stylesheet for Authentic A5 Veterinary Prescription Pad */}
      <style>{`
        @media print {
          @page {
            size: A5 portrait;
            margin: 6mm;
          }
          html, body {
            visibility: hidden !important;
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * {
            visibility: hidden !important;
          }
          .modal-overlay {
            visibility: visible !important;
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            display: block !important;
            width: auto !important;
            height: auto !important;
          }
          .modal-dialog {
            visibility: visible !important;
            position: static !important;
            background: transparent !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            max-height: none !important;
            display: block !important;
            overflow: visible !important;
          }
          .modal-header,
          .modal-footer,
          .email-form-col,
          .app-nav,
          nav,
          .no-print {
            display: none !important;
            visibility: hidden !important;
          }
          #vetlink-rx-paper,
          #vetlink-rx-paper * {
            visibility: visible !important;
          }
          #vetlink-rx-paper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 136mm !important;
            margin: 0 auto !important;
            padding: 6mm 8mm !important;
            background: #ffffff !important;
            color: #0f172a !important;
            border: 1.5px solid #0f172a !important;
            border-radius: 6px !important;
            box-shadow: none !important;
            display: flex !important;
            flex-direction: column !important;
            font-size: 0.8rem !important;
            line-height: 1.35 !important;
          }
          #vetlink-rx-paper .rx-scrollable {
            max-height: none !important;
            overflow: visible !important;
            white-space: pre-wrap !important;
          }
        }
      `}</style>
      <div
        className="modal-dialog"
        style={{
          maxWidth: 860,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 10,
        }}
      >
        {/* Modal Header */}
        <header
          className="modal-header no-print"
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border, #cbd5e1)',
            background: 'var(--surface, #ffffff)',
            flexShrink: 0,
          }}
        >
          <div>
            <h3 id="email-rx-title" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-h, #0f172a)' }}>
              Email Official Prescription
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--muted, #64748b)' }}>
              Dispatch certified veterinary prescription directly to pet owner
            </span>
          </div>
          <button
            className="modal-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={isSending}
          >
            &times;
          </button>
        </header>

        {/* Modal Body: Compact Two-Column Split View */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
            padding: 16,
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {/* Left Column: Form Inputs & Action Controls */}
          <div className="email-form-col no-print" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Status Banners */}
            {statusMessage && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#dcfce7',
                  border: '1px solid #86efac',
                  borderRadius: 6,
                  color: '#15803d',
                  fontSize: '0.82rem',
                  lineHeight: 1.4,
                  fontWeight: 600,
                }}
              >
                {statusMessage}
              </div>
            )}

            {errorMessage && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#fee2e2',
                  border: '1px solid #fca5a5',
                  borderRadius: 6,
                  color: '#b91c1c',
                  fontSize: '0.82rem',
                  lineHeight: 1.4,
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* Missing Email Prompt */}
            {!patient?.ownerEmail && !recipientEmail && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#f0f9ff',
                  border: '1px solid #bae6fd',
                  borderRadius: 6,
                  color: '#0369a1',
                  fontSize: '0.78rem',
                  lineHeight: 1.4,
                }}
              >
                <strong>No email on record.</strong> Please input owner email below to dispatch prescription and auto-save to patient record.
              </div>
            )}

            {/* Duplicate Dispatch Warning */}
            {isDuplicateDetected && (
              <div
                style={{
                  padding: '10px 12px',
                  background: '#fef3c7',
                  border: '1px solid #fde047',
                  borderRadius: 6,
                  color: '#92400e',
                  fontSize: '0.8rem',
                  lineHeight: 1.4,
                }}
              >
                <strong>Prescription Already Dispatched:</strong> An identical prescription was already sent to this owner today at {duplicateSentTime}. No medication or dosage changes were detected.
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, cursor: 'pointer', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={allowDuplicate}
                    onChange={(e) => setAllowDuplicate(e.target.checked)}
                  />
                  <span>Resend identical copy anyway</span>
                </label>
              </div>
            )}

            {/* Recipient Email Input */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                Pet Owner Email Address:
              </label>
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(e) => {
                  setRecipientEmail(e.target.value)
                  setErrorMessage('')
                }}
                placeholder="e.g. owner@gmail.com"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border, #cbd5e1)',
                  borderRadius: 6,
                  fontSize: '0.88rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Email Subject */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                Email Subject:
              </label>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  border: '1px solid var(--border, #cbd5e1)',
                  borderRadius: 6,
                  fontSize: '0.82rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Clinic Staff Personal Note */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                Clinic Note / Special Instructions (Optional):
              </label>
              <textarea
                rows={2}
                value={personalNote}
                onChange={(e) => setPersonalNote(e.target.value)}
                placeholder="e.g. Please bring Buddy back next Monday for follow-up skin scrape."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: '1px solid var(--border, #cbd5e1)',
                  borderRadius: 6,
                  fontSize: '0.82rem',
                  boxSizing: 'border-box',
                  resize: 'none',
                }}
              />
            </div>

            {/* Save to Record Toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#475569', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={saveToPatient}
                onChange={(e) => setSaveToPatient(e.target.checked)}
              />
              <span>Save this email to patient profile for future consultations</span>
            </label>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
              {/* Primary Cloud Email */}
              <button
                type="button"
                className="action-btn blue"
                onClick={handleSendCloudEmail}
                disabled={isSending || (isDuplicateDetected && !allowDuplicate)}
                style={{
                  minHeight: 40,
                  padding: '8px 16px',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  cursor: isSending || (isDuplicateDetected && !allowDuplicate) ? 'not-allowed' : 'pointer',
                  opacity: isDuplicateDetected && !allowDuplicate ? 0.6 : 1,
                }}
              >
                {isSending ? 'Sending via Cloud...' : 'Send via Clinic Cloud Email (with Attached PDF)'}
              </button>

              {/* Action Buttons Row: Download PDF & Print A5 Prescription Pad */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  className="action-btn green"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  style={{
                    minHeight: 38,
                    padding: '8px 10px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 6,
                    background: '#059669',
                    color: '#ffffff',
                    border: 'none',
                    cursor: isDownloadingPdf ? 'not-allowed' : 'pointer',
                  }}
                  title="Download official A5 vector PDF file"
                >
                  {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF (A5)'}
                </button>

                <button
                  type="button"
                  onClick={handlePrintRxPad}
                  style={{
                    minHeight: 38,
                    width: 'auto',
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 6,
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  title="Print authentic A5 prescription pad or Save as PDF"
                >
                  Print Reseta (A5 Pad)
                </button>
              </div>

              {/* Instant Gmail Web & Native Mail Fallback Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleSendGmailWeb}
                  disabled={isSending}
                  style={{
                    minHeight: 34,
                    padding: '6px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#1e3a8a',
                    cursor: isSending ? 'not-allowed' : 'pointer',
                  }}
                  title="Open Gmail composer in web browser"
                >
                  Open in Gmail Web
                </button>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleSendMailto}
                  disabled={isSending}
                  style={{
                    minHeight: 34,
                    padding: '6px 8px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#334155',
                    cursor: isSending ? 'not-allowed' : 'pointer',
                  }}
                  title="Open device native email app"
                >
                  Device Mail App
                </button>
              </div>

              <span style={{ fontSize: '0.71rem', color: '#64748b', textAlign: 'center', margin: '2px 0 0' }}>
                Tip: Click "Download Official Prescription (PDF)" first, then open Gmail to attach the file directly.
              </span>
            </div>
          </div>

          {/* Right Column: Scaled Digital Prescription Preview Card (Zero Scroll) */}
          <div
            id="vetlink-rx-paper"
            className="vetlink-rx-paper"
            style={{
              background: '#f8fafc',
              border: '1.5px solid #0f172a',
              borderRadius: 8,
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              fontSize: '0.78rem',
              lineHeight: 1.4,
              color: '#0f172a',
            }}
          >
            {/* Official PDF Document Badge */}
            <div
              className="no-print"
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: 6,
                padding: '5px 8px',
                marginBottom: 8,
                fontSize: '0.72rem',
                color: '#166534',
                fontWeight: 600,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>Attachment: Prescription_{patientName.replace(/\s+/g, '_')}_{cleanRxId}.pdf</span>
              <span style={{ fontSize: '0.65rem', background: '#dcfce7', border: '1px solid #86efac', padding: '1px 5px', borderRadius: 4, textTransform: 'uppercase', fontWeight: 700 }}>
                Official PDF
              </span>
            </div>

            {/* Preview Card Header */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: 6, marginBottom: 8 }}>
              <span style={{ fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.5px', color: '#1e3a8a', textTransform: 'uppercase' }}>
                Prescription Preview
              </span>
              <button
                type="button"
                onClick={handleCopyText}
                style={{
                  padding: '3px 8px',
                  fontSize: '0.72rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  background: '#ffffff',
                  color: '#1e293b',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {copied ? 'Copied' : 'Copy Text'}
              </button>
            </div>

            {/* Clinic Letterhead */}
            <div style={{ textAlign: 'center', borderBottom: '1px solid #94a3b8', paddingBottom: 6, marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>VETLINK ANIMAL CARE CLINIC & HOSPITAL</div>
              <div style={{ fontSize: '0.68rem', color: '#475569' }}>Veterinary Medical Center | Department of Clinical Dermatology</div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>765 J. P. Rizal St., Conception Uno, Marikina City, Philippines, 1807</div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Mobile: 0945 867 9891 | Email: vetlink.lamuan@gmail.com</div>
            </div>

            {/* Patient Meta Summary Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px', background: '#ffffff', padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 8 }}>
              <div><strong>Patient:</strong> {patientName} ({patientSpecies})</div>
              <div><strong>Owner:</strong> {ownerName}</div>
              <div><strong>Breed:</strong> {patientBreed}</div>
              <div><strong>Date:</strong> {todayStr}</div>
              <div><strong>Weight:</strong> {patientWeight}</div>
              <div><strong>Rx ID:</strong> {cleanRxId}</div>
            </div>

            {/* Diagnosis Banner */}
            <div style={{ background: '#eff6ff', borderLeft: '3px solid #2563eb', padding: '5px 8px', marginBottom: 8, fontSize: '0.75rem' }}>
              <strong>Clinical Diagnosis:</strong> <u>{cleanDiagnosis}</u>
            </div>

            {/* Prescribed Medications */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '0.78rem', marginBottom: 2 }}>
                Rx DISPENSING ORDER:
              </div>
              <div
                className="rx-scrollable"
                style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '6px 8px',
                  fontFamily: 'Consolas, monospace',
                  fontSize: '0.74rem',
                  maxHeight: 90,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {prescription || 'No oral or topical medication prescribed.'}
              </div>
            </div>

            {/* Home Instructions */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: '0.74rem', color: '#334155', marginBottom: 2 }}>
                Home Care & Recheck Instructions:
              </div>
              <div
                className="rx-scrollable"
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: '5px 8px',
                  fontSize: '0.72rem',
                  color: '#475569',
                  maxHeight: 60,
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {clinicalNotes || 'Follow standard home hygiene and monitoring.'}
                {personalNote ? `\nStaff Note: ${personalNote}` : ''}
              </div>
            </div>

            {/* Footer / Signature Block */}
            <div style={{ marginTop: 'auto', borderTop: '1px solid #cbd5e1', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '0.68rem', color: '#64748b' }}>
              <div>
                <div>Republic Act 9268 Certified</div>
                <div>Valid for 30 days from exam</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{cleanDoctor}</div>
                {(hasPrc || hasPtr) && (
                  <div>
                    {hasPrc && <span>PRC Lic: {cleanPrcLicense}</span>}
                    {hasPrc && hasPtr && <span> | </span>}
                    {hasPtr && <span>PTR: {cleanPtrNumber}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <footer
          className="modal-footer no-print"
          style={{
            padding: '10px 18px',
            borderTop: '1px solid var(--border, #cbd5e1)',
            background: 'var(--surface, #ffffff)',
            display: 'flex',
            justifyContent: 'flex-end',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="small-outline"
            onClick={onClose}
            disabled={isSending}
            style={{ padding: '6px 14px', fontSize: '0.82rem' }}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
