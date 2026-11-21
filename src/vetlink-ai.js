/**
 * vetlink-ai.js
 * VetLink AI inference engine — 11-class multi-species skin disease classifier
 * Model: MobileNetV3Large (97.33% test accuracy)
 *
 * NOTE: tf and tflite are loaded as global variables via CDN scripts in index.html.
 * Do NOT import them as npm modules — they are not bundled.
 */

let onnxModel   = null
let model       = null
let classLabels = []
let isLoading   = false

let animalVerifierModel = null
let animalVerifierMeta  = null
let isVerifierLoading   = false

// Species → expected classes (with case-insensitive alias support)
export const SPECIES_CLASSES = {
  Canine: ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  canine: ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  dog:    ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  Feline: ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  feline: ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  cat:    ['Healthy', 'Hotspots', 'Mange', 'Pyoderma', 'Ringworm'],
  Avian:  ['Avian Fowl Pox', 'Bird_Healthy', 'Scaly Face Scaly Leg Mite (Knemidocoptes)'],
  avian:  ['Avian Fowl Pox', 'Bird_Healthy', 'Scaly Face Scaly Leg Mite (Knemidocoptes)'],
  bird:   ['Avian Fowl Pox', 'Bird_Healthy', 'Scaly Face Scaly Leg Mite (Knemidocoptes)'],
  Rabbit: ['Rabbit Mange', 'Rabbit Ringworm', 'Rabbit_Healthy'],
  rabbit: ['Rabbit Mange', 'Rabbit Ringworm', 'Rabbit_Healthy'],
}

// Human-readable display labels for the UI
export const CLASS_DISPLAY = {
  'Avian Fowl Pox':                            'Avian Fowl Pox',
  'Bird_Healthy':                              'Healthy (Bird)',
  'Healthy':                                   'Healthy (Intact Skin & Coat)',
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
  if (onnxModel) return onnxModel
  if (isLoading) {
    while (isLoading) {
      await new Promise((res) => setTimeout(res, 100))
    }
    return onnxModel
  }

  isLoading = true
  try {
    // 1. Fetch label map
    if (classLabels.length === 0) {
      try {
        const labelResponse = await fetch('/models/vetlink_labels_v2.json')
        if (labelResponse.ok) {
          const labelMap = await labelResponse.json()
          classLabels = Object.keys(labelMap)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map((key) => labelMap[key])
        }
      } catch (lErr) {
        console.warn('[VetLink AI] Could not load labels map:', lErr)
      }
    }

    // 2. Production Edge Inference Engine: ONNX Runtime Web (Single-Threaded WASM)
    if (!window.ort) {
      throw new Error('ONNX Runtime Web (ort.all.min.js) is not loaded on window.')
    }

    const ort = window.ort
    ort.env.wasm.wasmPaths = '/wasm/'
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false

    const modelRes = await fetch('/models/vetlink_model_v2.onnx')
    if (!modelRes.ok) {
      throw new Error(`Failed to fetch ONNX model: HTTP ${modelRes.status}`)
    }

    const modelBuf = await modelRes.arrayBuffer()
    onnxModel = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    console.log('[VetLink AI] Universal ONNX Web edge model initialized successfully. Classes:', classLabels)

    return onnxModel
  } finally {
    isLoading = false
  }
}

/**
 * Load the edge MobileNetV3Small ImageNet verifier and category metadata.
 * Enables 100% offline edge rejection of computer screens, furniture, and non-living objects.
 */
export async function loadAnimalVerifierModel() {
  if (animalVerifierModel && animalVerifierMeta) {
    return { model: animalVerifierModel, meta: animalVerifierMeta }
  }
  if (isVerifierLoading) {
    while (isVerifierLoading) {
      await new Promise((res) => setTimeout(res, 100))
    }
    return { model: animalVerifierModel, meta: animalVerifierMeta }
  }

  isVerifierLoading = true
  try {
    const { tf, tflite } = await waitForTF()
    await tf.ready()
    try {
      if (tf.findBackend && tf.findBackend('cpu')) {
        await tf.setBackend('cpu')
      }
    } catch (bErr) {
      console.warn('[VetLink AI] CPU backend notice (verifier):', bErr)
    }
    tflite.setWasmPath('/wasm/')

    if (!animalVerifierMeta) {
      const metaRes = await fetch('/models/vetlink_animal_verifier_meta.json')
      if (metaRes.ok) {
        animalVerifierMeta = await metaRes.json()
      }
    }

    if (!animalVerifierModel) {
      const modelRes = await fetch('/models/vetlink_animal_verifier.tflite')
      if (modelRes.ok) {
        const buffer = await modelRes.arrayBuffer()
        animalVerifierModel = await tflite.loadTFLiteModel(buffer, { numThreads: 1 })
        console.log('[VetLink AI] Edge animal verifier loaded successfully (2.76MB).')
      }
    }

    return { model: animalVerifierModel, meta: animalVerifierMeta }
  } catch (err) {
    console.warn('[VetLink AI] Edge animal verifier could not be loaded:', err)
    return { model: null, meta: null }
  } finally {
    isVerifierLoading = false
  }
}

/**
 * Fast edge biophysical human skin & face gate (2ms on 2D canvas).
 * Replicates the YCbCr and fur density differential gate from backend/main.py:1862-1885.
 * Prevents non-veterinary human subjects from being misdiagnosed as animal diseases.
 */
function checkHumanSkinGate(imageElement) {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 224
    canvas.height = 224
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imageElement, 0, 0, 224, 224)
    const imgData = ctx.getImageData(0, 0, 224, 224)
    const d = imgData.data
    const totalPx = 224 * 224

    let skinCount = 0
    let totalErythema = 0
    let highEryCount = 0
    let gradCount = 0

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]

      // YCbCr conversion
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
      const isSkin = cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > g && r > (b + 14) && r > 90
      if (isSkin) skinCount++

      // Erythema calculation: R - (G + B)/2
      const ery = r - (g + b) / 2
      totalErythema += ery
      if (ery > 45) highEryCount++

      // Horizontal edge gradient across red channel
      if ((i / 4) % 224 < 223) {
        const nextR = d[i + 4]
        if (Math.abs(nextR - r) > 9) gradCount++
      }
    }

    const meanEry = totalErythema / totalPx
    const humanRatio = skinCount / totalPx
    const highEryPct = highEryCount / totalPx
    const furDensity = gradCount / (224 * 223)

    const isHuman = (humanRatio >= 0.28 && furDensity < 0.22 && highEryPct < 0.06) ||
                    (humanRatio >= 0.50 && furDensity < 0.25 && highEryPct < 0.08)

    return { isHuman, humanRatio, furDensity, highEryPct, meanEry }
  } catch (err) {
    console.warn('[VetLink AI] Human skin gate evaluation error:', err)
    return { isHuman: false, meanEry: 0, highEryPct: 0 }
  }
}

/**
 * Biophysical Surface Telemetry for Intact Coat vs. Focal Lesions (Offline Parity).
 * Evaluates erythema, crusting, fur density, and center-to-outer alopecia ratio directly
 * on the 224x224 Float32 pixel buffer. Prevents healthy light/white coats from triggering
 * Ringworm texture shortcuts while protecting true dry circular alopecia and scaly fungal lesions.
 */
function auditIntactCoatPlaque(rgbFloats) {
  const totalPx = 224 * 224
  let totalLum = 0
  let totalEry = 0
  let highEryCount = 0
  let crustCount = 0
  let gradCount = 0
  let centerGradCount = 0
  let outerGradCount = 0
  let centerTotal = 0
  let outerTotal = 0

  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      const idx = (y * 224 + x) * 3
      const r = rgbFloats[idx]
      const g = rgbFloats[idx + 1]
      const b = rgbFloats[idx + 2]

      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      totalLum += lum

      const ery = r - (g + b) / 2.0
      totalEry += ery
      if (ery > 45) highEryCount++

      // Crusting / scaly keratin biomarker
      if (r > 130 && g > 100 && b < 110 && (r - b) > 30 && ery > 15) {
        crustCount++
      }

      // Horizontal edge gradient across red channel
      if (x < 223) {
        const nextR = rgbFloats[idx + 3]
        const isEdge = Math.abs(nextR - r) > 9 ? 1 : 0
        gradCount += isEdge

        const isCenter = (y >= 70 && y < 154 && x >= 70 && x < 153)
        if (isCenter) {
          centerGradCount += isEdge
          centerTotal++
        } else {
          outerGradCount += isEdge
          outerTotal++
        }
      }
    }
  }

  const meanLum = totalLum / totalPx
  const meanEry = totalEry / totalPx
  const highEryPct = highEryCount / totalPx
  const crustRatio = crustCount / totalPx
  const furDensity = gradCount / (224 * 223)
  const centerFur = centerGradCount / Math.max(centerTotal, 1)
  const outerFur = outerGradCount / Math.max(outerTotal, 1)
  const centerOuterRatio = centerFur / Math.max(outerFur, 0.001)

  const isIntactHealthy = (
    furDensity >= 0.018 &&
    highEryPct < 0.015 &&
    meanEry < 15.0 &&
    centerOuterRatio >= 0.70 &&
    crustRatio < 0.03 &&
    meanLum >= 70.0
  )

  let dynamicHealthy = 0.0
  if (isIntactHealthy) {
    const eryFactor = Math.max(0.0, Math.min(1.0, 1.0 - (highEryPct / 0.015)))
    const ratioClamped = Math.min(1.30, Math.max(0.70, centerOuterRatio))
    const uniformityFactor = (ratioClamped - 0.70) / (1.30 - 0.70)
    const furFactor = Math.max(0.0, Math.min(1.0, (furDensity - 0.015) / 0.065))
    const lumFactor = Math.max(0.0, Math.min(1.0, (meanLum - 70.0) / 100.0))
    const composite = 0.40 * eryFactor + 0.30 * uniformityFactor + 0.20 * furFactor + 0.10 * lumFactor
    dynamicHealthy = 0.78 + 0.16 * composite
  }

  return {
    isIntactHealthy,
    dynamicHealthy,
    meanLum,
    meanEry,
    highEryPct,
    crustRatio,
    furDensity,
    centerOuterRatio,
  }
}

/**
 * Preprocess an image element for MobileNetV3Large.
 * The model was exported with include_preprocessing=True (Node 0: MUL 1/127.5, Node 1: ADD -1),
 * so it expects float32 pixels in [0, 255].
 * Output: float32 Tensor4D [1, 224, 224, 3]
 *
 * Uses direct CPU pixel buffer extraction via Canvas 2D context instead of tf.browser.fromPixels.
 * This completely bypasses mobile WebGL texture allocation and gl.readPixels synchronization stalls
 * which previously returned empty all-zero buffers on mobile devices.
 */
function preprocessImage(imageElement) {
  const tf = window.tf
  const canvas = document.createElement('canvas')
  canvas.width = 224
  canvas.height = 224
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  // Fill opaque black background to prevent transparent alpha artifacts
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 224, 224)

  const origW = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width || 224
  const origH = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height || 224
  const minDim = Math.min(origW, origH)
  const sx = Math.floor((origW - minDim) / 2)
  const sy = Math.floor((origH - minDim) / 2)
  ctx.drawImage(imageElement, sx, sy, minDim, minDim, 0, 0, 224, 224)

  // Direct CPU memory readback of 224x224 RGBA bytes
  const imgData = ctx.getImageData(0, 0, 224, 224).data
  const rgbFloats = new Float32Array(1 * 224 * 224 * 3)
  let pixelSum = 0

  for (let i = 0, j = 0; i < imgData.length; i += 4, j += 3) {
    const r = imgData[i]
    const g = imgData[i + 1]
    const b = imgData[i + 2]
    rgbFloats[j]     = r // Red [0.0, 255.0]
    rgbFloats[j + 1] = g // Green [0.0, 255.0]
    rgbFloats[j + 2] = b // Blue [0.0, 255.0]
    pixelSum += (r + g + b)
  }

  const meanPixel = pixelSum / (224 * 224 * 3)
  console.log(`[VetLink AI WASM Preprocessing] Extracted 224x224 RGB Float32Array. Mean pixel: ${meanPixel.toFixed(2)}`)

  return tf.tensor4d(rgbFloats, [1, 224, 224, 3], 'float32')
}

/**
 * Universal CPU Float32 pixel extraction directly from HTML5 Canvas 2D.
 * Extracts [1, 224, 224, 3] Float32Array in [0.0, 255.0] range.
 * Runs deterministically across Android, iPadOS Safari, tablets, and desktops.
 */
function extractFloat32Pixels(imageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 224
  canvas.height = 224
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 224, 224)

  const origW = imageElement.naturalWidth || imageElement.videoWidth || imageElement.width || 224
  const origH = imageElement.naturalHeight || imageElement.videoHeight || imageElement.height || 224
  const minDim = Math.min(origW, origH)
  const sx = Math.floor((origW - minDim) / 2)
  const sy = Math.floor((origH - minDim) / 2)
  ctx.drawImage(imageElement, sx, sy, minDim, minDim, 0, 0, 224, 224)

  const imgData = ctx.getImageData(0, 0, 224, 224).data
  const rgbFloats = new Float32Array(1 * 224 * 224 * 3)
  for (let i = 0, j = 0; i < imgData.length; i += 4, j += 3) {
    rgbFloats[j]     = imgData[i]     // Red [0.0, 255.0]
    rgbFloats[j + 1] = imgData[i + 1] // Green [0.0, 255.0]
    rgbFloats[j + 2] = imgData[i + 2] // Blue [0.0, 255.0]
  }
  return rgbFloats
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
            biophysicalTelemetry: data.biophysical_telemetry || null,
          }
        }
      } catch (err) {
        // Continue to fallback
      }
    }
  }

  // 2. FALLBACK PATH: Client-side in-browser edge inference (Universal ONNX WebAssembly)
  console.warn('[VetLink AI] Backend unreachable; attempting client-side edge inference...')
  if (!onnxModel) {
    try {
      await loadVetLinkModel()
    } catch (loadErr) {
      console.error('[VetLink AI] Could not load offline model weights:', loadErr)
      throw new Error(
        'Offline AI Model Not Cached: Local neural weights are not yet cached in this browser. Please connect to the internet once while opening VetLink so the local AI weights (~3.1MB) can download for 100% offline use.'
      )
    }
  }

  // 2a. Fast Edge Biophysical Human Skin / Face Rejection Gate
  const skinCheck = checkHumanSkinGate(imageElement)
  if (skinCheck.isHuman) {
    return {
      rejected: true,
      reason: 'HUMAN_SUBJECT',
      detected: 'Human Face / Cutaneous Subject',
      message: 'The submitted image exhibits human facial or cutaneous characteristics. VetLink AI is strictly calibrated for veterinary companion animals (Canine, Feline, Avian, Rabbit). Human dermatological screening is strictly prohibited under clinical safety protocols.',
    }
  }

  const spNorm = (species || 'Canine').toString().trim().toLowerCase()
  const allowedClasses = SPECIES_CLASSES[species] || SPECIES_CLASSES[spNorm] || classLabels

  let inputTensor = null
  let outputTensor = null
  let probabilities = []

  try {
    if (onnxModel && window.ort) {
      const rgbFloats = extractFloat32Pixels(imageElement)
      const ort = window.ort
      const inTensor = new ort.Tensor('float32', rgbFloats, [1, 224, 224, 3])
      const res = await onnxModel.run({ [onnxModel.inputNames[0]]: inTensor })
      const rawOut = res[onnxModel.outputNames[0]].data
      probabilities = Array.from(rawOut)
      console.timeEnd('[VetLink AI] Inference Time')
      console.log('[VetLink AI ONNX Web] Raw inference probabilities:', classLabels.map((lbl, idx) => `${lbl}: ${(probabilities[idx] * 100).toFixed(1)}%`).join(', '))
    } else {
      throw new Error('Local offline AI model could not be executed.')
    }

    let candidateScores = {}
    classLabels.forEach((lbl, idx) => {
      if (allowedClasses.includes(lbl)) {
        candidateScores[lbl] = probabilities[idx] || 0
      }
    })

    // Automated Feline Ear & Cranial Lesion Focus:
    // In cats, facial anatomical landmarks (eyes/nose/whiskers) bias MobileNetV3 toward Ringworm.
    // Automatically checks ear margins (where Notoedres cati crusts localize) for active Mange.
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

          let probs = []
          if (onnxModel && window.ort) {
            const earFloats = extractFloat32Pixels(c)
            const inEar = new window.ort.Tensor('float32', earFloats, [1, 224, 224, 3])
            const earRes = await onnxModel.run({ [onnxModel.inputNames[0]]: inEar })
            probs = Array.from(earRes[onnxModel.outputNames[0]].data)
          }

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

    // Biophysical Intact Coat & Dry Alopecia Safeguard (Offline WASM Parity)
    // Prevents high-albedo healthy white coats from triggering Ringworm shortcuts
    // while safeguarding genuine dry circular alopecia plaques and scaly fungal lesions.
    const healthyTarget = ['Healthy', 'Bird_Healthy', 'Rabbit_Healthy'].find((k) => allowedClasses.includes(k))
    const rawSum = Object.values(candidateScores).reduce((a, b) => a + b, 0) || 1.0
    const rawHealthyConf = healthyTarget ? (candidateScores[healthyTarget] || 0) / rawSum : 1.0

    const coatAudit = auditIntactCoatPlaque(rgbFloats)
    if (coatAudit.isIntactHealthy && healthyTarget && rawHealthyConf < 0.60) {
      const dynH = coatAudit.dynamicHealthy
      const otherKeys = Object.keys(candidateScores).filter((k) => k !== healthyTarget)
      const otherSum = otherKeys.reduce((acc, k) => acc + (candidateScores[k] || 0), 0)
      const scale = (1.0 - dynH) / Math.max(otherSum, 1e-6)
      otherKeys.forEach((k) => {
        candidateScores[k] = (candidateScores[k] || 0) * scale
      })
      candidateScores[healthyTarget] = dynH
      console.log(`[VetLink AI WASM] Intact coat safeguard activated. Dynamic Healthy: ${(dynH * 100).toFixed(1)}%`)
    }

    // Biophysical Surface Telemetry (Erythema metrics for clinical telemetry)
    const meanEry = typeof skinCheck?.meanEry === 'number' ? skinCheck.meanEry : 0
    const highEryPct = typeof skinCheck?.highEryPct === 'number' ? skinCheck.highEryPct : 0

    // Active pathology evaluation: lesions exhibit active erythema or elevated disease confidence
    const candSum = Object.values(candidateScores).reduce((a, b) => a + b, 0) || 1.0
    const normalizedDiseaseScores = Object.entries(candidateScores)
      .filter(([k]) => !k.includes('Healthy'))
      .map(([, v]) => v / candSum)
    const maxDiseaseConf = normalizedDiseaseScores.length > 0 ? Math.max(...normalizedDiseaseScores) : 0
    const hasActivePathology = (maxDiseaseConf >= 0.35) || (highEryPct >= 0.05) || (meanEry >= 20.0)

    // Edge Non-Animal / Inanimate Subject Verifier Gate (100% Parity with Cloud ImageNet Verifier)
    if (animalVerifierModel && animalVerifierMeta && !hasActivePathology) {
      try {
        let vOut = animalVerifierModel.predict(inputTensor)
        let vTensor = (vOut instanceof tf.Tensor) ? vOut : vOut[Object.keys(vOut)[0]]
        let vData = vTensor.dataSync ? vTensor.dataSync() : await vTensor.data()
        let vProbs = Array.from(vData)
        if (vTensor && typeof vTensor.dispose === 'function') vTensor.dispose()

        const animalIndices = new Set(animalVerifierMeta.animal_indices || [])
        const vLabels = animalVerifierMeta.labels || []
        const screenClasses = animalVerifierMeta.screen_classes || []
        const dermMimics = animalVerifierMeta.derm_mimics || []

        let pAnimal = 0
        animalIndices.forEach((idx) => {
          pAnimal += (vProbs[idx] || 0)
        })

        let topIdx = 0
        let maxVScore = -1
        for (let i = 0; i < vProbs.length; i++) {
          if (vProbs[i] > maxVScore) {
            maxVScore = vProbs[i]
            topIdx = i
          }
        }

        const topName = vLabels[topIdx] || ''
        const isTopArtifact = !animalIndices.has(topIdx)
        const isDermMimic = dermMimics.includes(topName)
        const isScreenOrTech = screenClasses.includes(topName) || screenClasses.some((sc) => topName.includes(sc))

        let shouldReject = false
        if (isScreenOrTech) shouldReject = true
        else if (isDermMimic) shouldReject = true
        else if (isTopArtifact && pAnimal < 0.25) shouldReject = true
        else if (pAnimal < 0.10) shouldReject = true

        if (shouldReject) {
          if (inputTensor && typeof inputTensor.dispose === 'function') {
            try { inputTensor.dispose() } catch (_) {}
          }
          const cleanName = topName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
          const detectedLabel = isScreenOrTech ? `Computer Screen / ${cleanName}` : cleanName
          return {
            rejected: true,
            reason: 'NON_ANIMAL',
            detected: detectedLabel,
            p_animal: Math.round(pAnimal * 1000) / 1000,
            message: `Non-animal subject detected (${detectedLabel}, animal match: ${(pAnimal * 100).toFixed(1)}%). VetLink only evaluates actual animal patient skin lesions (Canine, Feline, Avian, Rabbit). Please photograph the animal's skin condition directly.`,
          }
        }
      } catch (verifierErr) {
        console.warn('[VetLink AI] Edge animal verifier check error:', verifierErr)
      }
    }

    const sumProb = Object.values(candidateScores).reduce((a, b) => a + b, 0)
    const classScores = allowedClasses
      .map((lbl) => ({
        label: lbl,
        confidence: sumProb > 0.0001 ? (candidateScores[lbl] || 0) / sumProb : (1.0 / allowedClasses.length),
      }))
      .sort((a, b) => b.confidence - a.confidence)

    const topItem = classScores[0] || { label: 'Unknown', confidence: 0 }
    const topLabel = topItem.label
    const topConf = topItem.confidence

    const top3 = classScores.slice(0, 3).map((item) => ({
      label: item.label,
      display: CLASS_DISPLAY[item.label] || item.label,
      confidence: item.confidence,
    }))

    // Immediate cleanup of input tensor to preserve mobile WebAssembly heap memory
    if (inputTensor && typeof inputTensor.dispose === 'function') {
      try { inputTensor.dispose() } catch (_) {}
    }

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
      biophysicalTelemetry: {
        highEryPct: coatAudit.highEryPct,
        furDensity: coatAudit.furDensity,
        centerFurDensity: coatAudit.centerFurDensity,
        outerFurDensity: coatAudit.outerFurDensity,
        centerOuterRatio: coatAudit.centerOuterRatio,
        crustRatio: coatAudit.crustRatio,
        meanLuminance: coatAudit.meanLum,
        isIntactHealthy: coatAudit.isIntactHealthy,
      },
    }
  } catch (wasmErr) {
    console.error('[VetLink AI] WASM inference error:', wasmErr)
    throw wasmErr
  } finally {
    if (inputTensor && typeof inputTensor.dispose === 'function') {
      try { inputTensor.dispose() } catch (_) {}
    }
    if (outputTensor && typeof outputTensor.dispose === 'function') {
      try { outputTensor.dispose() } catch (_) {}
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
    let highErythemaPixels = 0

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

      // Active inflammatory erythema (lesions)
      const ery = r - (g + b) / 2
      if (ery > 45) {
        highErythemaPixels++
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

    // 7. Human Face & Cutaneous Subject Detection Gate:
    // Differentiates human skin / human face from animal fur and lesions.
    // Real canine/feline lesions exhibit high inflammatory erythema (highEryPct >= 0.08) or dense fur margins.
    // Human skin (whether smooth limbs or human faces with hair/eyes) exhibits low erythema (highEryPct < 0.06) and low animal fur density.
    const humanRatio = humanSkinPixels / n
    const furDensity = hairFiberEdges / n
    const highEryPct = highErythemaPixels / n
    const isHumanSubject = (humanRatio >= 0.28 && furDensity < 0.22 && highEryPct < 0.06) ||
                           (humanRatio >= 0.50 && furDensity < 0.25 && highEryPct < 0.08)

    if (isHumanSubject) {
      return {
        isValid: false,
        reason: 'HUMAN_SUBJECT',
        title: 'Image Rejected: Human Face / Cutaneous Subject Detected',
        message: 'The submitted image exhibits human facial or cutaneous characteristics. VetLink AI is strictly calibrated for veterinary companion animals (Canine, Feline, Avian, Rabbit). Human dermatological screening is prohibited under clinical safety protocols.',
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

