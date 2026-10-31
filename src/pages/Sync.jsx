import { useState, useEffect, useCallback } from 'react'
import {
  getPendingSyncQueue,
  getSyncConflicts,
  getFailedSyncItems,
  discardFailedSyncItem,
  retryFailedSyncItem,
  isSyncLocked,
  performCloudSync,
  resolveSyncConflict,
  saveRemoteSyncConflicts,
} from '../db/database'

export default function Sync({ authToken, apiBaseUrl = 'http://localhost:8000', currentUser }) {
  const isAdmin = currentUser?.role === 'Clinic Admin'
  const [queue, setQueue] = useState([])
  const [failedQueue, setFailedQueue] = useState([])
  const [conflicts, setConflicts] = useState([])
  const [activeTab, setActiveTab] = useState('queue')
  const [selectedConflictId, setSelectedConflictId] = useState(null)
  const [isResolving, setIsResolving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [serverStatus, setServerStatus] = useState('checking') // checking, online, offline
  const [serverInfo, setServerInfo] = useState(null)
  const [feedback, setFeedback] = useState(null) // { type: 'success' | 'error', message: string }
  const [lastSyncTime, setLastSyncTime] = useState(null)

  const refreshQueue = useCallback(async () => {
    try {
      const [items, failed] = await Promise.all([
        getPendingSyncQueue(),
        getFailedSyncItems(),
      ])
      setQueue(items || [])
      setFailedQueue(failed || [])
    } catch (err) {
      console.error('Failed to read syncQueue from IndexedDB:', err)
    }
  }, [])

  const refreshConflicts = useCallback(async () => {
    try {
      if (navigator.onLine && authToken) {
        const response = await fetch(`${apiBaseUrl}/api/sync/conflicts`, {
          headers: { Authorization: `Bearer ${authToken}` },
        })
        if (response.ok) {
          const result = await response.json()
          await saveRemoteSyncConflicts(result.conflicts || [])
        }
      }
    } catch {
      // Offline fallback: load from IndexedDB
    }

    try {
      const items = await getSyncConflicts()
      setConflicts(items || [])
      setSelectedConflictId((currentId) =>
        items && items.some((item) => item.id === currentId) ? currentId : items?.[0]?.id || null,
      )
    } catch (err) {
      console.error('Failed to read syncConflicts from IndexedDB:', err)
    }
  }, [apiBaseUrl, authToken])

  const checkServerHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/health`, { method: 'GET' })
      if (res.ok) {
        const data = await res.json()
        setServerStatus('online')
        setServerInfo(data)
      } else {
        setServerStatus('offline')
      }
    } catch {
      setServerStatus('offline')
    }
  }, [apiBaseUrl])

  useEffect(() => {
    const handleSyncEvent = () => {
      refreshQueue()
      refreshConflicts()
      checkServerHealth()
    }
    window.addEventListener('vetlink:synced', handleSyncEvent)
    window.addEventListener('vetlink:queue-updated', handleSyncEvent)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshQueue()
        refreshConflicts()
        checkServerHealth()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    const initialRefresh = window.setTimeout(() => {
      refreshQueue()
      refreshConflicts()
      checkServerHealth()
    }, 0)

    // Fix 3: Skip polling when tab is hidden, poll every 8 seconds when active
    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      refreshQueue()
      refreshConflicts()
      checkServerHealth()
    }, 8000)

    return () => {
      window.removeEventListener('vetlink:synced', handleSyncEvent)
      window.removeEventListener('vetlink:queue-updated', handleSyncEvent)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearTimeout(initialRefresh)
      clearInterval(interval)
    }
  }, [refreshQueue, refreshConflicts, checkServerHealth])

  const handleManualSync = async () => {
    if (isSyncing || isSyncLocked()) return
    setIsSyncing(true)
    setFeedback(null)
    try {
      const result = await performCloudSync(apiBaseUrl, authToken)
      await refreshQueue()
      await refreshConflicts()
      await checkServerHealth()
      setLastSyncTime(new Date().toLocaleTimeString())
      setFeedback({
        type: result.success ? 'success' : 'error',
        message: result.message || (result.success ? 'Cloud synchronization completed.' : 'Sync completed with errors.'),
      })
      if (result.success) {
        window.dispatchEvent(new CustomEvent('vetlink:synced'))
      }
    } catch (err) {
      console.error('Manual sync failed:', err)
      setFeedback({
        type: 'error',
        message:
          serverStatus === 'offline'
            ? 'Cannot connect to backend server. Make sure "python backend/run.py" is running.'
            : `Sync failed: ${err.message}`,
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handleResolveConflict = async (resolution) => {
    if (!isAdmin || !selectedConflictId) return
    setIsResolving(true)
    setFeedback(null)
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/sync/conflicts/${encodeURIComponent(selectedConflictId)}/resolve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ resolution }),
        },
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Could not resolve conflict on the server.')
      await resolveSyncConflict(selectedConflictId, resolution, result.record)
      await Promise.all([refreshQueue(), refreshConflicts()])
      setFeedback({
        type: 'success',
        message: resolution === 'local'
          ? 'Local version selected and applied across devices.'
          : 'Cloud version selected and applied across devices.',
      })
    } catch (err) {
      setFeedback({ type: 'error', message: `Could not resolve conflict: ${err.message}` })
    } finally {
      setIsResolving(false)
    }
  }

  const selectedConflict = conflicts.find((item) => item.id === selectedConflictId)

  const formatRecord = (record) => JSON.stringify(record || {}, null, 2)

  return (
    <section className="sync-card">
      <div className="sync-controls">
        <h3 className="eyebrow">Cloud Synchronization</h3>

        <div className="controls-row">
          <button
            className="action-btn blue"
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing || isSyncLocked()}
          >
            {isSyncing || isSyncLocked() ? '⏳ SYNCING...' : '▶ MANUAL SYNC'}
          </button>
        </div>

        {feedback && (
          <div
            className={`alert-banner ${feedback.type === 'success' ? 'success' : 'error'}`}
            style={{ marginTop: 12 }}
            role="status"
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              className="modal-close-btn"
              style={{ minHeight: 'auto', minWidth: 'auto', fontSize: '1rem' }}
              onClick={() => setFeedback(null)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="sync-status">
          <div>
            Cloud Server:{' '}
            {serverStatus === 'checking' ? (
              <span className="status-badge gray">Checking...</span>
            ) : serverStatus === 'online' ? (
              <span className="status-badge">Online (MySQL Connected)</span>
            ) : (
              <span className="status-badge orange">Offline (Server on port 8000 unreachable)</span>
            )}
          </div>
          <div style={{ marginTop: 6, fontSize: '0.85rem', color: 'var(--muted)' }}>
            Pending offline items in queue: <strong>{queue.length}</strong>
            {failedQueue.length > 0 && (
              <span style={{ marginLeft: 16, color: '#dc2626' }}>
                Failed items: <strong>{failedQueue.length}</strong>
              </span>
            )}
            {lastSyncTime && <span style={{ marginLeft: 16 }}>Last synced: <strong>{lastSyncTime}</strong></span>}
            {serverInfo?.counts && (
              <span style={{ marginLeft: 16 }}>
                MySQL Cloud totals: <strong>{serverInfo.counts.users} staff</strong>, <strong>{serverInfo.counts.patients} patients</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="sync-content">
        {isAdmin && (
          <div className="sync-tabs" role="tablist" aria-label="Sync details">
            <button
              className={`sync-tab ${activeTab === 'queue' ? 'active' : ''}`}
              id="sync-queue-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'queue'}
              aria-controls="sync-queue-panel"
              onClick={() => setActiveTab('queue')}
            >
              Pending Queue <span className="sync-tab-count">{queue.length}</span>
            </button>
            <button
              className={`sync-tab ${activeTab === 'conflicts' ? 'active' : ''}`}
              id="sync-conflicts-tab"
              type="button"
              role="tab"
              aria-selected={activeTab === 'conflicts'}
              aria-controls="sync-conflicts-panel"
              onClick={() => setActiveTab('conflicts')}
            >
              Conflicts <span className="sync-tab-count">{conflicts.length}</span>
            </button>
          </div>
        )}

        {!isAdmin && conflicts.length > 0 && (
          <div
            className="alert-banner"
            style={{
              marginBottom: 16,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              color: 'var(--text-h)',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 16px',
              borderRadius: 10
            }}
          >
            <span>
              ℹ <strong>{conflicts.length} sync conflict{conflicts.length > 1 ? 's' : ''} detected.</strong> Multi-device data conflicts require administrative review by a Clinic Admin.
            </span>
          </div>
        )}

        {(!isAdmin || activeTab === 'queue') ? (
          <section id="sync-queue-panel" role="tabpanel" aria-labelledby="sync-queue-tab">
        <h4 style={{ marginBottom: 10, color: 'var(--text-h)' }}>Pending Sync Queue</h4>
        <div className="patients-table-wrap">
          <table className="patients-table staff-table">
            <thead>
              <tr>
                <th>QUEUE ID</th>
                <th>ENTITY TYPE</th>
                <th>ENTITY ID</th>
                <th>OPERATION</th>
                <th>STATUS</th>
                <th>CREATED AT</th>
              </tr>
            </thead>
            <tbody>
              {queue.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                    No local changes are waiting to be uploaded.
                  </td>
                </tr>
              ) : (
                queue.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.id.slice(0, 8)}...</code></td>
                    <td><strong>{item.entityType.toUpperCase()}</strong></td>
                    <td>{item.entityId}</td>
                    <td>
                      <span className={`status-badge ${item.operation === 'DELETE' ? 'orange' : ''}`}>
                        {item.operation}
                      </span>
                    </td>
                    <td><span className="sync-pending-tag">Pending</span></td>
                    <td style={{ fontSize: '0.85rem' }}>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : 'Just now'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {failedQueue.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h4 style={{ marginBottom: 8, color: '#dc2626' }}>Failed Sync Items ({failedQueue.length})</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 10 }}>
              These items failed to upload after multiple attempts. You may retry or discard them.
            </p>
            <div className="patients-table-wrap">
              <table className="patients-table staff-table">
                <thead>
                  <tr>
                    <th>ENTITY</th>
                    <th>ID</th>
                    <th>OPERATION</th>
                    <th>ERROR</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {failedQueue.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.entityType.toUpperCase()}</strong></td>
                      <td>{item.entityId}</td>
                      <td><span className="status-badge orange">{item.operation}</span></td>
                      <td style={{ fontSize: '0.82rem', color: '#dc2626' }}>{item.lastError || 'Rejected by server'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="small-outline"
                            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                            onClick={async () => {
                              await retryFailedSyncItem(item.id)
                              await refreshQueue()
                            }}
                          >
                            Retry
                          </button>
                          <button
                            type="button"
                            className="small-outline"
                            style={{ fontSize: '0.75rem', padding: '3px 8px', color: '#dc2626', borderColor: '#fca5a5' }}
                            onClick={async () => {
                              await discardFailedSyncItem(item.id)
                              await refreshQueue()
                            }}
                          >
                            Discard
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </section>
        ) : isAdmin ? (
          <section id="sync-conflicts-panel" className="sync-conflicts-panel" role="tabpanel" aria-labelledby="sync-conflicts-tab">
            {conflicts.length === 0 ? (
              <div className="sync-empty-state">
                <h4>No unresolved conflicts</h4>
                <p>Conflicts appear here when the cloud record changed after this device’s last synced version.</p>
              </div>
            ) : (
              <div className="sync-conflict-layout">
                <div className="sync-conflict-list" aria-label="Unresolved conflicts">
                  {conflicts.map((conflict) => (
                    <button
                      className={`sync-conflict-item ${selectedConflictId === conflict.id ? 'active' : ''}`}
                      key={conflict.id}
                      type="button"
                      onClick={() => setSelectedConflictId(conflict.id)}
                    >
                      <strong>{conflict.entityType} · {conflict.entityId}</strong>
                      <span>{conflict.createdAt ? new Date(conflict.createdAt).toLocaleString() : 'Date unavailable'}</span>
                    </button>
                  ))}
                </div>

                {selectedConflict && (
                  <div className="sync-conflict-detail">
                    <div className="sync-conflict-heading">
                      <div>
                        <h4>Review {selectedConflict.entityType} record</h4>
                        <p>ID: {selectedConflict.entityId}</p>
                      </div>
                      <span className="sync-conflict-badge">Needs review</span>
                    </div>
                    <div className="sync-version-grid">
                      <section className="sync-version-panel">
                        <h5>Local version</h5>
                        <pre>{formatRecord(selectedConflict.localData)}</pre>
                      </section>
                      <section className="sync-version-panel">
                        <h5>Cloud version</h5>
                        <pre>{formatRecord(selectedConflict.cloudData)}</pre>
                      </section>
                    </div>
                    <p className="sync-resolution-note">Choose which version to keep. The selected version will become the next shared version across devices.</p>
                    <div className="sync-resolution-actions">
                      <button className="secondary-btn" type="button" disabled={isResolving} onClick={() => handleResolveConflict('cloud')}>
                        Use cloud version
                      </button>
                      <button className="action-btn blue" type="button" disabled={isResolving} onClick={() => handleResolveConflict('local')}>
                        {selectedConflict.localData?._deleted ? 'Keep local deletion' : 'Use local version'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </section>
  )
}
