/**
 * vetlink-ai.js
 * VetLink AI inference engine — 11-class multi-species skin disease classifier
 * Model: MobileNetV3Large (97.33% test accuracy)
 *
 * NOTE: tf and tflite are loaded as global variables via CDN scripts in index.html.
 * Do NOT import them as npm modules — they are not bundled.
 */

let model       = null
let classLabels = []
let isLoading   = false

// Species → expected classes (informational, not used for filtering)
export const SPECIES_CLASSES = {
  Canine: ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  Feline: ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  Avian:  ['Avian Fowl Pox', 'Bird_Healthy', 'Scaly Face Scaly Leg Mite (Knemidocoptes)'],
  Rabbit: ['Rabbit Mange', 'Rabbit Ringworm', 'Rabbit_Healthy'],
}

// Human-readable display labels for the UI
export const CLASS_DISPLAY = {
  'Avian Fowl Pox':                            'Avian Fowl Pox',
  'Bird_Healthy':                              'Healthy (Bird)',
  'Healthy':                                   'Healthy',
  'Hotspots':                                  'Hot Spots',
  'Mange':                                     'Mange',
  'Pyoderma':                                  'Pyoderma',
  'Rabbit Mange':                              'Mange (Rabbit)',
  'Rabbit Ringworm':                           'Ringworm (Rabbit)',
  'Rabbit_Healthy':                            'Healthy (Rabbit)',
  'Ringworm':                                  'Ringworm',
  'Scaly Face Scaly Leg Mite (Knemidocoptes)': 'Scaly Face / Leg Mite',
}

// Brief clinical description per class (shown with the new-patient analysis)
export const CLASS_DESCRIPTIONS = {
  'Avian Fowl Pox':        'Viral infection causing wart-like lesions on skin and beak.',
  'Bird_Healthy':           'No disease detected. Skin and feathers appear healthy.',
  'Healthy':                'No disease detected. Skin appears healthy.',
  'Hotspots':               'Acute moist dermatitis. Likely caused by allergies or self-trauma.',
  'Mange':                  'Mite infestation causing intense itching, hair loss, and skin crusting.',
  'Pyoderma':               'Bacterial skin infection with papules, pustules, or crusts.',
  'Rabbit Mange':           'Mite-caused condition with hair loss and skin crusting in rabbits.',
  'Rabbit Ringworm':        'Fungal infection causing circular bald patches in rabbits.',
  'Rabbit_Healthy':         'No disease detected. Fur and skin appear healthy.',
  'Ringworm':               'Fungal skin infection causing circular, scaly lesions.',
  'Scaly Face Scaly Leg Mite (Knemidocoptes)':
    'Mite infestation causing crusty, scaly beak and legs in birds.',
}

/**
 * Wait for the CDN scripts to be available on window.
 * The scripts are loaded before React, so this should resolve instantly.
 */
function waitForTF(maxWaitMs = 10000) {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (window.tf && window.tflite) {
        resolve({ tf: window.tf, tflite: window.tflite })
      } else {
        reject(new Error(
          'TensorFlow.js did not load. Check your internet connection — ' +
          'the AI model requires CDN scripts on first load.'
        ))
      }
    }
    // Give scripts a moment if they haven't finished yet
    if (window.tf && window.tflite) {
      resolve({ tf: window.tf, tflite: window.tflite })
    } else {
      setTimeout(check, maxWaitMs)
    }
  })
}

/**
 * Load the TFLite model and label map.
 * Call once on app startup; safe to call multiple times (cached).
 */
export async function loadVetLinkModel() {
  if (model) return model
  if (isLoading) {
    while (isLoading) {
      await new Promise((res) => setTimeout(res, 100))
    }
    return model
  }

  isLoading = true
  try {
    const { tf, tflite } = await waitForTF()
    await tf.ready()

    // Set WASM path for the TFLite runtime (alpha.9 contains the required wasm binaries)
    tflite.setWasmPath(
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.9/dist/'
    )

    // 1. Fetch label map
    const labelResponse = await fetch('/models/vetlink_labels_v2.json')
    if (!labelResponse.ok) throw new Error('Could not load label map')
    const labelMap = await labelResponse.json()

    // { "0": "Avian Fowl Pox", ... } → ["Avian Fowl Pox", ...]
    classLabels = Object.keys(labelMap)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .map((key) => labelMap[key])

    // 2. Explicitly fetch model file as ArrayBuffer (avoids relative path resolution bugs in worker)
    const modelResponse = await fetch('/models/vetlink_model_v2.tflite')
    if (!modelResponse.ok) throw new Error(`Could not fetch model: HTTP ${modelResponse.status}`)
    const modelBuffer = await modelResponse.arrayBuffer()
    console.log('[VetLink AI] Model buffer fetched successfully:', modelBuffer.byteLength, 'bytes')

    // 3. Load model from ArrayBuffer with numThreads: 1 to ensure instant, deadlock-free execution
    model = await tflite.loadTFLiteModel(modelBuffer, {
      numThreads: 1,
    })

    console.log('[VetLink AI] Model initialized with single-thread WASM. Classes:', classLabels)
    return model
  } finally {
    isLoading = false
  }
}

/**
 * Preprocess an image element for MobileNetV3Large.
 * The model was exported with include_preprocessing=True (Node 0: MUL 1/127.5, Node 1: ADD -1),
 * so it expects float32 pixels in [0, 255].
 * Output: float32 Tensor4D [1, 224, 224, 3]
 */
function preprocessImage(imageElement) {
  const tf = window.tf
  return tf.tidy(() => {
    let t = tf.browser.fromPixels(imageElement)    // [H, W, 3] in [0, 255]
    t = tf.image.resizeBilinear(t, [224, 224])     // [224, 224, 3]
    t = t.toFloat()                                // float32 [0, 255]
    return t.expandDims(0)                          // [1, 224, 224, 3]
  })
}

import { generateGradCAM } from './gradcam'

/**
 * Run AI inference on an image element with species-aware diagnostic support.
 * As detailed in Chapter 3 (Page 40) of the Capstone paper, VetLink enforces
 * species-aware gating across 4 domestic animal species (Canine, Feline, Avian, Rabbit)
 * so that clinically impossible cross-species diagnoses (e.g. canine Pyoderma in a rabbit)
 * are eliminated.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imageElement
 * @param {string} species - 'Canine' | 'Feline' | 'Avian' | 'Rabbit'
 * @returns {Promise<{ label, displayLabel, confidence, percent, description, top3, gradcam }>}
 */
function imageToBase64(imageElement) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width  = 224
    canvas.height = 224
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imageElement, 0, 0, 224, 224)
    return canvas.toDataURL('image/jpeg', 0.95)
  } catch (err) {
    console.warn('[VetLink AI] Failed to convert image to base64:', err)
    return null
  }
}

/**
 * Run AI inference on an image element with species-aware diagnostic support.
 * As detailed in Chapter 3 (Page 40) of the Capstone paper, VetLink enforces
 * species-aware gating across 4 domestic animal species (Canine, Feline, Avian, Rabbit)
 * so that clinically impossible cross-species diagnoses (e.g. canine Pyoderma in a rabbit)
 * are eliminated.
 *
 * Primary execution: Native TFLite via FastAPI endpoint (/api/ai/predict) in 0.04s.
 * Edge fallback: In-browser WASM runner via @tensorflow/tfjs-tflite.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imageElement
 * @param {string} species - 'Canine' | 'Feline' | 'Avian' | 'Rabbit'
 * @returns {Promise<{ label, displayLabel, confidence, percent, description, top3, gradcam }>}
 */
export async function predict(imageElement, species = 'Canine') {
  console.time('[VetLink AI] Inference Time')

  // 1. PRIMARY PATH: High-speed native TFLite inference via backend
  const b64 = imageToBase64(imageElement)
  if (b64) {
    const candidateEndpoints = ['/api/ai/predict', 'http://localhost:8000/api/ai/predict']
    for (const endpoint of candidateEndpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, species }),
        })
        if (res.ok) {
          const data = await res.json()
          console.timeEnd('[VetLink AI] Inference Time')

          if (data.rejected) {
            return {
              rejected: true,
              reason: data.reason || 'NON_ANIMAL',
              detected: data.detected,
              message: data.message,
            }
          }

          console.log(`[VetLink AI] Native TFLite result: ${data.label} (${data.percent})`)

          // Generate Grad-CAM 3-panel visualization (matching Colab Cell 8)
          const gradcam = await generateGradCAM(imageElement)

          return {
            label:        data.label,
            displayLabel: data.displayLabel || CLASS_DISPLAY[data.label] || data.label,
            confidence:   data.confidence,
            percent:      data.percent || `${(data.confidence * 100).toFixed(1)}%`,
            description:  CLASS_DESCRIPTIONS[data.label] || '',
            top3:         data.top3 || [],
            gradcam,
            engine:       'backend',
          }
        }
      } catch (err) {
        // Continue to fallback
      }
    }
  }

  // 2. FALLBACK PATH: Client-side in-browser WASM inference
  console.warn('[VetLink AI] Backend unreachable; attempting client-side WASM inference...')
  if (!model) await loadVetLinkModel()

  const tf          = window.tf
  const inputTensor = preprocessImage(imageElement)

  let outputTensor = null
  let rawOutput    = null

  try {
    rawOutput = model.predict(inputTensor)

    if (rawOutput instanceof tf.Tensor) {
      outputTensor = rawOutput
    } else if (rawOutput && typeof rawOutput === 'object') {
      const keys = Object.keys(rawOutput)
      if (keys.length === 0) throw new Error('TFLite model returned empty outputs')
      outputTensor = rawOutput[keys[0]]
    } else {
      throw new Error(`Unexpected TFLite model output: ${typeof rawOutput}`)
    }

    const rawData = outputTensor.dataSync ? outputTensor.dataSync() : await outputTensor.data()
    console.timeEnd('[VetLink AI] Inference Time')
    const probabilities = Array.from(rawData)

    // Allowed classes for the selected patient species
    const allowedClasses = SPECIES_CLASSES[species] || classLabels

    // Filter candidates to the selected species and normalize
    const candidateList = classLabels
      .map((label, idx) => ({ label, prob: probabilities[idx] || 0 }))
      .filter((item) => allowedClasses.includes(item.label))

    const sumProb = candidateList.reduce((acc, cur) => acc + cur.prob, 0) || 1
    const classScores = candidateList
      .map((item) => ({
        label: item.label,
        confidence: item.prob / sumProb,
      }))
      .sort((a, b) => b.confidence - a.confidence)

    const topItem  = classScores[0] || { label: 'Unknown', confidence: 0 }
    const topLabel = topItem.label
    const topConf  = topItem.confidence

    const top3 = classScores.slice(0, 3).map((item) => ({
      label:   item.label,
      display: CLASS_DISPLAY[item.label] || item.label,
      confidence: item.confidence,
    }))

    // Generate Grad-CAM 3-panel visualization (Original, Heatmap, Overlay)
    const gradcam = await generateGradCAM(imageElement)

    const maxP = Math.max(...probabilities)
    const minP = Math.min(...probabilities)
    const isUniform = (maxP - minP) < 0.05

    return {
      label:        topLabel,
      displayLabel: CLASS_DISPLAY[topLabel] || topLabel,
      confidence:   topConf,
      percent:      `${(topConf * 100).toFixed(1)}%`,
      description:  CLASS_DESCRIPTIONS[topLabel] || '',
      top3,
      gradcam,
      engine:       'wasm',
      isUniform,
    }
  } finally {
    inputTensor.dispose()
    if (outputTensor && typeof outputTensor.dispose === 'function') {
      outputTensor.dispose()
    }
    if (rawOutput && typeof rawOutput === 'object' && !(rawOutput instanceof tf.Tensor)) {
      Object.values(rawOutput).forEach((t) => {
        if (t && typeof t.dispose === 'function' && t !== outputTensor) {
          t.dispose()
        }
      })
    }
  }
}

/**
 * Load a File into an HTMLImageElement, ready for inference.
 * Uses FileReader data URL and img.decode() to ensure full pixel availability.
 * @param {File} file
 * @returns {Promise<HTMLImageElement>}
 */
export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = async () => {
        try {
          if (typeof img.decode === 'function') {
            await img.decode()
          }
        } catch (_) {
          // Decode error fallback, can still be read by canvas/fromPixels
        }
        resolve(img)
      }
      img.onerror = () => reject(new Error('Failed to load image element'))
      img.src = e.target.result
    }
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

/**
 * Comprehensive Clinical Image Quality Gate & Pre-Inference Validation.
 * Evaluates 5 clinical imaging dimensions before invoking the AI model:
 * 1. Illumination / Underexposure: Rejects dark photos (mean luminance < 32).
 * 2. Glare / Overexposure: Rejects flash reflection and bleached margins (mean > 225 or >30% saturated).
 * 3. Surface Detail / Contrast: Rejects uniform/flat surfaces like walls, paper, or camera blockage (stdDev < 14).
 * 4. High-Frequency Focus / Sharpness: Replicates OpenCV cv2.Laplacian().var() (variance < 45.0).
 * 5. Biological Gamut: Rejects pure digital screens, synthetic neon graphics, or IDE editors.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} imgElement
 * @returns {{ isValid: boolean, reason?: string, title?: string, message: string, instructions?: string, score?: number }}
 */
export function validateClinicalImageQuality(imgElement) {
  try {
    const canvas = document.createElement('canvas')
    const size = 224
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgElement, 0, 0, size, size)
    const imgData = ctx.getImageData(0, 0, size, size)
    const d = imgData.data

    let totalLuminance = 0
    let overexposedPixels = 0
    let underexposedPixels = 0
    let biologicalColorPixels = 0
    let coldScreenPixels = 0
    let warmOrganicPixels = 0

    const gray = new Float32Array(size * size)
    const n = size * size

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]

      // Luminance (Rec. 601)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      gray[p] = lum
      totalLuminance += lum

      if (lum > 245) overexposedPixels++
      if (lum < 20) underexposedPixels++

      // Screen / Monitor / Slate UI detection
      // 1. Cold blue/slate UI pixels (b > r + 10 && b > g - 8)
      // 2. Dark cyan/slate background pixels (e.g., #0f172a, #1e293b, #334155: r < 75 && b > r + 8)
      const isColdSlateOrScreen = (b > r + 12 && b > g - 8) || (r < 75 && b > r + 8 && b > 25)
      if (isColdSlateOrScreen) {
        coldScreenPixels++
      }

      // Warm organic animal tissue (erythema, pink skin, tan/brown fur, scabs)
      // Red is dominant over green and blue (r > g && r > b + 10)
      const isWarmOrganic = (r > g && r > b + 10) || (r > 120 && g > 70 && b < 100 && r > b + 20)
      if (isWarmOrganic) {
        warmOrganicPixels++
      }

      // Synthetic neons
      const isSyntheticBlue = (b > r + 45 && b > g + 45 && b > 120) // Blue screen / IDE
      const isPureNeonGreen = (g > r + 65 && g > b + 65 && g > 130)
      if (!isSyntheticBlue && !isPureNeonGreen) {
        biologicalColorPixels++
      }
    }

    const meanLuminance = totalLuminance / n

    // 1. Lighting Check: Too Dark
    if (meanLuminance < 32 || (underexposedPixels / n) > 0.65) {
      return {
        isValid: false,
        reason: 'TOO_DARK',
        title: 'Image Rejected: Insufficient Lighting (Too Dark)',
        message: `Average image brightness is only ${Math.round((meanLuminance / 255) * 100)}%. In dark shadows, fine lesion margins, erythema, and pustules cannot be differentiated from healthy fur.`,
        instructions: 'Please move the animal into a well-lit area or turn on device lighting before retaking.',
      }
    }

    // 2. Lighting Check: Overexposed / Flash Glare
    if (meanLuminance > 225 || (overexposedPixels / n) > 0.35) {
      return {
        isValid: false,
        reason: 'OVEREXPOSED',
        title: 'Image Rejected: Severe Glare / Overexposure',
        message: 'Severe flash washout or direct glare detected across the lesion. White glare erases skin inflammation, crusting, and micro-textures.',
        instructions: 'Please tilt the camera slightly away from direct flash reflection and retake without harsh glare.',
      }
    }

    // 3. Contrast Check: Uniform / Obstructed Surface
    let varianceLum = 0
    for (let p = 0; p < n; p++) {
      const diff = gray[p] - meanLuminance
      varianceLum += diff * diff
    }
    const stdDevLuminance = Math.sqrt(varianceLum / n)
    if (stdDevLuminance < 14) {
      return {
        isValid: false,
        reason: 'UNIFORM_SURFACE',
        title: 'Image Rejected: Blank / Obstructed Surface',
        message: 'A flat, uniform surface (such as a wall, desk, paper, or camera blockage) was detected without visible skin or fur textures.',
        instructions: 'Please ensure the camera is aimed directly at the animal patient\'s skin or fur lesion.',
      }
    }

    // 4. Sharpness Check: Laplacian Operator Variance (∇² f)
    let sumLap = 0
    let sumSqLap = 0
    let lapCount = 0

    for (let y = 1; y < size - 1; y++) {
      const rowIdx = y * size
      for (let x = 1; x < size - 1; x++) {
        const center = gray[rowIdx + x]
        const up     = gray[(y - 1) * size + x]
        const down   = gray[(y + 1) * size + x]
        const left   = gray[rowIdx + (x - 1)]
        const right  = gray[rowIdx + (x + 1)]

        const lap = up + down + left + right - 4.0 * center
        sumLap += lap
        sumSqLap += lap * lap
        lapCount++
      }
    }

    const meanLap = sumLap / (lapCount || 1)
    const lapVariance = Math.round(((sumSqLap / (lapCount || 1)) - meanLap * meanLap) * 10) / 10

    if (lapVariance < 45.0) {
      return {
        isValid: false,
        reason: 'BLURRY',
        title: 'Image Rejected: Motion Blur / Out of Focus',
        message: `Image sharpness score is ${lapVariance} (minimum clinical threshold: 45.0). Blurry images smear fine scabs and pustules, causing diagnostic errors.`,
        instructions: 'Please hold the device steady, tap the lesion area on screen to focus, and capture again.',
        score: lapVariance,
      }
    }

    // 5. Digital Screen / Computer Monitor Check
    const coldRatio = coldScreenPixels / n
    const warmRatio = warmOrganicPixels / n
    if (coldRatio > 0.28 || (coldRatio > 0.16 && warmRatio < 0.10)) {
      return {
        isValid: false,
        reason: 'DIGITAL_SCREEN',
        title: 'Image Rejected: Computer Monitor / Digital Screen Detected',
        message: 'The captured frame appears to be a computer monitor, software interface, or digital display rather than an animal patient. VetLink only analyzes direct photos of animal skin or fur lesions.',
        instructions: 'Please point your camera directly at the animal patient (dog, cat, bird, or rabbit) with proper focus on the lesion.',
      }
    }

    // 6. Biological Gamut Check
    if ((biologicalColorPixels / n) < 0.30) {
      return {
        isValid: false,
        reason: 'NON_BIOLOGICAL',
        title: 'Image Rejected: Non-Biological Subject Detected',
        message: 'The frame appears to capture a digital screen, synthetic graphic, or non-organic surface rather than animal tissue.',
        instructions: 'Please point your camera at an actual animal skin lesion.',
      }
    }

    return {
      isValid: true,
      sharpnessScore: lapVariance,
      brightness: Math.round((meanLuminance / 255) * 100),
      contrast: Math.round(stdDevLuminance),
      message: 'Image passed all clinical quality and focus gates.',
    }
  } catch (err) {
    console.warn('[VetLink AI] Quality validation bypass on error:', err)
    return { isValid: true, bypass: true, message: 'Quality check bypassed.' }
  }
}

/**
 * Backwards compatibility helper for checkImageSharpness.
 */
export function checkImageSharpness(imgElement) {
  const q = validateClinicalImageQuality(imgElement)
  return {
    isSharp: q.isValid,
    score: q.sharpnessScore || 50,
    message: q.message,
  }
}

// -----------------------------------------------------------------------------
// Veterinary Dermatological Symptoms Master Dictionary & Knowledge Base
// -----------------------------------------------------------------------------
export const MASTER_SYMPTOMS = [
  { id: 'SYM-PRURITUS', name: 'Pruritus (Severe Itching / Scratching / Licking)', shortName: 'Pruritus / Itching' },
  { id: 'SYM-ERYTHEMA', name: 'Erythema (Skin Redness / Active Inflammation)', shortName: 'Erythema / Redness' },
  { id: 'SYM-ALOPECIA', name: 'Alopecia (Focal / Generalized Hair Loss)', shortName: 'Alopecia / Hair Loss' },
  { id: 'SYM-SCALING',  name: 'Scaling & Crusts (Flaking / Dandruff / Scabs)', shortName: 'Scaling & Crusts' },
  { id: 'SYM-PUSTULES', name: 'Pustules & Papules (Pus-filled Bumps / Pimples)', shortName: 'Pustules & Papules' },
  { id: 'SYM-EXUDATE',  name: 'Moist Exudate (Oozing / Sticky / Matted Fur)', shortName: 'Moist Exudate / Hotspot' },
  { id: 'SYM-ODOR',     name: 'Malodorous / Rancid Yeast Odor', shortName: 'Rancid Yeast Odor' },
  { id: 'SYM-LICHEN',   name: 'Lichenification (Thickened, Darkened Leathery Skin)', shortName: 'Lichenification' },
]

export const DISEASE_HALLMARK_SYMPTOMS = {
  'Flea Allergy Dermatitis': ['SYM-PRURITUS', 'SYM-ERYTHEMA', 'SYM-ALOPECIA', 'SYM-SCALING'],
  'Ringworm':                ['SYM-ALOPECIA', 'SYM-SCALING', 'SYM-PRURITUS'],
  'Rabbit Ringworm':         ['SYM-ALOPECIA', 'SYM-SCALING'],
  'Hot Spots':               ['SYM-EXUDATE', 'SYM-ERYTHEMA', 'SYM-PRURITUS', 'SYM-ODOR'],
  'Hotspots':                ['SYM-EXUDATE', 'SYM-ERYTHEMA', 'SYM-PRURITUS', 'SYM-ODOR'],
  'Mange':                   ['SYM-ALOPECIA', 'SYM-SCALING', 'SYM-LICHEN', 'SYM-PRURITUS'],
  'Rabbit Mange':            ['SYM-SCALING', 'SYM-ALOPECIA', 'SYM-PRURITUS'],
  'Pyoderma':                ['SYM-PUSTULES', 'SYM-ERYTHEMA', 'SYM-SCALING'],
  'Scaly Face Scaly Leg Mite (Knemidocoptes)': ['SYM-SCALING', 'SYM-LICHEN'],
  'Avian Fowl Pox':          ['SYM-PUSTULES', 'SYM-SCALING'],
  'Healthy':                 [],
  'Rabbit Healthy':          [],
  'Bird Healthy':            [],
}

export function getSuggestedSymptomsForDisease(diseaseLabel) {
  if (!diseaseLabel) return []
  const norm = diseaseLabel.toLowerCase()
  for (const [key, symptomIds] of Object.entries(DISEASE_HALLMARK_SYMPTOMS)) {
    if (norm.includes(key.toLowerCase()) || key.toLowerCase().includes(norm)) {
      return symptomIds
    }
  }
  return []
}

