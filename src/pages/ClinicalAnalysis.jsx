import { useState, useEffect, useCallback } from 'react'
import { initDatabase } from '../db/database'

export default function ClinicalAnalysis({ onNewPatient, onViewPatients, currentUser }) {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({
    totalPatients: 0,
    todayCases: 0,
    pendingReviews: 0,
    topCondition: 'None',
    speciesDistribution: { canine: 0, feline: 0, avian: 0, rabbit: 0, other: 0 },
    conditionBreakdown: [],
    weeklyActivity: [],
    recentCases: [],
  })

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const db = await initDatabase()

      const [patients, consultations, screenings] = await Promise.all([
        db.getAll('patients').catch(() => []),
        db.getAll('consultations').catch(() => []),
        db.getAll('screeningResults').catch(() => []),
      ])

      const now = new Date()
      const todayStr = now.toISOString().split('T')[0] // YYYY-MM-DD

      // 1. Total Patients
      const totalPatients = patients.length

      // 2. Cases Today (consultations or patients updated/created today)
      let todayCases = 0
      consultations.forEach((c) => {
        const d = (c.updatedAt || c.createdAt || '').split('T')[0]
        if (d === todayStr) todayCases++
      })
      if (todayCases === 0) {
        patients.forEach((p) => {
          const d = (p.lastVisit || p.updatedAt || '').split('T')[0]
          if (d === todayStr) todayCases++
        })
      }

      // 3. Pending Reviews
      const pendingReviews = screenings.filter(
        (s) => !s.reviewStatus || s.reviewStatus.toLowerCase() === 'pending'
      ).length

      // 4. Species Distribution
      const speciesDistribution = { canine: 0, feline: 0, avian: 0, rabbit: 0, other: 0 }
      patients.forEach((p) => {
        const sp = String(p.species || '').toLowerCase()
        if (sp.includes('canine') || sp.includes('dog')) speciesDistribution.canine++
        else if (sp.includes('feline') || sp.includes('cat')) speciesDistribution.feline++
        else if (sp.includes('avian') || sp.includes('bird')) speciesDistribution.avian++
        else if (sp.includes('rabbit')) speciesDistribution.rabbit++
        else speciesDistribution.other++
      })

      // 5. Condition / Diagnosis Breakdown
      const conditionCounts = {}
      screenings.forEach((s) => {
        const label = s.aiDisplayLabel || s.aiLabel || s.conditionId
        if (label && !['healthy', 'normal'].includes(label.toLowerCase())) {
          conditionCounts[label] = (conditionCounts[label] || 0) + 1
        }
      })
      consultations.forEach((c) => {
        if (c.diagnosis && !conditionCounts[c.diagnosis]) {
          conditionCounts[c.diagnosis] = (conditionCounts[c.diagnosis] || 0) + 1
        }
      })

      const conditionBreakdown = Object.entries(conditionCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      const topCondition = conditionBreakdown.length > 0 ? conditionBreakdown[0].name : 'None Logged'

      // 6. Last 7 Days Activity Trend
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const weeklyActivity = []
      for (let i = 6; i >= 0; i--) {
        const targetDate = new Date(now)
        targetDate.setDate(targetDate.getDate() - i)
        const dateKey = targetDate.toISOString().split('T')[0]
        const dayLabel = days[targetDate.getDay()]

        // Count unique patient admissions per calendar day (avoids double counting consultations and edits)
        const dayPatientSet = new Set()
        patients.forEach((p) => {
          const created = (p.createdAt || p.lastVisit || '').slice(0, 10)
          if (created === dateKey) {
            dayPatientSet.add(p.id)
          }
        })
        consultations.forEach((c) => {
          const created = (c.createdAt || '').slice(0, 10)
          if (created === dateKey && c.patientId) {
            dayPatientSet.add(c.patientId)
          }
        })
        const count = dayPatientSet.size

        weeklyActivity.push({
          day: dayLabel,
          date: dateKey,
          count,
        })
      }

      // Compute relative bar heights (ensure minimum 12% for visibility if 0, max 100%)
      const maxCount = Math.max(...weeklyActivity.map((w) => w.count), 1)
      const activityWithHeights = weeklyActivity.map((w) => ({
        ...w,
        heightPercent: w.count === 0 ? 12 : Math.max(22, Math.round((w.count / maxCount) * 100)),
      }))

      // 7. Recent Cases Feed (up to 4 latest consultations/patients)
      const recentCases = [...patients]
        .sort((a, b) => new Date(b.updatedAt || b.lastVisit || 0) - new Date(a.updatedAt || a.lastVisit || 0))
        .slice(0, 4)

      setMetrics({
        totalPatients,
        todayCases,
        pendingReviews,
        topCondition,
        speciesDistribution,
        conditionBreakdown,
        weeklyActivity: activityWithHeights,
        recentCases,
      })
    } catch (err) {
      console.error('Failed to load live clinical dashboard metrics:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalSpeciesCount =
    metrics.speciesDistribution.canine +
    metrics.speciesDistribution.feline +
    metrics.speciesDistribution.avian +
    metrics.speciesDistribution.rabbit +
    metrics.speciesDistribution.other || 1

  return (
    <div className="clinical-dashboard-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner / Welcome Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.45rem', fontWeight: '800', color: 'var(--text-h)' }}>
            Clinical Intelligence & Analytics
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.88rem', color: 'var(--muted)' }}>
            Live clinical database feed • Updated automatically across online & offline sessions
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {onNewPatient && (
            <button
              type="button"
              onClick={onNewPatient}
              style={{
                background: 'var(--brand-primary, #1e88e5)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                padding: '9px 16px',
                fontWeight: '600',
                fontSize: '0.86rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Patient Intake
            </button>
          )}
          <button
            type="button"
            onClick={loadData}
            title="Refresh metrics"
            style={{
              background: 'var(--surface, #fff)',
              color: 'var(--text-body)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '9px 12px',
              fontWeight: '600',
              fontSize: '0.86rem',
              cursor: 'pointer',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* 4 Core Dynamic Metric Cards */}
      <div className="metric-grid">
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p className="metric-value" style={{ color: 'var(--brand-primary, #1e88e5)' }}>
              {loading ? '...' : metrics.todayCases}
            </p>
            <span style={{ fontWeight: '600' }}>Cases Today</span>
          </div>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
            {metrics.todayCases > 0 ? 'Active clinical consultations' : 'No new visits today yet'}
          </span>
        </div>

        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p className="metric-value" style={{ color: metrics.pendingReviews > 0 ? '#e65100' : 'var(--text-h)' }}>
              {loading ? '...' : metrics.pendingReviews}
            </p>
            <span style={{ fontWeight: '600' }}>Pending Doctor Reviews</span>
          </div>
          <span style={{ fontSize: '0.76rem', color: metrics.pendingReviews > 0 ? '#f57c00' : 'var(--muted)' }}>
            {metrics.pendingReviews > 0 ? 'Requires clinician confirmation' : 'All cases reviewed'}
          </span>
        </div>

        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p className="metric-value" style={{ color: '#2e7d32' }}>
              {loading ? '...' : metrics.totalPatients}
            </p>
            <span style={{ fontWeight: '600' }}>Total Patients</span>
          </div>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
            Registered in local IndexedDB
          </span>
        </div>

        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <p
              className="metric-value"
              style={{
                fontSize: metrics.topCondition.length > 12 ? '1.25rem' : '1.75rem',
                wordBreak: 'break-word',
                color: 'var(--accent, #5ca797)',
              }}
            >
              {loading ? '...' : metrics.topCondition}
            </p>
            <span style={{ fontWeight: '600' }}>Top Diagnosis</span>
          </div>
          <span style={{ fontSize: '0.76rem', color: 'var(--muted)' }}>
            Most prevalent condition
          </span>
        </div>
      </div>

      {/* Middle Row: Weekly Trend Chart & Species Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Weekly Case Analysis Chart */}
        <section className="chart-card">
          <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>Weekly Intake Volume</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Cases recorded over the last 7 calendar days
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', padding: '3px 8px', borderRadius: '6px', background: 'var(--brand-surface, #e8f5e9)', color: '#2e7d32' }}>
              Live IndexedDB
            </span>
          </div>

          <div className="chart-grid" style={{ alignItems: 'flex-end', minHeight: '180px', paddingBottom: '10px' }}>
            {metrics.weeklyActivity.map((item, index) => (
              <div
                key={index}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: item.count > 0 ? 'var(--text-h)' : 'var(--muted)' }}>
                  {item.count}
                </span>
                <div
                  className="chart-bar"
                  style={{
                    width: '70%',
                    height: `${item.heightPercent}%`,
                    minHeight: '8px',
                    transition: 'height 0.4s ease-in-out',
                    opacity: item.count > 0 ? 1 : 0.4,
                  }}
                  title={`${item.date}: ${item.count} case(s)`}
                />
                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--muted)' }}>
                  {item.day}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Species Distribution Card */}
        <section className="chart-card">
          <div className="chart-header">
            <h3 style={{ margin: 0 }}>Species Demographics</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Breakdown of registered animal patients
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '14px' }}>
            {[
              { label: 'Canine (Dogs)', count: metrics.speciesDistribution.canine, icon: '🐕', color: '#1e88e5' },
              { label: 'Feline (Cats)', count: metrics.speciesDistribution.feline, icon: '🐈', color: '#ab47bc' },
              { label: 'Avian (Birds)', count: metrics.speciesDistribution.avian, icon: '🦜', color: '#26a69a' },
              { label: 'Rabbit / Exotic', count: metrics.speciesDistribution.rabbit, icon: '🐇', color: '#ffa726' },
            ].map((sp, idx) => {
              const pct = Math.round((sp.count / totalSpeciesCount) * 100)
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                    <span style={{ fontWeight: '600' }}>
                      {sp.icon} {sp.label}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      {sp.count} ({metrics.totalPatients > 0 ? pct : 0}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--border, #eee)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${metrics.totalPatients > 0 ? pct : 0}%`,
                        height: '100%',
                        background: sp.color,
                        borderRadius: '4px',
                        transition: 'width 0.4s ease-in-out',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      {/* Bottom Row: Top Dermatological Conditions & Recent Patients */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Most Frequent Conditions */}
        <section className="chart-card">
          <div className="chart-header">
            <h3 style={{ margin: 0 }}>Prevalent Diagnoses</h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
              Top conditions detected by CDSS / validated by vet
            </p>
          </div>

          {metrics.conditionBreakdown.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.86rem' }}>
              No dermatological diagnoses recorded yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              {metrics.conditionBreakdown.map((item, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'var(--brand-surface, rgba(47, 124, 255, 0.05))',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: 'var(--accent, #5ca797)',
                        color: '#fff',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {index + 1}
                    </span>
                    <span style={{ fontWeight: '600', fontSize: '0.88rem' }}>{item.name}</span>
                  </div>
                  <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--muted)' }}>
                    {item.count} {item.count === 1 ? 'case' : 'cases'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Patients Quick Table */}
        <section className="chart-card">
          <div className="chart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0 }}>Recent Patient Admissions</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                Latest active medical files
              </p>
            </div>
            {onViewPatients && (
              <button
                type="button"
                onClick={onViewPatients}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--brand-primary, #1e88e5)',
                  fontSize: '0.82rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                View All →
              </button>
            )}
          </div>

          {metrics.recentCases.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.86rem' }}>
              No patients admitted yet. Click "New Patient Intake" to add your first patient.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {metrics.recentCases.map((patient) => (
                <div
                  key={patient.id}
                  onClick={onViewPatients}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    cursor: onViewPatients ? 'pointer' : 'default',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.25rem' }}>
                      {patient.species?.toLowerCase().includes('dog') || patient.species?.toLowerCase().includes('canine')
                        ? '🐕'
                        : patient.species?.toLowerCase().includes('cat') || patient.species?.toLowerCase().includes('feline')
                        ? '🐈'
                        : patient.species?.toLowerCase().includes('bird') || patient.species?.toLowerCase().includes('avian')
                        ? '🦜'
                        : '🐾'}
                    </span>
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-h)' }}>
                        {patient.name}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                        {patient.breed || patient.species} • Concern: {patient.areaOfConcern || 'General Lesion'}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: '700',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: patient.status === 'Active' ? 'rgba(46, 125, 50, 0.12)' : 'var(--border)',
                      color: patient.status === 'Active' ? '#2e7d32' : 'var(--muted)',
                    }}
                  >
                    {patient.status || 'Active'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}