import { useEffect, useState, useRef } from 'react'
import {
  getPatients,
  mergeCloudPatients,
  updatePatient,
  addConsultation,
  getConsultationsByPatient,
  updateConsultation,
  addScreeningResult,
  getScreeningResultsByConsultation,
  getConsultationSymptoms
} from '../db/database'
import CameraCaptureModal from '../components/CameraCaptureModal'

const CLINICAL_DIAGNOSES = [
  'Mange',
  'Ringworm',
  'Pyoderma',
  'Hot Spots',
  'Healthy',
  'Avian Fowl Pox',
  'Scaly Face Scaly Leg Mite',
  'Healthy (Bird)',
  'Rabbit Mange',
  'Rabbit Ringworm',
  'Healthy (Rabbit)'
]

export default function Patients({ authToken, apiBaseUrl = 'http://localhost:8000', isOffline = false, currentUser, onProceedToTreatment }) {

  const [patients, setPatients] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [cloudError, setCloudError] = useState('')
  const [editingPatient, setEditingPatient] = useState(null)
  const [formData, setFormData] = useState({ name: '', species: 'Canine', areaOfConcern: '', lastVisit: '', status: 'Active' })
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [selectedSpecies, setSelectedSpecies] = useState('All')

  const getSpeciesAvatar = (patient) => {
    return (patient?.name || patient?.species || 'P').charAt(0).toUpperCase()
  }

  // Clinical Review & Edit Case Modal State (Veterinarian / Admin Review)
  const [reviewPatient, setReviewPatient]             = useState(null)
  const [reviewConsult, setReviewConsult]             = useState(null)
  const [reviewScreening, setReviewScreening]         = useState(null)
  const [reviewSymptoms, setReviewSymptoms]           = useState([])
  const [clinicalStatus, setClinicalStatus]           = useState('Review Results')
  const [overrideDiag, setOverrideDiag]               = useState('')
  const [customDiag, setCustomDiag]                   = useState('')
  const [labNotes, setLabNotes]                       = useState('')
  const [isSavingReview, setIsSavingReview]           = useState(false)
  const [reviewError, setReviewError]                 = useState('')

  // Recheck / Follow-up Visit State
  const [recheckPatient, setRecheckPatient]             = useState(null)
  const [pastConsult, setPastConsult]                   = useState(null)
  const [pastScreening, setPastScreening]               = useState(null)
  const [pastVisits, setPastVisits]                     = useState([])
  const [recheckProgress, setRecheckProgress]           = useState('improving')
  const [recheckNotes, setRecheckNotes]                 = useState('')
  const [recheckFile, setRecheckFile]                   = useState(null)
  const [recheckPreview, setRecheckPreview]             = useState(null)
  const [isSavingRecheck, setIsSavingRecheck]           = useState(false)
  const [recheckError, setRecheckError]                 = useState('')
  const [isRecheckCameraOpen, setIsRecheckCameraOpen]   = useState(false)
  const recheckInputRef                                 = useRef(null)

  const refreshPatients = async () => {
    const savedPatients = await getPatients()
    setPatients(savedPatients)
  }

  useEffect(() => {
    let isMounted = true

    const loadPatients = async () => {
      try {
        const localPatients = await getPatients()
        if (isMounted) {
          setPatients(localPatients)
        }

        if (isOffline || !authToken) return

        const response = await fetch(`${apiBaseUrl}/api/patients`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.detail || `Patient request failed with HTTP ${response.status}`)

        await mergeCloudPatients(result.patients || [])
        const mergedPatients = await getPatients()
        if (isMounted) {
          setPatients(mergedPatients)
          setCloudError('')
        }
      } catch (error) {
        console.error('Failed to load cloud patients:', error)
        if (isMounted) setCloudError(error.message || 'Could not retrieve records from the cloud.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadPatients()

    return () => {
      isMounted = false
    }
  }, [apiBaseUrl, authToken, isOffline])

  const visiblePatients = patients.filter((patient) => {
    const query = searchTerm.toLowerCase().trim()
    const matchesSearch =
      !query ||
      String(patient.id || '').toLowerCase().includes(query) ||
      String(patient.name || '').toLowerCase().includes(query) ||
      String(patient.species || '').toLowerCase().includes(query) ||
      String(patient.areaOfConcern || '').toLowerCase().includes(query)

    const pSpecies = String(patient.species || '').toLowerCase()
    const matchesSpecies =
      selectedSpecies === 'All' ||
      (selectedSpecies === 'Lagomorph'
        ? pSpecies === 'rabbit' || pSpecies === 'lagomorph'
        : pSpecies === selectedSpecies.toLowerCase())

    return matchesSearch && matchesSpecies
  })

  const openEditPatient = (patient) => {
    setEditingPatient(patient)
    setFormError('')
    setFormData({
      name: patient.name || '',
      species: patient.species || 'Canine',
      breed: patient.breed || '',
      weight: patient.weight || '',
      age: patient.age || '',
      ownerName: patient.ownerName || '',
      ownerPhone: patient.ownerPhone || '',
      areaOfConcern: patient.areaOfConcern || '',
      lastVisit: patient.lastVisit || '',
      status: patient.status || 'Active',
    })
  }

  const handleSavePatient = async (event) => {
    event.preventDefault()
    if (!formData.name.trim()) {
      setFormError('Patient name is required.')
      return
    }

    setIsSaving(true)
    setFormError('')
    try {
      await updatePatient(editingPatient.id, {
        ...formData,
        name: formData.name.trim(),
        breed: (formData.breed || '').trim(),
        weight: (formData.weight || '').trim(),
        age: (formData.age || '').trim(),
        ownerName: (formData.ownerName || '').trim(),
        ownerPhone: (formData.ownerPhone || '').trim(),
        areaOfConcern: (formData.areaOfConcern || '').trim(),
      })
      await refreshPatients()
      setEditingPatient(null)
      setSuccessMessage(`${formData.name.trim()} was updated and queued for sync.`)
    } catch (error) {
      console.error('Failed to update patient:', error)
      setFormError(error.message || 'Could not save patient changes.')
    } finally {
      setIsSaving(false)
    }
  }

  const openClinicalReviewModal = async (patient) => {
    setReviewPatient(patient)
    setClinicalStatus(patient.status || 'Review Results')
    setOverrideDiag('')
    setCustomDiag('')
    setLabNotes('')
    setReviewError('')
    setReviewConsult(null)
    setReviewScreening(null)
    setReviewSymptoms([])

    try {
      const consults = await getConsultationsByPatient(patient.id)
      if (consults && consults.length > 0) {
        const latest = consults[consults.length - 1]
        setReviewConsult(latest)
        const screenings = await getScreeningResultsByConsultation(latest.id)
        if (screenings && screenings.length > 0) {
          setReviewScreening(screenings[screenings.length - 1])
        }
        const syms = await getConsultationSymptoms(latest.id)
        setReviewSymptoms(syms || [])
      }
    } catch (err) {
      console.warn('Could not load case records:', err)
    }
  }

  const handleSaveClinicalReview = async (e) => {
    if (e) e.preventDefault()
    if (!reviewPatient) return
    setIsSavingReview(true)
    setReviewError('')

    try {
      // 1. Update patient status
      await updatePatient(reviewPatient.id, {
        status: clinicalStatus,
      })

      // 2. Update consultation if diagnosis overridden or lab notes added
      if (reviewConsult) {
        const updates = {}
        const finalDiag = overrideDiag === 'OTHER' ? customDiag.trim() : overrideDiag.trim()
        if (finalDiag) {
          updates.diagnosis = finalDiag
        }
        if (labNotes && labNotes.trim()) {
          const currentNotes = reviewConsult.clinicalNotes || ''
          updates.clinicalNotes = currentNotes.includes('Lab Findings:')
            ? currentNotes
            : `${currentNotes} | Lab Findings: ${labNotes.trim()}`
        }
        if (Object.keys(updates).length > 0) {
          await updateConsultation(reviewConsult.id, updates)
        }
      }

      await refreshPatients()
      setSuccessMessage(`Clinical review successfully updated for ${reviewPatient.name} (${clinicalStatus}).`)
      setReviewPatient(null)
    } catch (err) {
      console.error('Failed to save clinical review:', err)
      setReviewError(err.message || 'Could not save review decisions.')
    } finally {
      setIsSavingReview(false)
    }
  }

  const renderStatusBadge = (status) => {
    const norm = (status || 'Active').toLowerCase()
    if (norm.includes('awaiting lab') || norm.includes('lab test')) {
      return (
        <span className="status-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600 }}>
          Awaiting Lab Test
        </span>
      )
    }
    if (norm.includes('needs vet') || (norm.includes('review') && norm.includes('needs'))) {
      return (
        <span className="status-badge" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a', fontWeight: 600 }}>
          Needs Vet Review
        </span>
      )
    }
    if (norm.includes('review results') || norm.includes('review')) {
      return (
        <span className="status-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', fontWeight: 600 }}>
          Review Results
        </span>
      )
    }
    if (norm.includes('completed') || norm.includes('discharged')) {
      return (
        <span className="status-badge" style={{ background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', fontWeight: 600 }}>
          Completed
        </span>
      )
    }
    return <span className="status-badge">{status || 'Active'}</span>
  }

  const openRecheckModal = async (patient) => {
    setRecheckPatient(patient)
    setRecheckError('')
    setRecheckProgress('improving')
    setRecheckNotes('')
    setRecheckFile(null)
    setRecheckPreview(null)
    setPastConsult(null)
    setPastScreening(null)
    setPastVisits([])

    try {
      const consults = await getConsultationsByPatient(patient.id)
      if (consults && consults.length > 0) {
        const loadedVisits = []
        for (let i = 0; i < consults.length; i++) {
          const c = consults[i]
          let scr = null
          try {
            const screenings = await getScreeningResultsByConsultation(c.id)
            if (screenings && screenings.length > 0) {
              scr = screenings[screenings.length - 1]
            }
          } catch (_) {}
          loadedVisits.push({
            visitNum: i + 1,
            consultation: c,
            screening: scr,
          })
        }
        setPastVisits(loadedVisits)
        const latest = consults[consults.length - 1]
        setPastConsult(latest)
        if (loadedVisits.length > 0 && loadedVisits[loadedVisits.length - 1].screening) {
          setPastScreening(loadedVisits[loadedVisits.length - 1].screening)
        }
      }
    } catch (err) {
      console.warn('Could not load past consultations:', err)
    }
  }

  const handleRecheckFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setRecheckFile(file)
    if (recheckPreview) URL.revokeObjectURL(recheckPreview)
    setRecheckPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  const handleRecheckCameraCapture = (file) => {
    if (!file) return
    setRecheckFile(file)
    if (recheckPreview) URL.revokeObjectURL(recheckPreview)
    setRecheckPreview(URL.createObjectURL(file))
  }

  const handleSaveRecheck = async (e) => {
    e.preventDefault()
    if (!recheckPatient) return
    setIsSavingRecheck(true)
    setRecheckError('')

    // Strict Clinical Validation: Follow-up lesion image is strictly mandatory
    if (!recheckFile) {
      setRecheckError('Required: Please capture or upload a follow-up lesion image for recheck evaluation.')
      setIsSavingRecheck(false)
      return
    }

    try {
      const today = new Date().toISOString().slice(0, 10)
      let b64Img = null
      if (recheckFile) {
        b64Img = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result)
          r.onerror = rej
          r.readAsDataURL(recheckFile)
        })
      }

      const progressLabels = {
        resolved: 'Resolved / Fully Healed',
        improving: 'Responding / Improving',
        unchanged: 'Refractory / Unchanged',
        new_complication: 'Suspected New Complication',
      }

      // 1. Add follow-up consultation record
      const newConsult = await addConsultation({
        patientId: recheckPatient.id,
        clinicalNotes: `[Recheck Evaluation: ${progressLabels[recheckProgress] || recheckProgress}] ${recheckNotes.trim()}`,
        diagnosis: recheckProgress === 'resolved'
          ? 'Healthy (Resolved)'
          : `Follow-up: ${pastConsult?.diagnosis || recheckPatient.areaOfConcern || 'Cutaneous Lesion'} (${progressLabels[recheckProgress]})`,
        treatmentPlan: recheckProgress === 'resolved'
          ? 'Clinical discharge. Lesion resolved; resume routine preventive care.'
          : `Continued regimen: ${pastConsult?.treatmentPlan || 'Maintain ongoing therapy; recheck in 14 days.'}`,
      })

      // 2. Add screening result if recheck image provided
      if (b64Img) {
        await addScreeningResult({
          consultationId: newConsult.id,
          imageData: b64Img,
          aiLabel: recheckProgress === 'resolved' ? 'Healthy' : (pastConsult?.diagnosis || 'Lesion'),
          aiDisplayLabel: recheckProgress === 'resolved' ? 'Healthy (Resolved)' : `Recheck: ${progressLabels[recheckProgress]}`,
          aiConfidence: 0.95,
          aiPercent: 'Clinical Review',
          species: recheckPatient.species,
          reviewStatus: 'approved',
        })
      }

      // 3. Update patient's lastVisit and status
      await updatePatient(recheckPatient.id, {
        lastVisit: today,
        status: recheckProgress === 'resolved' ? 'Discharged' : 'Active',
      })

      await refreshPatients()
      setSuccessMessage(`Follow-up recheck consultation successfully saved for ${recheckPatient.name}.`)
      setRecheckPatient(null)
    } catch (err) {
      console.error('Failed to save recheck:', err)
      setRecheckError(err.message || 'Could not save recheck consultation.')
    } finally {
      setIsSavingRecheck(false)
    }
  }

  return (
    <section className="patients-card">
      <div className="patients-toolbar-wrap">
        <div className="patients-filter-pills" role="tablist" aria-label="Filter patients by species">
          {['All', 'Canine', 'Feline', 'Avian', 'Lagomorph'].map((sp) => (
            <button
              key={sp}
              type="button"
              className={`filter-pill ${selectedSpecies === sp ? 'active' : ''}`}
              onClick={() => setSelectedSpecies(sp)}
            >
              {sp === 'Canine' }
              {sp === 'Feline' }
              {sp === 'Avian' }
              {sp === 'Lagomorph' }
              {sp}
            </button>
          ))}
        </div>

        <div className="patients-search-bar-row">
          <div className="search-input-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by patient name, ID, or condition..."
            />
            {searchTerm && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            className="search-filter-action-btn"
            onClick={() => setSelectedSpecies(selectedSpecies === 'All' ? 'Canine' : 'All')}
            title="Toggle species filters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span>Filter</span>
          </button>
        </div>
      </div>

      <div className="patients-table-wrap">
        {successMessage && <div className="alert-banner success" role="status">{successMessage}</div>}
        {cloudError && (
          <div className="alert-banner error" role="alert">
            Cloud records could not be loaded: {cloudError} Showing records saved on this device.
          </div>
        )}
        <table className="patients-table">
          <thead>
            <tr>
              <th style={{ width: '48px' }}>PATIENT</th>
              <th>PATIENT ID</th>
              <th>NAME &amp; CONCERN</th>
              <th>SPECIES</th>
              <th>LAST VISIT</th>
              <th>AI DIAGNOSIS</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px' }}>Loading patients from local database...</td></tr>
            ) : visiblePatients.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px' }}>No patients found matching your search.</td></tr>
            ) : visiblePatients.map((patient) => (
              <tr key={patient.id}>
                <td>
                  <div className="patient-avatar-circle" title={patient.species}>
                    {getSpeciesAvatar(patient)}
                  </div>
                </td>
                <td>
                  <span className="patient-id-badge">{patient.id}</span>
                </td>
                <td>
                  <div className="patient-name-block">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>{patient.name}</strong>
                      {patient.breed && (
                        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>
                          ({patient.breed})
                        </span>
                      )}
                      {patient.syncStatus === 'pending' && (
                        <span className="sync-pending-pill" title="Offline changes pending sync with cloud">
                          <span className="sync-pulse-dot" />
                          Unsynced
                        </span>
                      )}
                    </div>
                    {patient.ownerName && (
                      <span style={{ fontSize: '0.78rem', color: '#0284c7', display: 'block', marginTop: '2px' }}>
                        {patient.ownerName} {patient.ownerPhone ? `• ${patient.ownerPhone}` : ''}
                      </span>
                    )}
                    {(patient.weight || patient.age) && (
                      <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                        {patient.weight ? `${patient.weight} kg` : ''} {patient.weight && patient.age ? '• ' : ''}{patient.age ? `Age: ${patient.age}` : ''}
                      </span>
                    )}
                    {patient.areaOfConcern && (
                      <span className="patient-concern-sub">{patient.areaOfConcern}</span>
                    )}
                  </div>
                </td>
                <td>
                  <span className="species-pill-badge">{patient.species}</span>
                </td>
                <td className="patient-date-cell">{patient.lastVisit}</td>
                <td>
                  <span className="ai-diagnosis-chip" title="Primary condition note">
                    {patient.areaOfConcern || 'Cutaneous Lesion (Screened)'}
                  </span>
                </td>
                <td>{renderStatusBadge(patient.status)}</td>
                <td>
                  <div className="table-actions-row">
                    <button
                      className="primary-btn table-action-btn view-case-btn"
                      type="button"
                      onClick={() => openClinicalReviewModal(patient)}
                      title="Review Clinical Case"
                    >
                      View Case
                    </button>
                    <button
                      className="secondary-btn table-action-btn recheck-pill-btn"
                      type="button"
                      onClick={() => openRecheckModal(patient)}
                      title="Follow-up Recheck"
                    >
                      Recheck
                    </button>
                    <button
                      className="small-outline table-action-btn edit-pill-btn"
                      type="button"
                      onClick={() => openEditPatient(patient)}
                      title="Edit Patient Details"
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingPatient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-patient-title">
          <div className="modal-dialog">
            <header className="modal-header">
              <h3 id="edit-patient-title">Edit Patient Record</h3>
              <button className="modal-close-btn" type="button" onClick={() => setEditingPatient(null)} aria-label="Close edit patient dialog">✕</button>
            </header>
            <form className="modal-form" onSubmit={handleSavePatient}>
              {formError && <div className="alert-banner error" role="alert">{formError}</div>}
              <label>
                <span>Patient ID</span>
                <input value={editingPatient.id} readOnly />
              </label>
              <label>
                <span>Name</span>
                <input value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} required />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  <span>Species</span>
                  <select value={formData.species} onChange={(event) => setFormData({ ...formData, species: event.target.value })}>
                    <option>Canine</option>
                    <option>Feline</option>
                    <option>Avian</option>
                    <option>Lagomorph</option>
                    <option>Other</option>
                  </select>
                </label>
                <label>
                  <span>Breed</span>
                  <input
                    placeholder="e.g. Aspin, Persian, etc."
                    value={formData.breed || ''}
                    onChange={(event) => setFormData({ ...formData, breed: event.target.value })}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  <span>Weight (kg)</span>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 5.4"
                    value={formData.weight || ''}
                    onChange={(event) => setFormData({ ...formData, weight: event.target.value })}
                  />
                </label>
                <label>
                  <span>Age</span>
                  <input
                    placeholder="e.g. 2 yrs, 6 mos"
                    value={formData.age || ''}
                    onChange={(event) => setFormData({ ...formData, age: event.target.value })}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  <span>Owner Name</span>
                  <input
                    placeholder="e.g. Juan Dela Cruz"
                    value={formData.ownerName || ''}
                    onChange={(event) => setFormData({ ...formData, ownerName: event.target.value })}
                  />
                </label>
                <label>
                  <span>Owner Phone / Contact</span>
                  <input
                    placeholder="e.g. 0917-123-4567"
                    value={formData.ownerPhone || ''}
                    onChange={(event) => setFormData({ ...formData, ownerPhone: event.target.value })}
                  />
                </label>
              </div>
              <label>
                <span>Area of Concern</span>
                <input value={formData.areaOfConcern} onChange={(event) => setFormData({ ...formData, areaOfConcern: event.target.value })} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  <span>Last Visit</span>
                  <input type="date" value={formData.lastVisit} onChange={(event) => setFormData({ ...formData, lastVisit: event.target.value })} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value })}>
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>Needs Vet Review</option>
                    <option>Awaiting Lab Test</option>
                    <option>Discharged</option>
                  </select>
                </label>
              </div>
              <div className="modal-actions">
                <button className="small-outline" type="button" onClick={() => setEditingPatient(null)} disabled={isSaving}>Cancel</button>
                <button className="action-btn blue" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* Clinical Review & Edit Case Modal (Attending Veterinarian Review)   */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {reviewPatient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="review-patient-title">
          <div className="modal-dialog" style={{ maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}>
            <header className="modal-header">
              <h3 id="review-patient-title">
                Clinical Case Review: {reviewPatient.name} ({reviewPatient.species})
              </h3>
              <button className="modal-close-btn" type="button" onClick={() => setReviewPatient(null)} aria-label="Close dialog">✕</button>
            </header>

            <form className="modal-form" onSubmit={handleSaveClinicalReview}>
              {reviewError && <div className="alert-banner error" role="alert">{reviewError}</div>}

              {/* 1. Header Grid: Patient Info & Baseline Photo */}
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div>
                  {reviewScreening?.imageData ? (
                    <img
                      src={reviewScreening.imageData}
                      alt="Lesion Photo"
                      style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6, border: '1px solid #94a3b8' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: 140, background: '#e2e8f0', borderRadius: 6, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '0.78rem' }}>
                      No Photo
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '0.84rem', color: '#1e293b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div><strong>Patient ID:</strong> {reviewPatient.id}</div>
                  <div><strong>Name:</strong> {reviewPatient.name} ({reviewPatient.species})</div>
                  {reviewPatient.breed && <div><strong>Breed:</strong> {reviewPatient.breed}</div>}
                  {(reviewPatient.weight || reviewPatient.age) && (
                    <div>
                      {reviewPatient.weight ? <span><strong>Weight:</strong> {reviewPatient.weight} kg </span> : null}
                      {reviewPatient.age ? <span><strong>Age:</strong> {reviewPatient.age}</span> : null}
                    </div>
                  )}
                  {reviewPatient.ownerName && (
                    <div>
                      <strong>Owner:</strong> {reviewPatient.ownerName}
                      {reviewPatient.ownerPhone ? ` (${reviewPatient.ownerPhone})` : ''}
                    </div>
                  )}
                  <div><strong>Intake Date:</strong> {reviewPatient.lastVisit || 'Today'}</div>
                  <div><strong>Area of Concern:</strong> {reviewPatient.areaOfConcern || 'Skin lesion'}</div>
                  <div>
                    <strong>Preliminary AI Scan:</strong>{' '}
                    <span style={{ color: '#1e40af', fontWeight: 'bold' }}>
                      {reviewScreening?.aiDisplayLabel || reviewConsult?.diagnosis || 'Pending Analysis'}
                    </span>
                    {reviewConsult?.isComorbid && reviewConsult?.secondaryDiagnosis && (
                      <span style={{ display: 'block', color: '#7e22ce', fontSize: '0.8rem', marginTop: 2 }}>
                        + Concurrent: {reviewConsult.secondaryDiagnosis} (Comorbid)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Observed Symptoms and Notes */}
              <div style={{ marginTop: 12, padding: 10, background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.82rem', color: '#334155', display: 'block', marginBottom: 6 }}>
                  Observed Clinical Signs & Symptoms:
                </span>
                {reviewSymptoms && reviewSymptoms.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {reviewSymptoms.map((s, idx) => (
                      <span
                        key={idx}
                        style={{
                          background: '#e0f2fe',
                          color: '#0369a1',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: '0.76rem',
                          fontWeight: 500,
                          border: '1px solid #bae6fd',
                        }}
                      >
                        {s.customDescription ? `Other: ${s.customDescription}` : s.symptomId.replace('SYM-', '')}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                    {reviewConsult?.clinicalNotes || 'No specific physical symptoms itemized.'}
                  </p>
                )}
              </div>

              {/* 3. Diagnostic Status Selection */}
              <div style={{ marginTop: 12 }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b', display: 'block', marginBottom: 6 }}>
                  Clinical Triage & Action Status:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 6, fontSize: '0.82rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', background: clinicalStatus.includes('Review') && !clinicalStatus.includes('Needs') ? '#dcfce7' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Review Results"
                      checked={clinicalStatus === 'Review Results'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                    />
                    <span><strong>Review Results</strong> (High Confidence)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', background: clinicalStatus.includes('Needs') ? '#fef9c3' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Needs Vet Review"
                      checked={clinicalStatus === 'Needs Vet Review'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                    />
                    <span><strong>Needs Vet Review</strong> (Comorbid/Borderline)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', background: clinicalStatus.includes('Lab') ? '#fef3c7' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Awaiting Lab Test"
                      checked={clinicalStatus === 'Awaiting Lab Test'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                    />
                    <span><strong>Awaiting Lab Test</strong> (Skin Scrape / DTM)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 10px', background: clinicalStatus === 'Completed' ? '#dbeafe' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Completed"
                      checked={clinicalStatus === 'Completed'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                    />
                    <span><strong>Finalized & Prescribed</strong></span>
                  </label>
                </div>
              </div>

              {/* 4. Clinical Diagnosis Override / Lab Confirmation */}
              <div style={{ marginTop: 12, padding: 12, background: '#fdf4ff', border: '1px solid #f5d0fe', borderRadius: 8 }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.84rem', color: '#86198f', display: 'block', marginBottom: 4 }}>
                  Verified Diagnosis / Clinical Override:
                </span>
                <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#581c87' }}>
                  If laboratory diagnostics (skin scrape / cytology) or clinician examination differs from the initial scan, select verified condition:
                </p>
                <select
                  value={overrideDiag}
                  onChange={(e) => setOverrideDiag(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #d946ef', fontSize: '0.85rem' }}
                >
                  <option value="">-- Keep Current Diagnosis ({reviewConsult?.diagnosis || reviewPatient.areaOfConcern}) --</option>
                  {CLINICAL_DIAGNOSES.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  <option value="OTHER">Other / Custom Dermatological Condition...</option>
                </select>

                {overrideDiag === 'OTHER' && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#701a75' }}>
                      Enter Confirmed Custom Diagnosis:
                    </span>
                    <input
                      type="text"
                      required
                      value={customDiag}
                      onChange={(e) => setCustomDiag(e.target.value)}
                      placeholder="e.g. Canine Papillomavirus / Pemphigus / Deep Abscess"
                      style={{ width: '100%', padding: '7px 10px', fontSize: '0.85rem', borderRadius: 6, border: '2px solid #a855f7', marginTop: 4, boxSizing: 'border-box' }}
                    />
                  </div>
                )}

                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#701a75' }}>
                    Laboratory Findings & Differential Notes:
                  </span>
                  <input
                    type="text"
                    value={labNotes}
                    onChange={(e) => setLabNotes(e.target.value)}
                    placeholder="e.g. Skin scraping negative for mites; DTM fungal culture pending."
                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: 6, border: '1px solid #d946ef', marginTop: 4, boxSizing: 'border-box' }}
                  />
                </label>
              </div>

              {/* Modal Actions */}
              <div className="modal-actions" style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <button className="small-outline" type="button" onClick={() => setReviewPatient(null)} disabled={isSavingReview}>
                  Cancel
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  {onProceedToTreatment && (
                    <button
                      type="button"
                      className="secondary-btn"
                      style={{ padding: '8px 14px', fontSize: '0.85rem', background: '#f8fafc', border: '1px solid #cbd5e1', fontWeight: 700 }}
                      onClick={() => {
                        const finalDiag = overrideDiag === 'OTHER'
                          ? (customDiag.trim() || 'Custom Dermatological Condition')
                          : (overrideDiag || reviewConsult?.diagnosis || 'Skin Lesion')
                        onProceedToTreatment({
                          patient: reviewPatient,
                          consultation: reviewConsult,
                          aiResult: {
                            displayLabel: finalDiag,
                            percent: reviewScreening?.aiPercent || 'Clinical Evaluation',
                            top3: reviewScreening?.aiTop3 ? JSON.parse(reviewScreening.aiTop3) : [],
                          },
                          previewUrl: reviewScreening?.imageData,
                          diagnosis: finalDiag,
                          secondaryDiagnosis: reviewConsult?.secondaryDiagnosis || null,
                          isComorbid: Boolean(reviewConsult?.isComorbid || reviewConsult?.secondaryDiagnosis),
                          assignedStatus: clinicalStatus,
                          labTestRequired: clinicalStatus === 'Awaiting Lab Test' || reviewConsult?.reviewStatus === 'awaiting_lab',
                        })
                        setReviewPatient(null)
                      }}
                    >
                      Proceed to Treatment / Rx
                    </button>
                  )}
                  <button className="action-btn blue" type="submit" disabled={isSavingReview}>
                    {isSavingReview ? 'Saving...' : 'Save Case Decisions'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {recheckPatient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recheck-patient-title">
          <div className="modal-dialog" style={{ maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }}>
            <header className="modal-header">
              <h3 id="recheck-patient-title">
                Follow-Up Recheck: {recheckPatient.name} ({recheckPatient.species})
              </h3>
              <button className="modal-close-btn" type="button" onClick={() => setRecheckPatient(null)} aria-label="Close dialog">✕</button>
            </header>

            <form className="modal-form" onSubmit={handleSaveRecheck}>
              {recheckError && <div className="alert-banner error" role="alert">{recheckError}</div>}

              {/* Chronological Visit Healing Progression */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: pastVisits.length > 1 ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr 1fr',
                gap: 14,
                marginBottom: 14,
              }}>
                {/* All Past Visits Sequentially */}
                {pastVisits.length > 0 ? (
                  pastVisits.map((v) => (
                    <div
                      key={v.visitNum}
                      style={{
                        border: '1px solid #cbd5e1',
                        borderRadius: 12,
                        padding: 10,
                        background: '#f8fafc',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>
                        {v.visitNum === 1 ? '1. Baseline (Visit 1)' : `${v.visitNum}. Prior Visit (${v.visitNum})`}
                      </div>
                      {v.screening?.imageData ? (
                        <img
                          src={v.screening.imageData}
                          alt={`Visit ${v.visitNum} lesion`}
                          style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }}
                        />
                      ) : (
                        <div style={{ width: '100%', height: 140, background: '#e2e8f0', borderRadius: 8, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '0.78rem' }}>
                          No photo recorded
                        </div>
                      )}
                      <div style={{ marginTop: 8, fontSize: '0.76rem', color: '#334155', lineHeight: 1.35 }}>
                        <strong>Diagnosis:</strong> {v.consultation?.diagnosis || 'Cutaneous check'}<br />
                        <strong>Date:</strong> {v.consultation?.createdAt?.slice(0, 10) || 'Recorded Visit'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 10, background: '#f8fafc' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>
                      1. Baseline (Visit 1)
                    </div>
                    {pastScreening?.imageData ? (
                      <img
                        src={pastScreening.imageData}
                        alt="Baseline lesion"
                        style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: 140, background: '#e2e8f0', borderRadius: 8, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: '0.78rem' }}>
                        No prior photo saved
                      </div>
                    )}
                    <div style={{ marginTop: 8, fontSize: '0.76rem', color: '#334155', lineHeight: 1.35 }}>
                      <strong>Prior Diagnosis:</strong> {pastConsult?.diagnosis || recheckPatient.areaOfConcern || 'Cutaneous check'}<br />
                      <strong>Date:</strong> {pastConsult?.createdAt?.slice(0, 10) || recheckPatient.lastVisit || 'Initial Visit'}
                    </div>
                  </div>
                )}

                {/* Recheck (Today's Photo - Visit N+1) */}
                <div style={{ border: '1px solid #86efac', borderRadius: 12, padding: 10, background: '#f0fdf4', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#166534', marginBottom: 6, textTransform: 'uppercase' }}>
                    {pastVisits.length + 1}. Today's Photo (Visit {pastVisits.length + 1})
                  </div>
                  {recheckPreview ? (
                    <div>
                      <img
                        src={recheckPreview}
                        alt="Today's recheck lesion"
                        style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8, border: '1px solid #86efac' }}
                      />
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                          }}
                          onClick={() => setIsRecheckCameraOpen(true)}
                        >
                          Retake (Camera)
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                          }}
                          onClick={() => recheckInputRef.current?.click()}
                        >
                          Upload File
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: 160,
                        border: '2px dashed #86efac',
                        borderRadius: 8,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: 10,
                        background: 'white',
                        boxSizing: 'border-box',
                      }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                        <circle cx="12" cy="13" r="4" />
                      </svg>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#166534', textAlign: 'center' }}>
                        Snap or Upload Today's Photo
                      </span>
                      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                        <button
                          type="button"
                          className="action-btn blue"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            background: '#16a34a',
                          }}
                          onClick={() => setIsRecheckCameraOpen(true)}
                        >
                          Live Camera
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{
                            flex: 1,
                            padding: '6px 8px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                          }}
                          onClick={() => recheckInputRef.current?.click()}
                        >
                          Upload File
                        </button>
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    ref={recheckInputRef}
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleRecheckFileChange}
                  />
                  <div style={{ marginTop: 8, fontSize: '0.82rem', color: '#166534' }}>
                    Recheck Date: <strong>{new Date().toISOString().slice(0, 10)}</strong>
                  </div>
                </div>
              </div>

              {/* Clinical Progress Selector */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b' }}>
                    Veterinarian Healing Stage Evaluation:
                  </span>
                  {currentUser?.role === 'Clinic Staff' && (
                    <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                      Restricted to Veterinarian
                    </span>
                  )}
                </div>

                {currentUser?.role === 'Clinic Staff' && (
                  <div style={{ padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, color: '#92400e', fontSize: '0.78rem', marginBottom: 8 }}>
                    Staff Notice: Healing stage certification is legally restricted to the attending veterinarian. Clinic staff may record follow-up lesion photos and physical vitals.
                  </div>
                )}

                <div style={{ display: 'grid', gap: 6, fontSize: '0.85rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: currentUser?.role === 'Clinic Staff' ? 'not-allowed' : 'pointer', padding: '6px 10px', background: recheckProgress === 'resolved' ? '#dcfce7' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1', opacity: currentUser?.role === 'Clinic Staff' ? 0.75 : 1 }}>
                    <input
                      type="radio"
                      name="progress"
                      value="resolved"
                      checked={recheckProgress === 'resolved'}
                      disabled={currentUser?.role === 'Clinic Staff'}
                      onChange={(e) => setRecheckProgress(e.target.value)}
                    />
                    <span><strong>Resolved / Fully Healed</strong> — Lesion cleared, fur regrown, no active erythema</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: currentUser?.role === 'Clinic Staff' ? 'not-allowed' : 'pointer', padding: '6px 10px', background: recheckProgress === 'improving' ? '#fef9c3' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1', opacity: currentUser?.role === 'Clinic Staff' ? 0.75 : 1 }}>
                    <input
                      type="radio"
                      name="progress"
                      value="improving"
                      checked={recheckProgress === 'improving'}
                      disabled={currentUser?.role === 'Clinic Staff'}
                      onChange={(e) => setRecheckProgress(e.target.value)}
                    />
                    <span><strong>Responding / Improving</strong> — Lesion reduced by ~50–80%, healthy scabbing present</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: currentUser?.role === 'Clinic Staff' ? 'not-allowed' : 'pointer', padding: '6px 10px', background: recheckProgress === 'unchanged' ? '#fee2e2' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1', opacity: currentUser?.role === 'Clinic Staff' ? 0.75 : 1 }}>
                    <input
                      type="radio"
                      name="progress"
                      value="unchanged"
                      checked={recheckProgress === 'unchanged'}
                      disabled={currentUser?.role === 'Clinic Staff'}
                      onChange={(e) => setRecheckProgress(e.target.value)}
                    />
                    <span><strong>Refractory / Unchanged</strong> — No clinical response; alternative medication indicated</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: currentUser?.role === 'Clinic Staff' ? 'not-allowed' : 'pointer', padding: '6px 10px', background: recheckProgress === 'new_complication' ? '#f3e8ff' : '#f8fafc', borderRadius: 6, border: '1px solid #cbd5e1', opacity: currentUser?.role === 'Clinic Staff' ? 0.75 : 1 }}>
                    <input
                      type="radio"
                      name="progress"
                      value="new_complication"
                      checked={recheckProgress === 'new_complication'}
                      disabled={currentUser?.role === 'Clinic Staff'}
                      onChange={(e) => setRecheckProgress(e.target.value)}
                    />
                    <span><strong>Suspected New Complication</strong> — Secondary infection or new separate lesion detected</span>
                  </label>
                </div>
              </div>

              {/* Clinical Notes */}
              <label>
                <span>Follow-Up Clinical Notes</span>
                <textarea
                  value={recheckNotes}
                  onChange={(e) => setRecheckNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Day 14 Recheck: Pruritus subsided, 70% hair regrowth on flank. Tapering shampoo to once weekly..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }}
                />
              </label>

              <div className="modal-actions" style={{ marginTop: 14 }}>
                <button className="small-outline" type="button" onClick={() => setRecheckPatient(null)} disabled={isSavingRecheck}>Cancel</button>
                <button className="primary-btn" type="submit" disabled={isSavingRecheck}>
                  {isSavingRecheck ? 'Saving...' : 'Save Follow-Up Recheck'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recheck Live Camera Modal */}
      <CameraCaptureModal
        isOpen={isRecheckCameraOpen}
        onClose={() => setIsRecheckCameraOpen(false)}
        onCapture={handleRecheckCameraCapture}
        onFallbackUpload={() => recheckInputRef.current?.click()}
      />
    </section>
  )
}
