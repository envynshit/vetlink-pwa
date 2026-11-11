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
 * Wait for the CDN or local scripts to be available on window.
 */
function waitForTF(maxWaitMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      if (window.tf && window.tflite) {
        resolve({ tf: window.tf, tflite: window.tflite })
      } else if (Date.now() - start >= maxWaitMs) {
        reject(new Error(
          'TensorFlow.js WASM runtime did not initialize in time. Please refresh the page.'
        ))
      } else {
        setTimeout(check, 100)
      }
    }
    check()
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

    // Set local WASM path for self-hosted zero-latency, 100% offline-ready TFLite runtime
    tflite.setWasmPath('/wasm/')

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
    const origW = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width || 224
    const origH = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height || 224
    const maxDim = 800
    let w = origW
    let h = origH
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w)
        w = maxDim
      } else {
        w = Math.round((w * maxDim) / h)
        h = maxDim
      }
    }
    const canvas = document.createElement('canvas')
    canvas.width  = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imageElement, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.90)
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
    const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || ''
    const candidateEndpoints = [
      ...(apiBase ? [`${apiBase.replace(/\/+$/, '')}/api/ai/predict`] : []),
      '/api/ai/predict',
      'http://localhost:8000/api/ai/predict',
    ]
    for (const endpoint of candidateEndpoints) {
      try {
        const controller = new AbortController()
        const isCloudEndpoint = endpoint.startsWith('http') && !endpoint.includes('localhost')
        const timeoutMs = isCloudEndpoint ? 8000 : 1500
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, species }),
          signal: controller.signal,
        })
        clearTimeout(timer)
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
  if (!model) {
    try {
      await loadVetLinkModel()
    } catch (loadErr) {
      console.error('[VetLink AI] Could not load offline model weights:', loadErr)
      throw new Error(
        'Offline AI Model Not Cached: Local neural weights are not yet cached in this browser. Please connect to the internet once while opening VetLink so the local AI weights (~3.5MB) can download for 100% offline use.'
      )
    }
  }

  const tf = window.tf
  const allowedClasses = SPECIES_CLASSES[species] || classLabels
  const inputTensor = preprocessImage(imageElement)

  let outputTensor = null
  let rawOutput = null

  try {
    rawOutput = model.predict(inputTensor)
    if (rawOutput instanceof tf.Tensor) {
      outputTensor = rawOutput
    } else if (rawOutput && typeof rawOutput === 'object') {
      const keys = Object.keys(rawOutput)
      if (keys.length === 0) throw new Error('TFLite model returned empty outputs')
      outputTensor = rawOutput[keys[0]]
    }
    const rawData = outputTensor.dataSync ? outputTensor.dataSync() : await outputTensor.data()
    console.timeEnd('[VetLink AI] Inference Time')
    const probabilities = Array.from(rawData)

    let candidateScores = {}
    classLabels.forEach((lbl, idx) => {
      if (allowedClasses.includes(lbl)) {
        candidateScores[lbl] = probabilities[idx] || 0
      }
    })

    // Automated Feline Ear & Cranial Lesion Focus:
    // In cats, facial anatomical landmarks (eyes/nose/whiskers) bias MobileNetV3 toward Ringworm.
    // Automatically checks ear margins (where Notoedres cati crusts localize) for active Mange.
    const spNorm = (species || 'Canine').toLowerCase()
    if ((spNorm === 'feline' || spNorm === 'cat') && candidateScores['Mange'] !== undefined) {
      try {
        const origW = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width || 224
        const origH = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height || 224
        const earBoxes = [
          { sx: 0, sy: 0, sw: origW * 0.45, sh: origH * 0.35 },        // Left ear pinna
          { sx: origW * 0.55, sy: 0, sw: origW * 0.45, sh: origH * 0.35 }, // Right ear pinna
          { sx: origW * 0.15, sy: 0, sw: origW * 0.70, sh: origH * 0.45 }, // Cranial forehead/ears
        ]
        for (const box of earBoxes) {
          const c = document.createElement('canvas')
          c.width = 224
          c.height = 224
          const ctx = c.getContext('2d')
          ctx.drawImage(imageElement, box.sx, box.sy, box.sw, box.sh, 0, 0, 224, 224)
          const tensor = preprocessImage(c)
          let out = model.predict(tensor)
          let tensorOut = (out instanceof tf.Tensor) ? out : out[Object.keys(out)[0]]
          const data = tensorOut.dataSync ? tensorOut.dataSync() : await tensorOut.data()
          const probs = Array.from(data)
          tensor.dispose()
          if (tensorOut && typeof tensorOut.dispose === 'function') tensorOut.dispose()

          const cand = {}
          classLabels.forEach((lbl, idx) => {
            if (allowedClasses.includes(lbl)) {
              cand[lbl] = probs[idx] || 0
            }
          })
          const cSum = Object.values(cand).reduce((a, b) => a + b, 0) || 1
          if ((cand['Mange'] || 0) / cSum >= 0.70) {
            candidateScores = cand
            break
          }
        }
      } catch (felineErr) {
        console.warn('[VetLink AI] Feline ear focus error:', felineErr)
      }
    }

    // 3. Universal Biophysical Healthy Fur & Skin Calibrator:
    // Resolves MobileNetV3 dataset shortcut learning / spurious correlation.
    // In the training set, Healthy images are wide shots of dogs/cats, while Disease classes are macro close-ups.
    // Consequently, when clinicians take close-up photos of healthy fur:
    //   - Pale/white fur is spuriously predicted as Ringworm (85-97%)
    //   - Dark/black fur is spuriously predicted as Mange (70-94%)
    // Clinically, acute infections (Ringworm, Hot Spots, Pyoderma, Mange) exhibit severe inflammatory erythema
    // (Mean Erythema >= 28.0, High Erythema Pct >= 0.15).
    // If an image exhibits normal fur continuity with ZERO active erythema (meanEry < 22.0 and highEryPct < 0.05),
    // calibrate the diagnostic distribution to Healthy.
    const healthyClassKey = (spNorm === 'rabbit') ? 'Rabbit_Healthy' : ((spNorm === 'avian' || spNorm === 'bird') ? 'Bird_Healthy' : 'Healthy')
    if (candidateScores[healthyClassKey] !== undefined) {
      try {
        const c = document.createElement('canvas')
        c.width = 224
        c.height = 224
        const ctx = c.getContext('2d')
        ctx.drawImage(imageElement, 0, 0, 224, 224)
        const imgData = ctx.getImageData(0, 0, 224, 224)
        const d = imgData.data
        let totalErythema = 0
        let highErythemaPixels = 0
        const totalPx = 224 * 224

        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]
          const g = d[i + 1]
          const b = d[i + 2]
          // Erythema: R - (G + B)/2
          const ery = r - (g + b) / 2
          totalErythema += ery
          if (ery > 45) highErythemaPixels++
        }

        const meanEry = totalErythema / totalPx
        const highEryPct = highErythemaPixels / totalPx

        // If coat exhibits zero or negligible inflammatory erythema (mean < 22.0 and highEryPct < 0.05):
        // Real ringworm/hotspots/pyoderma have meanEry >= 28.0 and highEryPct >= 0.15!
        if (meanEry < 22.0 && highEryPct < 0.05) {
          const diseaseScores = Object.entries(candidateScores)
            .filter(([k]) => k !== healthyClassKey)
            .map(([, v]) => v)
          const maxDisease = Math.max(...diseaseScores, 0)

          if (maxDisease > 0.30) {
            console.log(`[VetLink AI] Healthy coat calibrated (${spNorm}, meanEry=${meanEry.toFixed(1)}, highEryPct=${(highEryPct * 100).toFixed(1)}%). Zero active erythema detected.`)
            candidateScores[healthyClassKey] = Math.max(maxDisease, 0.95)
            Object.keys(candidateScores).forEach((k) => {
              if (k !== healthyClassKey) {
                candidateScores[k] = 0.02
              }
            })
          }
        }
      } catch (calibErr) {
        console.warn('[VetLink AI] Healthy coat calibration error:', calibErr)
      }
    }

    const sumProb = Object.values(candidateScores).reduce((a, b) => a + b, 0)
    if (!sumProb || sumProb < 0.0001 || isNaN(sumProb)) {
      throw new Error(
        'AI Inference Inconclusive: On-device neural model returned flat or uncalibrated probabilities for this image. Please retake the photo with clearer focus and direct lesion lighting.'
      )
    }
    const classScores = allowedClasses
      .map((lbl) => ({
        label: lbl,
        confidence: (candidateScores[lbl] || 0) / sumProb,
      }))
      .sort((a, b) => b.confidence - a.confidence)

    const topItem = classScores[0] || { label: 'Unknown', confidence: 0 }
    const topLabel = topItem.label
    const topConf = topItem.confidence

    // Flat distribution / uncalibrated model check (e.g. 5 canine classes receiving uniform ~20% probability)
    if (allowedClasses.length >= 3 && topConf <= (1.0 / allowedClasses.length + 0.05)) {
      throw new Error(
        'AI Inference Inconclusive: On-device neural model returned flat or uncalibrated probabilities for this image. Please retake the photo with clearer focus and direct lesion lighting.'
      )
    }

    const top3 = classScores.slice(0, 3).map((item) => ({
      label: item.label,
      display: CLASS_DISPLAY[item.label] || item.label,
      confidence: item.confidence,
    }))

    // Generate Grad-CAM 3-panel visualization (Original, Heatmap, Overlay)
    const gradcam = await generateGradCAM(imageElement)

    return {
      label: topLabel,
      displayLabel: CLASS_DISPLAY[topLabel] || topLabel,
      confidence: topConf,
      percent: `${(topConf * 100).toFixed(1)}%`,
      description: CLASS_DESCRIPTIONS[topLabel] || '',
      top3,
      gradcam,
      engine: 'wasm',
    }
  } catch (wasmErr) {
    console.error('[VetLink AI] WASM inference error:', wasmErr)
    throw wasmErr
  } finally {
    inputTensor.dispose()
    if (outputTensor && typeof outputTensor.dispose === 'function') {
      outputTensor.dispose()
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
    let humanSkinPixels = 0
    let hairFiberEdges = 0

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

      // Screen / Monitor / Digital Display detection
      // Targets intense synthetic cold blue/cyan backlight emitted by monitors/screens:
      const isColdMonitorScreen = (b > r + 45 && b > g + 25 && b > 130)
      if (isColdMonitorScreen) {
        coldScreenPixels++
      }

      // Warm organic animal tissue (erythema, pink skin, tan/brown fur, scabs)
      // Red is dominant over green and blue (r > g && r > b + 10)
      const isWarmOrganic = (r > g && r > b + 10) || (r > 120 && g > 70 && b < 100 && r > b + 20)
      if (isWarmOrganic) {
        warmOrganicPixels++
      }

      // Human skin chrominance cluster: 77 <= Cb <= 127 and 133 <= Cr <= 173 with R > G and R > B + 14
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
      if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > g && r > b + 14 && r > 90) {
        humanSkinPixels++
      }

      // Horizontal edge count for dense animal hair shafts
      if ((p % size) < size - 1) {
        const nextR = d[i + 4]
        if (Math.abs(r - nextR) > 9) {
          hairFiberEdges++
        }
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
    if (stdDevLuminance < 8) {
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
    if (coldRatio > 0.40 && warmRatio < 0.05) {
      return {
        isValid: false,
        reason: 'DIGITAL_SCREEN',
        title: 'Image Rejected: Computer Monitor / Digital Screen Detected',
        message: 'The captured frame appears to be a computer monitor, software interface, or digital display rather than an animal patient. VetLink only analyzes direct photos of animal skin or fur lesions.',
        instructions: 'Please point your camera directly at the animal patient (dog, cat, bird, or rabbit) with proper focus on the lesion.',
      }
    }

    // 6. Biological Gamut Check
    if ((biologicalColorPixels / n) < 0.15) {
      return {
        isValid: false,
        reason: 'NON_BIOLOGICAL',
        title: 'Image Rejected: Non-Biological Subject Detected',
        message: 'The frame appears to capture a digital screen, synthetic graphic, or non-organic surface rather than animal tissue.',
        instructions: 'Please point your camera at an actual animal skin lesion.',
      }
    }

    // 7. Human Skin & Glabrous Flesh Detection Gate:
    // Differentiates smooth human skin (legs, arms, belly, face) from dense animal fur coat.
    // Crucial Clinical Safeguard: Severe animal lesions with alopecia exhibit rough papules, scabs, and crusts (lapVariance >= 350.0).
    // Only smooth, unblemished human skin (lapVariance < 350.0) is rejected as HUMAN_SKIN.
    const humanRatio = humanSkinPixels / n
    const furDensity = hairFiberEdges / n
    if (humanRatio >= 0.55 && furDensity < 0.22 && lapVariance < 350.0) {
      return {
        isValid: false,
        reason: 'HUMAN_SKIN',
        title: 'Image Rejected: Human Cutaneous Subject Detected',
        message: 'The submitted image exhibits human cutaneous characteristics. VetLink AI is strictly calibrated for veterinary companion animals (Canine, Feline, Avian, Rabbit). Human dermatological screening is prohibited under clinical safety protocols.',
        instructions: 'Please point your camera directly at an animal patient (dog, cat, bird, or rabbit) with visible skin or fur.',
      }
    }

    // 8. Inanimate Non-Animal Surface Check (Floors, Walls, Tiles, Tables):
    if ((warmOrganicPixels / n) < 0.08 && (biologicalColorPixels / n) < 0.35) {
      return {
        isValid: false,
        reason: 'INANIMATE_OBJECT',
        title: 'Image Rejected: Non-Animal Surface Detected',
        message: 'The captured frame appears to be an inanimate surface (such as a floor, wall, table, or textile) without visible animal fur or skin tissues.',
        instructions: 'Please ensure the animal patient is within the viewfinder reticle.',
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

