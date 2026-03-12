import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'

const ADMIN_EMAILS = [
  'content@toppagerankers.com',
  'content3@toppagerankers.com',
  'content1@toppagerankers.com',
]

const ADMIN_PASSWORD = 'Umer@1122###'
const MEMBER_SESSION_KEY = 'attendance_member_session_v1'
const ADMIN_SESSION_KEY = 'attendance_admin_session_v1'
const BREAK_TYPES = ['first break', 'second break', 'third break', 'extra break']

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function minutesBetween(start, end) {
  if (!start || !end) return 0
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000))
}

function monthStartIso() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

export default function App() {
  const [mode, setMode] = useState('member')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)
  const [members, setMembers] = useState([])
  const [memberName, setMemberName] = useState('')
  const [memberPin, setMemberPin] = useState('')
  const [memberSession, setMemberSession] = useState(() => {
    const raw = localStorage.getItem(MEMBER_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  })
  const [currentShift, setCurrentShift] = useState(null)
  const [breaks, setBreaks] = useState([])
  const [breakType, setBreakType] = useState(BREAK_TYPES[0])
  const [adminEmail, setAdminEmail] = useState(ADMIN_EMAILS[0])
  const [adminPassword, setAdminPassword] = useState('')
  const [adminSession, setAdminSession] = useState(() => {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  })
  const [adminRows, setAdminRows] = useState([])

  useEffect(() => {
    localStorage.setItem(MEMBER_SESSION_KEY, JSON.stringify(memberSession))
  }, [memberSession])

  useEffect(() => {
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSession))
  }, [adminSession])

  useEffect(() => {
    loadMembers()
  }, [])

  useEffect(() => {
    if (memberSession?.memberId) {
      loadMemberState(memberSession.memberId)
    } else {
      setCurrentShift(null)
      setBreaks([])
    }
  }, [memberSession])

  useEffect(() => {
    if (adminSession?.email) {
      loadAdminRows()
    }
  }, [adminSession])

  const openBreak = useMemo(
    () => breaks.find((item) => !item.end_time),
    [breaks],
  )

  async function loadMembers() {
    const { data, error } = await supabase
      .from('members')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setMembers(data || [])
  }

  async function loadMemberState(memberId) {
    const { data: shift, error: shiftError } = await supabase
      .from('attendance_sessions')
      .select('*')
      .eq('member_id', memberId)
      .is('clock_out_time', null)
      .order('clock_in_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (shiftError) {
      setMessage({ type: 'error', text: shiftError.message })
      return
    }

    setCurrentShift(shift || null)

    if (!shift) {
      setBreaks([])
      return
    }

    const { data: breakData, error: breakError } = await supabase
      .from('session_breaks')
      .select('*')
      .eq('session_id', shift.id)
      .order('start_time', { ascending: true })

    if (breakError) {
      setMessage({ type: 'error', text: breakError.message })
      return
    }

    setBreaks(breakData || [])
  }

  async function handleMemberLogin(event) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase
      .from('members')
      .select('id, name, pin')
      .eq('name', memberName)
      .eq('is_active', true)
      .maybeSingle()

    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    if (!data || data.pin !== memberPin) {
      setMessage({ type: 'error', text: 'Invalid member name or PIN.' })
      return
    }

    setMemberSession({ memberId: data.id, memberName: data.name })
    setMemberPin('')
    setMessage({ type: 'success', text: `Welcome, ${data.name}.` })
  }

  async function handleClockIn() {
    if (!memberSession?.memberId) return
    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase
      .from('attendance_sessions')
      .insert([{ member_id: memberSession.memberId }])
      .select('*')
      .single()

    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    setCurrentShift(data)
    setBreaks([])
    setMessage({ type: 'success', text: 'Clock-in saved.' })
  }

  async function handleStartBreak() {
    if (!currentShift || openBreak) return
    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase
      .from('session_breaks')
      .insert([{ session_id: currentShift.id, break_type: breakType }])
      .select('*')
      .single()

    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    setBreaks((prev) => [...prev, data])
    setMessage({ type: 'success', text: `${breakType} started.` })
  }

  async function handleEndBreak() {
    if (!openBreak) return
    setLoading(true)
    setMessage(null)

    const { data, error } = await supabase
      .from('session_breaks')
      .update({ end_time: new Date().toISOString() })
      .eq('id', openBreak.id)
      .select('*')
      .single()

    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    setBreaks((prev) => prev.map((item) => (item.id === data.id ? data : item)))
    setMessage({ type: 'success', text: 'Break ended.' })
  }

  async function handleClockOut() {
    if (!currentShift) return
    if (openBreak) {
      setMessage({ type: 'error', text: 'End the current break before clocking out.' })
      return
    }

    setLoading(true)
    setMessage(null)

    const { error } = await supabase
      .from('attendance_sessions')
      .update({ clock_out_time: new Date().toISOString() })
      .eq('id', currentShift.id)

    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }

    setCurrentShift(null)
    setBreaks([])
    setMessage({ type: 'success', text: 'Clock-out saved.' })
  }

  function handleMemberLogout() {
    setMemberSession(null)
    setCurrentShift(null)
    setBreaks([])
    setMessage(null)
  }

  function handleAdminLogin(event) {
    event.preventDefault()
    if (!ADMIN_EMAILS.includes(adminEmail) || adminPassword !== ADMIN_PASSWORD) {
      setMessage({ type: 'error', text: 'Invalid admin credentials.' })
      return
    }
    setAdminSession({ email: adminEmail })
    setAdminPassword('')
    setMessage({ type: 'success', text: `Admin access granted for ${adminEmail}.` })
  }

  function handleAdminLogout() {
    setAdminSession(null)
    setAdminRows([])
  }

  async function loadAdminRows() {
    const { data, error } = await supabase
      .from('admin_monthly_report')
      .select('*')
      .gte('clock_in_time', monthStartIso())
      .order('clock_in_time', { ascending: false })

    if (error) {
      setMessage({ type: 'error', text: error.message })
      return
    }
    setAdminRows(data || [])
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="title">Team Attendance Platform</h1>
          <p className="subtitle">Clock in, manage breaks, and save monthly records without losing data on refresh.</p>
        </div>
        <div className="row">
          <button className={mode === 'member' ? 'primary' : 'secondary'} onClick={() => setMode('member')}>Member</button>
          <button className={mode === 'admin' ? 'primary' : 'secondary'} onClick={() => setMode('admin')}>Admin</button>
        </div>
      </div>

      {message && <div className={`alert ${message.type}`}>{message.text}</div>}

      {mode === 'member' ? (
        <div className="grid grid-2">
          <div className="card">
            <h2 className="section-title">Member access</h2>
            {!memberSession ? (
              <form onSubmit={handleMemberLogin} className="grid">
                <div>
                  <label className="small">Name</label>
                  <select value={memberName} onChange={(e) => setMemberName(e.target.value)} required>
                    <option value="">Select your name</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.name}>{member.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="small">PIN</label>
                  <input type="password" inputMode="numeric" value={memberPin} onChange={(e) => setMemberPin(e.target.value)} placeholder="Enter your PIN" required />
                </div>
                <button className="primary" disabled={loading}>Log in</button>
              </form>
            ) : (
              <div className="grid">
                <div>
                  <span className="badge">Logged in as {memberSession.memberName}</span>
                </div>
                <div className="row">
                  <button className="primary" disabled={loading || !!currentShift} onClick={handleClockIn}>Clock in</button>
                  <button className="danger" disabled={loading || !currentShift} onClick={handleClockOut}>Clock out</button>
                  <button className="secondary" onClick={handleMemberLogout}>Log out</button>
                </div>
                <div className="spacer"></div>
                <div>
                  <h3 className="section-title">Break controls</h3>
                  <div className="row">
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <select value={breakType} onChange={(e) => setBreakType(e.target.value)} disabled={!currentShift || !!openBreak}>
                        {BREAK_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <button className="primary" disabled={!currentShift || !!openBreak || loading} onClick={handleStartBreak}>Start break</button>
                    <button className="secondary" disabled={!openBreak || loading} onClick={handleEndBreak}>End break</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="section-title">Current shift</h2>
            {!currentShift ? (
              <p className="muted">No open shift. Use Clock in to start work.</p>
            ) : (
              <div className="grid">
                <p><strong>Clock in:</strong> {formatDateTime(currentShift.clock_in_time)}</p>
                <p><strong>Open break:</strong> {openBreak ? `${openBreak.break_type} started at ${formatDateTime(openBreak.start_time)}` : 'No open break'}</p>
                <div>
                  <h3 className="section-title">Break history</h3>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Minutes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breaks.length === 0 ? (
                          <tr><td colSpan="4" className="muted">No breaks recorded yet.</td></tr>
                        ) : breaks.map((item) => (
                          <tr key={item.id}>
                            <td>{item.break_type}</td>
                            <td>{formatDateTime(item.start_time)}</td>
                            <td>{formatDateTime(item.end_time)}</td>
                            <td>{item.duration_minutes ?? minutesBetween(item.start_time, item.end_time)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <h2 className="section-title">Admin panel</h2>
          {!adminSession ? (
            <form onSubmit={handleAdminLogin} className="grid" style={{ maxWidth: 420 }}>
              <div>
                <label className="small">Admin email</label>
                <select value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}>
                  {ADMIN_EMAILS.map((email) => (
                    <option key={email} value={email}>{email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="small">Admin password</label>
                <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Enter admin password" required />
              </div>
              <button className="primary">Log in</button>
            </form>
          ) : (
            <div className="grid">
              <div className="row">
                <span className="badge">Admin: {adminSession.email}</span>
                <button className="secondary" onClick={loadAdminRows}>Refresh</button>
                <button className="secondary" onClick={handleAdminLogout}>Log out</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Clock in</th>
                      <th>Clock out</th>
                      <th>Total breaks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminRows.length === 0 ? (
                      <tr><td colSpan="4" className="muted">No records found for this month.</td></tr>
                    ) : adminRows.map((row) => (
                      <tr key={row.session_id}>
                        <td>{row.member_name}</td>
                        <td>{formatDateTime(row.clock_in_time)}</td>
                        <td>{formatDateTime(row.clock_out_time)}</td>
                        <td>{row.total_break_minutes ?? 0} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
