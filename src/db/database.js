import { openDB } from 'idb'
const DB_NAME = "vetlink_local_db";
const DB_VERSION = 4;
const SYNC_STORE_NAMES = ['users', 'owners', 'patients', 'consultations', 'screeningResults', 'auditLogs']

const schema = {
  patients: {
    keyPath: "id",
    indexes: [
      "ownerId",
      "createdBy",
      "updatedAt",
      "syncStatus",
      "version"
    ]
  },
  consultations: {
    keyPath: "id",
    indexes: [
      "patientId",
      "handledByUserId",
      "updatedAt",
      "syncStatus",
      "version"
    ]
  },
  screeningResults: {
    keyPath: "id",
    indexes: [
      "consultationId",
      "imageId",
      "conditionId",
      "severityLevelId",
      "updatedAt",
      "syncStatus",
      "version"
    ]
  },
  uploadedImages: {
    keyPath: "id",
    indexes: [
      "consultationId",
      "updatedAt",
      "syncStatus",
      "version"
    ]
  },
  owners: {
    keyPath: "id",
    indexes: ["updatedAt", "syncStatus", "version"]
  },
  users: {
    keyPath: "id",
    indexes: ["username", "updatedAt", "syncStatus", "version"]
  },
  symptoms: {
    keyPath: "id",
    indexes: ["updatedAt", "syncStatus", "version"]
  },
  skinConditions: {
    keyPath: "id",
    indexes: ["updatedAt", "syncStatus", "version"]
  },
  severityLevels: {
    keyPath: "id",
    indexes: ["updatedAt", "syncStatus", "version"]
  },
  consultationSymptoms: {
    keyPath: "id",
    indexes: [
      "consultationId",
      "symptomId",
      "updatedAt",
      "syncStatus",
      "version"
    ]
  },
  syncQueue: {
    keyPath: "id",
    indexes: [
      "entityType",
      "entityId",
      "status",
      "createdAt"
    ]
  },
  syncConflicts: {
    keyPath: "id",
    indexes: [
      "entityType",
      "entityId",
      "resolutionStatus",
      "createdAt"
    ]
  },
  auditLogs: {
    keyPath: "id",
    indexes: [
      "action",
      "userId",
      "targetEntity",
      "createdAt",
      "syncStatus"
    ]
  },
  idCounters: {
    keyPath: "prefix",
    indexes: []
  }
};

export function initDatabase() {
    return openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        Object.entries(schema).forEach(([storeName, storeConfig]) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, {
              keyPath: storeConfig.keyPath,
            })
  
            storeConfig.indexes.forEach((indexName) => {
              store.createIndex(indexName, indexName)
            })
          }
        })
      },
    })
  }

function createSyncQueueItem(entityType, entityId, operation, payload, createdAt, baseVersion = 0) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return { id, entityType, entityId, operation, payload, baseVersion, status: 'pending', createdAt }
}

function notifyQueueUpdated() {
  if (typeof window !== 'undefined' && window.dispatchEvent) {
    window.dispatchEvent(new CustomEvent('vetlink:queue-updated'))
  }
}

// ─── Fix 4: Global sync lock shared across App.jsx and Sync.jsx ───────────────
let _syncLockActive = false
export function isSyncLocked() { return _syncLockActive }
export function acquireSyncLock() { _syncLockActive = true }
export function releaseSyncLock() { _syncLockActive = false }

function createGlobalRecordId(prefix) {
  const uniqueId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${uniqueId}`
}

function normalizeCloudRecord(storeName, record) {
  const normalized = { ...record }

  if (storeName === 'users') {
    normalized.deviceStatus = record.device_status ?? record.deviceStatus
    normalized.prcLicense = record.prc_license ?? record.prcLicense ?? 'VET-894102'
    normalized.ptrNumber = record.ptr_number ?? record.ptrNumber ?? '1948201'
  } else if (storeName === 'owners') {
    normalized.name = record.name ?? ''
    normalized.phone = record.phone ?? ''
    normalized.email = record.email ?? ''
    normalized.address = record.address ?? ''
  } else if (storeName === 'patients') {
    normalized.areaOfConcern = record.area_of_concern ?? record.areaOfConcern ?? ''
    normalized.lastVisit = record.last_visit ?? record.lastVisit ?? ''
    normalized.ownerId = record.owner_id ?? record.ownerId
    normalized.createdBy = record.created_by ?? record.createdBy
    normalized.weight = record.weight ?? record.weight ?? ''
    normalized.ownerName = record.owner_name ?? record.ownerName ?? ''
    normalized.ownerPhone = record.owner_phone ?? record.ownerPhone ?? ''
    normalized.ownerAddress = record.owner_address ?? record.ownerAddress ?? ''
    normalized.ownerEmail = record.owner_email ?? record.ownerEmail ?? ''
    normalized.isArchived = Boolean(record.is_archived ?? record.isArchived ?? false)
  } else if (storeName === 'auditLogs') {
    normalized.action = record.action ?? ''
    normalized.userId = record.user_id ?? record.userId ?? ''
    normalized.userName = record.user_name ?? record.userName ?? ''
    normalized.userRole = record.user_role ?? record.userRole ?? ''
    normalized.targetEntity = record.target_entity ?? record.targetEntity ?? ''
    normalized.targetId = record.target_id ?? record.targetId ?? ''
    normalized.details = record.details ?? ''
  } else if (storeName === 'consultations') {
    normalized.patientId = record.patient_id ?? record.patientId
    normalized.handledByUserId = record.handled_by_user_id ?? record.handledByUserId
    normalized.clinicalNotes = record.clinical_notes ?? record.clinicalNotes
    normalized.secondaryDiagnosis = record.secondary_diagnosis ?? record.secondaryDiagnosis
    normalized.isComorbid = record.is_comorbid ?? record.isComorbid ?? false
    normalized.treatmentPlan = record.treatment_plan ?? record.treatmentPlan
    normalized.doctorName = record.doctor_name ?? record.doctorName ?? null
    normalized.doctorSignatureImage = record.doctor_signature_image ?? record.doctorSignatureImage ?? record.signatureImage ?? null
    normalized.doctorPrcLicense = record.doctor_prc_license ?? record.doctorPrcLicense ?? record.prcLicense ?? null
    normalized.doctorPtrNumber = record.doctor_ptr_number ?? record.doctorPtrNumber ?? record.ptrNumber ?? null
    normalized.lastEditedBy = record.last_edited_by ?? record.lastEditedBy ?? null
    normalized.lastEditedAt = record.last_edited_at ?? record.lastEditedAt ?? null
  } else if (storeName === 'screeningResults') {
    normalized.consultationId = record.consultation_id ?? record.consultationId
    normalized.imageId = record.image_id ?? record.imageId
    normalized.conditionId = record.condition_id ?? record.conditionId
    normalized.severityLevelId = record.severity_level_id ?? record.severityLevelId
    normalized.imageData = record.image_data ?? record.imageData
    normalized.aiLabel = record.ai_label ?? record.aiLabel
    normalized.aiDisplayLabel = record.ai_display_label ?? record.aiDisplayLabel
    normalized.aiConfidence = record.confidence_score ?? record.aiConfidence
    normalized.aiPercent = record.ai_percent ?? record.aiPercent
    normalized.aiSecondaryLabel = record.ai_secondary_label ?? record.aiSecondaryLabel
    normalized.aiSecondaryConfidence = record.ai_secondary_confidence ?? record.aiSecondaryConfidence
    normalized.isComorbid = record.is_comorbid ?? record.isComorbid ?? false
    normalized.aiDescription = record.ai_description ?? record.aiDescription
    normalized.aiTop3 = record.ai_top3 ?? record.aiTop3
    normalized.reviewStatus = record.review_status ?? record.reviewStatus
  }

  normalized.syncStatus = record.sync_status ?? record.syncStatus ?? 'synced'
  normalized.createdAt = record.created_at ?? record.createdAt
  normalized.updatedAt = record.updated_at ?? record.updatedAt
  return normalized
}

async function createNextRecordId(tx, storeName, prefix, digits, startAt) {
  const records = await tx.objectStore(storeName).getAll()
  const queue = await tx.objectStore('syncQueue').getAll()
  const counterStore = tx.objectStore('idCounters')
  const counter = await counterStore.get(prefix)
  const idPattern = new RegExp(`^${prefix}-(\\d+)$`, 'i')
  const recordIds = records.map((record) => record.id)
  const queuedIds = queue
    .filter((item) => item.entityType === storeName)
    .map((item) => item.entityId)
  const lastUsed = [...recordIds, ...queuedIds].reduce((maximum, id) => {
    const match = idPattern.exec(id || '')
    return match ? Math.max(maximum, Number(match[1])) : maximum
  }, Math.max(startAt - 1, counter?.lastValue || 0))
  const nextValue = lastUsed + 1
  await counterStore.put({ prefix, lastValue: nextValue })
  return `${prefix}-${String(nextValue).padStart(digits, '0')}`
}

export async function addPatient(patient) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const tx = db.transaction(['patients', 'owners', 'syncQueue', 'idCounters'], 'readwrite')
  const id = await createNextRecordId(tx, 'patients', 'PT', 4, 1001)

  // Smart Owner Linking / Auto-populate
  let ownerId = patient.ownerId || null
  const cleanOwnerName = (patient.ownerName || '').trim()
  const cleanOwnerPhone = (patient.ownerPhone || '').trim()
  const cleanOwnerAddress = (patient.ownerAddress || '').trim()
  const cleanOwnerEmail = (patient.ownerEmail || '').trim()

  if (cleanOwnerName || cleanOwnerPhone) {
    const ownerStore = tx.objectStore('owners')
    const allOwners = await ownerStore.getAll()
    const existingOwner = allOwners.find((o) => {
      if (cleanOwnerPhone && o.phone && o.phone.trim() === cleanOwnerPhone) return true
      if (cleanOwnerName && o.name && o.name.trim().toLowerCase() === cleanOwnerName.toLowerCase()) return true
      return false
    })

    if (existingOwner) {
      ownerId = existingOwner.id
      let updated = false
      if (cleanOwnerAddress && !existingOwner.address) {
        existingOwner.address = cleanOwnerAddress
        updated = true
      }
      if (cleanOwnerPhone && !existingOwner.phone) {
        existingOwner.phone = cleanOwnerPhone
        updated = true
      }
      if (cleanOwnerEmail && !existingOwner.email) {
        existingOwner.email = cleanOwnerEmail
        updated = true
      }
      if (updated) {
        existingOwner.updatedAt = now
        existingOwner.syncStatus = 'pending'
        existingOwner.version = (existingOwner.version || 1) + 1
        await ownerStore.put(existingOwner)
        await tx.objectStore('syncQueue').put(createSyncQueueItem('owners', existingOwner.id, 'UPDATE', existingOwner, now, existingOwner.version - 1))
      }
    } else {
      ownerId = await createNextRecordId(tx, 'owners', 'OWN', 4, 1001)
      const newOwner = {
        id: ownerId,
        name: cleanOwnerName || 'Pet Owner',
        phone: cleanOwnerPhone,
        address: cleanOwnerAddress,
        email: cleanOwnerEmail,
        syncStatus: 'pending',
        version: 1,
        createdAt: now,
        updatedAt: now,
      }
      await ownerStore.put(newOwner)
      await tx.objectStore('syncQueue').put(createSyncQueueItem('owners', newOwner.id, 'CREATE', newOwner, now, 0))
    }
  }

  const record = {
    ...patient,
    id,
    ownerId,
    weight: patient.weight || '',
    ownerName: cleanOwnerName,
    ownerPhone: cleanOwnerPhone,
    ownerAddress: cleanOwnerAddress,
    ownerEmail: cleanOwnerEmail,
    isArchived: Boolean(patient.isArchived || false),
    updatedAt: now,
    syncStatus: 'pending',
    version: 1,
  }

  await tx.objectStore('patients').put(record)
  await tx.objectStore('syncQueue').put(createSyncQueueItem('patients', record.id, 'CREATE', record, now, 0))
  await tx.done
  notifyQueueUpdated()
  return record
}

export async function getPatients() {
  const db = await initDatabase()
  const list = await db.getAll('patients')
  return (list || []).filter((p) => !p._deletedLocally)
}

export async function getOwners() {
  const db = await initDatabase()
  const list = await db.getAll('owners')
  return (list || []).filter((o) => !o._deletedLocally)
}

export async function getOwnerById(id) {
  if (!id) return null
  const db = await initDatabase()
  return await db.get('owners', id)
}

export async function addOwner(owner) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const tx = db.transaction(['owners', 'syncQueue', 'idCounters'], 'readwrite')
  const id = owner.id || await createNextRecordId(tx, 'owners', 'OWN', 4, 1001)
  const record = {
    ...owner,
    id,
    name: (owner.name || '').trim(),
    phone: (owner.phone || '').trim(),
    email: (owner.email || '').trim(),
    address: (owner.address || '').trim(),
    syncStatus: 'pending',
    version: 1,
    createdAt: now,
    updatedAt: now,
  }
  await tx.objectStore('owners').put(record)
  await tx.objectStore('syncQueue').put(createSyncQueueItem('owners', record.id, 'CREATE', record, now, 0))
  await tx.done
  notifyQueueUpdated()
  return record
}

export async function updateOwner(id, updates) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const tx = db.transaction(['owners', 'syncQueue'], 'readwrite')
  const store = tx.objectStore('owners')
  const existing = await store.get(id)
  if (!existing) throw new Error(`Owner with ID ${id} not found`)

  const queueStore = tx.objectStore('syncQueue')
  const queuedItems = await queueStore.index('entityId').getAll(id)
  const matching = queuedItems.filter((item) => item.entityType === 'owners')
  const baseVersion = matching[0]?.baseVersion ?? existing.version ?? 0
  const operation = matching.some((item) => item.operation === 'CREATE') ? 'CREATE' : 'UPDATE'

  const updatedRecord = {
    ...existing,
    ...updates,
    id,
    name: updates.name?.trim() || existing.name,
    phone: updates.phone !== undefined ? updates.phone.trim() : existing.phone,
    email: updates.email !== undefined ? updates.email.trim() : existing.email,
    address: updates.address !== undefined ? updates.address.trim() : existing.address,
    syncStatus: 'pending',
    version: baseVersion + 1,
    updatedAt: now,
  }
  await store.put(updatedRecord)
  for (const item of matching) await queueStore.delete(item.id)
  await queueStore.put(createSyncQueueItem('owners', id, operation, updatedRecord, now, baseVersion))
  await tx.done
  notifyQueueUpdated()
  return updatedRecord
}

export async function archivePatient(id, user = null) {
  const updated = await updatePatient(id, { isArchived: true, status: 'Archived' })
  await logAuditEvent({
    action: 'PATIENT_ARCHIVED',
    user: user || { name: 'Staff' },
    targetEntity: 'patients',
    targetId: id,
    details: `Moved patient ${id} (${updated.name}) to recycle bin / archive.`,
  })
  return updated
}

export async function restorePatient(id, user = null) {
  const updated = await updatePatient(id, { isArchived: false, status: 'Active' })
  await logAuditEvent({
    action: 'PATIENT_RESTORED',
    user: user || { name: 'Staff' },
    targetEntity: 'patients',
    targetId: id,
    details: `Restored patient ${id} (${updated.name}) from archive to active status.`,
  })
  return updated
}

export async function deletePatient(id) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const tx = db.transaction(['patients', 'consultations', 'screeningResults', 'syncQueue'], 'readwrite')
  const patientStore = tx.objectStore('patients')
  const existing = await patientStore.get(id)

  if (existing) {
    const queueStore = tx.objectStore('syncQueue')
    const queuedItems = await queueStore.index('entityId').getAll(id)
    const matchingQueueItems = queuedItems.filter((item) => item.entityType === 'patients')
    const isLocalOnly = matchingQueueItems.some((item) => item.operation === 'CREATE') || existing.syncStatus !== 'synced'
    const originalQueueItem = matchingQueueItems[0]
    const baseVersion = originalQueueItem?.baseVersion ?? existing.version ?? 0

    if (isLocalOnly) {
      // Record was never synced to cloud - delete directly
      await patientStore.delete(id)
      for (const item of matchingQueueItems) await queueStore.delete(item.id)
    } else {
      // Soft-delete locally until cloud sync confirms
      const softDeleted = { ...existing, _deletedLocally: true, syncStatus: 'pending', updatedAt: now }
      await patientStore.put(softDeleted)
      for (const item of matchingQueueItems) await queueStore.delete(item.id)
      await queueStore.put(createSyncQueueItem('patients', id, 'DELETE', { id }, now, baseVersion))
    }

    // Clean up local linked consultations & screenings if local only
    if (isLocalOnly) {
      const consultStore = tx.objectStore('consultations')
      const consults = await consultStore.index('patientId').getAll(id)
      const screeningStore = tx.objectStore('screeningResults')
      for (const c of consults) {
        await consultStore.delete(c.id)
        const screenings = await screeningStore.index('consultationId').getAll(c.id)
        for (const s of screenings) {
          await screeningStore.delete(s.id)
        }
      }
    }
  }

  await tx.done
  notifyQueueUpdated()
  return id
}

export async function cacheCloudPatient(patient) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const record = {
    ...patient,
    id: patient.id,
    areaOfConcern: patient.area_of_concern ?? patient.areaOfConcern ?? '',
    lastVisit: patient.last_visit ?? patient.lastVisit ?? '',
    ownerId: patient.owner_id ?? patient.ownerId,
    createdBy: patient.created_by ?? patient.createdBy,
    weight: patient.weight ?? '',
    ownerName: patient.owner_name ?? patient.ownerName ?? '',
    ownerPhone: patient.owner_phone ?? patient.ownerPhone ?? '',
    isArchived: Boolean(patient.is_archived ?? patient.isArchived ?? false),
    createdAt: patient.created_at ?? patient.createdAt ?? now,
    updatedAt: patient.updated_at ?? patient.updatedAt ?? now,
    syncStatus: 'synced',
  }
  const tx = db.transaction('patients', 'readwrite')
  await tx.objectStore('patients').put(record)
  await tx.done
  return record
}

export async function mergeCloudPatients(cloudPatients) {
  const db = await initDatabase()
  const tx = db.transaction(['patients', 'syncQueue', 'syncConflicts'], 'readwrite')
  const patientStore = tx.objectStore('patients')
  const queueItems = await tx.objectStore('syncQueue').getAll()
  const conflicts = await tx.objectStore('syncConflicts').getAll()
  const pendingKeys = new Set(queueItems.map((item) => `${item.entityType}:${item.entityId}`))
  const conflictKeys = new Set(
    conflicts
      .filter((item) => !item.resolutionStatus || item.resolutionStatus === 'unresolved')
      .map((item) => `${item.entityType}:${item.entityId}`),
  )

  for (const patient of cloudPatients) {
    const id = patient.id
    if (!id || pendingKeys.has(`patients:${id}`) || conflictKeys.has(`patients:${id}`)) continue

    await patientStore.put({
      ...patient,
      id,
      areaOfConcern: patient.area_of_concern ?? patient.areaOfConcern ?? '',
      lastVisit: patient.last_visit ?? patient.lastVisit ?? '',
      ownerId: patient.owner_id ?? patient.ownerId,
      createdBy: patient.created_by ?? patient.createdBy,
      weight: patient.weight ?? '',
      ownerName: patient.owner_name ?? patient.ownerName ?? '',
      ownerPhone: patient.owner_phone ?? patient.ownerPhone ?? '',
      isArchived: Boolean(patient.is_archived ?? patient.isArchived ?? false),
      createdAt: patient.created_at ?? patient.createdAt,
      updatedAt: patient.updated_at ?? patient.updatedAt,
      syncStatus: 'synced',
    })
  }
  await tx.done
}

export async function mergeCloudStaff(cloudUsers) {
  const db = await initDatabase()
  const tx = db.transaction(['users', 'syncQueue', 'syncConflicts'], 'readwrite')
  const userStore = tx.objectStore('users')
  const queueItems = await tx.objectStore('syncQueue').getAll()
  const conflicts = await tx.objectStore('syncConflicts').getAll()
  const pendingKeys = new Set(queueItems.map((item) => `${item.entityType}:${item.entityId}`))
  const conflictKeys = new Set(
    conflicts
      .filter((item) => !item.resolutionStatus || item.resolutionStatus === 'unresolved')
      .map((item) => `${item.entityType}:${item.entityId}`),
  )

  for (const user of cloudUsers) {
    const id = user.id
    if (!id || pendingKeys.has(`users:${id}`) || conflictKeys.has(`users:${id}`)) continue

    await userStore.put({
      ...user,
      id,
      username: user.username || `${user.name?.toLowerCase().replace(/\s+/g, '.')}@clinic.vet`,
      name: user.name || 'Unnamed Staff',
      role: user.role || 'Clinic Staff',
      prcLicense: user.prc_license ?? user.prcLicense ?? 'VET-894102',
      ptrNumber: user.ptr_number ?? user.ptrNumber ?? '1948201',
      deviceStatus: user.device_status ?? user.deviceStatus ?? 'Online',
      version: user.version || 1,
      createdAt: user.created_at ?? user.createdAt ?? new Date().toISOString(),
      updatedAt: user.updated_at ?? user.updatedAt ?? new Date().toISOString(),
      syncStatus: 'synced',
    })
  }
  await tx.done
}

export async function updatePatient(id, updates) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const tx = db.transaction(['patients', 'owners', 'syncQueue', 'idCounters'], 'readwrite')
  const patientStore = tx.objectStore('patients')
  const ownerStore = tx.objectStore('owners')
  const queueStore = tx.objectStore('syncQueue')
  const existing = await patientStore.get(id)
  if (!existing) throw new Error(`Patient with ID ${id} not found`)

  let ownerId = updates.ownerId ?? existing.ownerId ?? null
  const cleanOwnerName = updates.ownerName !== undefined ? updates.ownerName.trim() : (existing.ownerName || '')
  const cleanOwnerPhone = updates.ownerPhone !== undefined ? updates.ownerPhone.trim() : (existing.ownerPhone || '')
  const cleanOwnerAddress = updates.ownerAddress !== undefined ? updates.ownerAddress.trim() : (existing.ownerAddress || '')
  const cleanOwnerEmail = updates.ownerEmail !== undefined ? updates.ownerEmail.trim() : (existing.ownerEmail || '')

  if (cleanOwnerName || cleanOwnerPhone) {
    if (ownerId) {
      const existingOwner = await ownerStore.get(ownerId)
      if (existingOwner) {
        let changed = false
        if (cleanOwnerName && cleanOwnerName !== existingOwner.name) { existingOwner.name = cleanOwnerName; changed = true }
        if (cleanOwnerPhone !== undefined && cleanOwnerPhone !== existingOwner.phone) { existingOwner.phone = cleanOwnerPhone; changed = true }
        if (cleanOwnerAddress !== undefined && cleanOwnerAddress !== existingOwner.address) { existingOwner.address = cleanOwnerAddress; changed = true }
        if (cleanOwnerEmail !== undefined && cleanOwnerEmail !== existingOwner.email) { existingOwner.email = cleanOwnerEmail; changed = true }
        if (changed) {
          existingOwner.updatedAt = now
          existingOwner.syncStatus = 'pending'
          existingOwner.version = (existingOwner.version || 1) + 1
          await ownerStore.put(existingOwner)
          await queueStore.put(createSyncQueueItem('owners', existingOwner.id, 'UPDATE', existingOwner, now, existingOwner.version - 1))
        }
      }
    } else {
      const allOwners = await ownerStore.getAll()
      const match = allOwners.find((o) => {
        if (cleanOwnerPhone && o.phone && o.phone.trim() === cleanOwnerPhone) return true
        if (cleanOwnerName && o.name && o.name.trim().toLowerCase() === cleanOwnerName.toLowerCase()) return true
        return false
      })
      if (match) {
        ownerId = match.id
      } else {
        ownerId = await createNextRecordId(tx, 'owners', 'OWN', 4, 1001)
        const newOwner = {
          id: ownerId,
          name: cleanOwnerName || 'Pet Owner',
          phone: cleanOwnerPhone,
          address: cleanOwnerAddress,
          email: cleanOwnerEmail,
          syncStatus: 'pending',
          version: 1,
          createdAt: now,
          updatedAt: now,
        }
        await ownerStore.put(newOwner)
        await queueStore.put(createSyncQueueItem('owners', newOwner.id, 'CREATE', newOwner, now, 0))
      }
    }
  }

  const queuedItems = await queueStore.index('entityId').getAll(id)
  const matchingQueueItems = queuedItems.filter((item) => item.entityType === 'patients')
  const originalQueueItem = matchingQueueItems[0]
  const baseVersion = originalQueueItem?.baseVersion ?? existing.version ?? 0
  const operation = matchingQueueItems.some((item) => item.operation === 'CREATE') ? 'CREATE' : 'UPDATE'
  const updatedRecord = {
    ...existing,
    ...updates,
    id,
    ownerId,
    name: updates.name?.trim() || existing.name,
    weight: updates.weight !== undefined ? updates.weight.trim() : (existing.weight || ''),
    ownerName: cleanOwnerName,
    ownerPhone: cleanOwnerPhone,
    ownerAddress: cleanOwnerAddress,
    ownerEmail: cleanOwnerEmail,
    areaOfConcern: updates.areaOfConcern?.trim() ?? existing.areaOfConcern ?? '',
    syncStatus: 'pending',
    version: baseVersion + 1,
    updatedAt: now,
  }

  await patientStore.put(updatedRecord)
  for (const item of matchingQueueItems) await queueStore.delete(item.id)
  await queueStore.put(createSyncQueueItem('patients', id, operation, updatedRecord, now, baseVersion))
  await tx.done
  notifyQueueUpdated()
  return updatedRecord
}

const DEFAULT_STAFF = [
  {
    id: 'ST-001',
    username: 'admin@clinic.vet',
    name: 'Clinic Administrator',
    role: 'Clinic Admin',
    deviceStatus: 'Online',
    syncStatus: 'synced',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ST-002',
    username: 'staff@clinic.vet',
    name: 'Clinic Staff Member',
    role: 'Clinic Staff',
    deviceStatus: 'Online',
    syncStatus: 'synced',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export async function getStaffUsers() {
  const db = await initDatabase()
  const existing = await db.getAll('users')
  if (!existing || existing.length === 0) {
    const tx = db.transaction('users', 'readwrite')
    for (const member of DEFAULT_STAFF) {
      await tx.store.put(member)
    }
    await tx.done
    return DEFAULT_STAFF
  }
  return existing.filter((member) => !member._deletedLocally)
}

export async function addStaffUser(staff, { syncStatus = 'pending' } = {}) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const tx = db.transaction(['users', 'syncQueue', 'idCounters'], 'readwrite')
  const id = staff.id?.trim() || await createNextRecordId(tx, 'users', 'ST', 3, 1)

  const record = {
    ...staff,
    id,
    username: staff.username?.trim() || `${staff.name.toLowerCase().replace(/\s+/g, '.')}@clinic.vet`,
    name: staff.name.trim(),
    role: staff.role || 'Clinic Staff',
    deviceStatus: staff.deviceStatus || 'Online',
    syncStatus,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }

  await tx.objectStore('users').put(record)
  if (syncStatus !== 'synced') {
    await tx.objectStore('syncQueue').put(createSyncQueueItem('users', id, 'CREATE', record, now, 0))
  }
  await tx.done
  if (syncStatus !== 'synced') {
    notifyQueueUpdated()
  }
  return record
}

export async function updateStaffUser(id, updates) {
  const db = await initDatabase()
  const now = new Date().toISOString()

  const tx = db.transaction(['users', 'syncQueue'], 'readwrite')
  const existing = await tx.objectStore('users').get(id)

  const queueStore = tx.objectStore('syncQueue')
  const existingQueueItems = await queueStore.index('entityId').getAll(id)
  const matchingQueueItems = existingQueueItems.filter((item) => item.entityType === 'users')
  const originalQueueItem = matchingQueueItems[0]
  const baseRecord = existing || {
    id,
    username: updates.username?.trim() || `${id.toLowerCase()}@clinic.vet`,
    name: updates.name?.trim() || 'Staff Member',
    role: updates.role || 'Clinic Staff',
    deviceStatus: updates.deviceStatus || 'Online',
    version: 0,
    createdAt: now,
    updatedAt: now,
  }
  const baseVersion = originalQueueItem?.baseVersion ?? baseRecord.version ?? 0
  const operation = !existing || matchingQueueItems.some((item) => item.operation === 'CREATE') ? 'CREATE' : 'UPDATE'
  const updatedRecord = {
    ...baseRecord,
    ...updates,
    id,
    username: updates.username?.trim() || baseRecord.username,
    name: updates.name ? updates.name.trim() : baseRecord.name,
    role: updates.role || baseRecord.role,
    deviceStatus: updates.deviceStatus || baseRecord.deviceStatus,
    syncStatus: 'pending',
    version: baseVersion + 1,
    updatedAt: now,
  }

  await tx.objectStore('users').put(updatedRecord)
  for (const item of matchingQueueItems) await queueStore.delete(item.id)
  await queueStore.put(createSyncQueueItem('users', id, operation, updatedRecord, now, baseVersion))
  await tx.done
  notifyQueueUpdated()
  return updatedRecord
}

export async function deleteStaffUser(id) {
  const db = await initDatabase()
  const now = new Date().toISOString()

  const tx = db.transaction(['users', 'syncQueue'], 'readwrite')
  const existing = await tx.objectStore('users').get(id)
  if (existing) {
    const queueStore = tx.objectStore('syncQueue')
    const queuedItems = await queueStore.index('entityId').getAll(id)
    const matchingQueueItems = queuedItems.filter((item) => item.entityType === 'users')
    const originalQueueItem = matchingQueueItems[0]
    const baseVersion = originalQueueItem?.baseVersion ?? existing.version ?? 0
    const isOnlyLocal = matchingQueueItems.some((item) => item.operation === 'CREATE')

    if (isOnlyLocal) {
      // Record was never synced to the cloud — delete it outright
      await tx.objectStore('users').delete(id)
      for (const item of matchingQueueItems) await queueStore.delete(item.id)
    } else {
      // Fix 9: Soft-delete — keep the record locally until the DELETE is confirmed synced
      const softDeleted = { ...existing, _deletedLocally: true, syncStatus: 'pending', updatedAt: now }
      await tx.objectStore('users').put(softDeleted)
      for (const item of matchingQueueItems) await queueStore.delete(item.id)
      await queueStore.put(createSyncQueueItem('users', id, 'DELETE', { id }, now, baseVersion))
    }
  }
  await tx.done
  notifyQueueUpdated()
  return id
}

export async function getPendingSyncQueue() {
  const db = await initDatabase()
  const all = await db.getAll('syncQueue')
  // Fix 7: Exclude conflict and failed items from the "pending" count and push attempts
  return all.filter((item) => item.status !== 'conflict' && item.status !== 'failed')
}

export async function getFailedSyncItems() {
  const db = await initDatabase()
  const all = await db.getAll('syncQueue')
  return all.filter((item) => item.status === 'failed')
}

export async function discardFailedSyncItem(id) {
  const db = await initDatabase()
  await db.delete('syncQueue', id)
  notifyQueueUpdated()
}

export async function retryFailedSyncItem(id) {
  const db = await initDatabase()
  const tx = db.transaction('syncQueue', 'readwrite')
  const item = await tx.store.get(id)
  if (item) {
    item.status = 'pending'
    item.retryCount = 0
    delete item.lastError
    await tx.store.put(item)
  }
  await tx.done
  notifyQueueUpdated()
}

export async function getSyncConflicts() {
  const db = await initDatabase()
  const conflicts = await db.getAll('syncConflicts')
  return conflicts
    .filter((conflict) => !conflict.resolutionStatus || conflict.resolutionStatus === 'unresolved')
    .sort((first, second) => (second.createdAt || '').localeCompare(first.createdAt || ''))
}

export async function saveRemoteSyncConflicts(remoteConflicts) {
  const db = await initDatabase()
  const tx = db.transaction('syncConflicts', 'readwrite')
  const store = tx.objectStore('syncConflicts')
  const existingConflicts = await store.getAll()
  const remoteIds = new Set(remoteConflicts.map((conflict) => conflict.id))
  const now = new Date().toISOString()

  for (const conflict of existingConflicts) {
    if ((!conflict.resolutionStatus || conflict.resolutionStatus === 'unresolved') && !remoteIds.has(conflict.id)) {
      await store.put({ ...conflict, resolutionStatus: 'resolved', resolution: 'remote', resolvedAt: now })
    }
  }
  for (const conflict of remoteConflicts) {
    await store.put({ ...conflict, resolutionStatus: 'unresolved' })
  }
  await tx.done
}

export async function resolveSyncConflict(conflictId, resolution, authoritativeRecord) {
  if (!['local', 'cloud'].includes(resolution)) {
    throw new Error('Choose either the local or cloud version to resolve this conflict.')
  }

  const db = await initDatabase()
  const conflict = await db.get('syncConflicts', conflictId)
  if (!conflict) throw new Error('This sync conflict could not be found.')

  const storeName = SYNC_STORE_NAMES.includes(conflict.entityType) ? conflict.entityType : null
  if (!storeName) throw new Error(`Unsupported conflict type: ${conflict.entityType}`)

  const selected = resolution === 'local' ? conflict.localData : conflict.cloudData
  if (!selected || selected.id !== conflict.entityId) {
    throw new Error('The selected conflict version is missing or has an unexpected record ID.')
  }

  const now = new Date().toISOString()
  const tx = db.transaction(['syncConflicts', 'syncQueue', storeName], 'readwrite')
  const conflictStore = tx.objectStore('syncConflicts')
  const queueStore = tx.objectStore('syncQueue')
  const recordStore = tx.objectStore(storeName)
  const queuedItems = await queueStore.index('entityId').getAll(conflict.entityId)

  for (const item of queuedItems) {
    if (item.entityType === storeName) await queueStore.delete(item.id)
  }

  if (authoritativeRecord) {
    if (authoritativeRecord._deleted) {
      await recordStore.delete(conflict.entityId)
    } else {
      const normalizedRecord = normalizeCloudRecord(storeName, authoritativeRecord)
      await recordStore.put({ ...normalizedRecord, syncStatus: 'synced' })
    }

    await conflictStore.put({ ...conflict, resolutionStatus: 'resolved', resolution, resolvedAt: now })
    await tx.done
    return conflict
  }

  const normalized = normalizeCloudRecord(storeName, selected)

  if (resolution === 'local' && selected._deleted) {
    await recordStore.delete(conflict.entityId)
    await queueStore.put(createSyncQueueItem(
      storeName,
      conflict.entityId,
      'DELETE',
      { id: conflict.entityId },
      now,
      conflict.cloudData?.version || 0,
    ))
  } else if (resolution === 'local') {
    const localRecord = {
      ...normalized,
      syncStatus: 'pending',
      version: (conflict.cloudData?.version || 0) + 1,
      updatedAt: now,
    }
    await recordStore.put(localRecord)
    await queueStore.put(createSyncQueueItem(
      storeName,
      conflict.entityId,
      'UPDATE',
      localRecord,
      now,
      conflict.cloudData?.version || 0,
    ))
  } else if (selected._deleted) {
    await recordStore.delete(conflict.entityId)
  } else {
    await recordStore.put({ ...normalized, syncStatus: 'synced' })
  }

  await conflictStore.put({
    ...conflict,
    resolutionStatus: 'resolved',
    resolution,
    resolvedAt: now,
  })
  await tx.done
  notifyQueueUpdated()

  return conflict
}

export async function performCloudSync(apiBaseUrl = 'http://localhost:8000', authToken = '') {
  if (isSyncLocked()) {
    return {
      success: false,
      inProgress: true,
      message: 'A cloud synchronization is already in progress.',
    }
  }

  acquireSyncLock()
  try {
    const db = await initDatabase()
    const allQueue = await db.getAll('syncQueue')
    const queue = allQueue.filter((item) => item.status !== 'conflict' && item.status !== 'failed')
    let pushResult = { success: true, synced_ids: [], synced_count: 0, errors: [] }

    if (queue.length > 0) {
      const preparedQueue = await Promise.all(queue.map(async (item) => {
        if (item.operation && item.payload) return item

        const storeName = SYNC_STORE_NAMES.includes(item.entityType) ? item.entityType : null
        const record = storeName ? await db.get(storeName, item.entityId) : null
        return {
          ...item,
          operation: item.operation || (record ? 'UPDATE' : 'DELETE'),
          payload: item.payload || record || { id: item.entityId },
        }
      }))

      const response = await fetch(`${apiBaseUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ queue: preparedQueue }),
      })

      if (!response.ok) {
        throw new Error(`Cloud server responded with status HTTP ${response.status}`)
      }

      pushResult = await response.json()
      const syncedIds = new Set(pushResult.synced_ids || [])
      const backendConflicts = pushResult.conflicts || []
      const itemErrors = new Map((pushResult.errors || []).map((err) => [err.id, err.error]))

      if (syncedIds.size > 0 || backendConflicts.length > 0 || itemErrors.size > 0) {
        const tx = db.transaction(['syncQueue', 'syncConflicts', ...SYNC_STORE_NAMES], 'readwrite')
        const queueStore = tx.objectStore('syncQueue')
        const conflictStore = tx.objectStore('syncConflicts')
        const conflictedKeys = new Set()

        for (const item of queue) {
          if (syncedIds.has(item.id)) {
            await queueStore.delete(item.id)

            const store = SYNC_STORE_NAMES.includes(item.entityType) ? tx.objectStore(item.entityType) : null
            if (store) {
              if (item.operation === 'DELETE') {
                await store.delete(item.entityId)
              } else {
                const record = await store.get(item.entityId)
                const remaining = await queueStore.index('entityId').getAll(item.entityId)
                if (record && !remaining.some((queuedItem) => queuedItem.entityType === item.entityType)) {
                  record.syncStatus = 'synced'
                  await store.put(record)
                }
              }
            }
            continue
          }

          if (itemErrors.has(item.id)) {
            const currentItem = await queueStore.get(item.id)
            if (currentItem) {
              const retries = (currentItem.retryCount || 0) + 1
              currentItem.retryCount = retries
              currentItem.lastError = itemErrors.get(item.id)
              if (retries >= 3) {
                currentItem.status = 'failed'
              }
              await queueStore.put(currentItem)
            }
            continue
          }

          const conflict = backendConflicts.find((candidate) => candidate.queue_id === item.id || candidate.id === item.id)
          if (!conflict) continue
          await queueStore.delete(item.id)
          await conflictStore.put({
            ...conflict,
            id: conflict.id || item.id,
            entityType: conflict.entityType || item.entityType,
            entityId: conflict.entityId || item.entityId,
            localData: conflict.localData || item.payload,
            operation: conflict.operation || item.operation,
            resolutionStatus: 'unresolved',
            createdAt: conflict.createdAt || new Date().toISOString(),
          })
          conflictedKeys.add(`${item.entityType}:${item.entityId}`)

          const store = SYNC_STORE_NAMES.includes(item.entityType) ? tx.objectStore(item.entityType) : null
          if (store) {
            const localRecord = await store.get(item.entityId)
            if (localRecord) {
              localRecord.syncStatus = 'conflict'
              await store.put(localRecord)
            }
          }
        }
        await tx.done
        pushResult.conflictedKeys = [...conflictedKeys]
      }
    }

    const lastSyncTimestamp = typeof localStorage !== 'undefined' ? localStorage.getItem('vetlink_last_sync_timestamp') : null
    const pullUrl = lastSyncTimestamp
      ? `${apiBaseUrl}/api/sync/pull?since=${encodeURIComponent(lastSyncTimestamp)}`
      : `${apiBaseUrl}/api/sync/pull`

    const pullResponse = await fetch(pullUrl, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
    if (!pullResponse.ok) {
      throw new Error(`Cloud pull failed with status HTTP ${pullResponse.status}`)
    }
    const cloudSnapshot = await pullResponse.json()
    if (cloudSnapshot.server_time && typeof localStorage !== 'undefined') {
      localStorage.setItem('vetlink_last_sync_timestamp', cloudSnapshot.server_time)
    }

    await saveRemoteSyncConflicts(cloudSnapshot.conflicts || [])
    const currentQueue = await db.getAll('syncQueue')
    const queuedEntities = new Set(currentQueue.map((item) => `${item.entityType}:${item.entityId}`))
    const storedConflicts = await getSyncConflicts()
    const conflictedEntities = new Set([
      ...(pushResult.conflictedKeys || []),
      ...storedConflicts.map((item) => `${item.entityType}:${item.entityId}`),
    ])

    const reconcileStore = async (storeName, cloudRecords, deletedRecords) => {
      const localRecords = await db.getAll(storeName)
      const cloudById = new Map(cloudRecords.map((record) => {
        const mapped = normalizeCloudRecord(storeName, record)
        return [mapped.id, mapped]
      }))
      const tx = db.transaction(storeName, 'readwrite')
      const store = tx.objectStore(storeName)

      for (const [id, cloudRecord] of cloudById) {
        if (queuedEntities.has(`${storeName}:${id}`) || conflictedEntities.has(`${storeName}:${id}`)) continue
        await store.put({ ...cloudRecord, syncStatus: 'synced' })
      }

      for (const localRecord of localRecords) {
        const cloudDeleted = deletedRecords.some((item) =>
          item.entity_type === storeName && item.entity_id === localRecord.id,
        )
        if (cloudDeleted && !cloudById.has(localRecord.id) &&
          !queuedEntities.has(`${storeName}:${localRecord.id}`) &&
          !conflictedEntities.has(`${storeName}:${localRecord.id}`)) {
          await store.delete(localRecord.id)
        }
      }
      await tx.done
    }

    await reconcileStore('users', cloudSnapshot.users || [], cloudSnapshot.deleted || [])
    await reconcileStore('owners', cloudSnapshot.owners || [], cloudSnapshot.deleted || [])
    await reconcileStore('patients', cloudSnapshot.patients || [], cloudSnapshot.deleted || [])
    await reconcileStore('consultations', cloudSnapshot.consultations || [], cloudSnapshot.deleted || [])
    await reconcileStore('screeningResults', cloudSnapshot.screeningResults || [], cloudSnapshot.deleted || [])
    await reconcileStore('auditLogs', cloudSnapshot.auditLogs || [], cloudSnapshot.deleted || [])

    const remainingPendingQueue = (await db.getAll('syncQueue')).filter(
      (item) => item.status !== 'conflict' && item.status !== 'failed'
    )
    const failedItems = pushResult.errors || []
    const pendingKeys = new Set(remainingPendingQueue.map((item) => `${item.entityType}:${item.entityId}`))
    const localIds = new Set()
    for (const storeName of SYNC_STORE_NAMES) {
      const localRecords = await db.getAll(storeName)
      for (const record of localRecords) {
        if (!pendingKeys.has(`${storeName}:${record.id}`) &&
          !conflictedEntities.has(`${storeName}:${record.id}`)) {
          localIds.add(`${storeName}:${record.id}`)
        }
      }
    }
    const cloudIds = new Set([
      ...(cloudSnapshot.users || []).map((record) => `users:${record.id}`),
      ...(cloudSnapshot.owners || []).map((record) => `owners:${record.id}`),
      ...(cloudSnapshot.patients || []).map((record) => `patients:${record.id}`),
      ...(cloudSnapshot.consultations || []).map((record) => `consultations:${record.id}`),
      ...(cloudSnapshot.screeningResults || []).map((record) => `screeningResults:${record.id}`),
      ...(cloudSnapshot.auditLogs || []).map((record) => `auditLogs:${record.id}`),
    ].filter((key) => !pendingKeys.has(key) && !conflictedEntities.has(key)))

    const isIncrementalPull = Boolean(lastSyncTimestamp)
    const hasUnqueuedMismatch = !isIncrementalPull && (localIds.size !== cloudIds.size || [...localIds].some((id) => !cloudIds.has(id)))
    const conflictCount = storedConflicts.length

    return {
      success: pushResult.success !== false && remainingPendingQueue.length === 0 && !hasUnqueuedMismatch && conflictCount === 0,
      syncedCount: pushResult.synced_count || pushResult.synced_ids?.length || 0,
      pendingCount: remainingPendingQueue.length,
      errors: failedItems,
      message: conflictCount > 0
        ? `${conflictCount} sync conflict(s) need review.`
        : hasUnqueuedMismatch
        ? 'Sync could not confirm parity: unqueued local and cloud records differ.'
        : remainingPendingQueue.length === 0
          ? 'Local and cloud records are synchronized.'
          : `Cloud sync completed with ${remainingPendingQueue.length} local change(s) still pending.`,
    }
  } finally {
    releaseSyncLock()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultation Functions
// ─────────────────────────────────────────────────────────────────────────────

export async function addConsultation(consultation) {
  const db  = await initDatabase()
  const now = new Date().toISOString()
  const tx  = db.transaction(['consultations', 'syncQueue'], 'readwrite')
  const id  = createGlobalRecordId('CONS')

  const record = {
    ...consultation,
    id,
    secondaryDiagnosis:   consultation.secondaryDiagnosis || null,
    isComorbid:           Boolean(consultation.isComorbid),
    doctorName:           consultation.doctorName || null,
    doctorSignatureImage: consultation.doctorSignatureImage || consultation.signatureImage || null,
    doctorPrcLicense:     consultation.doctorPrcLicense || consultation.prcLicense || null,
    doctorPtrNumber:      consultation.doctorPtrNumber || consultation.ptrNumber || null,
    lastEditedBy:         consultation.lastEditedBy || consultation.doctorName || null,
    lastEditedAt:         consultation.lastEditedAt || now,
    createdAt:            now,
    updatedAt:            now,
    syncStatus:           'pending',
    version:              1,
  }

  await tx.objectStore('consultations').put(record)
  await tx.objectStore('syncQueue').put(
    createSyncQueueItem('consultations', record.id, 'CREATE', record, now, 0)
  )
  await tx.done
  notifyQueueUpdated()
  return record
}

export async function getConsultationsByPatient(patientId) {
  const db = await initDatabase()
  return db.getAllFromIndex('consultations', 'patientId', patientId)
}

export async function updateConsultation(id, updates) {
  const db = await initDatabase()
  const now = new Date().toISOString()
  const tx = db.transaction(['consultations', 'syncQueue'], 'readwrite')
  const consultStore = tx.objectStore('consultations')
  const queueStore = tx.objectStore('syncQueue')
  const existing = await consultStore.get(id)
  if (!existing) throw new Error(`Consultation with ID ${id} not found`)
  const queuedItems = await queueStore.index('entityId').getAll(id)
  const matchingQueueItems = queuedItems.filter((item) => item.entityType === 'consultations')
  const originalQueueItem = matchingQueueItems[0]
  const baseVersion = originalQueueItem?.baseVersion ?? existing.version ?? 0
  const operation = matchingQueueItems.some((item) => item.operation === 'CREATE') ? 'CREATE' : 'UPDATE'

  const updatedRecord = {
    ...existing,
    ...updates,
    id,
    updatedAt: now,
    syncStatus: 'pending',
    version: baseVersion + 1,
  }

  await consultStore.put(updatedRecord)
  for (const item of matchingQueueItems) await queueStore.delete(item.id)
  await queueStore.put(createSyncQueueItem('consultations', updatedRecord.id, operation, updatedRecord, now, baseVersion))
  await tx.done
  notifyQueueUpdated()
  return updatedRecord
}

// ─────────────────────────────────────────────────────────────────────────────
// Screening Result Functions (AI output)
// ─────────────────────────────────────────────────────────────────────────────

export async function addScreeningResult(result) {
  const db  = await initDatabase()
  const now = new Date().toISOString()
  const tx  = db.transaction(['screeningResults', 'syncQueue'], 'readwrite')
  const id  = createGlobalRecordId('SR')

  const record = {
    ...result,
    id,
    aiSecondaryLabel:      result.aiSecondaryLabel || null,
    aiSecondaryConfidence: result.aiSecondaryConfidence || null,
    isComorbid:            Boolean(result.isComorbid),
    createdAt:             now,
    updatedAt:             now,
    syncStatus:            'pending',
    reviewStatus:          result.reviewStatus || 'pending',
    version:               1,
  }

  await tx.objectStore('screeningResults').put(record)
  await tx.objectStore('syncQueue').put(
    createSyncQueueItem('screeningResults', record.id, 'CREATE', record, now, 0)
  )
  await tx.done
  notifyQueueUpdated()
  return record
}

export async function getScreeningResultsByConsultation(consultationId) {
  const db = await initDatabase()
  return db.getAllFromIndex('screeningResults', 'consultationId', consultationId)
}

export async function getPendingScreeningResults() {
  const db      = await initDatabase()
  const results = await db.getAll('screeningResults')
  return results.filter((r) => r.reviewStatus === 'pending')
}

export async function updateScreeningResultStatus(id, reviewStatus) {
  const db       = await initDatabase()
  const tx       = db.transaction(['screeningResults', 'syncQueue'], 'readwrite')
  const resultStore = tx.objectStore('screeningResults')
  const queueStore = tx.objectStore('syncQueue')
  const existing = await resultStore.get(id)
  if (!existing) throw new Error(`Screening result ${id} not found`)

  const now = new Date().toISOString()
  const queuedItems = await queueStore.index('entityId').getAll(id)
  const matchingQueueItems = queuedItems.filter((item) => item.entityType === 'screeningResults')
  const originalQueueItem = matchingQueueItems[0]
  const baseVersion = originalQueueItem?.baseVersion ?? existing.version ?? 0
  const operation = matchingQueueItems.some((item) => item.operation === 'CREATE') ? 'CREATE' : 'UPDATE'
  const updated = {
    ...existing,
    reviewStatus,
    updatedAt: now,
    syncStatus: 'pending',
    version: baseVersion + 1,
  }

  await resultStore.put(updated)
  for (const item of matchingQueueItems) await queueStore.delete(item.id)
  await queueStore.put(createSyncQueueItem('screeningResults', id, operation, updated, now, baseVersion))
  await tx.done
  notifyQueueUpdated()
  return updated
}

// ─────────────────────────────────────────────────────────────────────────────
// Consultation Symptoms & Reference Functions (Resolves Schema Audit Finding)
// ─────────────────────────────────────────────────────────────────────────────

export async function addConsultationSymptoms(consultationId, symptomIds = [], customNotes = '') {
  try {
    const db = await initDatabase()
    if (!db.objectStoreNames.contains('consultationSymptoms')) {
      console.warn('[IndexedDB] consultationSymptoms store not found in schema')
      return []
    }
    const now = new Date().toISOString()
    const tx = db.transaction(['consultationSymptoms'], 'readwrite')
    const csStore = tx.objectStore('consultationSymptoms')

    const savedRecords = []

    for (let i = 0; i < symptomIds.length; i++) {
      const symptomId = symptomIds[i]
      const recId = `CS-${consultationId}-${i + 1}-${Date.now().toString(36)}`
      const record = {
        id: recId,
        consultationId,
        symptomId,
        severity: 'moderate',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
        version: 1,
      }
      await csStore.put(record)
      savedRecords.push(record)
    }

    // If custom notes are provided as "Other Symptoms", store as custom symptom record
    if (customNotes && customNotes.trim()) {
      const customRecId = `CS-${consultationId}-custom-${Date.now().toString(36)}`
      const customRecord = {
        id: customRecId,
        consultationId,
        symptomId: 'SYM-CUSTOM',
        severity: 'clinician-noted',
        customDescription: customNotes.trim(),
        createdAt: now,
        updatedAt: now,
        syncStatus: 'local',
        version: 1,
      }
      await csStore.put(customRecord)
      savedRecords.push(customRecord)
    }

    await tx.done
    return savedRecords
  } catch (err) {
    console.warn('[IndexedDB] Could not record consultation symptoms:', err)
    return []
  }
}

export async function getConsultationSymptoms(consultationId) {
  try {
    const db = await initDatabase()
    if (!db.objectStoreNames.contains('consultationSymptoms')) return []
    return await db.getAllFromIndex('consultationSymptoms', 'consultationId', consultationId)
  } catch (err) {
    console.warn('[IndexedDB] Could not fetch consultation symptoms:', err)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Logs & System Activity Recording
// ─────────────────────────────────────────────────────────────────────────────

export async function logAuditEvent({ action, user, targetEntity = '', targetId = '', details = '' }) {
  try {
    const db = await initDatabase()
    const now = new Date().toISOString()
    const logId = `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const entry = {
      id: logId,
      action: action || 'SYSTEM_EVENT',
      userId: user?.id || user?.userId || 'SYSTEM',
      userName: user?.name || user?.userName || user?.email || 'System User',
      userRole: user?.role || user?.userRole || 'Staff',
      targetEntity: targetEntity || '',
      targetId: targetId || '',
      details: typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
      createdAt: now,
      syncStatus: 'pending',
      version: 1,
    }

    const tx = db.transaction(['auditLogs', 'syncQueue'], 'readwrite')
    await tx.objectStore('auditLogs').put(entry)
    await tx.objectStore('syncQueue').put(createSyncQueueItem('auditLogs', logId, 'CREATE', entry, now, 0))
    await tx.done
    notifyQueueUpdated()
    return entry
  } catch (err) {
    console.warn('[VetLink Audit] Could not record audit log:', err)
  }
}

export async function getAuditLogs() {
  try {
    const db = await initDatabase()
    const logs = await db.getAll('auditLogs')
    return (logs || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch (err) {
    console.warn('[VetLink Audit] Could not fetch audit logs:', err)
    return []
  }
}
