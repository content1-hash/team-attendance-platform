import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables.')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const ADMINS = [
  'content@toppagerankers.com',
  'content3@toppagerankers.com',
  'content1@toppagerankers.com',
]

const ADMIN_PASSWORD = 'CHANGE_THIS_ADMIN_PASSWORD'
const BREAK_TYPES = ['first_break', 'second_break', 'third_break', 'extra_break']
const SESSION_KEY = 'team_attendance_session'

function formatDateTime(dateString) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString()
}

function formatDuration(seconds) {
  const total = Number(seconds || 0)
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return [hrs, mins, secs].map((v) => String(v).padStart(2, '0')).join(':')
}

function getMonthBounds() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function Card({ title, children, right }) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState('member')
  const [members, setMembers] = useState([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberPin, setMemberPin] = useState('')
  const [currentMember, setCurrentMember] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [openBreak, setOpenBreak] = useState(null)
  const [monthlySessions, setMonthlySessions] = useState([])
  const [adminEmail, setAdminEmail] = useState(ADMINS[0])
  const [adminPassword, setAdminPassword] = useState('')
  const [adminLoggedIn, setAdminLoggedIn] = useState(false)
  const [adminSummary, setAdminSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const memberLookup = useMemo(
    () => Object.fromEntries(members.map((member) => [member.id, member])),
    [members]
  )

  useEffect(() => {
    loadMembers()
    restoreMemberSession()
  }, [])

  useEffect(() => {
    if (!currentMember) return
    const channel = supabase
      .channel('attendance-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_sessions' },
        async () => {
          await Promise.all([loadMemberState(currentMember.id), loadMemberMonthlySessions(currentMember.id)])
          if (adminLoggedIn) await loadAdminSummary()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'break_entries' },
        async () => {
          await Promise.all([loadMemberState(currentMember.id), loadMemberMonthlySessions(currentMember.id)])
          if (adminLoggedIn) await loadAdminSummary()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentMember, adminLoggedIn])

  async function loadMembers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('members')
      .select('id, full_name, pin, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMembers(data || [])
    setLoading(false)
  }

  function restoreMemberSession() {
    const raw = window.localStorage.getItem(SESSION_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.memberId) {
        setSelectedMemberId(parsed.memberId)
        setCurrentMember({ id: parsed.memberId, full_name: parsed.memberName })
        loadMemberState(parsed.memberId)
        loadMemberMonthlySessions(parsed.memberId)
      }
    } catch {
      window.localStorage.removeItem(SESSION_KEY)
    }
  }

  async function loadMemberState(memberId) {
    const { data: sessionData, error: sessionError } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('member_id', memberId)
      .is('clock_out_at', null)
      .maybeSingle()

    if (sessionError) {
      setError(sessionError.message)
      return
    }

    setActiveSession(sessionData || null)

    if (!sessionData) {
      setOpenBreak(null)
      return
    }

    const { data: breakData, error: breakError } = await supabase
      .from('break_entries')
      .select('*')
      .eq('attendance_session_id', sessionData.id)
      .is('break_end_at', null)
      .maybeSingle()

    if (breakError) {
      setError(breakError.message)
      return
    }

    setOpenBreak(breakData || null)
  }

  async function loadMemberMonthlySessions(memberId) {
    const { start, end } = getMonthBounds()
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('*, break_entries(*)')
      .eq('member_id', memberId)
      .gte('clock_in_at', start)
      .lt('clock_in_at', end)
      .order('clock_in_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    setMonthlySessions(data || [])
  }

  async function loadAdminSummary() {
    const { start, end } = getMonthBounds()
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('id, member_id, clock_in_at, clock_out_at, total_work_seconds, total_break_seconds, break_entries(*)')
      .gte('clock_in_at', start)
      .lt('clock_in_at', end)
      .order('clock_in_at', { ascending: false })

    if (error) {
      setError(error.message)
      return
    }

    const grouped = new Map()
    for (const row of data || []) {
      const existing = grouped.get(row.member_id) || {
        memberId: row.member_id,
        memberName: memberLookup[row.member_id]?.full_name || 'Unknown',
        shifts: 0,
        workSeconds: 0,
        breakSeconds: 0,
      }
      existing.shifts += 1
      existing.workSeconds += Number(row.total_work_seconds || 0)
      existing.breakSeconds += Number(row.total_break_seconds || 0)
      grouped.set(row.member_id, existing)
    }

    setAdminSummary(Array.from(grouped.values()).sort((a, b) => a.memberName.localeCompare(b.memberName)))
  }

  async function handleMemberLogin(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    const member = members.find((item) => String(item.id) === String(selectedMemberId))
    if (!member) {
      setError('Please select a team member.')
      return
    }

    if (member.pin !== memberPin.trim()) {
      setError('Wrong PIN.')
      return
    }

    const current = { id: member.id, full_name: member.full_name }
    setCurrentMember(current)
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ memberId: member.id, memberName: member.full_name })
    )

    await Promise.all([loadMemberState(member.id), loadMemberMonthlySessions(member.id)])
    setMessage(`Welcome, ${member.full_name}.`)
  }

  function logoutMember() {
    setCurrentMember(null)
    setActiveSession(null)
    setOpenBreak(null)
    setMonthlySessions([])
    setMemberPin('')
    setMessage('Logged out successfully.')
    window.localStorage.removeItem(SESSION_KEY)
  }

  async function handleClockIn() {
    if (!currentMember) return
    setBusyAction('clock-in')
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('clock_in_member', {
      p_member_id: currentMember.id,
    })

    setBusyAction('')

    if (error) {
      setError(error.message)
      return
    }

    await Promise.all([loadMemberState(currentMember.id), loadMemberMonthlySessions(currentMember.id)])
    setMessage('Clock-in saved.')
  }

  async function handleStartBreak(type) {
    if (!activeSession) return
    setBusyAction(type)
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('start_break', {
      p_session_id: activeSession.id,
      p_break_type: type,
    })

    setBusyAction('')

    if (error) {
      setError(error.message)
      return
    }

    await Promise.all([loadMemberState(currentMember.id), loadMemberMonthlySessions(currentMember.id)])
    setMessage(`${type.replaceAll('_', ' ')} started.`)
  }

  async function handleEndBreak() {
    if (!activeSession) return
    setBusyAction('end-break')
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('end_break', {
      p_session_id: activeSession.id,
    })

    setBusyAction('')

    if (error) {
      setError(error.message)
      return
    }

    await Promise.all([loadMemberState(currentMember.id), loadMemberMonthlySessions(currentMember.id)])
    setMessage('Break ended.')
  }

  async function handleClockOut() {
    if (!currentMember) return
    setBusyAction('clock-out')
    setError('')
    setMessage('')

    const { error } = await supabase.rpc('clock_out_member', {
      p_member_id: currentMember.id,
    })

    setBusyAction('')

    if (error) {
      setError(error.message)
      return
    }

    await Promise.all([loadMemberState(currentMember.id), loadMemberMonthlySessions(currentMember.id)])
    setMessage('Clock-out saved.')
  }

  async function handleAdminLogin(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!ADMINS.includes(adminEmail.trim().toLowerCase())) {
      setError('This email is not in the admin list.')
      return
    }

    if (adminPassword !== ADMIN_PASSWORD) {
      setError('Wrong admin password. Change it inside src/App.jsx before deployment.')
      return
    }

    setAdminLoggedIn(true)
    await loadAdminSummary()
    setMessage('Admin login successful.')
  }

  const totalWork = monthlySessions.reduce((sum, row) => sum + Number(row.total_work_seconds || 0), 0)
  const totalBreak = monthlySessions.reduce((sum, row) => sum + Number(row.total_break_seconds || 0), 0)

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Free Team Attendance Platform</p>
          <h1>Clock in, breaks, and monthly records in one place</h1>
          <p className="hero-text">
            Built for a small office team. Data stays saved in the database even if the page is refreshed or closed.
          </p>
        </div>
        <div className="mode-switch">
          <button className={mode === 'member' ? 'active' : ''} onClick={() => setMode('member')}>
            Team Member
          </button>
          <button className={mode === 'admin' ? 'active' : ''} onClick={() => setMode('admin')}>
            Admin
          </button>
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      {mode === 'member' ? (
        <div className="grid two-col">
          <Card title="Member login">
            {!currentMember ? (
              <form className="stack" onSubmit={handleMemberLogin}>
                <label>
                  Team member
                  <select value={selectedMemberId} onChange={(e) => setSelectedMemberId(e.target.value)}>
                    <option value="">Select member</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  PIN
                  <input
                    type="password"
                    placeholder="Enter your PIN"
                    value={memberPin}
                    onChange={(e) => setMemberPin(e.target.value)}
                  />
                </label>
                <button type="submit" disabled={loading}>
                  {loading ? 'Loading...' : 'Login'}
                </button>
              </form>
            ) : (
              <div className="stack">
                <div className="pill-row">
                  <span className="pill">Logged in as {currentMember.full_name}</span>
                </div>
                <div className="action-grid">
                  <button onClick={handleClockIn} disabled={!!activeSession || busyAction === 'clock-in'}>
                    {busyAction === 'clock-in' ? 'Saving...' : 'Clock In'}
                  </button>
                  <button
                    className="secondary"
                    onClick={handleClockOut}
                    disabled={!activeSession || !!openBreak || busyAction === 'clock-out'}
                  >
                    {busyAction === 'clock-out' ? 'Saving...' : 'Clock Out'}
                  </button>
                </div>
                <div className="action-grid break-grid">
                  {BREAK_TYPES.map((type) => (
                    <button
                      key={type}
                      className="ghost"
                      onClick={() => handleStartBreak(type)}
                      disabled={!activeSession || !!openBreak || busyAction === type}
                    >
                      {type.replaceAll('_', ' ')}
                    </button>
                  ))}
                </div>
                <button
                  className="warning"
                  onClick={handleEndBreak}
                  disabled={!openBreak || busyAction === 'end-break'}
                >
                  {busyAction === 'end-break' ? 'Saving...' : 'End Current Break'}
                </button>
                <button className="linkish" onClick={logoutMember}>
                  Logout
                </button>
              </div>
            )}
          </Card>

          <Card title="Current status">
            <div className="stats-grid">
              <Stat label="Open shift" value={activeSession ? 'Yes' : 'No'} />
              <Stat label="Break active" value={openBreak ? 'Yes' : 'No'} />
            </div>
            <div className="stack compact">
              <p><strong>Clock in time:</strong> {formatDateTime(activeSession?.clock_in_at)}</p>
              <p><strong>Open break type:</strong> {openBreak ? openBreak.break_type.replaceAll('_', ' ') : '-'}</p>
              <p><strong>Break start:</strong> {formatDateTime(openBreak?.break_start_at)}</p>
            </div>
          </Card>

          <Card
            title="This month"
            right={<span className="month-note">Current month records</span>}
          >
            <div className="stats-grid">
              <Stat label="Total shifts" value={monthlySessions.length} />
              <Stat label="Work time" value={formatDuration(totalWork)} />
              <Stat label="Break time" value={formatDuration(totalBreak)} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Break</th>
                    <th>Work</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySessions.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.clock_in_at).toLocaleDateString()}</td>
                      <td>{new Date(row.clock_in_at).toLocaleTimeString()}</td>
                      <td>{row.clock_out_at ? new Date(row.clock_out_at).toLocaleTimeString() : '-'}</td>
                      <td>{formatDuration(row.total_break_seconds)}</td>
                      <td>{formatDuration(row.total_work_seconds)}</td>
                    </tr>
                  ))}
                  {!monthlySessions.length ? (
                    <tr>
                      <td colSpan="5">No records yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid two-col">
          <Card title="Admin login">
            {!adminLoggedIn ? (
              <form className="stack" onSubmit={handleAdminLogin}>
                <label>
                  Admin email
                  <select value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}>
                    {ADMINS.map((email) => (
                      <option key={email} value={email}>
                        {email}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter admin password"
                  />
                </label>
                <button type="submit">Login as Admin</button>
              </form>
            ) : (
              <div className="stack">
                <p>You are logged in as <strong>{adminEmail}</strong>.</p>
                <button className="secondary" onClick={() => setAdminLoggedIn(false)}>
                  Logout Admin
                </button>
              </div>
            )}
          </Card>

          <Card title="Admin monthly summary">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Shifts</th>
                    <th>Work Time</th>
                    <th>Break Time</th>
                  </tr>
                </thead>
                <tbody>
                  {adminSummary.map((row) => (
                    <tr key={row.memberId}>
                      <td>{row.memberName}</td>
                      <td>{row.shifts}</td>
                      <td>{formatDuration(row.workSeconds)}</td>
                      <td>{formatDuration(row.breakSeconds)}</td>
                    </tr>
                  ))}
                  {!adminSummary.length ? (
                    <tr>
                      <td colSpan="4">No monthly data yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
