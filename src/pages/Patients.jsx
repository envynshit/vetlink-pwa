import { useEffect, useState, useRef } from 'react'
import {
  getPatients,
  mergeCloudPatients,
  updatePatient,
  deletePatient,
  archivePatient,
  restorePatient,
  logAuditEvent,
  addConsultation,
  getConsultationsByPatient,
  updateConsultation,
  addScreeningResult,
  getScreeningResultsByConsultation,
  getConsultationSymptoms
} from '../db/database'
import CameraCaptureModal from '../components/CameraCaptureModal'
import ImageCropModal from '../components/ImageCropModal'
import ImageViewerModal from '../components/ImageViewerModal'
import EmailPrescriptionModal from '../components/EmailPrescriptionModal'

const CLINICAL_DIAGNOSIS_GROUPS = {
  'Canine Protocols': [
    'Canine Mange',
    'Canine Ringworm',
    'Canine Pyoderma',
    'Canine Hot Spots',
    'Canine Healthy',
    'Mange with Secondary Pyoderma',
    'Ringworm with Secondary Pyoderma',
    'Hot Spots with Secondary Pyoderma',
  ],
  'Feline Protocols': [
    'Feline Mange',
    'Feline Ringworm',
    'Feline Pyoderma',
    'Feline Hot Spots',
    'Feline Healthy',
  ],
  'Avian Protocols': [
    'Avian Fowl Pox',
    'Scaly Face / Leg Mite',
    'Healthy (Bird)',
  ],
  'Rabbit Protocols': [
    'Rabbit Mange',
    'Rabbit Ringworm',
    'Healthy (Rabbit)',
  ],
}

export default function Patients({ authToken, apiBaseUrl = 'http://localhost:8000', isOffline = false, currentUser, onProceedToTreatment }) {

  const roleStr = String(currentUser?.role || '').toLowerCase().trim()
  const isStaff = roleStr.includes('staff') || roleStr === 'clinic staff'
  const isVetOrAdmin = !isStaff

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
  const [reviewTreatmentPlan, setReviewTreatmentPlan] = useState('')
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
  const [recheckCropOpen, setRecheckCropOpen]           = useState(false)
  const [recheckFileToCrop, setRecheckFileToCrop]       = useState(null)
  const recheckInputRef                                 = useRef(null)

  // Soft-Delete / Recycle Bin & Role-Based Recheck State
  const [viewTab, setViewTab]                           = useState('active') // 'active' | 'archived'
  const [staffRecheckWeight, setStaffRecheckWeight]     = useState('')
  const [staffRecheckVitals, setStaffRecheckVitals]     = useState('')
  const [vetAdjustedRx, setVetAdjustedRx]               = useState('')
  const [recheckTab, setRecheckTab]                     = useState('evaluate') // 'evaluate' | 'history'
  const [activeViewerImage, setActiveViewerImage]       = useState(null)
  const [emailRxModalData, setEmailRxModalData]         = useState(null)

  const handleOpenEmailRx = async (patient, specificConsult = null) => {
    try {
      let consult = specificConsult
      if (!consult) {
        const consults = await getConsultationsByPatient(patient.id)
        consult = consults && consults.length > 0 ? consults[consults.length - 1] : null
      }
      setEmailRxModalData({
        patient,
        consultation: consult,
        prescription: consult?.treatmentPlan || '',
        clinicalNotes: consult?.clinicalNotes || '',
        diagnosis: consult?.diagnosis || patient?.areaOfConcern || 'Cutaneous Dermatological Condition',
      })
    } catch (err) {
      console.warn('Could not load consultation for email:', err)
      setEmailRxModalData({
        patient,
        consultation: null,
        prescription: '',
        clinicalNotes: '',
        diagnosis: patient?.areaOfConcern || 'Cutaneous Dermatological Condition',
      })
    }
  }

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

    const handleSynced = () => {
      refreshPatients()
    }
    window.addEventListener('vetlink:synced', handleSynced)

    return () => {
      isMounted = false
      window.removeEventListener('vetlink:synced', handleSynced)
    }
  }, [apiBaseUrl, authToken, isOffline])

  const activeCount = patients.filter((p) => !p.isArchived && p.status !== 'Archived').length
  const archivedCount = patients.filter((p) => p.isArchived || p.status === 'Archived').length

  const visiblePatients = patients.filter((patient) => {
    const isPatientArchived = Boolean(patient.isArchived || patient.status === 'Archived')
    if (viewTab === 'active' && isPatientArchived) return false
    if (viewTab === 'archived' && !isPatientArchived) return false

    const query = searchTerm.toLowerCase().trim()
    const matchesSearch =
      !query ||
      String(patient.id || '').toLowerCase().includes(query) ||
      String(patient.name || '').toLowerCase().includes(query) ||
      String(patient.species || '').toLowerCase().includes(query) ||
      String(patient.areaOfConcern || '').toLowerCase().includes(query) ||
      String(patient.ownerName || '').toLowerCase().includes(query)

    const pSpecies = String(patient.species || '').toLowerCase()
    const matchesSpecies =
      selectedSpecies === 'All' ||
      (selectedSpecies === 'Rabbit'
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
      ownerAddress: patient.ownerAddress || '',
      ownerEmail: patient.ownerEmail || '',
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
        ownerAddress: (formData.ownerAddress || '').trim(),
        ownerEmail: (formData.ownerEmail || '').trim(),
        areaOfConcern: (formData.areaOfConcern || '').trim(),
      })
      await logAuditEvent({
        action: 'PATIENT_EDITED',
        user: currentUser,
        targetEntity: 'patients',
        targetId: editingPatient.id,
        details: `Updated demographics for patient ${formData.name.trim()} (${editingPatient.id}).`,
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

  const handleArchivePatient = async (patient) => {
    if (!window.confirm(`Move patient "${patient.name}" (${patient.id}) to Recycle Bin / Archive? You can restore this record at any time.`)) {
      return
    }
    try {
      await archivePatient(patient.id, currentUser)
      await refreshPatients()
      setSuccessMessage(`Patient ${patient.id} (${patient.name}) was moved to Recycle Bin.`)
    } catch (err) {
      console.error('Failed to archive patient:', err)
      alert('Could not archive patient: ' + (err.message || 'Unknown error'))
    }
  }

  const handleRestorePatient = async (patient) => {
    try {
      await restorePatient(patient.id, currentUser)
      await refreshPatients()
      setSuccessMessage(`Patient ${patient.id} (${patient.name}) was restored to Active Patients.`)
    } catch (err) {
      console.error('Failed to restore patient:', err)
      alert('Could not restore patient: ' + (err.message || 'Unknown error'))
    }
  }

  const handlePermanentDeletePatient = async (patient) => {
    if (!window.confirm(`PERMANENT DELETION: Are you sure you want to permanently erase patient "${patient.name}" (${patient.id}) from the database? This cannot be undone.`)) {
      return
    }
    try {
      await deletePatient(patient.id)
      await logAuditEvent({
        action: 'PATIENT_PERMANENTLY_DELETED',
        user: currentUser,
        targetEntity: 'patients',
        targetId: patient.id,
        details: `Permanently removed record for ${patient.name} (${patient.id}).`,
      })
      await refreshPatients()
      setSuccessMessage(`Patient ${patient.id} was permanently erased.`)
    } catch (err) {
      console.error('Failed to permanently delete patient:', err)
      alert('Could not delete patient record: ' + (err.message || 'Unknown error'))
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
        setReviewTreatmentPlan(latest?.treatmentPlan || '')
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
        const rawDiag = overrideDiag === 'OTHER' ? customDiag.trim() : overrideDiag.trim()
        if (rawDiag) {
          let primaryParsed = rawDiag
          let secondaryParsed = null
          if (rawDiag.toLowerCase().includes(' with ')) {
            const parts = rawDiag.split(/ with /i)
            primaryParsed = parts[0].trim()
            secondaryParsed = parts[1].trim()
          } else if (rawDiag.includes(' + ')) {
            const parts = rawDiag.split(' + ')
            primaryParsed = parts[0].trim()
            secondaryParsed = parts[1].trim()
          }
          updates.diagnosis = primaryParsed
          updates.secondaryDiagnosis = secondaryParsed
          updates.isComorbid = Boolean(secondaryParsed)
        }
        if (labNotes && labNotes.trim()) {
          const currentNotes = reviewConsult.clinicalNotes || ''
          updates.clinicalNotes = currentNotes.includes('Lab Findings:')
            ? currentNotes
            : `${currentNotes} | Lab Findings: ${labNotes.trim()}`
        }
        if (reviewTreatmentPlan !== undefined) {
          updates.treatmentPlan = reviewTreatmentPlan.trim()
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
    setStaffRecheckWeight(patient.weight || '')
    setStaffRecheckVitals('')
    setVetAdjustedRx('')
    setRecheckTab(isStaff ? 'evaluate' : 'history')
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
          } catch (err) {
            console.warn('Could not load screening for visit:', err)
          }
          loadedVisits.push({
            visitNum: i + 1,
            consultation: c,
            screening: scr,
          })
        }
        setPastVisits(loadedVisits)
        const latest = consults[consults.length - 1]
        setPastConsult(latest)
        setVetAdjustedRx(latest?.treatmentPlan || '')
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
    setRecheckFileToCrop(file)
    setRecheckCropOpen(true)
    e.target.value = ''
  }

  const handleRecheckCameraCapture = (file) => {
    if (!file) return
    setIsRecheckCameraOpen(false)
    setRecheckFileToCrop(file)
    setRecheckCropOpen(true)
  }

  const handleConfirmRecheckCrop = (croppedFile) => {
    setRecheckCropOpen(false)
    setRecheckFileToCrop(null)
    setRecheckFile(croppedFile)
    if (recheckPreview) URL.revokeObjectURL(recheckPreview)
    setRecheckPreview(URL.createObjectURL(croppedFile))
  }

  const handleUseFullRecheckImage = () => {
    setRecheckCropOpen(false)
    if (recheckFileToCrop) {
      setRecheckFile(recheckFileToCrop)
      if (recheckPreview) URL.revokeObjectURL(recheckPreview)
      setRecheckPreview(URL.createObjectURL(recheckFileToCrop))
      setRecheckFileToCrop(null)
    }
  }

  const handleSaveRecheck = async (e) => {
    e.preventDefault()
    if (!recheckPatient) return
    setIsSavingRecheck(true)
    setRecheckError('')

    // Strict Clinical Validation: Follow-up lesion image is required for accurate visual evaluation
    if (!recheckFile && !isStaff) {
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

      if (isStaff) {
        // ── STAFF INTAKE FLOW ──
        const staffNotes = `[Staff Intake & Physical Vitals] ${staffRecheckWeight ? `Weight: ${staffRecheckWeight} kg. ` : ''}${staffRecheckVitals.trim() ? `Observations: ${staffRecheckVitals.trim()}` : ''}`
        const newConsult = await addConsultation({
          patientId: recheckPatient.id,
          handledByUserId: currentUser?.id || 'STAFF',
          clinicalNotes: staffNotes,
          diagnosis: `Intake Check: ${pastConsult?.diagnosis || recheckPatient.areaOfConcern || 'Cutaneous Check'}`,
          treatmentPlan: pastConsult?.treatmentPlan || 'Awaiting attending veterinarian review.',
        })

        if (b64Img) {
          await addScreeningResult({
            consultationId: newConsult.id,
            imageData: b64Img,
            aiLabel: pastConsult?.diagnosis || 'Follow-up Lesion',
            aiDisplayLabel: `Staff Triage Photo: ${pastConsult?.diagnosis || 'Lesion'}`,
            aiConfidence: 0.90,
            aiPercent: 'Staff Intake',
            species: recheckPatient.species,
            reviewStatus: 'pending',
          })
        }

        await updatePatient(recheckPatient.id, {
          weight: staffRecheckWeight ? String(staffRecheckWeight).trim() : recheckPatient.weight,
          lastVisit: today,
          status: 'Needs Vet Review',
        })

        await logAuditEvent({
          action: 'STAFF_TRIAGE_INTAKE',
          user: currentUser,
          targetEntity: 'patients',
          targetId: recheckPatient.id,
          details: `Staff recorded triage intake for ${recheckPatient.name}. Weight: ${staffRecheckWeight || 'N/A'} kg. Status set to Needs Vet Review.`,
        })

        await refreshPatients()
        setSuccessMessage(`Staff follow-up triage and photo intake successfully saved for ${recheckPatient.name}. Ready for veterinarian review.`)
        setRecheckPatient(null)
      } else {
        // ── VETERINARIAN / ADMIN CLINICAL RECHECK FLOW ──
        const newConsult = await addConsultation({
          patientId: recheckPatient.id,
          handledByUserId: currentUser?.id || 'VET',
          clinicalNotes: `[Doctor Follow-Up: ${progressLabels[recheckProgress] || recheckProgress}] ${recheckNotes.trim()}`,
          diagnosis: recheckProgress === 'resolved'
            ? 'Healthy (Resolved)'
            : `Follow-up: ${pastConsult?.diagnosis || recheckPatient.areaOfConcern || 'Cutaneous Lesion'} (${progressLabels[recheckProgress]})`,
          treatmentPlan: recheckProgress === 'resolved'
            ? 'Clinical discharge. Lesion resolved; resume routine preventive care.'
            : (vetAdjustedRx.trim() || pastConsult?.treatmentPlan || 'Maintain ongoing therapy; recheck in 14 days.'),
        })

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

        await updatePatient(recheckPatient.id, {
          lastVisit: today,
          status: recheckProgress === 'resolved' ? 'Discharged' : 'Active',
        })

        await logAuditEvent({
          action: 'VET_RECHECK_SAVED',
          user: currentUser,
          targetEntity: 'patients',
          targetId: recheckPatient.id,
          details: `Veterinarian recorded follow-up recheck for ${recheckPatient.name}. Evaluation: ${progressLabels[recheckProgress]}.`,
        })

        await refreshPatients()
        setSuccessMessage(`Follow-up recheck consultation successfully saved for ${recheckPatient.name}.`)
        setRecheckPatient(null)
      }
    } catch (err) {
      console.error('Failed to save recheck:', err)
      setRecheckError(err.message || 'Could not save recheck consultation.')
    } finally {
      setIsSavingRecheck(false)
    }
  }

  return (
    <section className="patients-card">
      {/* Top Primary Filter Tabs: Active Patients vs Recycle Bin */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`filter-pill ${viewTab === 'active' ? 'active' : ''}`}
          onClick={() => setViewTab('active')}
          style={{ fontWeight: 700, padding: '7px 16px' }}
        >
          Active Patients ({activeCount})
        </button>
        {!isStaff && (
          <button
            type="button"
            className={`filter-pill ${viewTab === 'archived' ? 'active' : ''}`}
            onClick={() => setViewTab('archived')}
            style={{
              fontWeight: 700,
              padding: '7px 16px',
              background: viewTab === 'archived' ? '#fef3c7' : undefined,
              color: viewTab === 'archived' ? '#92400e' : undefined,
              borderColor: viewTab === 'archived' ? '#fde68a' : undefined
            }}
          >
            Recycle Bin / Archived ({archivedCount})
          </button>
        )}
      </div>

      <div className="patients-toolbar-wrap">
        <div className="patients-filter-pills" role="tablist" aria-label="Filter patients by species">
          {['All', 'Canine', 'Feline', 'Avian', 'Rabbit'].map((sp) => (
            <button
              key={sp}
              type="button"
              className={`filter-pill ${selectedSpecies === sp ? 'active' : ''}`}
              onClick={() => setSelectedSpecies(sp)}
            >
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
              <th>NAME</th>
              <th>SPECIES</th>
              <th>AREA OF CONCERN</th>
              <th>LAST VISIT</th>
              <th>AI DIAGNOSIS</th>
              <th>STATUS</th>
              <th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '32px' }}>Loading patients from local database...</td></tr>
            ) : visiblePatients.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '32px' }}>No patients found matching your search.</td></tr>
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
                        {patient.ownerName} {patient.ownerPhone ? `• ${patient.ownerPhone}` : ''} {patient.ownerAddress ? `• ${patient.ownerAddress}` : ''}
                      </span>
                    )}
                    {(patient.weight || patient.age) && (
                      <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>
                        {patient.weight ? `${patient.weight} kg` : ''} {patient.weight && patient.age ? '• ' : ''}{patient.age ? `Age: ${patient.age}` : ''}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <span className="species-pill-badge">{patient.species}</span>
                </td>
                <td>
                  <span className="patient-concern-cell" title={patient.areaOfConcern || ''}>
                    {patient.areaOfConcern || '—'}
                  </span>
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
                    {viewTab === 'archived' ? (
                      <>
                        <button
                          className="secondary-btn table-action-btn"
                          type="button"
                          onClick={() => handleRestorePatient(patient)}
                          title="Restore Patient Record"
                        >
                          Restore
                        </button>
                        {currentUser?.role === 'Clinic Admin' && (
                          <button
                            className="small-outline table-action-btn delete-pill-btn"
                            type="button"
                            onClick={() => handlePermanentDeletePatient(patient)}
                            title="Permanently Erase Patient Record"
                            style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                          >
                            Perm. Delete
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {!isStaff && (
                          <button
                            className="primary-btn table-action-btn view-case-btn"
                            type="button"
                            onClick={() => openClinicalReviewModal(patient)}
                            title="Review Clinical Case"
                          >
                            View Case
                          </button>
                        )}
                        <button
                          className="secondary-btn table-action-btn recheck-pill-btn"
                          type="button"
                          onClick={() => openRecheckModal(patient)}
                          title="Follow-up Recheck"
                        >
                          Recheck
                        </button>
                        <button
                          className="secondary-btn table-action-btn email-rx-pill-btn"
                          type="button"
                          onClick={() => handleOpenEmailRx(patient)}
                          title="Email Prescription to Pet Owner"
                          style={{
                            background: '#f0f9ff',
                            color: '#0369a1',
                            borderColor: '#bae6fd',
                            fontWeight: 600,
                          }}
                        >
                          Email Rx
                        </button>
                        <button
                          className="small-outline table-action-btn edit-pill-btn"
                          type="button"
                          onClick={() => openEditPatient(patient)}
                          title="Edit Patient Details"
                        >
                          Edit
                        </button>
                        {!isStaff && (
                          <button
                            className="small-outline table-action-btn delete-pill-btn"
                            type="button"
                            onClick={() => handleArchivePatient(patient)}
                            title="Move Patient Record to Recycle Bin"
                            style={{ color: '#f59e0b', borderColor: '#fcd34d' }}
                          >
                            Archive
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingPatient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-patient-title">
          <form
            className="modal-dialog modal-form"
            style={{
              maxWidth: 540,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              borderRadius: 10,
              background: 'var(--surface, #1e293b)',
            }}
            onSubmit={handleSavePatient}
          >
            <header className="modal-header" style={{ flexShrink: 0, padding: '14px 20px', borderBottom: '1px solid var(--border, #334155)' }}>
              <h3 id="edit-patient-title">Edit Patient Record</h3>
              <button className="modal-close-btn" type="button" onClick={() => setEditingPatient(null)} aria-label="Close edit patient dialog">✕</button>
            </header>
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    <option>Rabbit</option>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <label>
                  <span>Owner Locality / Address</span>
                  <input
                    placeholder="e.g. Brgy. San Jose, Quezon City"
                    value={formData.ownerAddress || ''}
                    onChange={(event) => setFormData({ ...formData, ownerAddress: event.target.value })}
                  />
                  <small style={{ fontSize: '0.71rem', color: '#64748b', display: 'block', marginTop: 2 }}>
                    City/Barangay level (RA 10173 compliant)
                  </small>
                </label>
                <label>
                  <span>Owner Email</span>
                  <input
                    type="email"
                    placeholder="e.g. owner@example.com"
                    value={formData.ownerEmail || ''}
                    onChange={(event) => setFormData({ ...formData, ownerEmail: event.target.value })}
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
                  <span>Status {isStaff && <small style={{ color: '#64748b' }}>(Locked - Doctor/Admin only)</small>}</span>
                  <select
                    value={formData.status}
                    onChange={(event) => setFormData({ ...formData, status: event.target.value })}
                    disabled={isStaff}
                    title={isStaff ? 'Status modification restricted to Veterinarian / Administrator' : 'Change patient status'}
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>Needs Vet Review</option>
                    <option>Awaiting Lab Test</option>
                    <option>Discharged</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="modal-actions" style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--border, #334155)', background: 'var(--surface, #1e293b)', display: 'flex', justifyContent: 'flex-end', gap: 10, margin: 0 }}>
              <button className="small-outline" type="button" onClick={() => setEditingPatient(null)} disabled={isSaving}>Cancel</button>
              <button className="action-btn blue" type="submit" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* Clinical Review & Edit Case Modal (Attending Veterinarian Review)   */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {reviewPatient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="review-patient-title">
          <form
            className="modal-dialog modal-form"
            style={{
              maxWidth: 760,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              borderRadius: 10,
              background: 'var(--surface, #1e293b)',
            }}
            onSubmit={handleSaveClinicalReview}
          >
            <header className="modal-header" style={{ flexShrink: 0, padding: '14px 20px', borderBottom: '1px solid var(--border, #334155)' }}>
              <h3 id="review-patient-title">
                Clinical Case Review: {reviewPatient.name} ({reviewPatient.species})
              </h3>
              <button className="modal-close-btn" type="button" onClick={() => setReviewPatient(null)} aria-label="Close dialog">✕</button>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviewError && <div className="alert-banner error" role="alert">{reviewError}</div>}

              {/* 1. Header Grid: Patient Info & Baseline Photo */}
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 14, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #cbd5e1' }}>
                <div>
                  {reviewScreening?.imageData ? (
                    <div
                      style={{ position: 'relative', cursor: 'zoom-in', overflow: 'hidden', borderRadius: 6 }}
                      onClick={() => setActiveViewerImage({
                        src: reviewScreening.imageData,
                        title: `${reviewPatient.name} — Baseline Lesion Scan`,
                        subtitle: `${reviewScreening.aiDisplayLabel || reviewConsult?.diagnosis || 'Clinical Scan'} • ${reviewPatient.species || 'Animal'} • Tap to inspect / zoom`,
                      })}
                      title="Click to inspect lesion image (Zoom & Pan)"
                    >
                      <img
                        src={reviewScreening.imageData}
                        alt="Lesion Photo"
                        style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6, border: '1px solid #94a3b8', display: 'block', transition: 'transform 0.2s ease' }}
                      />
                      <div style={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        background: 'rgba(15, 23, 42, 0.8)',
                        color: '#f8fafc',
                        fontSize: '0.68rem',
                        padding: '3px 7px',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontWeight: 600,
                        backdropFilter: 'blur(4px)',
                      }}>
                        Inspect Photo
                      </div>
                    </div>
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
                      <div>
                        <strong>Owner:</strong> {reviewPatient.ownerName}
                        {reviewPatient.ownerPhone ? ` (${reviewPatient.ownerPhone})` : ''}
                      </div>
                      {reviewPatient.ownerAddress && (
                        <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                          <strong>Locality:</strong> {reviewPatient.ownerAddress}
                        </div>
                      )}
                      {reviewPatient.ownerEmail && (
                        <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                          <strong>Email:</strong> {reviewPatient.ownerEmail}
                        </div>
                      )}
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

              {/* 3. Diagnostic Status Selection (Balanced 2x2 Grid) */}
              <div style={{ marginTop: 12 }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b', display: 'block', marginBottom: 6 }}>
                  Clinical Triage & Action Status:
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, fontSize: '0.82rem' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      background: clinicalStatus === 'Review Results' ? '#dcfce7' : '#f0fdf4',
                      borderRadius: 6,
                      border: clinicalStatus === 'Review Results' ? '2px solid #16a34a' : '1px solid #86efac',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Review Results"
                      checked={clinicalStatus === 'Review Results'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                      style={{ display: 'none' }}
                    />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: clinicalStatus === 'Review Results' ? '#16a34a' : '#86efac',
                        flexShrink: 0,
                      }}
                    />
                    <span><strong style={{ color: '#166534' }}>Review Results</strong> (High Confidence)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      background: clinicalStatus === 'Needs Vet Review' ? '#fef9c3' : '#fefce8',
                      borderRadius: 6,
                      border: clinicalStatus === 'Needs Vet Review' ? '2px solid #ca8a04' : '1px solid #fde047',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Needs Vet Review"
                      checked={clinicalStatus === 'Needs Vet Review'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                      style={{ display: 'none' }}
                    />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: clinicalStatus === 'Needs Vet Review' ? '#ca8a04' : '#fde047',
                        flexShrink: 0,
                      }}
                    />
                    <span><strong style={{ color: '#854d0e' }}>Needs Vet Review</strong> (Borderline)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      background: clinicalStatus === 'Awaiting Lab Test' ? '#ffedd5' : '#fff7ed',
                      borderRadius: 6,
                      border: clinicalStatus === 'Awaiting Lab Test' ? '2px solid #ea580c' : '1px solid #fdba74',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Awaiting Lab Test"
                      checked={clinicalStatus === 'Awaiting Lab Test'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                      style={{ display: 'none' }}
                    />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: clinicalStatus === 'Awaiting Lab Test' ? '#ea580c' : '#fdba74',
                        flexShrink: 0,
                      }}
                    />
                    <span><strong style={{ color: '#9a3412' }}>Awaiting Lab Test</strong> (Skin Scrape / DTM)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      padding: '8px 12px',
                      background: clinicalStatus === 'Completed' ? '#dbeafe' : '#eff6ff',
                      borderRadius: 6,
                      border: clinicalStatus === 'Completed' ? '2px solid #2563eb' : '1px solid #bfdbfe',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="clinicalStatus"
                      value="Completed"
                      checked={clinicalStatus === 'Completed'}
                      onChange={(e) => setClinicalStatus(e.target.value)}
                      style={{ display: 'none' }}
                    />
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: clinicalStatus === 'Completed' ? '#2563eb' : '#bfdbfe',
                        flexShrink: 0,
                      }}
                    />
                    <span><strong style={{ color: '#1e40af' }}>Finalized & Prescribed</strong></span>
                  </label>
                </div>
              </div>

              {/* 4. Clinical Diagnosis Override / Lab Confirmation (Grouped Optgroups) */}
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
                  {Object.entries(CLINICAL_DIAGNOSIS_GROUPS).map(([group, diagnoses]) => (
                    <optgroup key={group} label={group}>
                      {diagnoses.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </optgroup>
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
                      placeholder="e.g. Feline Chin Acne / Malassezia Yeast / Canine Papillomavirus"
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

              {/* 5. Recommended Treatment Protocol & Prescription (Editable by Attending Veterinarian) */}
              <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.84rem', color: '#0f172a' }}>
                    Recommended Treatment Protocol & Prescription:
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Editable by Attending Veterinarian
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={reviewTreatmentPlan}
                  onChange={(e) => setReviewTreatmentPlan(e.target.value)}
                  placeholder="Enter customized pharmacological dosage, oral/topical medications, and clinical therapy instructions..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    fontFamily: 'Consolas, monospace',
                    boxSizing: 'border-box',
                    lineHeight: 1.4,
                  }}
                />
              </div>
            </div>

            {/* Modal Actions (Solid Non-Floating Footer) */}
            <div className="modal-actions" style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--border, #334155)', background: 'var(--surface, #1e293b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
              <button className="small-outline" type="button" onClick={() => setReviewPatient(null)} disabled={isSavingReview}>
                Cancel
              </button>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {onProceedToTreatment && (
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ padding: '8px 14px', fontSize: '0.85rem', fontWeight: 700 }}
                    onClick={() => {
                      const rawDiag = overrideDiag === 'OTHER'
                        ? (customDiag.trim() || 'Custom Dermatological Condition')
                        : (overrideDiag || reviewConsult?.diagnosis || 'Skin Lesion')

                      let primaryParsed = rawDiag
                      let secondaryParsed = null

                      if (rawDiag.toLowerCase().includes(' with ')) {
                        const parts = rawDiag.split(/ with /i)
                        primaryParsed = parts[0].trim()
                        secondaryParsed = parts[1].trim()
                      } else if (rawDiag.includes(' + ')) {
                        const parts = rawDiag.split(' + ')
                        primaryParsed = parts[0].trim()
                        secondaryParsed = parts[1].trim()
                      } else if (overrideDiag) {
                        // Doctor overridden to specific single condition -> purge stale AI secondary condition!
                        secondaryParsed = null
                      } else {
                        secondaryParsed = reviewConsult?.secondaryDiagnosis || null
                      }

                      onProceedToTreatment({
                        patient: reviewPatient,
                        consultation: reviewConsult,
                        aiResult: {
                          displayLabel: primaryParsed,
                          percent: reviewScreening?.aiPercent || 'Clinical Evaluation',
                          top3: reviewScreening?.aiTop3 ? JSON.parse(reviewScreening.aiTop3) : [],
                        },
                        previewUrl: reviewScreening?.imageData,
                        diagnosis: primaryParsed,
                        secondaryDiagnosis: secondaryParsed,
                        isComorbid: Boolean(secondaryParsed),
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
      )}

      {recheckPatient && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recheck-patient-title">
          <div
            className="modal-dialog"
            style={{
              maxWidth: 760,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflow: 'hidden',
              borderRadius: 10,
              background: 'var(--surface, #1e293b)',
            }}
          >
            <header className="modal-header" style={{ flexShrink: 0, padding: '14px 20px', borderBottom: '1px solid var(--border, #334155)' }}>
              <h3 id="recheck-patient-title">
                {isStaff
                  ? `Staff Patient Intake & Triage: ${recheckPatient.name} (${recheckPatient.id})`
                  : `Clinical Follow-Up & History: ${recheckPatient.name} (${recheckPatient.id})`}
              </h3>
              <button className="modal-close-btn" type="button" onClick={() => setRecheckPatient(null)} aria-label="Close dialog">✕</button>
            </header>

            {/* Demographics & Tabs Container (Anchored at Top) */}
            <div style={{ flexShrink: 0, padding: '12px 20px 8px', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
              {/* Demographics Summary Bar */}
              <div style={{
                display: 'flex',
                gap: 12,
                padding: '6px 10px',
                background: '#f1f5f9',
                borderRadius: 6,
                fontSize: '0.80rem',
                color: '#334155',
                marginBottom: 8,
                flexWrap: 'wrap'
              }}>
                <span><strong>Species:</strong> {recheckPatient.species} ({recheckPatient.breed || 'Mixed'})</span>
                <span><strong>Age:</strong> {recheckPatient.age || '—'}</span>
                <span><strong>Last Recorded Weight:</strong> {recheckPatient.weight ? `${recheckPatient.weight} kg` : 'Not recorded'}</span>
                {recheckPatient.ownerName && (
                  <span><strong>Owner:</strong> {recheckPatient.ownerName} {recheckPatient.ownerPhone ? `(${recheckPatient.ownerPhone})` : ''}</span>
                )}
              </div>

              {/* If Veterinarian / Admin: Show Sub-Tabs for History Timeline vs Clinical Evaluation */}
              {!isStaff && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className={`filter-pill ${recheckTab === 'history' ? 'active' : ''}`}
                    onClick={() => setRecheckTab('history')}
                    style={{ fontWeight: 600, fontSize: '0.82rem' }}
                  >
                    Medical Record History ({pastVisits.length} visits)
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${recheckTab === 'evaluate' ? 'active' : ''}`}
                    onClick={() => setRecheckTab('evaluate')}
                    style={{ fontWeight: 600, fontSize: '0.82rem' }}
                  >
                    Evaluate Today's Recheck & Prescription
                  </button>
                </div>
              )}
            </div>

            {/* Tab 1: Comprehensive Medical Record History Timeline (Veterinarian View) */}
            {!isStaff && recheckTab === 'history' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {pastVisits.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                      No previous consultation records found for this patient.
                    </div>
                  ) : (
                    pastVisits.map((v) => (
                      <div
                        key={v.visitNum}
                        style={{
                          border: '1px solid #cbd5e1',
                          borderRadius: 10,
                          padding: 14,
                        background: '#ffffff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                        <span style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.88rem' }}>
                          Visit #{v.visitNum} &bull; {v.consultation?.createdAt?.slice(0, 10) || 'Recorded Visit'}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
                          Attending Doctor / Staff: <strong>{v.consultation?.handledByUserId || 'Clinic Staff'}</strong>
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: v.screening?.imageData ? '120px 1fr' : '1fr', gap: 12 }}>
                        {v.screening?.imageData && (
                          <div
                            style={{ position: 'relative', cursor: 'zoom-in', overflow: 'hidden', borderRadius: 6, width: 120, height: 110 }}
                            onClick={() => setActiveViewerImage({
                              src: v.screening.imageData,
                              title: `${recheckPatient?.name || 'Patient'} — Visit #${v.visitNum} Lesion Scan`,
                              subtitle: `Diagnosis: ${v.consultation?.diagnosis || 'Clinical Check'} • ${v.consultation?.createdAt?.slice(0, 10) || 'Past Visit'}`,
                            })}
                            title="Click to view & zoom visit lesion"
                          >
                            <img
                              src={v.screening.imageData}
                              alt={`Visit ${v.visitNum} lesion`}
                              style={{ width: 120, height: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1', display: 'block' }}
                            />
                            <div style={{
                              position: 'absolute',
                              bottom: 3,
                              right: 3,
                              background: 'rgba(15, 23, 42, 0.8)',
                              color: '#f8fafc',
                              fontSize: '0.62rem',
                              padding: '2px 5px',
                              borderRadius: 4,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                              fontWeight: 600,
                              backdropFilter: 'blur(4px)',
                            }}>
                              Inspect Photo
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: '0.84rem', lineHeight: 1.45, color: '#1e293b' }}>
                          <div style={{ marginBottom: 4 }}>
                            <strong>Diagnosis:</strong> <span style={{ color: '#0369a1', fontWeight: 600 }}>{v.consultation?.diagnosis || 'Cutaneous Check'}</span>
                            {v.consultation?.secondaryDiagnosis && (
                              <span style={{ color: '#854d0e', marginLeft: 6 }}>({v.consultation.secondaryDiagnosis})</span>
                            )}
                          </div>
                          {v.consultation?.clinicalNotes && (
                            <div style={{ marginBottom: 4 }}>
                              <strong>Clinical Notes:</strong> {v.consultation.clinicalNotes}
                            </div>
                          )}
                          {v.consultation?.treatmentPlan && (
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: 6, marginTop: 4, color: '#166534', fontSize: '0.8rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1 }}>
                                  <strong>Prescription / Regimen:</strong> {v.consultation.treatmentPlan}
                                </div>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  style={{ padding: '3px 8px', fontSize: '0.72rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  onClick={() => {
                                    setEmailRxModalData({
                                      patient: recheckPatient,
                                      consultation: v.consultation,
                                      prescription: v.consultation.treatmentPlan,
                                      clinicalNotes: v.consultation.clinicalNotes || '',
                                      diagnosis: v.consultation.diagnosis || recheckPatient?.areaOfConcern || 'Follow-up Recheck',
                                    })
                                  }}
                                  title="Email this visit's prescription to owner"
                                >
                                  Email Rx
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                </div>
                <div className="modal-actions" style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--border, #334155)', background: 'var(--surface, #1e293b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                  <button className="small-outline" type="button" onClick={() => setRecheckPatient(null)}>Close</button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => setRecheckTab('evaluate')}
                    style={{ padding: '8px 18px', fontSize: '0.86rem' }}
                  >
                    Proceed to Recheck Evaluation &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Recheck Form (Staff Intake OR Veterinarian Evaluation) */}
            {(isStaff || recheckTab === 'evaluate') && (
              <form style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', margin: 0 }} onSubmit={handleSaveRecheck}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recheckError && <div className="alert-banner error" role="alert">{recheckError}</div>}

                {/* Staff-Specific Triage Section */}
                {isStaff && (
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: 12, borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.88rem', marginBottom: 6 }}>
                      Clinic Staff Triage Intake
                    </div>
                    <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#3b82f6', lineHeight: 1.4 }}>
                      Record the patient's current physical weight and triage observations. Certified prescription changes and clinical discharge are legally reserved for the veterinarian.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                      <label>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>Current Weight (kg)</span>
                        <input
                          type="text"
                          value={staffRecheckWeight}
                          onChange={(e) => setStaffRecheckWeight(e.target.value)}
                          placeholder="e.g. 5.8"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                        />
                      </label>
                      <label>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>Triage Physical Observations</span>
                        <input
                          type="text"
                          value={staffRecheckVitals}
                          onChange={(e) => setStaffRecheckVitals(e.target.value)}
                          placeholder="e.g. Less itching, eating normally, active demeanor"
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Chronological Photo Comparison */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: pastVisits.length > 1 ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr 1fr',
                  gap: 14,
                  marginBottom: 14,
                }}>
                  {/* Prior Visit Photo */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 10, background: '#f8fafc' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#475569', marginBottom: 6, textTransform: 'uppercase' }}>
                      Prior Visit Lesion
                    </div>
                    {pastScreening?.imageData ? (
                      <div
                        style={{ position: 'relative', cursor: 'zoom-in', overflow: 'hidden', borderRadius: 8 }}
                        onClick={() => setActiveViewerImage({
                          src: pastScreening.imageData,
                          title: `${recheckPatient.name} — Prior Visit Lesion`,
                          subtitle: `Prior Diagnosis: ${pastConsult?.diagnosis || recheckPatient.areaOfConcern || 'Cutaneous check'} • Date: ${pastConsult?.createdAt?.slice(0, 10) || recheckPatient.lastVisit || 'Initial Visit'}`,
                        })}
                        title="Click to inspect prior visit lesion (Zoom & Pan)"
                      >
                        <img
                          src={pastScreening.imageData}
                          alt="Prior visit lesion"
                          style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1', display: 'block' }}
                        />
                        <div style={{
                          position: 'absolute',
                          bottom: 4,
                          right: 4,
                          background: 'rgba(15, 23, 42, 0.8)',
                          color: '#f8fafc',
                          fontSize: '0.68rem',
                          padding: '3px 7px',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontWeight: 600,
                          backdropFilter: 'blur(4px)',
                        }}>
                          Inspect Photo
                        </div>
                      </div>
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

                  {/* Today's Photo */}
                  <div style={{ border: '1px solid #86efac', borderRadius: 12, padding: 10, background: '#f0fdf4', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#166534', marginBottom: 6, textTransform: 'uppercase' }}>
                      Today's Follow-up Photo
                    </div>
                    {recheckPreview ? (
                      <div>
                        <div
                          style={{ position: 'relative', cursor: 'zoom-in', overflow: 'hidden', borderRadius: 8 }}
                          onClick={() => setActiveViewerImage({
                            src: recheckPreview,
                            title: `${recheckPatient.name} — Today's Follow-up Lesion`,
                            subtitle: `Recheck Date: ${new Date().toISOString().slice(0, 10)} • Progress: ${recheckProgress}`,
                          })}
                          title="Click to inspect today's photo (Zoom & Pan)"
                        >
                          <img
                            src={recheckPreview}
                            alt="Today's recheck lesion"
                            style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 8, border: '1px solid #86efac', display: 'block' }}
                          />
                          <div style={{
                            position: 'absolute',
                            bottom: 4,
                            right: 4,
                            background: 'rgba(15, 23, 42, 0.8)',
                            color: '#f8fafc',
                            fontSize: '0.68rem',
                            padding: '3px 7px',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                            backdropFilter: 'blur(4px)',
                          }}>
                            Inspect Photo
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ flex: 1, padding: '5px 8px', fontSize: '0.74rem' }}
                            onClick={() => setIsRecheckCameraOpen(true)}
                          >
                            Retake Camera
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ flex: 1, padding: '5px 8px', fontSize: '0.74rem' }}
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
                          height: 150,
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
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#166534', textAlign: 'center' }}>
                          Capture or Upload Today's Photo
                        </span>
                        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                          <button
                            type="button"
                            className="action-btn blue"
                            style={{ flex: 1, padding: '6px 8px', fontSize: '0.75rem', background: '#16a34a' }}
                            onClick={() => setIsRecheckCameraOpen(true)}
                          >
                            Live Camera
                          </button>
                          <button
                            type="button"
                            className="secondary-btn"
                            style={{ flex: 1, padding: '6px 8px', fontSize: '0.75rem' }}
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
                      style={{ display: 'none' }}
                      onChange={handleRecheckFileChange}
                    />
                    <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#166534' }}>
                      Recheck Date: <strong>{new Date().toISOString().slice(0, 10)}</strong>
                    </div>
                  </div>
                </div>

                {/* Veterinarian Healing Stage & Rx Section (Hidden for Staff) */}
                {!isStaff && (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b', display: 'block', marginBottom: 6 }}>
                        Attending Veterinarian Healing Stage Evaluation:
                      </span>
                      <div style={{ display: 'grid', gap: 8, fontSize: '0.84rem' }}>
                        {/* 1. Green: Resolved / Healed */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            padding: '10px 14px',
                            background: recheckProgress === 'resolved' ? '#dcfce7' : '#f0fdf4',
                            borderRadius: 8,
                            border: recheckProgress === 'resolved' ? '2px solid #16a34a' : '1px solid #86efac',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="radio"
                            name="progress"
                            value="resolved"
                            checked={recheckProgress === 'resolved'}
                            onChange={(e) => setRecheckProgress(e.target.value)}
                            style={{ display: 'none' }}
                          />
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: recheckProgress === 'resolved' ? '#16a34a' : '#86efac',
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <strong style={{ color: '#15803d', display: 'block' }}>RESOLVED / FULLY HEALED</strong>
                            <span style={{ color: '#166534', fontSize: '0.78rem' }}>Lesion cleared, fur regrown, discharge patient</span>
                          </div>
                        </label>

                        {/* 2. Yellow/Light Green: Responding / Improving */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            padding: '10px 14px',
                            background: recheckProgress === 'improving' ? '#fef9c3' : '#fefce8',
                            borderRadius: 8,
                            border: recheckProgress === 'improving' ? '2px solid #ca8a04' : '1px solid #fde047',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="radio"
                            name="progress"
                            value="improving"
                            checked={recheckProgress === 'improving'}
                            onChange={(e) => setRecheckProgress(e.target.value)}
                            style={{ display: 'none' }}
                          />
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: recheckProgress === 'improving' ? '#ca8a04' : '#fde047',
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <strong style={{ color: '#854d0e', display: 'block' }}>RESPONDING / IMPROVING</strong>
                            <span style={{ color: '#713f12', fontSize: '0.78rem' }}>Lesion significantly reduced; continue ongoing therapy</span>
                          </div>
                        </label>

                        {/* 3. Orange: Refractory / Unchanged */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            padding: '10px 14px',
                            background: recheckProgress === 'unchanged' ? '#ffedd5' : '#fff7ed',
                            borderRadius: 8,
                            border: recheckProgress === 'unchanged' ? '2px solid #ea580c' : '1px solid #fdba74',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="radio"
                            name="progress"
                            value="unchanged"
                            checked={recheckProgress === 'unchanged'}
                            onChange={(e) => setRecheckProgress(e.target.value)}
                            style={{ display: 'none' }}
                          />
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: recheckProgress === 'unchanged' ? '#ea580c' : '#fdba74',
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <strong style={{ color: '#9a3412', display: 'block' }}>REFRACTORY / UNCHANGED</strong>
                            <span style={{ color: '#7c2d12', fontSize: '0.78rem' }}>No clinical response; adjust prescription or therapy protocol</span>
                          </div>
                        </label>

                        {/* 4. Red: Suspected New Complication */}
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            padding: '10px 14px',
                            background: recheckProgress === 'new_complication' ? '#fee2e2' : '#fef2f2',
                            borderRadius: 8,
                            border: recheckProgress === 'new_complication' ? '2px solid #dc2626' : '1px solid #fca5a5',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="radio"
                            name="progress"
                            value="new_complication"
                            checked={recheckProgress === 'new_complication'}
                            onChange={(e) => setRecheckProgress(e.target.value)}
                            style={{ display: 'none' }}
                          />
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: '50%',
                              background: recheckProgress === 'new_complication' ? '#dc2626' : '#fca5a5',
                              flexShrink: 0,
                            }}
                          />
                          <div>
                            <strong style={{ color: '#991b1b', display: 'block' }}>SUSPECTED NEW COMPLICATION</strong>
                            <span style={{ color: '#7f1d1d', fontSize: '0.78rem' }}>Secondary opportunistic infection or new separate lesion detected</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Adjusted Treatment Plan / Prescription */}
                    <label style={{ marginBottom: 10, display: 'block' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Adjusted Prescription / Treatment Plan</span>
                      <textarea
                        value={vetAdjustedRx}
                        onChange={(e) => setVetAdjustedRx(e.target.value)}
                        rows={2}
                        placeholder="e.g. Continue Cephalexin 500mg BID for 7 more days. Taper medicated bath to once weekly..."
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                      />
                    </label>

                    {/* Clinical Notes */}
                    <label style={{ marginBottom: 14, display: 'block' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>Doctor's Progression Notes</span>
                      <textarea
                        value={recheckNotes}
                        onChange={(e) => setRecheckNotes(e.target.value)}
                        rows={2}
                        placeholder="e.g. Day 14 Follow-up: Significant reduction in erythema. Crusts sloughing off..."
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', boxSizing: 'border-box' }}
                      />
                    </label>
                  </>
                )}
                </div>

                <div className="modal-actions" style={{ flexShrink: 0, padding: '12px 20px', borderTop: '1px solid var(--border, #334155)', background: 'var(--surface, #1e293b)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
                  <button className="small-outline" type="button" onClick={() => setRecheckPatient(null)} disabled={isSavingRecheck}>Cancel</button>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {!isStaff && onProceedToTreatment && (
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          onProceedToTreatment({
                            patient: recheckPatient,
                            consultation: pastConsult,
                            diagnosis: pastConsult?.diagnosis || recheckPatient.areaOfConcern || 'Cutaneous Lesion',
                            treatmentPlan: vetAdjustedRx || pastConsult?.treatmentPlan,
                          })
                          setRecheckPatient(null)
                        }}
                      >
                        Open Full Rx Protocol Editor
                      </button>
                    )}
                    <button className="primary-btn" type="submit" disabled={isSavingRecheck}>
                      {isSavingRecheck
                        ? 'Saving...'
                        : isStaff
                          ? 'Save Staff Triage & Upload Photo'
                          : 'Save Follow-Up Consultation'}
                    </button>
                  </div>
                </div>
              </form>
            )}
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

      {/* Recheck Lesion Crop & Zoom Modal */}
      <ImageCropModal
        isOpen={recheckCropOpen}
        file={recheckFileToCrop}
        onClose={() => {
          setRecheckCropOpen(false)
          setRecheckFileToCrop(null)
        }}
        onConfirmCrop={handleConfirmRecheckCrop}
        onUseFullImage={handleUseFullRecheckImage}
      />

      {/* Clinical High-Resolution Lesion Image Zoom & Pan Inspection Lightbox */}
      <ImageViewerModal
        isOpen={Boolean(activeViewerImage)}
        src={activeViewerImage?.src}
        title={activeViewerImage?.title}
        subtitle={activeViewerImage?.subtitle}
        onClose={() => setActiveViewerImage(null)}
      />

      {/* Send Prescription to Pet Owner Modal */}
      {emailRxModalData && (
        <EmailPrescriptionModal
          isOpen={Boolean(emailRxModalData)}
          onClose={() => setEmailRxModalData(null)}
          patient={emailRxModalData.patient}
          consultation={emailRxModalData.consultation}
          prescription={emailRxModalData.prescription}
          clinicalNotes={emailRxModalData.clinicalNotes}
          diagnosis={emailRxModalData.diagnosis}
          doctorName={currentUser?.name ? (currentUser.name.startsWith('Dr.') ? currentUser.name : `Dr. ${currentUser.name}`) : 'Attending Veterinarian'}
          prcLicense={currentUser?.prcLicense || ''}
          ptrNumber={currentUser?.ptrNumber || ''}
          currentUser={currentUser}
          authToken={authToken}
          apiBaseUrl={apiBaseUrl}
          onPrescriptionSent={(newEmail) => {
            refreshPatients()
            setSuccessMessage(`Prescription successfully emailed to ${newEmail} for ${emailRxModalData.patient?.name || 'patient'}.`)
          }}
        />
      )}
    </section>
  )
}
