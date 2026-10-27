import { useState, useEffect } from 'react'
import { updateConsultation } from '../db/database'

export const BASE_TREATMENT_PROTOCOLS = {
  // ── Canine (Aso) Protocols (Exact 11 dataset classes) ─────────
  'Canine Mange': {
    category: '🐶 Canine Protocols (Aso)',
    species: 'Canine',
    baseCondition: 'Mange',
    treatment: [
      'Isoxazoline systemic acaricide therapy (NexGard / Bravecto chewable single dose according to body weight)',
      'Medicated keratolytic bath (Benzoyl Peroxide 2.5% or Chlorhexidine 4%) twice weekly with 10-minute contact time',
      'Wash all bedding, blankets, and grooming tools in hot water (>60°C)',
      'Treat all in-contact household dogs simultaneously to prevent cross-reinfestation',
    ],
    prescription: 'NexGard Spectra (Afoxolaner/Milbemycin) 1 chewable tablet PO Day 0 according to body weight. Dispense Chlorhexidine 4% Medicated Shampoo 250mL (bathe twice weekly, 10 min contact time).',
    notes: 'Sarcoptic mange (scabies) is highly contagious and zoonotic. Handlers should wear disposable gloves until skin scrapings confirm mite elimination.',
  },
  'Canine Ringworm': {
    category: '🐶 Canine Protocols (Aso)',
    species: 'Canine',
    baseCondition: 'Ringworm',
    treatment: [
      'Topical antifungal therapy: Miconazole 2% / Chlorhexidine 2% medicated shampoo baths twice weekly',
      'Systemic oral antifungal (Itraconazole 5–10 mg/kg SID with a high-fat meal) for 28 days',
      'Rigorous environmental decontamination: daily vacuuming and surface wipe with 0.5% sodium hypochlorite (1:10 bleach)',
      'Isolate patient from other household animals and young children',
    ],
    prescription: 'Itraconazole 100mg capsules (dosed 5 mg/kg PO SID with high-fat meal) for 28 days. Malaseb Medicated Wash 250mL (bathe twice weekly).',
    notes: 'Dermatophytosis is contagious and zoonotic. Continue treatment until negative fungal culture or Wood\'s lamp clearance.',
  },
  'Canine Pyoderma': {
    category: '🐶 Canine Protocols (Aso)',
    species: 'Canine',
    baseCondition: 'Pyoderma',
    treatment: [
      'Topical antimicrobial therapy: Chlorhexidine 3–4% medicated shampoo baths twice weekly with 10-minute contact time',
      'Systemic oral antibiotics (Cephalexin 22 mg/kg PO BID or Amoxicillin-Clavulanate) for 14–21 days',
      'Identify and treat underlying predisposing conditions (flea allergy, atopy, or endocrine disease)',
      'Schedule follow-up clinical examination and tape impression cytology in 14 days',
    ],
    prescription: 'Cephalexin 500mg tablets (dosed 22 mg/kg PO BID with food) for 21 days. Chlorhexidine 4% medicated mousse applied to localized lesions daily.',
    notes: 'Recheck cytology in 2 weeks. Continue antibiotic therapy for a minimum of 7 days past complete clinical lesion resolution.',
  },
  'Canine Hot Spots': {
    category: '🐶 Canine Protocols (Aso)',
    species: 'Canine',
    baseCondition: 'Hot Spots',
    treatment: [
      'Gently clip fur around the acute moist dermatitis lesion margin to allow air exposure and drying',
      'Cleanse eroded epidermis with cool dilute chlorhexidine solution (2%) or sterile saline',
      'Apply topical antimicrobial and anti-inflammatory spray twice daily for 5–7 days (taper as lesion dries)',
      'Place Elizabethan collar (cone) immediately to prevent relentless licking, scratching, and self-trauma',
    ],
    prescription: 'Gentamicin sulfate 0.1% + Betamethasone valerate 0.1% topical spray BID for 7 days (taper once lesion dries). Oral Diphenhydramine 2 mg/kg PO BID for 5 days.',
    notes: 'Acute moist dermatitis is often secondary to flea saliva allergy, ear canal infection, or atopy. Taper corticosteroid spray once lesion dries.',
  },
  'Canine Healthy': {
    category: '🐶 Canine Protocols (Aso)',
    species: 'Canine',
    baseCondition: 'Healthy',
    treatment: [
      'Patient dermatological status is clinically normal. Skin barrier intact with no erythema, crusting, or alopecia.',
      'No medical or topical dermatological therapy indicated.',
      'Maintain routine veterinary ectoparasite prevention (flea, tick, and mite preventative).',
      'Maintain regular grooming, balanced diet, and fresh water access.',
    ],
    prescription: 'None required (Canine patient is dermatologically healthy).',
    notes: 'Normal physical and integumentary exam. Return for routine annual wellness checkup and vaccinations.',
  },

  // ── Feline (Pusa) Protocols (Feline-Safe Pharmacology) ─────────
  'Feline Mange': {
    category: '🐱 Feline Protocols (Pusa)',
    species: 'Feline',
    baseCondition: 'Mange',
    treatment: [
      'Feline-safe systemic spot-on acaricide (Selamectin / Revolution Plus or Fluralaner / Bravecto Plus for cats)',
      'Gentle leave-on antiseptic foam / mousse (avoid water baths which cause severe distress and hypothermia in cats)',
      'Thorough home premise sanitation; wash cat bedding and sanitise scratching posts in hot water (>60°C)',
      '⚠️ Toxicological Safety: Strictly isolate cats from any dogs recently treated with canine permethrin products',
    ],
    prescription: 'Bravecto Plus Spot-on (Fluralaner/Moxidectin for Cats) 1 tube applied topically to skin at base of skull. Dispense Douxo S3 Pyo Mousse (apply 3x weekly without bathing).',
    notes: '⚠️ FELINE TOXICOLOGY ALERT: Permethrin and organophosphates are lethal to felines. Never administer canine ectoparasiticides to cats. Notoedric mange requires 30-day isolation.',
  },
  'Feline Ringworm': {
    category: '🐱 Feline Protocols (Pusa)',
    species: 'Feline',
    baseCondition: 'Ringworm',
    treatment: [
      'Oral Itraconazole liquid solution (5 mg/kg PO SID with high-fat food on an alternate-week pulse schedule: 1 wk on, 1 wk off)',
      'Topical antifungal leave-on mousse (Miconazole / Ketoconazole) or gentle localized wipe-downs',
      'Environmental confinement to an easily cleanable room; daily vacuuming and 1:10 dilute bleach wipe-down of surfaces',
      'Wear disposable gloves during handling; feline dermatophytosis carries high zoonotic contagion to humans',
    ],
    prescription: 'Itrafungol (Itraconazole oral solution 10 mg/mL for cats) dosed 5 mg/kg PO SID on Week 1, Week 3, Week 5 (Pulse schedule). Miconazole leave-on foam applied twice weekly.',
    notes: 'Cats are primary reservoir hosts for Microsporum canis. Monitor hepatic enzymes if therapy extends past 6 weeks. Treat until two consecutive weekly negative fungal cultures.',
  },
  'Feline Pyoderma': {
    category: '🐱 Feline Protocols (Pusa)',
    species: 'Feline',
    baseCondition: 'Pyoderma',
    treatment: [
      'Pediatric oral liquid antibiotic suspension: Amoxicillin-Clavulanate (Clavamox drops 12.5–20 mg/kg PO BID with food) for 14–21 days',
      'Gentle daily localized cleansing of feline chin acne or crusting with 2% chlorhexidine wipes',
      'Replace all plastic feeding and water bowls with non-porous stainless steel or ceramic to eliminate bacterial harboring',
      'Schedule follow-up clinical examination and cytology in 14 days',
    ],
    prescription: 'Clavamox (Amoxicillin-Clavulanate) oral drops 62.5 mg/mL (dosed 12.5 mg/kg PO BID) for 14 days. Chlorhexidine 2% antiseptic wipes (cleanse affected chin/skin folds SID).',
    notes: 'Feline pyoderma often manifests as chin acne or crusty miliary dermatitis. Recheck tape impression cytology in 14 days.',
  },
  'Feline Hot Spots': {
    category: '🐱 Feline Protocols (Pusa)',
    species: 'Feline',
    baseCondition: 'Hot Spots',
    treatment: [
      'Carefully trim fur around moist lesion; avoid scissors trauma to thin, fragile feline skin',
      'Cleanse with cool sterile saline or gentle dilute chlorhexidine solution (0.05% feline-safe dilution)',
      'Apply feline-safe soothing hydrocortisone lotion (avoid alcohol-based sting sprays)',
      'Place soft inflatable collar or feline recovery suit to block aggressive barbed-tongue licking and self-trauma',
    ],
    prescription: 'Feline Hydrocortisone 0.5% + Neomycin topical lotion BID for 5 days. Oral Cetirizine 2.5–5 mg PO SID for 5 days for acute pruritus relief.',
    notes: 'Cats groom compulsively with barbed papillae, rapidly eroding the epidermis. Investigate flea allergy dermatitis or psychogenic stress-induced alopecia.',
  },
  'Feline Healthy': {
    category: '🐱 Feline Protocols (Pusa)',
    species: 'Feline',
    baseCondition: 'Healthy',
    treatment: [
      'Patient dermatological status is clinically normal. Fur coat clean and glossy, skin barrier intact.',
      'No medical or topical dermatological therapy indicated.',
      'Maintain monthly feline-safe flea, tick, and heartworm spot-on preventative.',
      'Provide balanced feline nutrition, clean fresh water, and environmental enrichment.',
    ],
    prescription: 'None required (Feline patient is dermatologically healthy).',
    notes: 'Normal physical and integumentary exam. Return for routine annual wellness examination and core vaccinations.',
  },

  // ── Avian Protocols (Ibon) ─────────────────────────────────
  'Avian Fowl Pox': {
    category: '🦜 Avian Protocols (Ibon)',
    species: 'Avian',
    baseCondition: 'Avian Fowl Pox',
    treatment: [
      'Gentle antiseptic cleansing of cutaneous pox lesions with dilute povidone-iodine (1:10 dilution)',
      'Vitamin A supplementation (oral drop or water-soluble) to promote epithelial mucosal healing',
      'Isolate affected bird from flock to prevent vector (mosquito) transmission',
      'Provide soft, easily digestible nutrition and monitor weight daily',
    ],
    prescription: 'Topical povidone-iodine 1% swab BID + Vitamin A avian oral supplement for 21 days.',
    notes: 'Cutaneous (dry) fowl pox is self-limiting in 3–4 weeks. Seek emergency veterinary care if diphtheritic (wet/mouth) lesions or dyspnea develop.',
  },
  'Scaly Face / Leg Mite': {
    category: '🦜 Avian Protocols (Ibon)',
    species: 'Avian',
    baseCondition: 'Scaly Face / Leg Mite',
    treatment: [
      'Topical or oral Ivermectin (0.2 mg/kg) applied to unfeathered skin of back of neck',
      'Repeat dosing at 10–14 day intervals for 2–3 treatments to eliminate newly hatched mites',
      'Apply thin layer of sterile mineral oil or paraffin sparingly to beak and leg crusts to suffocate mites (DO NOT obstruct nares/nostrils)',
      'Thoroughly sanitize cage, perches, and toys in hot soapy water or safe aviary disinfectant',
    ],
    prescription: 'Ivermectin 1% spot-on (1 drop topically on skin of back of neck), repeat on Day 14 and Day 28.',
    notes: 'Treat all in-contact cage mates. Monitor beak symmetry as chronic infestations can cause permanent beak malformation.',
  },
  'Healthy (Bird)': {
    category: '🦜 Avian Protocols (Ibon)',
    species: 'Avian',
    baseCondition: 'Healthy (Bird)',
    treatment: [
      'Patient is dermatologically healthy. Plumage, cere, beak, and legs show normal integrity.',
      'No medical or pharmacological treatment indicated.',
      'Maintain balanced avian nutrition (species-specific pellets, fresh greens, and seed moderation).',
      'Provide clean bathing water daily and maintain adequate ambient cage ventilation.',
    ],
    prescription: 'None required (Avian patient is healthy).',
    notes: 'Routine avian wellness checkup documented. Schedule routine annual veterinary examination.',
  },

  // ── Rabbit Protocols (Kuneho) ──────────────────────────────
  'Rabbit Mange': {
    category: '🐇 Rabbit Protocols (Kuneho)',
    species: 'Rabbit',
    baseCondition: 'Rabbit Mange',
    treatment: [
      'Topical Selamectin spot-on (Revolution for puppies/kittens, 6–18 mg/kg) or subcutaneous Ivermectin (0.2–0.4 mg/kg)',
      'Repeat dosing at 14-day intervals for 2–3 treatments',
      'Do NOT forcefully pick or peel ear crusts — allow crusts to slough off naturally to prevent auditory canal hemorrhage',
      'Sanitize hutch, cage, litter box, and accessories with hot soapy water or safe veterinary disinfectant',
    ],
    prescription: 'Selamectin spot-on (dosed to body weight) applied topically between shoulder blades; repeat in 14 days.',
    notes: 'Psoroptes cuniculi (ear mites) causes severe pain and crusting. Isolate from other rabbits until mite scraping confirms cure.',
  },
  'Rabbit Ringworm': {
    category: '🐇 Rabbit Protocols (Kuneho)',
    species: 'Rabbit',
    baseCondition: 'Rabbit Ringworm',
    treatment: [
      'Topical antifungal ointment (Miconazole 1% or Clotrimazole 1%) applied twice daily for 2–4 weeks',
      'Thorough cage & bedding disinfection to eliminate fungal arthrospores',
      'Consider oral antifungal (Terbinafine 10–20 mg/kg or Itraconazole 5–10 mg/kg) if lesions are generalized',
      'Schedule follow-up evaluation and skin scrapings in 14 days',
    ],
    prescription: 'Dispense 30 g Miconazole 1% topical ointment. Apply thin layer around margin of lesion BID for 21 days.',
    notes: 'Dermatophytosis (ringworm) is zoonotic. Owners should wear disposable gloves during topical applications.',
  },
  'Healthy (Rabbit)': {
    category: '🐇 Rabbit Protocols (Kuneho)',
    species: 'Rabbit',
    baseCondition: 'Healthy (Rabbit)',
    treatment: [
      'Patient is dermatologically healthy. Fur coat intact, no alopecia, crusting, or ectoparasites observed.',
      'No medical or pharmacological treatment indicated.',
      'Maintain standard high-fiber hay diet (unlimited Timothy hay), fresh water, and clean dry bedding.',
    ],
    prescription: 'None required (Rabbit patient is healthy).',
    notes: 'Routine health check documented. Return for biannual rabbit wellness exam.',
  },

  // ── Common Dual Presentations / Comorbidities ──────────────
  'Canine Mange + Secondary Pyoderma': {
    category: '🩺 Common Dual Presentations',
    species: 'Canine',
    treatment: [
      'Systemic isoxazoline acaricide (NexGard / Bravecto) for primary mite infestation eradication',
      'Systemic oral antibiotic (Cephalexin 22 mg/kg PO BID or Clavamox) for 21 days for secondary deep follicular pyoderma',
      'Medicated antiseptic & keratolytic bath (Benzoyl Peroxide 2.5% or Chlorhexidine 4%) twice weekly with 10-minute contact time',
      'Nutritional skin-barrier restoration: daily Omega-3 fatty acid supplementation',
      'Hot-water laundry (>60°C) of all bedding; treat all household contacts simultaneously',
    ],
    prescription: '1. NexGard Spectra 1 chewable tablet PO Day 0.\n2. Cephalexin 500mg PO BID for 21 days with food.\n3. Chlorhexidine 4% Medicated Antiseptic Shampoo 250mL (bathe twice weekly).',
    notes: 'Severe excoriation and secondary bacterial infection due to chronic Sarcoptic / Demodectic mange. Recheck deep skin scraping and cytology in 14 days.',
  },
  'Canine Ringworm + Secondary Malassezia': {
    category: '🩺 Common Dual Presentations',
    species: 'Canine',
    treatment: [
      'Multi-spectrum topical antifungal & antimicrobial bath (Miconazole 2% + Chlorhexidine 2%) twice weekly with 10-minute lather time',
      'Systemic oral Itraconazole (5–10 mg/kg PO SID with high-fat food) for 28 days for core fungal clearance',
      'Daily antiseptic wipe-down of affected interdigital or facial fold areas with 2% chlorhexidine wipes',
      'Environmental decontamination: daily vacuuming and 1:10 dilute sodium hypochlorite wash to kill persistent arthrospores',
      'Wear disposable gloves during handling due to zoonotic dermatophyte risk',
    ],
    prescription: '1. Itraconazole 100mg capsules PO SID with meal for 28 days.\n2. Malaseb / Miconazole-Chlorhexidine medicated wash 250mL (bathe twice weekly for 4 weeks).',
    notes: 'Dual fungal + yeast presentation. Monitor hepatic enzymes during systemic azole therapy. Continue therapy until 2 consecutive negative fungal cultures.',
  },
}

const STORAGE_KEY = 'vetlink_custom_clinic_protocols'

function loadSavedProtocols() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...BASE_TREATMENT_PROTOCOLS, ...parsed }
    }
  } catch (err) {
    console.error('Failed to load custom protocols from storage:', err)
  }
  return BASE_TREATMENT_PROTOCOLS
}

// Helper to resolve species-aware protocol key
function getSpeciesProtocolKey(diseaseName, speciesName) {
  if (!diseaseName) return 'Canine Mange'
  const d = diseaseName.toLowerCase()
  const s = (speciesName || 'Canine').toLowerCase()

  if (s.includes('feline') || s.includes('cat')) {
    if (d.includes('mange')) return 'Feline Mange'
    if (d.includes('ringworm')) return 'Feline Ringworm'
    if (d.includes('pyoderma')) return 'Feline Pyoderma'
    if (d.includes('hot')) return 'Feline Hot Spots'
    if (d.includes('healthy')) return 'Feline Healthy'
  }

  if (s.includes('avian') || s.includes('bird')) {
    if (d.includes('pox')) return 'Avian Fowl Pox'
    if (d.includes('mite') || d.includes('scaly')) return 'Scaly Face / Leg Mite'
    if (d.includes('healthy')) return 'Healthy (Bird)'
  }

  if (s.includes('rabbit') || s.includes('lagomorph')) {
    if (d.includes('mange')) return 'Rabbit Mange'
    if (d.includes('ringworm')) return 'Rabbit Ringworm'
    if (d.includes('healthy')) return 'Healthy (Rabbit)'
  }

  // Default to Canine
  if (d.includes('mange')) return 'Canine Mange'
  if (d.includes('ringworm')) return 'Canine Ringworm'
  if (d.includes('pyoderma')) return 'Canine Pyoderma'
  if (d.includes('hot')) return 'Canine Hot Spots'
  if (d.includes('healthy')) return 'Canine Healthy'

  return diseaseName
}

export default function Treatment({ onBack, caseData, currentUser }) {
  const [protocols, setProtocols] = useState(loadSavedProtocols)
  const isLibraryMode = !caseData?.patient
  const patient       = caseData?.patient
  const consultation  = caseData?.consultation
  const aiResult      = caseData?.aiResult

  // Check if case is flagged as awaiting lab test
  const isAwaitingLab = Boolean(
    caseData?.assignedStatus === 'Awaiting Lab Test' ||
    caseData?.status === 'awaiting_lab' ||
    caseData?.labTestRequired ||
    consultation?.reviewStatus === 'awaiting_lab'
  )

  const patientSpecies = patient?.species || caseData?.species || 'Canine'
  const rawDiagnosis = caseData?.approvedDiagnosis || caseData?.diagnosis || aiResult?.displayLabel || 'Mange'

  // Initial selection
  const initialKey = isLibraryMode
    ? 'Canine Mange'
    : getSpeciesProtocolKey(rawDiagnosis, patientSpecies)

  const [selectedDisease, setSelectedDisease] = useState(initialKey)

  // Show "Add Custom Protocol" modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newProtocolName, setNewProtocolName] = useState('')
  const [newProtocolCategory, setNewProtocolCategory] = useState('🐶 Canine Protocols (Aso)')
  const [newProtocolSteps, setNewProtocolSteps] = useState('')
  const [newProtocolRx, setNewProtocolRx] = useState('')
  const [newProtocolNotes, setNewProtocolNotes] = useState('')

  const activeProtocolKey = isLibraryMode ? selectedDisease : getSpeciesProtocolKey(rawDiagnosis, patientSpecies)
  const diagnosis         = isLibraryMode ? (protocols[selectedDisease]?.baseCondition || selectedDisease) : rawDiagnosis
  const secondaryDiagnosis = caseData?.approvedSecondary || caseData?.secondaryDiagnosis || null
  const isComorbid        = Boolean(caseData?.isComorbid || secondaryDiagnosis)
  const isOverridden      = Boolean(caseData?.isOverridden)

  // Resolve Primary Protocol
  const primaryProtocol = protocols[activeProtocolKey] ||
                         protocols[selectedDisease] ||
                         protocols[diagnosis] || {
    category: '✨ Custom Clinic Protocols',
    treatment: [
      'Comprehensive clinical dermatological workup and lesion cleansing with sterile saline or dilute chlorhexidine',
      'Targeted etiology-specific medical intervention (antimicrobial, antifungal, or parasiticide as clinically indicated)',
      'Symptomatic anti-inflammatory and barrier restoration therapy (barrier creams / oral fatty acids)',
      'Schedule follow-up clinical examination and cytology in 7–14 days',
    ],
    prescription: 'Custom veterinary prescription tailored to clinical findings. Dispense with detailed dosage and administration schedule.',
    notes: 'Custom dermatological condition. Monitor lesion site daily. Return immediately if signs of infection or discomfort exacerbate.',
  }

  // Resolve Secondary Protocol if comorbid
  const secondaryKey = secondaryDiagnosis ? getSpeciesProtocolKey(secondaryDiagnosis, patientSpecies) : null
  const secondaryProtocol = secondaryKey ? (
    protocols[secondaryKey] ||
    protocols[secondaryDiagnosis] || {
      category: 'Secondary Opportunistic',
      treatment: [
        `Targeted adjunct therapy for concurrent ${secondaryDiagnosis}`,
        'Antimicrobial or antifungal wash twice weekly',
      ],
      prescription: `Adjunct therapy for concurrent ${secondaryDiagnosis}.`,
      notes: `Concurrent management for ${secondaryDiagnosis}.`,
    }
  ) : null

  // FR7: 60% Confidence Decision Boundary Rule (Thesis pp. 11, 41, 46, 56)
  const isSubThreshold = (aiResult?.confidence !== undefined && aiResult.confidence < 0.60) &&
                         !diagnosis.toLowerCase().includes('healthy') && !isOverridden

  let treatmentSteps = [...(primaryProtocol.treatment || [])]

  // Comorbidity steps merging
  if (isComorbid && secondaryProtocol) {
    treatmentSteps.push(`🩺 [CONCURRENT PROTOCOL: ${secondaryDiagnosis.toUpperCase()}] ${secondaryProtocol.treatment[0]}`)
    if (secondaryProtocol.treatment[1]) {
      treatmentSteps.push(`🩺 [ADJUNCT STEP] ${secondaryProtocol.treatment[1]}`)
    }
  }

  // Pharmacological contraindication alert if hot spots + ringworm
  const isHotSpotAndRingworm = (diagnosis.toLowerCase().includes('hot') && secondaryDiagnosis?.toLowerCase().includes('ringworm')) ||
                               (diagnosis.toLowerCase().includes('ringworm') && secondaryDiagnosis?.toLowerCase().includes('hot'))

  if (isHotSpotAndRingworm) {
    treatmentSteps.push(`⚠️ [STEROID CAUTION IN DUAL PRESENTATION] Topical corticosteroids rapidly control acute hot spot pain, but can exacerbate dermatophyte (Ringworm) proliferation. Taper steroid as soon as lesion dries, and maintain continuous antifungal application.`)
  }

  if (isSubThreshold) {
    treatmentSteps.unshift('⚠️ [CONFIRMATORY LAB TESTING INDICATED] Pre-screening algorithmic confidence is below the 60% decision boundary. Attending veterinarian should execute secondary confirmatory diagnostics (microscopic skin scraping, fungal DTM culture, or tape cytology) to rule out differential conditions.')
  }

  // Initial combined prescription text
  let initialPrescription = primaryProtocol.prescription
  if (isComorbid && secondaryProtocol) {
    initialPrescription = `1. PRIMARY (${diagnosis.toUpperCase()}):\n${primaryProtocol.prescription}\n\n2. CONCURRENT (${secondaryDiagnosis.toUpperCase()}):\n${secondaryProtocol.prescription}`
  }

  // Initial combined notes text
  let initialNotes = primaryProtocol.notes
  if (isComorbid && secondaryProtocol) {
    initialNotes = `[COMORBIDITY MANAGEMENT: ${diagnosis} + ${secondaryDiagnosis}] ${primaryProtocol.notes} ${isHotSpotAndRingworm ? 'Caution with corticosteroid duration due to concurrent fungal infection.' : ''}`
  }
  if (isOverridden) {
    initialNotes = `[VETERINARIAN CLINICAL OVERRIDE]: Attending clinician modified diagnosis to ${diagnosis}${caseData?.overrideNotes ? `: "${caseData.overrideNotes}"` : '.'} ${initialNotes}`
  } else if (isSubThreshold) {
    initialNotes = `[FR7 Triage Notice]: AI pre-screening confidence was below the calibrated 60% decision boundary (${aiResult?.percent ?? '<60%'}). Secondary confirmatory laboratory diagnostics are advised. ${initialNotes}`
  }

  // Interactive Editable State
  const [prescription, setPrescription]   = useState(initialPrescription)
  const [clinicalNotes, setClinicalNotes] = useState(initialNotes)
  const [isSaving, setIsSaving]           = useState(false)
  const [saveMessage, setSaveMessage]     = useState('')
  const [saveError, setSaveError]         = useState('')

  useEffect(() => {
    setPrescription(initialPrescription)
    setClinicalNotes(initialNotes)
    setSaveMessage('')
    setSaveError('')
  }, [selectedDisease, initialPrescription, initialNotes])

  // Save changes to patient consultation
  const handleSaveTreatmentPlan = async () => {
    setIsSaving(true)
    setSaveMessage('')
    setSaveError('')
    try {
      if (consultation?.id) {
        await updateConsultation(consultation.id, {
          diagnosis,
          secondaryDiagnosis,
          isComorbid,
          treatmentPlan: prescription,
          clinicalNotes: clinicalNotes,
        })
        setSaveMessage('✓ Treatment plan and customized prescription successfully saved to patient medical record!')
      } else {
        setSaveMessage('✓ Clinical protocol verified. (Reference mode — ready for clinical execution).')
      }
    } catch (err) {
      console.error('Failed to save treatment plan:', err)
      setSaveError('Could not save treatment plan to database. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // Save current edits as Clinic SOP / Default Protocol Template
  const handleSaveClinicSOP = () => {
    try {
      const updated = {
        ...protocols,
        [selectedDisease]: {
          ...(protocols[selectedDisease] || { category: '✨ Custom Clinic Protocols', treatment: treatmentSteps }),
          prescription: prescription,
          notes: clinicalNotes,
        },
      }
      setProtocols(updated)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setSaveMessage(`✓ Protocol template for "${selectedDisease}" successfully saved as Clinic SOP!`)
    } catch (err) {
      console.error('Failed to save clinic SOP:', err)
      setSaveError('Failed to save protocol template to local clinic storage.')
    }
  }

  // Add a brand new protocol
  const handleAddNewProtocol = (e) => {
    e.preventDefault()
    if (!newProtocolName.trim()) return

    const name = newProtocolName.trim()
    const steps = newProtocolSteps
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

    const newEntry = {
      category: newProtocolCategory,
      treatment: steps.length > 0 ? steps : ['Administer targeted medical therapy according to clinical findings.'],
      prescription: newProtocolRx.trim() || 'Dispense prescribed medication as clinically indicated.',
      notes: newProtocolNotes.trim() || 'Monitor patient closely. Return for recheck in 14 days.',
    }

    const updated = {
      ...protocols,
      [name]: newEntry,
    }

    setProtocols(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch (err) {
      console.error('Failed to persist protocol:', err)
    }

    setSelectedDisease(name)
    setShowAddModal(false)
    setNewProtocolName('')
    setNewProtocolSteps('')
    setNewProtocolRx('')
    setNewProtocolNotes('')
    setSaveMessage(`✓ New protocol "${name}" added to Clinic Protocol Library!`)
  }

  // Reset to default guidelines
  const handleResetProtocols = () => {
    if (window.confirm('Reset all protocol templates back to peer-reviewed standard clinical guidelines? Any custom clinic edits will be cleared.')) {
      localStorage.removeItem(STORAGE_KEY)
      setProtocols(BASE_TREATMENT_PROTOCOLS)
      setSelectedDisease('Canine Mange')
      setSaveMessage('✓ Protocols successfully reset to standard clinical guidelines.')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const isVetOrAdmin = currentUser?.role === 'Clinic Admin' || currentUser?.role?.toLowerCase().includes('vet') || !currentUser?.role

  // Group protocol names for the categorized dropdown
  const categories = {
    '🐶 Canine Protocols (Aso)': [],
    '🐱 Feline Protocols (Pusa)': [],
    '🦜 Avian Protocols (Ibon)': [],
    '🐇 Rabbit Protocols (Kuneho)': [],
    '🩺 Common Dual Presentations': [],
    '✨ Custom Clinic Protocols': [],
  }

  Object.entries(protocols).forEach(([key, val]) => {
    const cat = val.category || '🐶 Canine Protocols (Aso)'
    if (cat.includes('Feline')) {
      categories['🐱 Feline Protocols (Pusa)'].push(key)
    } else if (cat.includes('Avian')) {
      categories['🦜 Avian Protocols (Ibon)'].push(key)
    } else if (cat.includes('Rabbit')) {
      categories['🐇 Rabbit Protocols (Kuneho)'].push(key)
    } else if (cat.includes('Dual')) {
      categories['🩺 Common Dual Presentations'].push(key)
    } else if (cat.includes('Custom')) {
      categories['✨ Custom Clinic Protocols'].push(key)
    } else {
      categories['🐶 Canine Protocols (Aso)'].push(key)
    }
  })

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .official-rx-print-document, .official-rx-print-document * {
            visibility: visible !important;
          }
          .official-rx-print-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px 30px !important;
            background: white !important;
            color: #0f172a !important;
            display: block !important;
            box-sizing: border-box !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* ── Screen View: Interactive Treatment Plan ────────────────── */}
      <section className="treatment-card no-print">
        {isLibraryMode && (
          <div style={{ padding: '16px 20px', background: 'var(--surface, #ffffff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: '14px', marginBottom: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-h, #0f172a)' }}>
                  Veterinary Pharmacopeia & Treatment Protocols
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: 'var(--muted, #64748b)' }}>
                  Species-specific clinical dermatological guidelines, feline-safe dosages, and clinic SOPs
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '4px 10px', borderRadius: '8px', background: 'var(--brand-surface, #e8f5e9)', color: 'var(--brand-strong, #2e7d32)' }}>
                  Clinician Reference Mode
                </span>
                {isVetOrAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      border: '1px solid #10b981',
                      background: '#ecfdf5',
                      color: '#065f46',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>➕</span> Add New Protocol
                  </button>
                )}
                {isVetOrAdmin && (
                  <button
                    type="button"
                    onClick={handleResetProtocols}
                    title="Reset to peer-reviewed standard clinical guidelines"
                    style={{
                      padding: '5px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#64748b',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    ↺ Reset Defaults
                  </button>
                )}
              </div>
            </div>

            {/* Categorized Dropdown Combo Box */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label htmlFor="protocol-selector" style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-body, #334155)' }}>
                Select Clinical Protocol:
              </label>
              <select
                id="protocol-selector"
                value={selectedDisease}
                onChange={(e) => setSelectedDisease(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: 260,
                  padding: '9px 14px',
                  borderRadius: 10,
                  border: '2px solid var(--accent, #5ca797)',
                  background: 'var(--surface, #ffffff)',
                  color: 'var(--text-h, #0f172a)',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {Object.entries(categories).map(([groupName, items]) => (
                  items.length > 0 && (
                    <optgroup key={groupName} label={groupName}>
                      {items.map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                    </optgroup>
                  )
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Status / Triage Banner */}
        <div className="treatment-banner" style={{
          background: isAwaitingLab ? 'linear-gradient(135deg, #fffbeb, #fef3c7)' : 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
          border: isAwaitingLab ? '1px solid #fde68a' : '1px solid #a7f3d0',
          borderRadius: 12,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 16,
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: isAwaitingLab ? '#f59e0b' : '#10b981',
            color: 'white',
            display: 'grid',
            placeItems: 'center',
            fontSize: '1.2rem',
            fontWeight: 800,
            flexShrink: 0,
          }}>
            {isAwaitingLab ? '🧪' : '✓'}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: isAwaitingLab ? '#92400e' : '#065f46', fontWeight: 800 }}>
              {isAwaitingLab
                ? 'Confirmatory Laboratory Testing Mandated'
                : isLibraryMode
                  ? `Clinical Guideline: ${diagnosis} (${primaryProtocol.category || 'General'})`
                  : `Validated for ${patient?.name || 'Patient'} (${patientSpecies})`}
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.84rem', color: isAwaitingLab ? '#b45309' : '#047857' }}>
              {patient ? `Patient: ${patient.name} • Species: ${patient.species} • ` : ''}
              {isAwaitingLab
                ? 'Pharmacological prescription withheld pending definitive laboratory confirmation (Medical Safety Protocol).'
                : isLibraryMode
                  ? 'Standard evidence-based clinical therapy recommendation approved for veterinary practice.'
                  : 'Treatment recommendation approved and ready for clinical execution.'}
            </p>
          </div>
        </div>

        {saveMessage && (
          <div style={{ padding: '12px 16px', background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', marginBottom: 14 }}>
            {saveMessage}
          </div>
        )}

        {saveError && (
          <div style={{ padding: '12px 16px', background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, fontWeight: 600, fontSize: '0.9rem', marginBottom: 14 }}>
            {saveError}
          </div>
        )}

        {/* ── CONDITIONAL DISPLAY: Lab Slip vs. Prescription Form ────────── */}
        {isAwaitingLab ? (
          /* Laboratory Requisition Order Panel */
          <div style={{
            background: '#ffffff',
            border: '2px dashed #f59e0b',
            borderRadius: 14,
            padding: 20,
            marginBottom: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid #fef3c7', paddingBottom: 12, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#b45309' }}>
                  CLINICAL DIAGNOSTIC WORKUP ORDER
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '1.2rem', color: '#92400e', fontWeight: 800 }}>
                  🔬 Laboratory Requisition Order Slip
                </h3>
              </div>
              <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700 }}>
                Status: Awaiting Confirmatory Lab Test
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, background: '#fffbeb', padding: 14, borderRadius: 10, marginBottom: 16, fontSize: '0.85rem' }}>
              <div>
                <strong>Patient Name:</strong> {patient?.name || 'Walk-in Intake'}<br />
                <strong>Species & Breed:</strong> {patient?.species || 'Canine'} {patient?.breed ? `(${patient.breed})` : ''}<br />
                <strong>Weight / Age:</strong> {patient?.weight ? `${patient.weight} kg` : 'N/A'} • {patient?.age || 'N/A'}<br />
                <strong>Patient ID:</strong> {patient?.id || 'Pending'}
              </div>
              <div>
                <strong>Owner:</strong> {patient?.ownerName || 'None recorded'} {patient?.ownerPhone ? `(📞 ${patient.ownerPhone})` : ''}<br />
                <strong>Ordering Clinician:</strong> Dr. Sarah Lin, DVM<br />
                <strong>Suspected Condition:</strong> <u>{diagnosis}</u> {secondaryDiagnosis ? `+ ${secondaryDiagnosis}` : ''}<br />
                <strong>AI Pre-screen Flag:</strong> {aiResult?.percent || '<60%'} (FR7 Calibrated Threshold)
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '0.92rem', color: '#1e293b' }}>
                Mandated Diagnostic Laboratory Workups:
              </h4>
              <div style={{ display: 'grid', gap: 8, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <span style={{ color: '#0284c7', fontSize: '1.1rem' }}>☑</span>
                  <div>
                    <strong>Direct Microscopic Skin Scraping (Mineral Oil / 10% KOH):</strong>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Evaluate for deep Demodex canis/gatoi mites or superficial Sarcoptes scabiei / Notoedres cati mites.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <span style={{ color: '#0284c7', fontSize: '1.1rem' }}>☑</span>
                  <div>
                    <strong>Wood\'s Lamp Fluorometric Examination & DTM Fungal Culture:</strong>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Screen for apple-green pteridine fluorescence and inoculate Dermatophyte Test Medium to confirm Microsporum canis / Trichophyton.</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <span style={{ color: '#0284c7', fontSize: '1.1rem' }}>☑</span>
                  <div>
                    <strong>Acetate Tape Impression Cytology (Diff-Quik Stain):</strong>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Quantify bacterial cocci (Staphylococcus pseudintermedius) and Malassezia pachydermatis peanut-shaped yeast organisms.</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.82rem', color: '#991b1b', lineHeight: 1.45 }}>
              🛡️ <strong>Medical Safety Rule:</strong> Pharmacological prescription is legally and clinically withheld. In accordance with the Philippine Veterinary Medicine Act and clinical standards, systemic antibiotics, acaricides, or antifungals will only be dispensed once diagnostic cytology or scraping is verified by the attending veterinarian.
            </div>
          </div>
        ) : (
          /* Standard Validated Treatment Panel */
          <div className="treatment-panel">
            <div className="treatment-section treatment-highlight">
              <div className="treatment-section-title">VALIDATED DIAGNOSIS & SPECIES PROTOCOL</div>
              <div className="treatment-section-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b' }}>
                    {diagnosis} {isOverridden ? '🔬 (Clinical Override)' : ''}
                  </span>
                  <span style={{ fontSize: '0.82rem', padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#334155', fontWeight: 700 }}>
                    Protocol: {primaryProtocol.category || patientSpecies}
                  </span>
                  {aiResult?.percent && !isOverridden && (
                    <span style={{ fontSize: '0.9rem', color: '#16a34a', fontWeight: 'bold' }}>
                      AI Confidence: {aiResult.percent}
                    </span>
                  )}
                </div>
                {isComorbid && secondaryDiagnosis && (
                  <div style={{ padding: '6px 10px', background: '#dbeafe', borderRadius: 6, border: '1px solid #93c5fd', color: '#1e40af', fontSize: '0.85rem' }}>
                    🩺 <strong>Concurrent Co-Occurring Condition:</strong> {secondaryDiagnosis} (Secondary opportunistic infection)
                  </div>
                )}
                {isOverridden && caseData?.overrideNotes && (
                  <div style={{ padding: '6px 10px', background: '#fae8ff', borderRadius: 6, border: '1px solid #e879f9', color: '#701a75', fontSize: '0.85rem' }}>
                    🔬 <strong>Veterinarian Clinical Reason:</strong> {caseData.overrideNotes}
                  </div>
                )}
              </div>
            </div>

            <div className="treatment-section">
              <div className="treatment-section-title">
                {isComorbid ? 'RECOMMENDED DUAL-CONDITION CARE PROTOCOL' : 'RECOMMENDED TREATMENT PROTOCOL (CLINICAL GUIDELINE)'}
              </div>
              <div className="treatment-section-body treatment-list">
                <ul>
                  {treatmentSteps.map((step, idx) => (
                    <li key={idx} style={step.startsWith('⚠️') ? { color: '#b45309', fontWeight: 600, background: '#fef3c7', padding: '6px 10px', borderRadius: 4, listStyleType: 'none', marginLeft: -20, marginBottom: 8 } : {}}>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ── Editable Prescription ───────────────────────────── */}
            <div className="treatment-section">
              <div className="treatment-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>PRESCRIPTION DETAILS (EDITABLE BY VET)</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'normal', textTransform: 'none' }}>
                  ✏️ Customize medication & dosage as needed
                </span>
              </div>
              <div className="treatment-section-body">
                <textarea
                  value={prescription}
                  onChange={(e) => setPrescription(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                  placeholder="Enter customized prescription, dosage, and administration schedule..."
                />
              </div>
            </div>

            {/* ── Editable Clinical Notes ─────────────────────────── */}
            <div className="treatment-section">
              <div className="treatment-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>VETERINARIAN CLINICAL NOTES (EDITABLE BY VET)</span>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'normal', textTransform: 'none' }}>
                  ✏️ Add patient-specific precautions
                </span>
              </div>
              <div className="treatment-section-body">
                <textarea
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                  placeholder="Enter clinical notes, home care advice, or follow-up schedule..."
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Action Buttons ──────────────────────────────────── */}
        <div className="treatment-footer" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
          <button className="secondary-btn small-back" type="button" onClick={onBack}>
            ← Back to Patient Records
          </button>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {isLibraryMode && isVetOrAdmin && !isAwaitingLab && (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleSaveClinicSOP}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, borderColor: '#5ca797', color: '#0f766e' }}
              >
                💾 Save as Clinic SOP
              </button>
            )}
            <button
              type="button"
              className="secondary-btn"
              onClick={handlePrint}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              {isAwaitingLab ? '🖨️ Print Lab Requisition Slip' : '🖨️ Print Rx / Save PDF'}
            </button>
            {!isLibraryMode && (
              <button
                type="button"
                className="primary-btn"
                onClick={handleSaveTreatmentPlan}
                disabled={isSaving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                💾 {isSaving ? 'Saving...' : 'Save & Finalize Treatment Plan'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Add New Protocol Modal ────────────────────────────── */}
      {showAddModal && (
        <div className="modal-overlay no-print" role="dialog" aria-modal="true">
          <div className="modal-dialog" style={{ maxWidth: 600 }}>
            <header className="modal-header">
              <h3>➕ Add New Treatment Protocol to Clinic Library</h3>
              <button className="modal-close-btn" type="button" onClick={() => setShowAddModal(false)}>✕</button>
            </header>
            <form onSubmit={handleAddNewProtocol} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
              <label>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Protocol / Disease Name:</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Flea Allergy Dermatitis / Malassezia Yeast / Canine Papillomavirus"
                  value={newProtocolName}
                  onChange={(e) => setNewProtocolName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>

              <label>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Category:</span>
                <select
                  value={newProtocolCategory}
                  onChange={(e) => setNewProtocolCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 4, boxSizing: 'border-box' }}
                >
                  <option value="🐶 Canine Protocols (Aso)">🐶 Canine Protocols (Aso)</option>
                  <option value="🐱 Feline Protocols (Pusa)">🐱 Feline Protocols (Pusa)</option>
                  <option value="🦜 Avian Protocols (Ibon)">🦜 Avian Protocols (Ibon)</option>
                  <option value="🐇 Rabbit Protocols (Kuneho)">🐇 Rabbit Protocols (Kuneho)</option>
                  <option value="🩺 Common Dual Presentations">🩺 Common Dual Presentations</option>
                  <option value="✨ Custom Clinic Protocols">✨ Custom Clinic Protocols</option>
                </select>
              </label>

              <label>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Recommended Treatment Steps (1 per line):</span>
                <textarea
                  rows={4}
                  required
                  placeholder="Step 1: Cleanse affected area...&#10;Step 2: Administer targeted therapy...&#10;Step 3: Schedule 14-day recheck..."
                  value={newProtocolSteps}
                  onChange={(e) => setNewProtocolSteps(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>

              <label>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Default Prescription (Rx Orders):</span>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Medication name, form, dosage, and duration..."
                  value={newProtocolRx}
                  onChange={(e) => setNewProtocolRx(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>

              <label>
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Clinical Notes & Precautions:</span>
                <textarea
                  rows={2}
                  placeholder="e.g. Zoonotic precautions, e-collar compliance, recheck schedule..."
                  value={newProtocolNotes}
                  onChange={(e) => setNewProtocolNotes(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 4, boxSizing: 'border-box' }}
                />
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button type="button" className="secondary-btn" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  💾 Save to Clinic Library
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Official Print Document (Authentic Philippine Veterinary Format) ── */}
      <div className="official-rx-print-document" style={{ display: 'none' }}>
        {isAwaitingLab ? (
          /* Official Lab Order Print Slip */
          <div style={{ border: '2px solid #0f172a', padding: 24, borderRadius: 8 }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 14, marginBottom: 16 }}>
              <h1 style={{ margin: '0 0 4px', fontSize: '1.7rem', color: '#0f172a', letterSpacing: '0.5px' }}>
                VETLINK ANIMAL CARE CLINIC & HOSPITAL
              </h1>
              <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>
                Department of Clinical Pathology & Diagnostic Dermatology
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                102 Rizal Avenue, Brgy. San Antonio • Tel: (02) 8876-5432 • Mobile: 0917-123-4567 • clinic@vetlink.ph
              </p>
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#92400e', marginBottom: 16, fontSize: '0.95rem', letterSpacing: '0.5px' }}>
              OFFICIAL LABORATORY REQUISITION ORDER SLIP
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12, padding: 12, border: '1px solid #cbd5e1', borderRadius: 6, marginBottom: 18, fontSize: '0.88rem' }}>
              <div>
                <strong>PATIENT NAME:</strong> {patient?.name || '________'}<br />
                <strong>SPECIES / BREED:</strong> {patient?.species || 'Canine'} • {patient?.breed || '________'}<br />
                <strong>WEIGHT:</strong> {patient?.weight ? `${patient.weight} kg` : '________ kg'} • <strong>AGE:</strong> {patient?.age || '________'}<br />
                <strong>PATIENT ID:</strong> {patient?.id || 'P-________'}
              </div>
              <div>
                <strong>OWNER:</strong> {patient?.ownerName || '________'}<br />
                <strong>CONTACT:</strong> {patient?.ownerPhone || '________'}<br />
                <strong>DATE:</strong> {todayStr}<br />
                <strong>ORDERING VET:</strong> Dr. Sarah Lin, DVM<br />
                <strong>REQUISITION ID:</strong> {consultation?.id || 'REQ-2026-1027'}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', borderBottom: '1px solid #cbd5e1', paddingBottom: 4, marginBottom: 8 }}>
                SUSPECTED DERMATOLOGICAL ETIOLOGY:
              </div>
              <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.9rem' }}>
                <strong>Primary:</strong> {diagnosis} • <strong>Comorbidity Flag:</strong> {secondaryDiagnosis || 'None'}<br />
                <strong>Algorithmic Triage Flag:</strong> {aiResult?.percent || '<60%'} (Confirmatory testing mandated prior to pharmacological dispensing)
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', borderBottom: '1px solid #cbd5e1', paddingBottom: 4, marginBottom: 8 }}>
                SPECIFIED LABORATORY DIAGNOSTIC PROCEDURES:
              </div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.88rem', lineHeight: 1.6 }}>
                <li>[X] <strong>Deep / Superficial Skin Scraping:</strong> Mineral oil preparation for Demodex / Sarcoptes / Notoedres mites</li>
                <li>[X] <strong>Wood\'s Lamp Examination & DTM Fungal Culture:</strong> Rule out Dermatophytosis (Microsporum canis)</li>
                <li>[X] <strong>Tape Impression Cytology:</strong> Diff-Quik stain for Malassezia yeast and bacterial cocci</li>
              </ul>
            </div>

            <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 20, borderTop: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: 360 }}>
                Specimen Collection Protocol: Sample active lesion borders. Label specimen slides with Patient ID and collection time.
              </div>
              <div style={{ textAlign: 'center', width: 230 }}>
                <div style={{ borderBottom: '1px solid #0f172a', marginBottom: 6, height: 32 }}></div>
                <strong style={{ fontSize: '0.9rem' }}>Dr. Sarah Lin, DVM</strong><br />
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>PRC License No.: VET-894102</span><br />
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>PTR No.: 1948201</span>
              </div>
            </div>
          </div>
        ) : (
          /* Official Authentic Veterinary Prescription (Rx Slip) */
          <div style={{ border: '2px solid #0f172a', padding: 24, borderRadius: 8 }}>
            {/* Clinic Header */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: 14, marginBottom: 16 }}>
              <h1 style={{ margin: '0 0 4px', fontSize: '1.7rem', color: '#0f172a', letterSpacing: '0.5px' }}>
                VETLINK ANIMAL CARE CLINIC & HOSPITAL
              </h1>
              <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>
                Veterinary Medical Center • Department of Clinical Dermatology
              </p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                102 Rizal Avenue, Brgy. San Antonio • Tel: (02) 8876-5432 • Mobile: 0917-123-4567 • clinic@vetlink.ph
              </p>
            </div>

            {/* Patient & Client Metadata Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, padding: 12, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, marginBottom: 18, fontSize: '0.88rem' }}>
              <div>
                <strong>FOR (PATIENT):</strong> <span style={{ fontSize: '1.05rem', fontWeight: 800 }}>{patient?.name || '________'}</span><br />
                <strong>SPECIES / BREED:</strong> {patient?.species || 'Canine'} • {patient?.breed || '________'}<br />
                <strong>WEIGHT:</strong> {patient?.weight ? `${patient.weight} kg` : '________ kg'} • <strong>AGE:</strong> {patient?.age || '________'}
              </div>
              <div>
                <strong>OWNER:</strong> {patient?.ownerName || '________'}<br />
                <strong>CONTACT:</strong> {patient?.ownerPhone || '________'}<br />
                <strong>DATE:</strong> {todayStr}<br />
                <strong>CASE / RX ID:</strong> {consultation?.id || 'RX-2026-1027'}
              </div>
            </div>

            {/* Diagnosis Banner */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#f1f5f9', borderLeft: '4px solid #1e3a8a', marginBottom: 18 }}>
              <span style={{ fontSize: '0.88rem' }}>
                <strong>CLINICAL DIAGNOSIS:</strong> <u style={{ fontWeight: 800 }}>{diagnosis}</u> ({primaryProtocol.category || patientSpecies})
                {secondaryDiagnosis ? ` + ${secondaryDiagnosis} (Concurrent Comorbidity)` : ''}
              </span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>
                VALIDATED CLINICAL PRESCRIPTION
              </span>
            </div>

            {/* Prominent Rx Section */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', fontWeight: 900, color: '#1e3a8a', lineHeight: 1 }}>
                  ℞
                </span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a', letterSpacing: '0.5px' }}>
                  MEDICATION & DOSAGE DISPENSING ORDER
                </span>
              </div>
              <div style={{
                padding: 16,
                border: '1.5px solid #0f172a',
                borderRadius: 6,
                fontSize: '0.96rem',
                lineHeight: 1.65,
                minHeight: 100,
                whiteSpace: 'pre-wrap',
                fontFamily: 'Consolas, "Courier New", monospace',
                background: '#fafafa',
              }}>
                {prescription}
              </div>
            </div>

            {/* Home Care & Special Instructions */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', marginBottom: 6, textTransform: 'uppercase' }}>
                CLINICAL CARE, HOME ADMINISTRATION & RECHECK INSTRUCTIONS:
              </div>
              <div style={{ padding: 12, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.88rem', lineHeight: 1.5, background: '#ffffff' }}>
                {clinicalNotes}
              </div>
            </div>

            {/* Signature & License Block */}
            <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 16, borderTop: '1px solid #cbd5e1' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: 360, lineHeight: 1.4 }}>
                Notice: Official prescription issued under Republic Act 9268. Valid for 30 days from date of examination. Substitution requires attending veterinarian authorization.
              </div>
              <div style={{ textAlign: 'center', width: 230 }}>
                <div style={{ borderBottom: '1px solid #0f172a', marginBottom: 6, height: 32 }}></div>
                <strong style={{ fontSize: '0.92rem' }}>Dr. Sarah Lin, DVM</strong><br />
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>PRC License No.: VET-894102</span><br />
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>PTR No.: 1948201</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
