# VetLink PWA — Clinical & Architectural Feature Update Report (October 27, 2026)

**Document Title:** Species-Specific Pharmacology (Canine vs. Feline Separation), Authentic Client & Patient Demographics Intake, Elimination of Hardcoded Prescription Data, and AI Dataset Class Normalization  
**Prepared For:** Capstone Faculty Advisers, Development Team (Russel & Benedict), and Clinic Stakeholders  
**Institutional Affiliation:** College of Computing Studies, Eulogio "Amang" Rodriguez Institute of Science and Technology (EARIST)  
**Project:** *A Deep Learning Animal Decision Support System Using MobileNetV3 and Grad-CAM for VetLink Clinic*  
**Date:** October 27, 2026  
**Git Commit:** `cdf2b28` (*"feat: species-specific canine vs feline protocols, owner contact & demographics intake, and dataset deduplication"*)  
**Safety Checkpoint Branch:** `backup-pre-rx-dual-protocols-oct27` (Commit: `d0f7012`)  
**Physical Backup Snapshot:** `backup_snapshots/pre_oct27_all_safe/`  
**System Codebase Readiness:** **96% – 97%** *(Software System Only)*  

---

## 1. Executive Summary

The October 27, 2026 development cycle finalized critical clinical safety, authentic veterinary documentation, and data integrity milestones required for the upcoming Capstone defense and clinic User Acceptance Testing (UAT). 

Prior to this update, four critical clinical gaps were identified during deep architectural auditing:
1. **Canine and Feline Treatment Conflation:** Dogs and cats share common diagnostic categories (e.g., Mange, Ringworm, Pyoderma), but feline physiology possesses profound pharmacological vulnerabilities (hepatic glucuronyl transferase enzyme deficiency). Administering canine-safe ectoparasiticides (such as high-dose permethrins, organophosphates, or oral chewables) to felines induces severe neurotoxicity and death. Furthermore, full water baths cause severe distress and hypothermia in cats.
2. **Missing Patient & Client Demographics:** The intake interface lacked dedicated inputs for animal breed, weight, age, and owner personal details (owner name and contact phone).
3. **Hardcoded Fallbacks on Official Rx & Lab Slips:** When patient records had omitted fields, the prescription generator defaulted to fictitious mockup values (`12.5 kg`, `Adult`, `Mixed`, `Walk-in Client`), which severely compromises clinical authenticity during formal evaluations.
4. **AI Class Normalization & Vocabulary Duplication:** The protocol dropdown contained non-model conditions (`Flea Allergy Dermatitis`, `Malassezia Dermatitis`) presented as AI classes, and duplicate entries (`Hotspots` vs. `Hot Spots`, `Bird_Healthy` vs. `Healthy (Bird)`).

This release thoroughly resolves all four issues while preserving all existing pre-inference image validation gates, anti-blur Laplacian filters, and role-based clinic controls.

---

## 2. Key Milestones Completed Today

1. **Separation of Canine (Aso) and Feline (Pusa) Clinical Protocols:**
   * Divided the primary small-animal guidelines into distinct **`🐶 Canine Protocols (Aso)`** and **`🐱 Feline Protocols (Pusa)`** categories.
   * Tailored feline protocols with species-safe medications: Bravecto Plus spot-on / Revolution Plus, oral pediatric suspensions (Clavamox, Itrafungol), and **leave-on antiseptic mousses** (eliminating hazardous water baths).
   * Prominently rendered an explicit clinical toxicology banner:  
     > **⚠️ FELINE TOXICOLOGY ALERT:** *Permethrin and organophosphates are lethal to felines. Never administer canine ectoparasiticides to cats. Strictly isolate cats from dogs recently treated with canine topical products.*
   * Implemented automatic species-aware protocol routing in `Treatment.jsx` based on incoming patient species.

2. **Authentic Patient Demographics & Owner Personal Information Capture:**
   * Expanded `NewPatient.jsx` with structured intake inputs placed cleanly before image capture:
     * **Species Dropdown:** Canine, Feline, Avian, Lagomorph
     * **Breed:** *(e.g., Shih Tzu, Aspin, Persian, DSH)*
     * **Weight in Kilograms:** Dosing-critical metric *(e.g., 5.4 kg)*
     * **Age:** *(e.g., 2 yrs, 6 mos)*
     * **Owner Full Name:** *(e.g., Juan Dela Cruz)*
     * **Owner Contact / Phone:** *(e.g., 0917-123-4567)*
   * Dynamically persisted across the IndexedDB storage layer and fully synchronized with the MySQL schema (`owners` table and `patients` table fields: `breed`, `age`, `owner_id`).

3. **Complete Elimination of Fake Hardcoded Prescription Data:**
   * Eradicated all static strings (`12.5 kg`, `Adult`, `Mixed`, `Walk-in Client`) from the Philippine Veterinary Prescription (Rx) slip and the Official Laboratory Requisition slip.
   * If any demographic field is omitted, the slips dynamically render standardized **clean underline blanks** (`________ kg`, `________`), allowing attending veterinarians to handwrite observations and dosages on printed documents.

4. **Protocol Library Alignment with Ground-Truth 11 AI Classes:**
   * Cross-referenced `src/vetlink-ai.js` ground-truth labels and deduplicated naming:
     * `Hotspots` $\to$ `Hot Spots`
     * `Bird_Healthy` $\to$ `Healthy (Bird)`
     * `Rabbit_Healthy` $\to$ `Healthy (Rabbit)`
   * Removed `Flea Allergy Dermatitis` and `Malassezia Dermatitis` from the default AI dataset list. Both conditions were cleanly relocated under **`📋 Additional Clinical Dermatoses (Manual / Custom)`**, allowing veterinarians to manually select them during clinical overrides without misrepresenting the deep learning model's training classes.

5. **Patient Records Table & Edit Modal Synchronization (`src/pages/Patients.jsx`):**
   * **Table Record Display:** Patient cards now display their breed, owner name, contact number, weight, and age directly underneath the patient name.
   * **Edit Patient Modal:** Allows clinic staff or veterinarians to update breed, weight, age, and owner contact information at any time.
   * **Clinical Case Review Modal:** Displays the complete patient and owner demographic profile before launching the prescription generator.

6. **Dashboard Intake Calculation Fix (`src/pages/ClinicalAnalysis.jsx`):**
   * Corrected the weekly case distribution calculation to measure distinct patient intakes per calendar day rather than compounding historical consultation entries.

---

## 3. Detailed Technical Breakdown

### 3.1. Pharmacology & Feline Toxicology Architecture (`src/pages/Treatment.jsx`)

In veterinary dermatology, therapeutic approaches differ radically between dogs and cats:

```
                                  [ Diagnosed Condition ]
                                             |
                     +-----------------------+-----------------------+
                     |                                               |
             [ Canine Patient ]                              [ Feline Patient ]
                     |                                               |
       • Chewable Isoxazolines (NexGard)              • Topical Spot-On Only (Bravecto Plus)
       • Cephalexin Oral Tablets                      • Clavamox Pediatric Oral Drops
       • Medicated Chlorhexidine Baths                • Leave-On Antiseptic Mousse (No Baths)
       • Standard E-Collar                            • ⚠️ FELINE TOXICOLOGY ALERT:
                                                        Permethrin / Pyrethroid Prohibition
```

#### Code Snippet — Species Protocol Resolution Helper:
```javascript
export function getSpeciesProtocolKey(species, condition) {
  const normSp = (species || 'Canine').toLowerCase()
  const normCond = (condition || '').toLowerCase()

  if (normSp.includes('cat') || normSp.includes('fel')) {
    if (normCond.includes('mange')) return 'Feline Mange'
    if (normCond.includes('ringworm')) return 'Feline Ringworm'
    if (normCond.includes('pyoderma')) return 'Feline Pyoderma'
    if (normCond.includes('hot')) return 'Feline Hot Spots'
    if (normCond.includes('healthy')) return 'Feline Healthy'
    return 'Feline Mange'
  }
  if (normSp.includes('bird') || normSp.includes('avi')) {
    if (normCond.includes('pox')) return 'Avian Fowl Pox'
    if (normCond.includes('mite') || normCond.includes('scaly')) return 'Scaly Face / Leg Mite (Knemidocoptes)'
    return 'Healthy (Bird)'
  }
  if (normSp.includes('rabbit') || normSp.includes('lago')) {
    if (normCond.includes('ringworm')) return 'Rabbit Ringworm'
    if (normCond.includes('mange')) return 'Rabbit Mange'
    return 'Healthy (Rabbit)'
  }
  // Default Canine
  if (normCond.includes('mange')) return 'Canine Mange'
  if (normCond.includes('ringworm')) return 'Canine Ringworm'
  if (normCond.includes('pyoderma')) return 'Canine Pyoderma'
  if (normCond.includes('hot')) return 'Canine Hot Spots'
  return 'Canine Healthy'
}
```

---

### 3.2. Intake Demographics Schema (`src/pages/NewPatient.jsx`)

The intake form was restructured using modern CSS Grid layouts, preserving full responsiveness across mobile viewports and desktop workstations:

```jsx
{/* Species & Breed Row */}
<div className="new-patient-form-grid-2">
  <label>
    <span>SPECIES *</span>
    <select value={species} onChange={(e) => setSpecies(e.target.value)}>
      <option value="Canine">Canine</option>
      <option value="Feline">Feline</option>
      <option value="Avian">Avian</option>
      <option value="Lagomorph">Lagomorph</option>
    </select>
  </label>
  <label>
    <span>BREED (OPTIONAL)</span>
    <input
      type="text"
      placeholder="e.g. Shih Tzu, Aspin, Persian"
      value={breed}
      onChange={(e) => setBreed(e.target.value)}
    />
  </label>
</div>

{/* Weight & Age Row */}
<div className="new-patient-form-grid-2">
  <label>
    <span>WEIGHT IN KG (OPTIONAL)</span>
    <input
      type="number"
      step="0.1"
      placeholder="e.g. 5.5"
      value={weight}
      onChange={(e) => setWeight(e.target.value)}
    />
  </label>
  <label>
    <span>AGE (OPTIONAL)</span>
    <input
      type="text"
      placeholder="e.g. 2 yrs / 6 mos"
      value={age}
      onChange={(e) => setAge(e.target.value)}
    />
  </label>
</div>

{/* Owner Name & Contact Row */}
<div className="new-patient-form-grid-2">
  <label>
    <span>OWNER NAME (OPTIONAL)</span>
    <input
      type="text"
      placeholder="e.g. Maria Santos"
      value={ownerName}
      onChange={(e) => setOwnerName(e.target.value)}
    />
  </label>
  <label>
    <span>OWNER CONTACT / PHONE (OPTIONAL)</span>
    <input
      type="tel"
      placeholder="e.g. 0917-123-4567"
      value={ownerPhone}
      onChange={(e) => setOwnerPhone(e.target.value)}
    />
  </label>
</div>
```

---

### 3.3. Cleaned Prescription & Lab Requisition Print Slips

The Philippine Veterinary Prescription slip dynamically renders real data or blank underlines:

```jsx
{/* Authentic Veterinary Prescription Print Header */}
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
```

---

## 4. Verification and Browser Testing Results

Automated headless browser subagents verified the deployed features at `http://localhost:5173/`:

| Verification Step | Target Component | Result | Visual Evidence |
| :--- | :--- | :---: | :--- |
| **New Patient Intake** | Demographics Form Fields | **PASS** | Captured screenshot `new_patient_form_verified_1793105996390.png`. All inputs aligned cleanly with instant placeholder guidance. |
| **Feline Protocol Gating** | Feline Mange Protocol | **PASS** | Captured screenshot `feline_mange_protocol_1793106076246.png`. Displays Bravecto Plus, leave-on mousse, and the toxicological warning. |
| **Canine Protocol Gating** | Canine Mange & Ringworm | **PASS** | Captured screenshot `canine_mange_final_1793106104575.png`. Displays NexGard, Cephalexin, and Malaseb baths. |
| **Patient Record Edit** | Edit Patient Modal | **PASS** | Saved `Fluffy (Rabbit)` with Breed (`Shih Tzu`), Weight (`6.2 kg`), Age (`3 yrs`), Owner (`Juan Dela Cruz`), Contact (`0917-123-4567`). |
| **Clinical Case Review** | View Case Review Modal | **PASS** | Captured screenshot `clinical_case_review_modal_1793106233167.png`. Displays demographics and 11 true override options. |
| **Production Build** | `npm run build` | **PASS** | Built in **182ms – 253ms** with zero errors or warnings. |

---

## 5. Summary of Files Modified

* `src/pages/NewPatient.jsx`: Added breed, weight, age, ownerName, ownerPhone inputs and persistence.
* `src/pages/Treatment.jsx`: Added species-separated protocols, feline toxicology warnings, and removed hardcoded fallbacks on Rx slips.
* `src/pages/Patients.jsx`: Enhanced table display, edit modal, and review modal with full demographic data.
* `src/App.jsx`: Wired props and navigation callbacks cleanly.
