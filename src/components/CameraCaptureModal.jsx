import React, { useEffect, useRef, useState } from 'react'

/**
 * CameraCaptureModal
 * Cross-platform Live Camera Viewfinder for VetLink PWA.
 * Enables live photo capture on any webcam, mobile device, or tablet.
 * Includes clinical macro-framing target reticle and fallback to file upload.
 *
 * @param {boolean} isOpen - Whether modal is open
 * @param {Function} onClose - Callback when modal is closed
 * @param {Function} onCapture - Callback receiving captured File object
 * @param {Function} onFallbackUpload - Callback to trigger standard file picker
 */
export default function CameraCaptureModal({ isOpen, onClose, onCapture, onFallbackUpload }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [hasCamera, setHasCamera] = useState(true)
  const [cameraError, setCameraError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment') // back camera by default
  const [availableCameras, setAvailableCameras] = useState([])
  const [capturedBlobUrl, setCapturedBlobUrl] = useState(null)
  const [capturedFile, setCapturedFile] = useState(null)
  const [isInitializing, setIsInitializing] = useState(true)

  // Cleanly stop all media tracks
  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch (e) {
          // ignore
        }
      })
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  // Start video stream
  const startCamera = async (mode = facingMode) => {
    stopTracks()
    setCameraError(null)
    setIsInitializing(true)
    setCapturedBlobUrl(null)
    setCapturedFile(null)

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCamera(false)
      setCameraError('Camera access is not supported by this browser. Please use the file upload option.')
      setIsInitializing(false)
      return
    }

    try {
      // 1. Enumerate video devices to check available cameras
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter((d) => d.kind === 'videoinput')
        setAvailableCameras(videoInputs)
      } catch (devErr) {
        // enumeration can fail if permissions not granted yet
      }

      // 2. Request camera stream (prefer back/environment camera on phones & tablets)
      let stream
      try {
        const constraints = {
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
      } catch (constraintErr) {
        // Graceful fallback if high resolution was rejected by basic webcam
        console.warn('[VetLink Camera] High-res constraints failed, falling back to basic video:', constraintErr)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode ? { ideal: mode } : 'environment' },
          audio: false,
        })
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }

      setHasCamera(true)
    } catch (err) {
      console.warn('[VetLink Camera] getUserMedia failed:', err)
      setHasCamera(false)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission was blocked. Please allow camera access in your browser or use the file upload option.')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No camera found on this device. You can upload an existing pet image instead.')
      } else {
        setCameraError(`Camera unavailable: ${err.message || 'Device busy or unsupported'}. Please use the file upload option.`)
      }
    } finally {
      setIsInitializing(false)
    }
  }

  // Effect to manage camera stream when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode)
    } else {
      stopTracks()
      if (capturedBlobUrl) {
        URL.revokeObjectURL(capturedBlobUrl)
        setCapturedBlobUrl(null)
        setCapturedFile(null)
      }
    }

    return () => {
      stopTracks()
    }
  }, [isOpen, facingMode])

  if (!isOpen) return null

  // Switch between front & back camera
  const handleToggleCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextMode)
  }

  // Snap photo from live video frame
  const handleSnapPhoto = () => {
    const video = videoRef.current
    if (!video) return

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    // If using user/front camera on laptop or phone, mirror horizontally
    if (facingMode === 'user') {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, width, height)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        const file = new File([blob], `clinical_capture_${Date.now()}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        })

        setCapturedBlobUrl(url)
        setCapturedFile(file)
        stopTracks()
      },
      'image/jpeg',
      0.95
    )
  }

  // Confirm photo and send back to parent page
  const handleConfirmPhoto = () => {
    if (capturedFile) {
      onCapture(capturedFile)
      onClose()
    }
  }

  // Retake photo: discard snapshot and re-start stream
  const handleRetake = () => {
    if (capturedBlobUrl) {
      URL.revokeObjectURL(capturedBlobUrl)
      setCapturedBlobUrl(null)
      setCapturedFile(null)
    }
    startCamera(facingMode)
  }

  const handleClose = () => {
    stopTracks()
    if (capturedBlobUrl) {
      URL.revokeObjectURL(capturedBlobUrl)
      setCapturedBlobUrl(null)
      setCapturedFile(null)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.88)' }}>
      <div
        className="modal-dialog"
        style={{
          width: '94%',
          maxWidth: 620,
          background: '#0f172a',
          color: '#f8fafc',
          borderRadius: 16,
          border: '1px solid #334155',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #334155',
            background: '#1e293b',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#38bdf8' }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: '0.95rem', color: '#f8fafc' }}>
              {capturedBlobUrl ? 'Review Captured Photo' : 'Clinical Camera Viewfinder'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.2rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </header>

        {/* Viewfinder Area */}
        <div style={{ position: 'relative', width: '100%', height: 380, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {isInitializing && !capturedBlobUrl && (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>
              <div style={{ width: 28, height: 28, margin: '0 auto 10px', border: '3px solid #38bdf8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Initializing camera stream...</p>
            </div>
          )}

          {cameraError && !capturedBlobUrl && (
            <div style={{ textAlign: 'center', padding: '24px 20px', maxWidth: 420 }}>
              <div style={{ width: 44, height: 44, margin: '0 auto 12px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h4 style={{ margin: '0 0 8px', color: '#f87171', fontSize: '1.05rem' }}>Camera Unavailable</h4>
              <p style={{ margin: '0 0 16px', color: '#cbd5e1', fontSize: '0.85rem', lineHeight: 1.45 }}>{cameraError}</p>
              {onFallbackUpload && (
                <button
                  type="button"
                  className="action-btn blue"
                  style={{ padding: '8px 16px', fontSize: '0.88rem' }}
                  onClick={() => {
                    handleClose()
                    onFallbackUpload()
                  }}
                >
                  Choose Photo From Files Instead
                </button>
              )}
            </div>
          )}

          {/* Live Video Stream */}
          {!capturedBlobUrl && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isInitializing || cameraError ? 'none' : 'block',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
              }}
            />
          )}

          {/* Clinical Macro Lesion Reticle Overlay (over live video) */}
          {!capturedBlobUrl && !cameraError && !isInitializing && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '68%',
                height: '68%',
                border: '2px dashed rgba(56, 189, 248, 0.85)',
                borderRadius: 16,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                pointerEvents: 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 10,
              }}
            >
              <div style={{ textAlign: 'center', background: 'rgba(15, 23, 42, 0.75)', padding: '4px 8px', borderRadius: 4, alignSelf: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>ALIGN LESION IN FRAME</span>
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(15, 23, 42, 0.75)', padding: '3px 8px', borderRadius: 4, alignSelf: 'center' }}>
                <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Fill 70% of box & hold steady</span>
              </div>
            </div>
          )}

          {/* Freeze-frame Preview when photo is taken */}
          {capturedBlobUrl && (
            <img
              src={capturedBlobUrl}
              alt="Snapshot preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
        </div>

        {/* Action Controls Footer */}
        <footer style={{ padding: '14px 18px', background: '#1e293b', borderTop: '1px solid #334155' }}>
          {capturedBlobUrl ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="secondary-btn"
                style={{ flex: 1, padding: '10px 14px', background: '#334155', color: '#f8fafc', border: '1px solid #475569' }}
                onClick={handleRetake}
              >
                Retake Photo
              </button>
              <button
                type="button"
                className="action-btn blue"
                style={{ flex: 1.4, padding: '10px 14px', background: '#16a34a', color: '#fff', fontWeight: 600 }}
                onClick={handleConfirmPhoto}
              >
                Confirm & Use Photo
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              {/* Optional switch camera button */}
              {availableCameras.length > 1 ? (
                <button
                  type="button"
                  style={{
                    background: '#334155',
                    border: '1px solid #475569',
                    color: '#cbd5e1',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                  onClick={handleToggleCamera}
                  disabled={!hasCamera || isInitializing}
                >
                  Flip Camera
                </button>
              ) : onFallbackUpload ? (
                <button
                  type="button"
                  style={{
                    background: 'transparent',
                    border: '1px solid #475569',
                    color: '#94a3b8',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    handleClose()
                    onFallbackUpload()
                  }}
                >
                  Upload File
                </button>
              ) : <div />}

              <button
                type="button"
                style={{
                  background: '#ef4444',
                  color: '#fff',
                  border: '4px solid rgba(255, 255, 255, 0.4)',
                  borderRadius: '50%',
                  width: 64,
                  height: 64,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: hasCamera && !isInitializing ? 'pointer' : 'not-allowed',
                  opacity: hasCamera && !isInitializing ? 1 : 0.4,
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.5)',
                }}
                onClick={handleSnapPhoto}
                disabled={!hasCamera || isInitializing}
                aria-label="Capture photo"
              >
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fff', display: 'block' }} />
              </button>

              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  )
}
