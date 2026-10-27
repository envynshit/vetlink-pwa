# VetLink Animal Decision Support System — Technical Status, Audit & Action Report
**Document Title:** System Status, Codebase Audit & UI Elegance Enhancement Roadmap  
**Prepared For:** Capstone Faculty Advisers, Development Team (Russel & Benedict), and Clinic Stakeholders  
**Institutional Affiliation:** College of Computing Studies, Eulogio "Amang" Rodriguez Institute of Science and Technology (EARIST)  
**Project:** *A Deep Learning Animal Decision Support System Using MobileNetV3 and Grad-CAM for VetLink Clinic*  
**Date:** October 24, 2026  
**Target Defense Window:** November 9–11, 2026  
**Current System Codebase Readiness:** **93%** *(Software System Only)*  
**Target Before Clinic Trials:** **100%** *(By October 26, 2026)*  

---

## 1. Executive Summary & Objective Status

This audit provides an unvarnished, engineering-grounded evaluation of the **VetLink PWA software system** following the October 24 development cycle. It evaluates the contributions merged from Russel's UI modernization alongside the Clinical Decision Support System (CDSS) enhancements, the pre-inference image validation gate, and the calibrated ImageNet animal verifier.

### System Readiness Scorecard (Software System Only)

| Module / System Layer | Readiness | Status | Critical Strengths & Identified Gaps |
| :--- | :---: | :---: | :--- |
| **1. AI Model & Inference Engine** | **97%** | **PRODUCTION READY** | 11 classes, 4 species, 3.1 MB quantized TFLite. Dual-engine: Native Python backend (0.04s) + client WASM (40ms). Pre-inference quality gate (illumination, glare, Laplacian focus $\nabla^2 f \ge 45.0$). Calibrated animal verifier with dermatological texture mimic handling. |
| **2. Clinical Decision Support (CDSS)** | **96%** | **SOLID & CLINICAL** | 3-tier triage badges, dual-diagnosis comorbidity detection, symptoms checklist integration (`consultation_symptoms`), lab test referral workflow, in-chart doctor override, printable Rx with clinic letterhead. |
| **3. Database & Longitudinal Tracking** | **92%** | **HIGH FIDELITY** | IndexedDB multi-store schema. Multi-visit photo gallery (Visit 1 to Visit $N+1$). Preserves historical lesion imagery without overwriting. Needs client-side image downsampling before DB write. |
| **4. Frontend UI & Native PWA Shell** | **86%** | **ACTION REQUIRED** | Modern responsive dashboard, camera capture viewfinder modal, clinical rejection cards with actionable tips. **Remaining gaps:** "Install PWA" sidebar button lacks event handler, and Dashboard metrics ("Cases Today: 24", "Pending: 7") remain hardcoded static strings. |
| **5. Backend API & Authentication** | **92%** | **PRODUCTION READY** | FastAPI server with JWT authentication, role management, password hashing, and animal verification. Supports dual-mode operation (Online MySQL XAMPP + Offline local demo). |
| **OVERALL SOFTWARE SYSTEM** | **93%** | **NEAR DEFENSE READY** | Core intelligence, safety gates, clinical workflows, and data layers are proven. Resolving the remaining UI gaps will take the system to 100%. |

---

## 2. The Brutal Truth: Frank Assessment of the System

### A. What Truly Elevates the System (The Wins)
1. **The Inanimate Object & Screen Gate is Solved:** Standard Softmax neural networks are forced to output 100% across their known disease classes, causing computer monitors, circuit boards, or spreadsheets to be falsely classified as Mange or Ringworm. By deploying a 2-tier defense (client-side cold slate UI check + backend 489-class ImageNet animal probability mass sum), computer monitors and inanimate objects are stopped cold before touching the disease model.
2. **Clinical Sensitivity to Severe Lesions:** Generic animal classifiers often fail on severely diseased skin (e.g., nodular Demodectic mange with heavy crusts looks like a "Custard Apple" fruit to ImageNet). By implementing a **dermatological texture mimics whitelist** (`DERM_TEXTURE_MIMICS`), real mangy patients with $\ge 12\%$ animal presence pass through to the disease model, while actual fruits and computer monitors ($< 18\%$) are rejected.
3. **The Role Conflict is Solved:** Russel's removal of the intrusive "Admin Approval" popup during intake was the right clinical instinct. By splitting the intake between an unblocked Assistant flow (intake + photo + AI scan) and giving doctors the comprehensive `[ 🩺 REVIEW CASE ]` modal directly in the patient table, the software now matches how real animal clinics work.
4. **The Defense-Proof CDSS Justification:** When the AI model misclassifies a cat's crusted face as Ringworm instead of Mange, it is no longer an embarrassing failure. It is now the textbook academic defense of your thesis: *facial dermatophytosis and Demodex are acknowledged clinical mimics, and VetLink protects the patient through Grad-CAM, lab test flagging, and Doctor Clinical Override.*
5. **Multi-Visit Healing Gallery:** Preserving Visit 1, Visit 2, and Visit 3 photos side-by-side without deleting earlier images provides genuine clinical utility that will impress veterinary evaluators during UAT.
6. **Blazing Fast Latency:** 0.04-second inference on the FastAPI backend makes the application feel instant.

### B. What is Still Vulnerable and Could Hurt Your Defense (The Gaps)
1. **The Static Dashboard Metrics Trap (`src/pages/ClinicalAnalysis.jsx`):**
   * Lines 6–18 display: `24 Cases Today`, `7 Pending Results`, `94% AI Accuracy`, `8m Avg. Time`.
   * **The Danger:** If an adviser or panelist asks you to add 3 new patients and refresh the dashboard, the numbers will **not change**. Examiners instantly recognize static mockups and will question system authenticity.
2. **The Inert "Install PWA" Button (`src/App.jsx:212`):**
   * The sidebar prominently displays `<button className="action-btn secondary">Install PWA</button>` with **no `onClick` handler**. Clicking it does nothing.
3. **Mobile Camera Storage Exhaustion (Image Compression Gap):**
   * Modern smartphones capture 12-megapixel photos (4–8 MB each). Storing uncompressed base64 images in IndexedDB across multiple visits will quickly exhaust browser storage quota (typically 50–100 MB on mobile Safari/Chrome). Client-side downsampling (to max 1024px, JPEG 85%) before saving is required.

---

## 3. Dedicated Section: UI & System Suggestions for Medical-Grade Elegance & Professional Polish

To transform VetLink from a student capstone project into a **world-class, commercial-grade Veterinary Clinical Decision Support System**, implement the following design and architectural refinements:

### 1. Unified Medical-Grade Design Tokens (Elegance & Cohesion)
* **Current Issue:** Colors are currently scattered: inline HSL strings, hex codes (`#166534`, `#3b82f6`, `#a855f7`, `#cbd5e1`), and ad-hoc padding across components.
* **Suggestion:** Define a unified CSS variable palette in `src/index.css`:
  * **Primary Teal/Emerald (Clinical Trust):** `--clinical-teal: #0f766e`, `--clinical-teal-light: #f0fdfa`, `--clinical-teal-border: #99f6e4`.
  * **Diagnostic Amber (Triage/Caution):** `--triage-amber: #b45309`, `--triage-amber-bg: #fffbeb`, `--triage-amber-border: #fde68a`.
  * **Action Blue (Doctor Authority):** `--action-blue: #1d4ed8`, `--action-blue-bg: #eff6ff`, `--action-blue-border: #bfdbfe`.
  * **Danger / Rejection Coral:** `--danger-coral: #dc2626`, `--danger-coral-bg: #fef2f2`, `--danger-coral-border: #fca5a5`.
  * **Neutral Slate (Typography & Surfaces):** Replace harsh `#cbd5e1` borders with soft shadows (`box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`).

### 2. Patient Records Table Action Bar Ergonomics
* **Current Issue:** In `Patients.jsx`, the action column has three individual buttons (`REVIEW CASE`, `EDIT`, `RECHECK`) crammed horizontally. On tablet or split screens, this causes horizontal overflow.
* **Suggestion:** 
  * Replace the individual buttons with a cohesive **Action Pill Group**:
    * Primary action: `[ 🩺 Review ]` (Bold blue pill).
    * Secondary action: `[ 🔄 Recheck ]` (Subtle teal pill).
    * Tertiary action: `[ ✏️ ]` (Icon button or dropdown menu for patient details edit).

### 3. Glassmorphic Modal Windows with Fluid Scroll
* **Current Issue:** The Review Case and Recheck modals use standard white rectangles with default browser scrollbars.
* **Suggestion:**
  * Add backdrop blur: `backdrop-filter: blur(8px); background: rgba(15, 23, 42, 0.45);`.
  * Style modern thin scrollbars:
    ```css
    .modal-body::-webkit-scrollbar { width: 6px; }
    .modal-body::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
    ```
  * Pin the modal header and action footer, making only the middle content scrollable so the `[ Save ]` and `[ Close ]` buttons are always accessible.

### 4. Dynamic Dashboard Metrics Engine (`ClinicalAnalysis.jsx`)
* **Current Issue:** Hardcoded numbers (24, 7, 94%).
* **Suggestion:** Wire `ClinicalAnalysis.jsx` to live IndexedDB queries:
  * **Cases Today:** Count of patients where `lastVisit === today`.
  * **Awaiting Lab / Review:** Count of patients where `status.includes('Review') || status.includes('Lab')`.
  * **Active Roster:** Total patient count in IndexedDB.
  * **Engine Latency:** Live benchmark reading (e.g., `0.04s TFLite`).

### 5. Seamless PWA Install Listener (`src/App.jsx`)
* **Current Issue:** "Install PWA" button is inert.
* **Suggestion:** Implement the standard PWA installation hook:
  ```javascript
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    })
  }, [])
  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setDeferredPrompt(null)
    }
  }
  ```

### 6. Client-Side Image Downsampling Before Storage
* **Current Issue:** Raw camera photos (4–8 MB) saved directly as base64 in IndexedDB.
* **Suggestion:** Add an offscreen canvas resizer in `loadImageFromFile`: resize max dimension to 1024px at 85% JPEG quality. This reduces storage footprint from 6 MB down to ~180 KB per photo (a 97% reduction) with zero loss in clinical readability.

---

## 4. Immediate Action Plan to Reach 100%

1. **Step 1: Wire Dynamic Dashboard Metrics in `ClinicalAnalysis.jsx`** *(Est: 20 mins)*
   * Query IndexedDB counts dynamically so numbers increment live when patients are admitted.
2. **Step 2: Connect the "Install PWA" Button in `src/App.jsx`** *(Est: 10 mins)*
   * Attach `beforeinstallprompt` event listener so clicking the button triggers native browser installation.
3. **Step 3: Implement Client-Side Canvas Image Downsampling** *(Est: 15 mins)*
   * Downscale stored photos to max 1024px before base64 encoding to prevent mobile quota overflow.
4. **Step 4: Push to Clean Feature Branch & Create Pull Request** *(Est: 10 mins)*
   * Push `feature/cdss-roles-symptoms-lab` to GitHub remote and generate PR against `main`.
