import { useState, useEffect, useCallback } from 'react'
import {
  getStaffUsers,
  addStaffUser,
  updateStaffUser,
  deleteStaffUser,
  mergeCloudStaff,
} from '../db/database'

export default function Staff({ authToken, apiBaseUrl = 'http://localhost:8000' }) {
  const [staffList, setStaffList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState(null)

  // Form inputs
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    username: '',
    temporaryPassword: '',
    role: 'Technician',
    deviceStatus: 'Online',
  })

  const refreshStaff = useCallback(async () => {
    try {
      if (navigator.onLine && authToken) {
        try {
          const response = await fetch(`${apiBaseUrl}/api/users`, {
            headers: { Authorization: `Bearer ${authToken}` },
          })
          if (response.ok) {
            const result = await response.json()
            await mergeCloudStaff(result.users || [])
          }
        } catch {
          // Fallback to local IndexedDB on network error
        }
      }
      const records = await getStaffUsers()
      setStaffList(records)
    } catch (err) {
      console.error('Failed to reload staff records:', err)
      setErrorMessage('Could not load staff members from the local database.')
    }
  }, [apiBaseUrl, authToken])

  useEffect(() => {
    let isMounted = true

    const loadStaff = async () => {
      try {
        const localStaff = await getStaffUsers()
        if (isMounted) {
          setStaffList(localStaff)
        }

        if (!navigator.onLine || !authToken) return

        const response = await fetch(`${apiBaseUrl}/api/users`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        if (!response.ok) return

        const result = await response.json()
        await mergeCloudStaff(result.users || [])
        const mergedStaff = await getStaffUsers()
        if (isMounted) {
          setStaffList(mergedStaff)
        }
      } catch (err) {
        console.warn('Could not retrieve cloud staff on mount:', err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadStaff()

    const handleSynced = () => {
      refreshStaff()
    }
    window.addEventListener('vetlink:synced', handleSynced)

    return () => {
      isMounted = false
      window.removeEventListener('vetlink:synced', handleSynced)
    }
  }, [apiBaseUrl, authToken, refreshStaff])

  useEffect(() => {
    if (!successMessage) return
    const timer = setTimeout(() => setSuccessMessage(''), 3500)
    return () => clearTimeout(timer)
  }, [successMessage])

  const handleOpenAddModal = () => {
    setEditingStaff(null)
    setFormError('')
    setFormData({
      id: '',
      name: '',
      username: '',
      temporaryPassword: '',
      role: 'Technician',
      deviceStatus: 'Online',
    })
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (staff) => {
    setEditingStaff(staff)
    setFormError('')
    setFormData({
      id: staff.id,
      name: staff.name,
      username: staff.username || '',
      temporaryPassword: '',
      role: staff.role || 'Technician',
      deviceStatus: staff.deviceStatus || 'Online',
    })
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingStaff(null)
    setFormError('')
  }

  const handleSubmitForm = async (event) => {
    event.preventDefault()
    if (!formData.name.trim()) {
      setFormError('Staff name is required.')
      return
    }
    if (!formData.username.trim()) {
      setFormError('Work email / username is required.')
      return
    }
    if (!editingStaff && formData.temporaryPassword.length < 10) {
      setFormError('Temporary password must be at least 10 characters.')
      return
    }

    setIsSaving(true)
    setFormError('')

    try {
      if (editingStaff) {
        await updateStaffUser(editingStaff.id, {
          name: formData.name.trim(),
          username: formData.username.trim(),
          role: formData.role,
          deviceStatus: formData.deviceStatus,
        })
        setSuccessMessage(`Updated "${formData.name.trim()}" successfully.`)
      } else {
        const response = await fetch(`${apiBaseUrl}/api/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            name: formData.name.trim(),
            email: formData.username.trim(),
            role: formData.role,
            temporary_password: formData.temporaryPassword,
          }),
        })
        const result = await response.json()
        if (!response.ok) throw new Error(result.detail || 'Could not create staff login account.')

        await addStaffUser({
          id: result.id,
          name: formData.name.trim(),
          username: formData.username.trim(),
          role: formData.role,
          deviceStatus: formData.deviceStatus,
        }, { syncStatus: 'synced' })
        setSuccessMessage(`Added "${formData.name.trim()}" to staff database.`)
      }
      await refreshStaff()
      handleCloseModal()
    } catch (err) {
      console.error('Failed to save staff record:', err)
      setFormError(err.message || 'Failed to save staff record. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleDeviceStatus = async (staff) => {
    const nextStatus = staff.deviceStatus === 'Online' ? 'Offline' : 'Online'
    try {
      await updateStaffUser(staff.id, { deviceStatus: nextStatus })
      await refreshStaff()
      setSuccessMessage(`${staff.name}'s device marked as ${nextStatus}.`)
    } catch (err) {
      console.error('Failed to toggle device status:', err)
      setErrorMessage(`Could not update device status for ${staff.name}.`)
    }
  }

  const handleExecuteDelete = async () => {
    if (!deleteConfirmStaff) return
    setIsSaving(true)
    try {
      await deleteStaffUser(deleteConfirmStaff.id)
      await refreshStaff()
      setSuccessMessage(`Removed staff member "${deleteConfirmStaff.name}".`)
      setDeleteConfirmStaff(null)
    } catch (err) {
      console.error('Failed to delete staff member:', err)
      setErrorMessage(`Unable to remove staff member: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  const visibleStaff = staffList.filter((staff) => {
    const query = searchTerm.toLowerCase()
    const matchesSearch =
      (staff.name && staff.name.toLowerCase().includes(query)) ||
      (staff.id && staff.id.toLowerCase().includes(query)) ||
      (staff.username && staff.username.toLowerCase().includes(query)) ||
      (staff.role && staff.role.toLowerCase().includes(query))

    const matchesRole = roleFilter === 'All' || staff.role === roleFilter

    return matchesSearch && matchesRole
  })

  return (
    <section className="staff-card">
      <div className="staff-header-actions">
        <button
          className="action-btn blue"
          type="button"
          onClick={handleOpenAddModal}
        >
          + Add New Staff
        </button>

        <div className="staff-filter-group">
          <input
            className="search-input"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, ID, or email..."
            aria-label="Search staff"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
          >
            <option value="All">All Roles</option>
            <option value="Veterinarian">Veterinarian</option>
            <option value="Technician">Technician</option>
            <option value="Assistant">Assistant</option>
            <option value="Clinic Admin">Clinic Admin</option>
          </select>
        </div>
      </div>

      {successMessage && (
        <div className="alert-banner success" role="status">
          <span>{successMessage}</span>
          <button
            type="button"
            className="modal-close-btn"
            style={{ minHeight: 'auto', minWidth: 'auto', fontSize: '1rem' }}
            onClick={() => setSuccessMessage('')}
          >
            ✕
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="alert-banner error" role="alert">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="modal-close-btn"
            style={{ minHeight: 'auto', minWidth: 'auto', fontSize: '1rem' }}
            onClick={() => setErrorMessage('')}
          >
            ✕
          </button>
        </div>
      )}

      <div className="patients-table-wrap">
        <table className="patients-table staff-table">
          <thead>
            <tr>
              <th>STAFF ID</th>
              <th>NAME &amp; EMAIL</th>
              <th>ROLE</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>
                  Loading staff records from database...
                </td>
              </tr>
            ) : visibleStaff.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>
                  No staff members found matching your search.
                </td>
              </tr>
            ) : (
              visibleStaff.map((staff) => (
                <tr key={staff.id}>
                  <td>
                    <strong>{staff.id}</strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>{staff.name}</strong>
                      {staff.syncStatus === 'pending' && (
                        <span className="sync-pending-pill" title="Offline changes pending sync with cloud">
                          <span className="sync-pulse-dot" />
                          Unsynced
                        </span>
                      )}
                    </div>
                    {staff.username && (
                      <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
                        {staff.username}
                      </div>
                    )}
                  </td>
                  <td>{staff.role}</td>
                  <td>
                    <button
                      type="button"
                      className={`status-badge clickable ${staff.deviceStatus === 'Offline' ? 'gray' : ''}`}
                      onClick={() => handleToggleDeviceStatus(staff)}
                      title="Click to toggle status"
                    >
                      {staff.deviceStatus === 'Offline' ? 'Offline' : 'Online'}
                    </button>
                  </td>
                  <td>
                    <button
                      className="small-outline"
                      type="button"
                      onClick={() => handleOpenEditModal(staff)}
                    >
                      EDIT
                    </button>
                    <button
                      className="small-outline danger"
                      type="button"
                      onClick={() => setDeleteConfirmStaff(staff)}
                    >
                      REMOVE
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Staff Modal */}
      {isModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="staff-modal-title">
          <div className="modal-dialog">
            <header className="modal-header">
              <h3 id="staff-modal-title">
                {editingStaff ? `Edit Staff Member (${editingStaff.id})` : 'Add New Staff Member'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </header>

            <form className="modal-form" onSubmit={handleSubmitForm}>
              {formError && (
                <div className="alert-banner error" role="alert">
                  <span>{formError}</span>
                </div>
              )}

              {editingStaff ? (
                <label>
                  <span>Staff ID</span>
                  <input type="text" value={formData.id} disabled />
                </label>
              ) : (
                <p className="id-auto-note">Staff ID will be assigned automatically.</p>
              )}

              <label>
                <span>Full Name</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Dr. Sarah Lin"
                  required
                />
              </label>

              <label>
                <span>Work Email / Username</span>
                <input
                  type="email"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="sarah.lin@clinic.vet"
                  required
                />
              </label>

              {!editingStaff && (
                <label>
                  <span>Temporary Password</span>
                  <input
                    type="password"
                    value={formData.temporaryPassword}
                    onChange={(e) => setFormData({ ...formData, temporaryPassword: e.target.value })}
                    autoComplete="new-password"
                    minLength={10}
                    required
                  />
                </label>
              )}

              <label>
                <span>Role</span>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="Veterinarian">Veterinarian</option>
                  <option value="Technician">Technician</option>
                  <option value="Assistant">Assistant</option>
                  <option value="Clinic Admin">Clinic Admin</option>
                </select>
              </label>

              <label>
                <span>Status</span>
                <select
                  value={formData.deviceStatus}
                  onChange={(e) => setFormData({ ...formData, deviceStatus: e.target.value })}
                >
                  <option value="Online">Online</option>
                  <option value="Offline">Offline</option>
                </select>
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="small-outline"
                  onClick={handleCloseModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="action-btn blue"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : editingStaff ? 'Save Changes' : 'Create Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmStaff && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className="modal-dialog">
            <header className="modal-header">
              <h3 id="delete-modal-title">Confirm Staff Removal</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeleteConfirmStaff(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <div className="modal-form">
              <p>
                Are you sure you want to remove <strong>{deleteConfirmStaff.name}</strong> ({deleteConfirmStaff.id})?
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                This record will be removed from your local device and marked for cloud synchronization.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="small-outline"
                  onClick={() => setDeleteConfirmStaff(null)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={handleExecuteDelete}
                  disabled={isSaving}
                >
                  {isSaving ? 'Removing...' : 'Remove Staff Member'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
