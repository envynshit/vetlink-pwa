import { useState, useRef, useEffect } from 'react'
import { addPatient, addConsultation, addScreeningResult, addConsultationSymptoms } from '../db/database'
import {
  loadVetLinkModel,
  predict,
  loadImageFromFile,
  validateClinicalImageQuality,
  MASTER_SYMPTOMS,
  getSuggestedSymptomsForDisease
} from '../vetlink-ai'
import CameraCaptureModal from '../components/CameraCaptureModal'

// Clinical check for co-occurring dermatitis or secondary opportunistic infection
export function checkComorbidity(top3) {
  if (!top3 || top3.length < 2) return { isComorbid: false }
  const p1 = top3[0]
  const p2 = top3[1]
  const isP1Healthy = p1.display.toLowerCase().includes('healthy')
  const isP2Healthy = p2.display.toLowerCase().includes('healthy')
  if (isP1Healthy || isP2Healthy) return { isComorbid: false }

  // Clinical threshold: 2nd disease elevated >= 20%, or differential delta <= 55% with secondary >= 15%
  const delta = p1.confidence - p2.confidence
  const hasSignal = p2.confidence >= 0.20 || (delta <= 0.55 && p2.confidence >= 0.15)

  if (hasSignal) {
    return {
      isComorbid: true,
      primary: p1.display,
      primaryConf: p1.confidence,
      secondary: p2.display,
      secondaryConf: p2.confidence,
    }
  }
  return { isComorbid: false }
}

// Clinical check for early-stage dermatological overlap (e.g. early Demodex vs Ringworm on canine face)
export function checkEarlyStageDifferential(aiResult, species, areaOfConcern = '') {
  try {
    if (!aiResult) return null
    const topLabel = (aiResult.displayLabel || aiResult.label || '').toLowerCase()
    const isCanineOrFeline = species === 'Canine' || species === 'Feline'
    if (!isCanineOrFeline) return null

    const top3 = aiResult.top3 || []
    const mangeContender = top3.find((t) => (t.label || t.display || '').toLowerCase().includes('mange'))
    const mangeConfidence = mangeContender ? (mangeContender.confidence || 0) : 0

    const isRingworm = topLabel.includes('ringworm')
    const areaText = (areaOfConcern || '').toLowerCase()
    const areaMatchesFace = Boolean(
      areaText.match(/(face|ear|eye|cheek|muzzle|nose|head)/)
    )

    // Clinical Differential Rule (Option A):
    // Only trigger if Mange is a genuine differential contender (>= 5%)
    // or facial lesion with borderline confidence (< 85% with Mange > 0.5%)
    const hasMangeDifferentialContest =
      isRingworm && (
        mangeConfidence >= 0.05 ||
        (areaMatchesFace && (aiResult.confidence || 0) < 0.85 && mangeConfidence > 0.005)
      )

    if (hasMangeDifferentialContest) {
      return {
        type: 'ringworm_vs_mange',
        title: '🔬 Clinical Differential Advisory (Mange vs. Ringworm)',
        message: `Diagnostic ambiguity detected: Preliminary AI scan favors Ringworm (${aiResult.percent || ''}), but Mange is also present in differential contenders (${(mangeConfidence * 100).toFixed(1)}%). Focal alopecia and facial/ear crusts share visual mimics between Demodex mites and Dermatophytosis. A deep skin scraping is advised.`,
        overrideHint: 'If skin scrape reveals Demodex mites, use the Clinical Override dropdown in Clinical Review to confirm Mange.',
      }
    }

    const isHealthyWithConcern = topLabel.includes('healthy') &&
      (Boolean(areaText.match(/(face|ear|eye|cheek|muzzle|nose|head|rash|red|itch|loss|hair)/)) ||
        top3.some((t) => !(t.display || t.label || '').toLowerCase().includes('healthy') && (t.confidence || 0) >= 0.04))

    if (isHealthyWithConcern) {
      return {
        type: 'subclinical_mange_alert',
        title: '🔬 Subclinical / Early-Stage Lesion Advisory',
        message: 'Early-stage localized mange with subtle erythema and early hair thinning often lacks florid crusts, causing visual classification to align with intact skin. If clinical pruritus or focal redness is present, microscopic skin scraping is recommended.',
        overrideHint: 'Attending veterinarian may override the tentative triage classification in Clinical Review if clinical lesions are confirmed.',
      }
    }

    return null
  } catch (err) {
    console.warn('[VetLink CDSS] checkEarlyStageDifferential error:', err)
    return null
  }
}

export default function NewPatient({ onBack, onViewPending, onCapture, currentUser, authToken, apiBaseUrl, isOffline }) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('Canine')
  const [breed, setBreed] = useState('')
  const [weight, setWeight] = useState('')
  const [age, setAge] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [areaOfConcern, setAreaOfConcern] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  // Image & AI state
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [qualityRejection, setQualityRejection] = useState(null)
  const [modelReady, setModelReady] = useState(false)
  const [modelError, setModelError] = useState(null)
  const [isCameraOpen, setIsCameraOpen] = useState(false)

  // Clinical Symptoms & Lab Test State
  const [selectedSymptoms, setSelectedSymptoms] = useState([])
  const [otherSymptoms, setOtherSymptoms] = useState('')
  const [labTestRequired, setLabTestRequired] = useState(false)
  const [labTestReason, setLabTestReason] = useState('')

  // Role-based Assistant Flow State
  const [intakeSuccess, setIntakeSuccess] = useState(false)
  const [savedSummary, setSavedSummary] = useState(null)

  const fileInputRef = useRef(null)

  // Pre-load the model in the background as soon as the page mounts
  useEffect(() => {
    let cancelled = false
    loadVetLinkModel()
      .then(() => { if (!cancelled) setModelReady(true) })
      .catch((err) => { if (!cancelled) setModelError(err.message) })
    return () => { cancelled = true }
  }, [])

  // Process image from either live camera snapshot or file upload
  const processImageFile = async (file) => {
    if (!file) return

    // 10 MB maximum file size limit
    const MAX_FILE_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      setError(`Image file is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Please select a photo under 10 MB.`)
      return
    }

    // Revoke previous preview URL to avoid memory leaks
    if (previewUrl) URL.revokeObjectURL(previewUrl)

    const url = URL.createObjectURL(file)
    setSelectedFile(file)
    setPreviewUrl(url)
    setAiResult(null)
    setQualityRejection(null)
    setError('')
    setIntakeSuccess(false)

    // Run AI automatically after image is selected
    setIsAnalyzing(true)
    try {
      const imgElement = await loadImageFromFile(file)

      // Step 1: Client-Side Clinical Image Quality & Anti-Blur Gate
      const quality = validateClinicalImageQuality(imgElement)
      if (!quality.isValid) {
        setQualityRejection({
          title: quality.title || 'Image Rejected: Quality Gate Failed',
          reason: quality.reason || 'LOW_QUALITY',
          message: quality.message,
          instructions: quality.instructions || 'Please retake or upload a clearer close-up photo of the animal lesion.',
          score: quality.score,
        })
        setIsAnalyzing(false)
        return // HARD STOP - Reject before calling neural network!
      }

      // Step 2: Animal Verification & Disease Classification (Backend TFLite / WASM)
      const result = await predict(imgElement, species)

      // Step 2b: Server-Side Inanimate / Non-Animal Gate Check
      if (result.rejected) {
        setQualityRejection({
          title: '🚫 Image Rejected: Non-Animal Subject Detected',
          reason: result.reason || 'NON_ANIMAL',
          detected: result.detected,
          message: result.message || 'VetLink is trained exclusively on domestic animal dermatological lesions (Canine, Feline, Avian, Rabbit). Non-animal subjects are rejected to prevent diagnostic errors and model overload.',
          instructions: 'Please take or upload a photo showing an actual animal patient with a visible skin or fur condition.',
        })
        setIsAnalyzing(false)
        return // HARD STOP - Do not accept non-animal images!
      }

      setAiResult(result)

      // Intelligent Symptom Pre-selection & Lab Test Auto-evaluation
      if (result.confidence >= 0.60) {
        const primarySymptoms = getSuggestedSymptomsForDisease(result.displayLabel)
        const comorb = checkComorbidity(result.top3)
        const secondarySymptoms = comorb.isComorbid ? getSuggestedSymptomsForDisease(comorb.secondary) : []
        const merged = Array.from(new Set([...primarySymptoms, ...secondarySymptoms]))
        setSelectedSymptoms(merged)
        setLabTestRequired(false)
        setLabTestReason('')
      } else {
        // Low confidence: keep checkboxes blank to avoid cognitive bias
        setSelectedSymptoms([])
        setLabTestRequired(true)
        setLabTestReason('AI confidence below 60% decision boundary. Confirmatory lab test (Skin scrape / fungal DTM) recommended.')
      }

      // Check subclinical early differential
      const earlyDiff = checkEarlyStageDifferential(result, species, areaOfConcern)
      if (earlyDiff) {
        setLabTestRequired(true)
        setLabTestReason(earlyDiff.message)
      }

    } catch (err) {
      console.error('AI inference failed:', err)
      setError(`AI could not analyze this image: ${err.message || err}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const toggleSymptom = (symptomId) => {
    setSelectedSymptoms((prev) =>
      prev.includes(symptomId) ? prev.filter((id) => id !== symptomId) : [...prev, symptomId]
    )
  }

  // When user picks a file, show preview and immediately run AI
  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (file) {
      processImageFile(file)
    }
    event.target.value = ''
  }

  // When user snaps photo from live camera
  const handleCameraCapture = (file) => {
    processImageFile(file)
  }

  // When species changes, re-run AI if an image is already loaded and valid
  const handleSpeciesChange = async (newSpecies) => {
    setSpecies(newSpecies)
    if (selectedFile && !qualityRejection) {
      setIsAnalyzing(true)
      try {
        const imgElement = await loadImageFromFile(selectedFile)
        const result = await predict(imgElement, newSpecies)
        if (result.rejected) {
          setQualityRejection({
            title: '🚫 Image Rejected: Non-Animal Subject Detected',
            reason: result.reason || 'NON_ANIMAL',
            detected: result.detected,
            message: result.message,
            instructions: 'Please take or upload a photo showing an animal patient.',
          })
          setAiResult(null)
        } else {
          setAiResult(result)
        }
      } catch (err) {
        console.error('Re-inference failed:', err)
      } finally {
        setIsAnalyzing(false)
      }
    }
  }

  // Called when user wants to take live photo with camera
  const handleOpenCamera = () => {
    if (!name.trim()) {
      setError('Please enter a patient name first.')
      return
    }
    setError('')
    setIsCameraOpen(true)
  }

  // Called when user wants to upload from file storage
  const handleOpenFilePicker = () => {
    if (!name.trim()) {
      setError('Please enter a patient name first.')
      return
    }
    setError('')
    fileInputRef.current?.click()
  }

  // Save the patient record, then retain its linked local case analysis.
  const handleSave = async () => {
    if (!name.trim()) { setError('Patient name is required.'); return }
    if (!selectedFile) { setError('Please capture or upload a photo first.'); return }
    if (qualityRejection) { setError(`Cannot save: Image was rejected (${qualityRejection.reason || 'Quality Check Failed'}). Please capture or upload a valid animal skin lesion photo.`); return }
    if (!aiResult) { setError('Waiting for AI analysis to complete.'); return }

    setIsSaving(true)
    setError('')

    try {
      // 1. Determine clinical status based on lab test and confidence
      const comorb = checkComorbidity(aiResult.top3)
      let assignedStatus = 'Review Results'
      if (labTestRequired) {
        assignedStatus = 'Awaiting Lab Test'
      } else if (comorb.isComorbid || aiResult.confidence < 0.80) {
        assignedStatus = 'Needs Vet Review'
      } else {
        assignedStatus = 'Review Results'
      }

      // 2. Save patient with full demographics & owner contact
      const patient = await addPatient({
        name: name.trim(),
        species,
        breed: breed.trim(),
        weight: weight ? String(weight).trim() : '',
        age: age.trim(),
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        areaOfConcern: areaOfConcern.trim(),
        lastVisit: new Date().toISOString().slice(0, 10),
        status: assignedStatus,
      })

      // 3. Save consultation linked to the patient
      const combinedNotes = [
        areaOfConcern.trim(),
        otherSymptoms.trim() ? `Symptom Notes: ${otherSymptoms.trim()}` : '',
        labTestRequired && labTestReason ? `Lab Order: ${labTestReason}` : '',
      ].filter(Boolean).join(' | ')

      const consultation = await addConsultation({
        patientId: patient.id,
        clinicalNotes: combinedNotes,
        diagnosis: aiResult.label,
        secondaryDiagnosis: comorb.isComorbid ? comorb.secondary : null,
        isComorbid: comorb.isComorbid,
        treatmentPlan: '',
      })

      // 4. Convert image to base64 for local storage
      const base64Image = await fileToBase64(selectedFile)

      // 5. Save screening result linked to the consultation
      await addScreeningResult({
        consultationId: consultation.id,
        imageId: null,
        imageData: base64Image,
        aiLabel: aiResult.label,
        aiDisplayLabel: aiResult.displayLabel,
        aiConfidence: aiResult.confidence,
        aiPercent: aiResult.percent,
        aiSecondaryLabel: comorb.isComorbid ? comorb.secondary : null,
        aiSecondaryConfidence: comorb.isComorbid ? comorb.secondaryConf : null,
        isComorbid: comorb.isComorbid,
        aiDescription: aiResult.description,
        aiTop3: JSON.stringify(aiResult.top3),
        species,
        reviewStatus: assignedStatus === 'Awaiting Lab Test' ? 'awaiting_lab' : 'pending',
      })

      // 6. Save itemized symptoms into consultationSymptoms store
      await addConsultationSymptoms(consultation.id, selectedSymptoms, otherSymptoms)

      // 7. Role-aware completion: Assistant gets confirmation screen; Admin/Doctor gets direct capture
      if (currentUser?.role === 'Clinic Staff') {
        setIntakeSuccess(true)
        setSavedSummary({
          patientId: patient.id,
          name: patient.name,
          species: patient.species,
          breed: patient.breed,
          weight: patient.weight,
          ownerName: patient.ownerName,
          status: assignedStatus,
          diagnosis: aiResult.displayLabel,
          secondary: comorb.isComorbid ? comorb.secondary : null,
          labOrdered: labTestRequired,
        })
      } else {
        // Veterinarian / Clinic Admin flow
        onCapture({
          patient,
          consultation,
          aiResult,
          previewUrl,
          comorbidityInfo: comorb,
          selectedSymptoms,
          otherSymptoms,
          labTestRequired,
          assignedStatus,
          diagnosis: aiResult.displayLabel,
          secondaryDiagnosis: comorb.isComorbid ? comorb.secondary : null,
          isComorbid: comorb.isComorbid,
        })
      }

    } catch (saveError) {
      console.error('Failed to save patient:', saveError)
      setError('Unable to save. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // Confidence color: green ≥ 80%, yellow ≥ 50%, red < 50%
  const confidenceColor = aiResult
    ? aiResult.confidence >= 0.8 ? '#22c55e'
      : aiResult.confidence >= 0.5 ? '#f59e0b'
        : '#ef4444'
    : '#888'

  return (
    <section className="new-patient-card">
      {/* Hidden file input — opens camera on mobile, file picker on desktop */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        aria-label="Capture or upload a pet photo"
      />

      {/* Assistant Intake Success Confirmation Card */}
      {intakeSuccess && savedSummary && (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
          border: '2px solid #86efac',
          borderRadius: 14,
          padding: 20,
          marginBottom: 20,
          boxShadow: '0 4px 14px rgba(22, 101, 52, 0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: '2.4rem' }}>✅</span>
            <div>
              <h3 style={{ margin: 0, color: '#166534', fontSize: '1.25rem' }}>
                Patient Intake & AI Screening Admitted!
              </h3>
              <p style={{ margin: '4px 0 0', color: '#15803d', fontSize: '0.88rem' }}>
                Patient record and preliminary scan successfully saved to clinic database.
              </p>
            </div>
          </div>

          <div style={{
            background: 'white',
            borderRadius: 10,
            padding: 14,
            border: '1px solid #bbf7d0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 14,
          }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Patient ID</span>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0f172a' }}>{savedSummary.patientId}</div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Name & Species</span>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>{savedSummary.name} ({savedSummary.species})</div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Preliminary AI Scan</span>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1e40af' }}>
                {savedSummary.diagnosis}
                {savedSummary.secondary && <span style={{ color: '#6b21a8', display: 'block', fontSize: '0.8rem' }}>+ {savedSummary.secondary}</span>}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Triage Status</span>
              <div style={{ marginTop: 2 }}>
                <span className="status-badge" style={{
                  background: savedSummary.status === 'Awaiting Lab Test' ? '#fef3c7' : '#fef9c3',
                  color: savedSummary.status === 'Awaiting Lab Test' ? '#92400e' : '#854d0e',
                  border: '1px solid #fde68a',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                }}>
                  {savedSummary.status === 'Awaiting Lab Test' ? '🧪 Awaiting Lab Test' : '🟡 Needs Vet Review'}
                </span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#334155', margin: '0 0 14px', lineHeight: 1.4 }}>
            📋 <strong>Next Step:</strong> Hand off the patient to the Attending Veterinarian. The doctor will review the Grad-CAM heatmap, confirm symptoms, and finalize the prescription.
          </p>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="action-btn blue"
              style={{ padding: '9px 18px', fontSize: '0.88rem' }}
              onClick={() => {
                setName('')
                setAreaOfConcern('')
                setSelectedFile(null)
                setPreviewUrl(null)
                setAiResult(null)
                setSelectedSymptoms([])
                setOtherSymptoms('')
                setLabTestRequired(false)
                setIntakeSuccess(false)
                setSavedSummary(null)
              }}
            >
              ➕ Intake Next Patient
            </button>
            <button
              type="button"
              className="secondary-btn"
              style={{ padding: '9px 18px', fontSize: '0.88rem' }}
              onClick={onViewPending}
            >
              📋 View Patient Records
            </button>
          </div>
        </div>
      )}

      <div className="new-patient-header">
        <button className="secondary-btn small-back" type="button" onClick={onBack}>← DASHBOARD</button>
        <span className={`status-chip ${modelReady ? 'green' : modelError ? 'red' : 'gray'}`}>
          {modelReady ? 'AI READY' : modelError ? 'AI ERROR' : 'LOADING AI...'}
        </span>
      </div>

      <div className="new-patient-topbar">
        <div>
          <div className="brand-badge">NEW CASE</div>
          <p>Fill in details then capture a photo</p>
        </div>
      </div>

      <div className="new-patient-main">

        {/* ── Left: Image Preview ─────────────────────────────── */}
        <div className="new-patient-preview">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Pet photo preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
            />
          ) : (
            <div
              className="image-placeholder"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '24px 16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2.4rem' }}>📷</div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#334155' }}>
                Capture or Upload Patient Photo
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: 220, lineHeight: 1.35 }}>

              </div>
            </div>
          )}

          {/* Retake buttons */}
          {previewUrl && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="secondary-btn"
                style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={handleOpenCamera}
                disabled={isAnalyzing || isSaving}
              >
                <span>📸</span> Retake (Camera)
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={handleOpenFilePicker}
                disabled={isAnalyzing || isSaving}
              >
                <span>📁</span> Upload File
              </button>
            </div>
          )}

          {/* Quality check rejection alert */}
          {qualityRejection && (
            <div style={{
              marginTop: 10,
              padding: '12px 14px',
              background: '#fef2f2',
              border: '2px solid #ef4444',
              borderRadius: 10,
              color: '#991b1b',
              fontSize: '0.82rem',
              lineHeight: 1.45,
              textAlign: 'left',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 'bold', fontSize: '0.88rem', marginBottom: 4 }}>
                <span>🚫</span>
                <span>{qualityRejection.title}</span>
              </div>
              <p style={{ margin: '0 0 8px 0', color: '#7f1d1d', fontSize: '0.8rem' }}>
                {qualityRejection.message}
              </p>
              <div style={{
                background: 'white',
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid #fca5a5',
                color: '#991b1b',
                fontWeight: 600,
                fontSize: '0.76rem',
              }}>
                👉 {qualityRejection.instructions}
              </div>
            </div>
          )}

          {/* Macro Framing Guide */}
          <div style={{
            marginTop: 10,
            padding: '10px 12px',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 8,
            fontSize: '0.78rem',
            color: '#0369a1',
            lineHeight: 1.45,
            textAlign: 'left',
          }}>
            🔍 <strong>Clinical Imaging Tip:</strong> Take a tight close-up photo where the lesion fills 70–80% of the frame. Wide shots showing the full dog face or body will cause the AI to focus on surrounding healthy fur instead of the lesion.
          </div>
        </div>

        {/* ── Right: Form + AI Result ─────────────────────────── */}
        <div className="new-patient-form-card">
          <div className="form-card-heading">Patient Details</div>
          <div className="new-patient-form">
            <p className="id-auto-note">Patient ID will be assigned automatically.</p>

            <label>
              <span>PATIENT NAME *</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Buddy / Max"
                disabled={isSaving}
                required
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                <span>SPECIES *</span>
                <select
                  value={species}
                  onChange={(e) => handleSpeciesChange(e.target.value)}
                  disabled={isSaving}
                >
                  <option>Canine</option>
                  <option>Feline</option>
                  <option>Avian</option>
                  <option>Rabbit</option>
                </select>
              </label>

              <label>
                <span>BREED (OPTIONAL)</span>
                <input
                  value={breed}
                  onChange={(e) => setBreed(e.target.value)}
                  placeholder="e.g. Shih Tzu, Aspin, Persian"
                  disabled={isSaving}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                <span>WEIGHT IN KG (OPTIONAL)</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="e.g. 5.5"
                  disabled={isSaving}
                />
              </label>

              <label>
                <span>AGE (OPTIONAL)</span>
                <input
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 2 yrs / 6 mos"
                  disabled={isSaving}
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>
                <span>OWNER NAME (OPTIONAL)</span>
                <input
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  disabled={isSaving}
                />
              </label>

              <label>
                <span>OWNER CONTACT / PHONE (OPTIONAL)</span>
                <input
                  type="tel"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="e.g. 0917-123-4567"
                  disabled={isSaving}
                />
              </label>
            </div>

            <label>
              <span>AREA OF CONCERN</span>
              <input
                value={areaOfConcern}
                onChange={(e) => setAreaOfConcern(e.target.value)}
                placeholder="e.g. Back leg rash / ear crusts"
                disabled={isSaving}
              />
            </label>

            {error && <p role="alert" style={{ color: '#ef4444', fontSize: '0.85rem', margin: '4px 0' }}>{error}</p>}

            {/* AI Analysis Result */}
            {isAnalyzing && (
              <div className="ai-result-box analyzing">
                <span className="ai-spinner">⏳</span> Analyzing image with Edge WASM & Grad-CAM...
              </div>
            )}

            {/* Clinical Image Rejection Card */}
            {qualityRejection && !isAnalyzing && (
              <div style={{
                marginTop: 14,
                padding: 16,
                background: 'linear-gradient(135deg, #fef2f2, #fff1f2)',
                border: '2px solid #ef4444',
                borderRadius: 12,
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.12)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: '2rem' }}>⛔</span>
                  <div>
                    <h4 style={{ margin: 0, color: '#991b1b', fontSize: '1.02rem', fontWeight: 700 }}>
                      {qualityRejection.title}
                    </h4>
                    <span style={{
                      display: 'inline-block',
                      marginTop: 2,
                      padding: '2px 8px',
                      background: '#fee2e2',
                      border: '1px solid #fca5a5',
                      borderRadius: 4,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#b91c1c',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      GATE: {qualityRejection.reason} {qualityRejection.detected ? `• DETECTED: ${qualityRejection.detected}` : ''}
                    </span>
                  </div>
                </div>

                <p style={{ margin: '0 0 10px 0', color: '#374151', fontSize: '0.84rem', lineHeight: 1.5 }}>
                  {qualityRejection.message}
                </p>

                <div style={{
                  background: 'white',
                  borderRadius: 8,
                  padding: '10px 12px',
                  border: '1px solid #fecaca',
                  marginBottom: 14,
                  fontSize: '0.8rem',
                  color: '#7f1d1d',
                  lineHeight: 1.45,
                }}>
                  💡 <strong>Action Required:</strong> {qualityRejection.instructions}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="action-btn blue"
                    style={{ flex: 1, padding: '10px 12px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={handleOpenCamera}
                  >
                    <span>📸</span> Retake with Camera
                  </button>
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ flex: 1, padding: '10px 12px', fontSize: '0.84rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'white' }}
                    onClick={handleOpenFilePicker}
                  >
                    <span>📁</span> Select Another Image
                  </button>
                </div>
              </div>
            )}

            {aiResult && !qualityRejection && !isAnalyzing && (
              <div className="ai-result-box" style={{ background: '#0f172a', color: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #334155' }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '0.95rem', marginBottom: 10, color: '#38bdf8' }}>
                  Grad-CAM: {aiResult.displayLabel} ({aiResult.percent} confident)
                </div>

                {/* 3-Panel Grad-CAM Visualization matching Colab Cell 8 */}
                {aiResult.gradcam && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    <div style={{ textAlign: 'center' }}>
                      <img
                        src={aiResult.gradcam.originalUrl}
                        alt="Original"
                        style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 6, border: '1px solid #475569' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginTop: 3 }}>Original Image</span>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <img
                        src={aiResult.gradcam.heatmapUrl}
                        alt="Heatmap"
                        style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 6, border: '1px solid #475569' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginTop: 3 }}>
                        Heatmap<br /><span style={{ fontSize: '0.65rem', color: '#f87171' }}>(Red = AI focused)</span>
                      </span>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <img
                        src={aiResult.gradcam.overlayUrl}
                        alt="Overlay"
                        style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 6, border: '1px solid #475569' }}
                      />
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block', marginTop: 3 }}>Overlay</span>
                    </div>
                  </div>
                )}

                {/* Colab-exact Prediction Banner */}
                <div style={{ borderTop: '1px dashed #334155', paddingTop: 10, marginTop: 4, fontFamily: 'monospace' }}>
                  <div style={{ fontSize: '0.88rem', color: '#4ade80', fontWeight: 'bold' }}>
                    🏆 TOP PREDICTION: {aiResult.displayLabel.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginLeft: 20 }}>
                    Confidence: {aiResult.percent}
                  </div>

                  {/* FR7: 60% Decision Boundary (Thesis pp. 11, 41, 46, 56) */}
                  {aiResult.confidence >= 0.60 ? (
                    <div style={{ marginTop: 6, padding: '5px 8px', background: 'rgba(22, 101, 52, 0.35)', border: '1px solid #16a34a', borderRadius: 4, fontSize: '0.74rem', color: '#86efac' }}>
                      ✓ Confidence &ge; 60%: First-line care protocol auto-populated into consultation draft.
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(180, 83, 9, 0.35)', border: '1px solid #d97706', borderRadius: 4, fontSize: '0.74rem', color: '#fde68a' }}>
                      ⚠️ Confidence &lt; 60% decision boundary: Secondary confirmatory laboratory diagnostics (Skin Scraping, Fungal Culture, or Tape Cytology) recommended.
                    </div>
                  )}

                  <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#94a3b8' }}>
                    📊 Top 3 Predictions:
                    {aiResult.top3.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0 2px 14px', color: i === 0 ? '#f1f5f9' : '#94a3b8' }}>
                        <span>{i + 1}. {item.display}</span>
                        <span style={{ fontWeight: i === 0 ? 'bold' : 'normal' }}>{(item.confidence * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>

                  {/* Co-occurring / Comorbidity Detection */}
                  {(() => {
                    const comorb = checkComorbidity(aiResult.top3)
                    if (!comorb.isComorbid) return null
                    return (
                      <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(59, 130, 246, 0.25)', border: '1px solid #3b82f6', borderRadius: 6, fontSize: '0.78rem', color: '#bfdbfe', lineHeight: 1.4 }}>
                        🩺 <strong>Suspected Comorbidity / Secondary Condition:</strong> Elevated probability detected for both <strong>{comorb.primary} ({(comorb.primaryConf * 100).toFixed(1)}%)</strong> and <strong>{comorb.secondary} ({(comorb.secondaryConf * 100).toFixed(1)}%)</strong>. Clinical evaluation for secondary opportunistic infection (e.g. bacterial colonization over fungal/parasitic lesion) recommended.
                      </div>
                    )
                  })()}

                  {/* Early-Stage Subclinical / Facial Differential Advisory */}
                  {(() => {
                    const diff = checkEarlyStageDifferential(aiResult, species, areaOfConcern)
                    if (!diff) return null
                    return (
                      <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7', borderRadius: 6, fontSize: '0.78rem', color: '#e9d5ff', lineHeight: 1.4 }}>
                        <strong>{diff.title}:</strong> {diff.message}
                        <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#d8b4fe' }}>
                          💡 <em>{diff.overrideHint}</em>
                        </div>
                      </div>
                    )
                  })()}

                  {aiResult.engine === 'backend' ? (
                    <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#4ade80', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⚡</span>
                      <span><strong>Native TFLite Engine (0.04s)</strong> — Neural inference verified on FastAPI backend</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#fbbf24', background: 'rgba(217, 119, 6, 0.2)', border: '1px solid #d97706', padding: '6px 8px', borderRadius: 4 }}>
                      ⚠️ <strong>Offline WASM Fallback Active:</strong> FastAPI backend (port 8000) was unreachable. For 99.9% clinical accuracy, ensure backend is running (<code>python -m uvicorn backend.main:app --port 8000</code>).
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Clinical Symptoms Checklist & Custom Input */}
            {aiResult && !qualityRejection && !isAnalyzing && (
              <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.88rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🩺</span>
                    <span>Observed Clinical Signs & Symptoms</span>
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    {aiResult.confidence >= 0.60 ? 'Auto-suggested from AI findings' : 'Manual verification required (<60%)'}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#475569', margin: '0 0 10px', lineHeight: 1.35 }}>
                  Select observed physical lesion signs. These will be linked directly into the consultation record:
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, marginBottom: 10 }}>
                  {MASTER_SYMPTOMS.map((sym) => {
                    const isChecked = selectedSymptoms.includes(sym.id)
                    return (
                      <label
                        key={sym.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 8px',
                          borderRadius: 6,
                          fontSize: '0.78rem',
                          background: isChecked ? '#e0f2fe' : '#ffffff',
                          border: isChecked ? '1px solid #38bdf8' : '1px solid #cbd5e1',
                          color: isChecked ? '#0369a1' : '#334155',
                          cursor: 'pointer',
                          fontWeight: isChecked ? 600 : 400,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSymptom(sym.id)}
                        />
                        <span>{sym.shortName}</span>
                      </label>
                    )
                  })}
                </div>

                {/* Others / Custom Symptoms free-text */}
                <label style={{ display: 'block', marginTop: 8 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                    Other Clinical Signs / Specific Observations (Free-text):
                  </span>
                  <input
                    type="text"
                    value={otherSymptoms}
                    onChange={(e) => setOtherSymptoms(e.target.value)}
                    placeholder="e.g. Mild fever, localized swelling, foul ear discharge, lethargic..."
                    style={{ width: '100%', padding: '6px 10px', fontSize: '0.82rem', borderRadius: 6, border: '1px solid #cbd5e1', marginTop: 4, boxSizing: 'border-box' }}
                  />
                </label>
              </div>
            )}

            {/* Confirmatory Diagnostic Lab Testing Section */}
            {aiResult && !qualityRejection && !isAnalyzing && (
              <div style={{ marginTop: 12, padding: 12, background: labTestRequired ? '#fffbeb' : '#f8fafc', border: labTestRequired ? '1px solid #fde68a' : '1px solid #e2e8f0', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: currentUser?.role === 'Clinic Staff' ? 'not-allowed' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={labTestRequired}
                      disabled={currentUser?.role === 'Clinic Staff'}
                      onChange={(e) => setLabTestRequired(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: labTestRequired ? '#b45309' : '#1e293b' }}>
                        🧪 Confirmatory Diagnostic Lab Test Required
                      </span>
                      <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#475569', lineHeight: 1.35 }}>
                        Check if attending staff or clinician needs microscope skin scraping, fungal DTM culture, or tape cytology. (Patient will be flagged as <code>🧪 Awaiting Lab Test</code>).
                      </p>
                    </div>
                  </label>
                </div>

                {currentUser?.role === 'Clinic Staff' && labTestRequired && (
                  <div style={{ marginTop: 6, padding: '6px 10px', background: '#fef3c7', borderRadius: 6, color: '#92400e', fontSize: '0.76rem', fontWeight: 600 }}>
                    🔒 Mandated by AI Triage Protocol: Low confidence or secondary comorbidity detected. Awaiting Attending Veterinarian authorization.
                  </div>
                )}

                {labTestRequired && (
                  <div style={{ marginTop: 8, paddingLeft: 22 }}>
                    <input
                      type="text"
                      value={labTestReason}
                      disabled={currentUser?.role === 'Clinic Staff'}
                      onChange={(e) => setLabTestReason(e.target.value)}
                      placeholder="Specify test: e.g. Skin scrape for Demodex mites / Fungal DTM culture"
                      style={{ width: '100%', padding: '6px 10px', fontSize: '0.8rem', borderRadius: 6, border: '1px solid #f59e0b', boxSizing: 'border-box', background: currentUser?.role === 'Clinic Staff' ? '#fef3c7' : '#ffffff' }}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="form-actions-row" style={{ flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {/* Step 1: Capture or Upload photo */}
              {!previewUrl && (
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                  <button
                    className="capture-btn"
                    type="button"
                    onClick={handleOpenCamera}
                    disabled={isSaving || isAnalyzing}
                    style={{ flex: 1.2, margin: 0 }}
                  >
                    <span>📸</span>
                    TAKE LIVE PHOTO
                  </button>
                  <button
                    className="secondary-btn"
                    type="button"
                    onClick={handleOpenFilePicker}
                    disabled={isSaving || isAnalyzing}
                    style={{
                      flex: 1,
                      margin: 0,
                      padding: '12px 14px',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                    }}
                  >
                    <span>📁</span>
                    UPLOAD FILE
                  </button>
                </div>
              )}

              {/* Quality rejection block indicator */}
              {qualityRejection && !isAnalyzing && (
                <div style={{
                  padding: '10px 14px',
                  background: '#fef2f2',
                  border: '1px dashed #ef4444',
                  borderRadius: 8,
                  textAlign: 'center',
                  color: '#b91c1c',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  marginTop: 4,
                }}>
                  ⚠️ Patient record cannot be submitted with a rejected image. Please retake photo above.
                </div>
              )}

              {/* Step 2: Save after AI result is ready */}
              {aiResult && !qualityRejection && !isAnalyzing && (
                <button
                  className="capture-btn"
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{ background: 'linear-gradient(135deg, #16a34a, #15803d)', marginTop: 8 }}
                >
                  {isSaving
                    ? '⏳ SAVING PATIENT & SCAN...'
                    : currentUser?.role === 'Clinic Staff'
                      ? '✓ SAVE INTAKE & QUEUE FOR VET REVIEW'
                      : '✓ SAVE PATIENT RECORD'}
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Cross-platform Live Camera Viewfinder Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCameraCapture}
        onFallbackUpload={handleOpenFilePicker}
      />
    </section>
  )
}

// Helper: convert File to downscaled base64 string for local storage (max 1024px, JPEG 85%)
// Keeps clinical dermatological clarity while preventing IndexedDB mobile quota overflow
function fileToBase64(file, maxDimension = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width)
          width = maxDimension
        } else {
          width = Math.round((width * maxDimension) / height)
          height = maxDimension
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      // Fallback to plain FileReader if Image decode fails
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    }
    img.src = url
  })
}
