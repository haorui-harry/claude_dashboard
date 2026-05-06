import { useState, useEffect, useRef } from 'react'

const KIND_STYLE = {
  USER:      { bg: '#dbeafe', color: '#1d4ed8', label: 'User' },
  THINK:     { bg: '#ede9fe', color: '#7c3aed', label: 'Think' },
  SAY:       { bg: '#d1fae5', color: '#065f46', label: 'Say' },
  BASH:      { bg: '#fef3c7', color: '#b45309', label: 'Bash' },
  READ:      { bg: '#e0f2fe', color: '#0369a1', label: 'Read' },
  WRITE:     { bg: '#dcfce7', color: '#15803d', label: 'Write' },
  EDIT:      { bg: '#f3e8ff', color: '#7e22ce', label: 'Edit' },
  WEBFETCH:  { bg: '#fce7f3', color: '#be185d', label: 'WebFetch' },
  WEBSEARCH: { bg: '#cffafe', color: '#0e7490', label: 'WebSearch' },
  RESULT:    { bg: '#fff7ed', color: '#c2410c', label: 'Result' },
  AGENT:     { bg: '#ccfbf1', color: '#0f766e', label: 'Agent' },
  TASKCREATE:{ bg: '#fef9c3', color: '#a16207', label: 'TaskCreate' },
  TASKUPDATE:{ bg: '#e0e7ff', color: '#4338ca', label: 'TaskUpdate' },
}

function getStyle(kind) {
  return KIND_STYLE[kind] || { bg: '#f1f5f9', color: '#475569', label: kind }
}

function fmtDur(ms) {
  if (ms < 0) return '—'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${Math.floor(s % 60)}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// ── SVG donut chart ──────────────────────────────────────────────
function DonutChart({ tc }) {
  const SKIP = new Set(['USER', 'THINK', 'SAY', 'RESULT'])
  const data = Object.entries(tc)
    .filter(([k]) => !SKIP.has(k))
    .map(([k, v]) => ({ label: k, value: v, color: getStyle(k).color }))
    .filter(d => d.value > 0)

  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return <div style={{ color: '#94a3b8', fontSize: '12px' }}>No tools</div>

  const cx = 75, cy = 75, r = 55, ir = 35
  let angle = -Math.PI / 2
  const paths = data.map((d, i) => {
    const sweep = (d.value / total) * 2 * Math.PI
    const end = angle + sweep
    const large = sweep > Math.PI ? 1 : 0
    const [c0x, c0y] = [Math.cos(angle), Math.sin(angle)]
    const [c1x, c1y] = [Math.cos(end), Math.sin(end)]
    const path = [
      `M ${cx + r * c0x} ${cy + r * c0y}`,
      `A ${r} ${r} 0 ${large} 1 ${cx + r * c1x} ${cy + r * c1y}`,
      `L ${cx + ir * c1x} ${cy + ir * c1y}`,
      `A ${ir} ${ir} 0 ${large} 0 ${cx + ir * c0x} ${cy + ir * c0y}`,
      'Z',
    ].join(' ')
    angle = end
    return <path key={i} d={path} fill={d.color} opacity={0.9} />
  })

  return (
    <div>
      <svg width="150" height="150" viewBox="0 0 150 150" style={{ display: 'block', margin: '0 auto' }}>
        {paths}
      </svg>
      <div style={{ marginTop: '8px' }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', padding: '2px 0' }}>
            <span style={{ color: d.color, marginRight: '5px', fontSize: '13px' }}>●</span>
            <span style={{ fontSize: '11px', color: '#475569', flex: 1 }}>{d.label}</span>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── turn analysis divider ────────────────────────────────────────
function TurnDivider({ turn, analysis, isExpanded, onToggle }) {
  if (!analysis) return null
  const { core_action, focus, intention, time_cost_ms, tool_summary, errors } = analysis
  return (
    <div style={{ padding: '8px 16px', background: '#f0f9ff', borderBottom: '1px solid #e0f2fe', borderLeft: '3px solid #0ea5e9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={onToggle}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>
          Turn {turn}
        </span>
        <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {core_action || '...'}
        </span>
        {time_cost_ms > 0 && (
          <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{(time_cost_ms / 1000).toFixed(1)}s</span>
        )}
        {errors && errors.length > 0 && (
          <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700, background: '#fef2f2', padding: '1px 6px', borderRadius: '4px', flexShrink: 0 }}>
            {errors.length} err{errors.length > 1 ? 's' : ''}
          </span>
        )}
        <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
      </div>
      {isExpanded && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#334155', lineHeight: '1.6' }}>
          {focus && <div><strong style={{ color: '#0f172a' }}>重点：</strong>{focus}</div>}
          {intention && <div><strong style={{ color: '#0f172a' }}>意图：</strong>{intention}</div>}
          {tool_summary && tool_summary.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong style={{ color: '#0f172a' }}>工具：</strong>
              {tool_summary.map((t, i) => (
                <span key={i} style={{ display: 'inline-block', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', marginRight: '4px', marginBottom: '2px', fontSize: '11px' }}>
                  {t.name}{t.target ? `: ${t.target}` : t.note ? `: ${t.note}` : ''}
                </span>
              ))}
            </div>
          )}
          {errors && errors.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              {errors.map((err, i) => (
                <div key={i} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '6px 8px', marginBottom: '4px', fontSize: '11px', color: '#7f1d1d' }}>
                  <strong>Error ({err.tool || '?'}):</strong> {(err.error_text || '').substring(0, 200)}
                  {err.root_cause && <div style={{ color: '#991b1b', marginTop: '2px' }}>原因：{err.root_cause}</div>}
                  {err.suggestion && <div style={{ color: '#7f1d1d', marginTop: '2px' }}>建议：{err.suggestion}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── summary panel ────────────────────────────────────────────────
function SummaryPanel({ summary, agentInsight, isExpanded, onToggle, elapsedSec }) {
  if (!summary) return null
  const { phases, test_frequency, development_process, parallel_degree, redundancy, tool_stats, deliverable_assessment, issues } = summary
  return (
    <div style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={onToggle}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>Agent 全局总结</span>
        {elapsedSec > 0 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>(分析耗时 {elapsedSec}s)</span>}
        <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>{isExpanded ? '▲ 收起' : '▼ 展开'}</span>
      </div>
      {isExpanded && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#334155', lineHeight: '1.7' }}>
          {phases && phases.length > 0 && (
            <div><strong style={{ color: '#0f172a' }}>阶段划分：</strong>{phases.join(' → ')}</div>
          )}
          <div><strong style={{ color: '#0f172a' }}>自测频率：</strong>
            <span style={{ color: test_frequency === '高' ? '#16a34a' : test_frequency === '低' ? '#ef4444' : '#ca8a04', fontWeight: 700 }}>{test_frequency}</span>
            {parallel_degree && <span style={{ marginLeft: '12px' }}><strong style={{ color: '#0f172a' }}>并行利用：</strong><span style={{ fontWeight: 700 }}>{parallel_degree}</span></span>}
            {redundancy && <span style={{ marginLeft: '12px' }}><strong style={{ color: '#0f172a' }}>冗余度：</strong><span style={{ fontWeight: 700 }}>{redundancy}</span></span>}
          </div>
          {development_process && <div><strong style={{ color: '#0f172a' }}>开发过程：</strong>{development_process}</div>}
          {tool_stats && Object.keys(tool_stats).length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong style={{ color: '#0f172a' }}>Tool 统计：</strong>
              {Object.entries(tool_stats).map(([k, v]) => (
                <span key={k} style={{ display: 'inline-block', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', marginRight: '4px', marginBottom: '2px', fontSize: '11px' }}>
                  {k}: {v}
                </span>
              ))}
            </div>
          )}
          {deliverable_assessment && (
            <div style={{
              marginTop: '6px', padding: '8px', borderRadius: '6px',
              background: deliverable_assessment.meets_requirements ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${deliverable_assessment.meets_requirements ? '#bbf7d0' : '#fecaca'}`
            }}>
              <div>
                <strong>产物评价：</strong>
                {deliverable_assessment.completeness || ''} {deliverable_assessment.meets_requirements ? '✅ 符合需求' : '❌ 未完全满足'}
              </div>
              {deliverable_assessment.notes && <div style={{ marginTop: '2px', color: '#475569' }}>{deliverable_assessment.notes}</div>}
            </div>
          )}
          {issues && issues.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <strong style={{ color: '#0f172a' }}>问题与改进：</strong>
              {issues.map((issue, i) => (
                <div key={i} style={{ marginTop: '4px', padding: '6px 8px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '4px', fontSize: '11px' }}>
                  <span style={{ color: issue.severity === '高' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>[{issue.severity}]</span> {issue.description}
                </div>
              ))}
            </div>
          )}

          {/* Agent Insight */}
          {agentInsight && (
            <div style={{ marginTop: '12px', padding: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginBottom: '6px' }}>🧠 Agent 行为洞察</div>
              {agentInsight.unique_patterns && agentInsight.unique_patterns.length > 0 && (
                <div style={{ marginBottom: '6px' }}>
                  <strong style={{ color: '#1e3a8a' }}>独特处理方式：</strong>
                  {agentInsight.unique_patterns.map((item, i) => (
                    <div key={i} style={{ marginLeft: '8px', marginTop: '2px', fontSize: '11px', color: '#334155' }}>• {item}</div>
                  ))}
                </div>
              )}
              {agentInsight.hidden_habits && agentInsight.hidden_habits.length > 0 && (
                <div style={{ marginBottom: '6px' }}>
                  <strong style={{ color: '#1e3a8a' }}>隐性策略：</strong>
                  {agentInsight.hidden_habits.map((item, i) => (
                    <div key={i} style={{ marginLeft: '8px', marginTop: '2px', fontSize: '11px', color: '#334155' }}>• {item}</div>
                  ))}
                </div>
              )}
              {agentInsight.success_conditions && (
                <div style={{ marginBottom: '4px' }}>
                  <strong style={{ color: '#1e3a8a' }}>成功/失败条件：</strong>
                  <span style={{ fontSize: '11px', color: '#334155' }}>{agentInsight.success_conditions}</span>
                </div>
              )}
              {agentInsight.recovery_strategy && (
                <div style={{ marginBottom: '4px' }}>
                  <strong style={{ color: '#1e3a8a' }}>恢复策略：</strong>
                  <span style={{ fontSize: '11px', color: '#334155' }}>{agentInsight.recovery_strategy}</span>
                </div>
              )}
              {agentInsight.actionable_takeaways && agentInsight.actionable_takeaways.length > 0 && (
                <div>
                  <strong style={{ color: '#1e3a8a' }}>可迁移经验：</strong>
                  {agentInsight.actionable_takeaways.map((item, i) => (
                    <div key={i} style={{ marginLeft: '8px', marginTop: '2px', fontSize: '11px', color: '#334155' }}>• {item}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── single event row ─────────────────────────────────────────────
const COLLAPSE_LEN = 300

function EventRow({ event, idx, isExpanded, onToggle }) {
  const { kind, ts, content = '' } = event
  const st = getStyle(kind)
  const tsStr = ts ? ts.substring(11, 19) : ''
  const isResult = kind === 'RESULT'
  const isCode = kind === 'BASH' || kind === 'RESULT'
  const isThink = kind === 'THINK'
  const isTool = kind === 'BASH' || kind === 'READ' || kind === 'WRITE' || kind === 'EDIT' || kind === 'WEBFETCH' || kind === 'WEBSEARCH' || kind === 'AGENT' || kind === 'TASKCREATE' || kind === 'TASKUPDATE'
  const isLong = content.length > COLLAPSE_LEN
  const shown = isLong && !isExpanded ? content.substring(0, COLLAPSE_LEN) : content

  const preStyle = {
    fontFamily: isCode ? "'Consolas','Monaco','Courier New',monospace" : 'inherit',
    fontSize: '13px',
    lineHeight: '1.5',
    color: isResult ? '#c2410c' : isThink ? '#7c3aed' : '#1e293b',
    fontStyle: isThink ? 'italic' : 'normal',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
    background: isResult ? '#fff7ed' : isCode ? '#fafafa' : 'transparent',
    border: isResult ? '1px solid #fed7aa' : isCode ? '1px solid #f1f5f9' : 'none',
    borderRadius: '6px',
    padding: isCode || isResult ? '8px 10px' : 0,
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start',
      padding: '10px 16px', borderBottom: '1px solid #f8fafc',
      marginLeft: isResult ? '24px' : '0',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10px', marginRight: '12px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: st.color, border: `2px solid ${st.color}44`, marginTop: '2px', flexShrink: 0 }} />
        <div style={{ width: '2px', background: '#f1f5f9', flex: 1, marginTop: '2px' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: '14px' }}>
        <div style={{ marginBottom: '5px', display: 'flex', alignItems: 'center' }}>
          <span style={{ background: st.bg, color: st.color, padding: '2px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700, letterSpacing: '.02em' }}>
            {st.label}
          </span>
          {isTool && (
            <span style={{ marginLeft: '6px', fontSize: '11px', color: '#f59e0b', fontWeight: 700, background: '#fffbeb', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
              🔧 tool
            </span>
          )}
          <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '8px' }}>{tsStr}</span>
        </div>
        <pre style={preStyle}>{shown}</pre>
        {isLong && (
          <button onClick={() => onToggle(idx)} style={{
            background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px',
            padding: '3px 10px', fontSize: '11px', color: '#64748b', cursor: 'pointer',
            marginTop: '4px', display: 'block', width: '100%', textAlign: 'left',
          }}>
            {isExpanded ? '▲ Show less' : `▼ Show more (${content.length} chars)`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── section title ────────────────────────────────────────────────
function SecTitle({ children }) {
  return (
    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', padding: '12px 0 6px', borderBottom: '1px solid #e2e8f0', marginBottom: '6px' }}>
      {children}
    </div>
  )
}

// ── main app ─────────────────────────────────────────────────────
const FILTER_ORDER = ['All', 'USER', 'THINK', 'BASH', 'READ', 'WRITE', 'EDIT', 'WEBFETCH', 'WEBSEARCH', 'SAY', 'RESULT']

export default function App() {
  const [sessions, setSessions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [curEvents, setCurEvents] = useState([])
  const [filter, setFilter] = useState('All')
  const [expanded, setExpanded] = useState(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const loadedSidRef = useRef(null)

  // analysis states
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [expandedAnalysis, setExpandedAnalysis] = useState(new Set())
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [showCacheChoice, setShowCacheChoice] = useState(false)
  const [cacheAvailable, setCacheAvailable] = useState(false)

  const _applyAnalysis = (data) => {
    setAnalysis(data)
    setExpandedAnalysis(new Set())
    setSummaryExpanded(true)
    setShowCacheChoice(false)
  }

  const loadSessions = async (refresh = false) => {
    try {
      const qs = refresh ? '?refresh=1' : ''
      const res = await fetch(`/api/sessions${qs}`)
      const data = await res.json()
      setSessions(data)
    } catch (e) { console.error('Failed to load sessions', e) }
  }

  const loadEvents = async (sid) => {
    if (!sid || sid === loadedSidRef.current) return
    loadedSidRef.current = sid
    setLoading(true)
    setCurEvents([])
    setExpanded(new Set())
    setFilter('All')
    setAnalysis(null)
    setExpandedAnalysis(new Set())
    setSummaryExpanded(false)
    try {
      const res = await fetch(`/api/sessions/${sid}/events`)
      const data = await res.json()
      setCurEvents(data)
    } catch (e) { console.error('Failed to load events', e) }
    finally { setLoading(false) }
  }

  const runAnalyze = async () => {
    if (!curSession) return
    setAnalyzing(true)
    try {
      // Check cache first
      const checkRes = await fetch(`/api/sessions/${curSession.id}/analyze`)
      const checkData = await checkRes.json()
      if (checkData.cached) {
        setCacheAvailable(true)
        setShowCacheChoice(true)
        setAnalyzing(false)
        return
      }
      // No cache — go ahead
      const res = await fetch(`/api/sessions/${curSession.id}/analyze`, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        alert('分析失败: ' + data.error)
      } else {
        _applyAnalysis(data)
      }
    } catch (e) {
      alert('分析请求失败: ' + e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const runAnalyzeCached = async () => {
    if (!curSession) return
    setAnalyzing(true)
    setShowCacheChoice(false)
    try {
      const res = await fetch(`/api/sessions/${curSession.id}/analyze`, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        alert('加载缓存失败: ' + data.error)
      } else {
        _applyAnalysis(data)
      }
    } catch (e) {
      alert('加载缓存失败: ' + e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const runAnalyzeForce = async () => {
    if (!curSession) return
    setAnalyzing(true)
    setShowCacheChoice(false)
    try {
      const res = await fetch(`/api/sessions/${curSession.id}/analyze?force=true`, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        alert('分析失败: ' + data.error)
      } else {
        _applyAnalysis(data)
      }
    } catch (e) {
      alert('分析请求失败: ' + e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    loadSessions(true)
    const iv = setInterval(() => loadSessions(false), 15000)
    return () => clearInterval(iv)
  }, [])

  const selectedIdx = sessions.findIndex(s => s.id === selectedId)
  const effectiveIdx = selectedIdx >= 0 ? selectedIdx : 0
  const curSession = sessions[effectiveIdx] || null

  useEffect(() => {
    if (sessions.length > 0) {
      const sid = curSession?.id || sessions[0]?.id
      if (sid) {
        if (selectedId === null && sid === sessions[0]?.id) {
          setSelectedId(sid)
        }
        loadEvents(sid)
      }
    }
  }, [sessions, selectedId])

  const toggleExpand = (i) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const toggleAnalysis = (turnIdx) => {
    setExpandedAnalysis(prev => {
      const next = new Set(prev)
      next.has(turnIdx) ? next.delete(turnIdx) : next.add(turnIdx)
      return next
    })
  }

  const handleDelete = async (sid, e) => {
    e.stopPropagation()
    if (!window.confirm('确定要删除这个 session 吗？此操作不可恢复。')) return
    try {
      const res = await fetch(`/api/sessions/${sid}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        if (selectedId === sid) {
          setSelectedId(null)
          setCurEvents([])
          loadedSidRef.current = null
        }
        loadSessions()
      } else {
        alert('删除失败: ' + (data.error || '未知错误'))
      }
    } catch (err) {
      alert('删除失败: ' + err.message)
    }
  }

  const filteredSessions = searchQuery
    ? sessions.filter(s => {
        const q = searchQuery.toLowerCase()
        return s.id.toLowerCase().includes(q) || s.first_msg.toLowerCase().includes(q) || (s.search_text || '').includes(q)
      })
    : sessions

  const filteredEvents = filter === 'All' ? curEvents : curEvents.filter(e => e.kind === filter)

  const filterCounts = {}
  FILTER_ORDER.forEach(k => {
    filterCounts[k] = k === 'All' ? curEvents.length : curEvents.filter(e => e.kind === k).length
  })

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", background: '#f8fafc', color: '#1e293b', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

      {/* ── top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 20px', background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,.06)', position: 'sticky', top: 0, zIndex: 100 }}>
        <span style={{ fontSize: '20px' }}>⚡</span>
        <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', letterSpacing: '-.02em' }}>Claude Code Dashboard</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#10b981', fontSize: '12px' }}>●</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{sessions.length} sessions</span>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 55px)' }}>

        {/* ── left: session list ── */}
        <div style={{ width: '240px', minWidth: '240px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', letterSpacing: '.08em' }}>SESSIONS</span>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{filteredSessions.length} / {sessions.length}</span>
            </div>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索 session 内容或 ID..."
              style={{ width: '100%', padding: '6px 10px', fontSize: '12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', color: '#1e293b', outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {filteredSessions.length === 0
              ? <div style={{ color: '#94a3b8', padding: '20px', fontSize: '13px' }}>无匹配结果</div>
              : filteredSessions.map(s => {
                  const active = s.id === selectedId
                  const startStr = s.start ? s.start.substring(5, 16).replace('T', ' ') : ''
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      style={{ borderLeft: `3px solid ${active ? '#3b82f6' : 'transparent'}`, background: active ? '#eff6ff' : 'transparent', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background .1s' }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#eff6ff' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{startStr}</span>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{s.id}</span>
                        <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>{fmtDur(s.dur_ms)}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: active ? '#1e293b' : '#475569', lineHeight: '1.4', marginBottom: '4px', wordBreak: 'break-word' }}>
                        {s.first_msg ? (s.first_msg.length > 55 ? s.first_msg.substring(0, 55) + '…' : s.first_msg) : '(no message)'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{s.total} events</div>
                        <button
                          onClick={(e) => handleDelete(s.id, e)}
                          style={{ marginLeft: 'auto', fontSize: '10px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  )
                })
            }
          </div>
        </div>

        {/* ── center: timeline ── */}
        <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* session id header + analyze button */}
          {curSession && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', position: 'relative' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '.05em', flexShrink: 0 }}>SESSION</span>
              <span
                title="双击复制"
                onDoubleClick={() => { navigator.clipboard.writeText(curSession.id); alert('Session ID 已复制到剪贴板') }}
                style={{ fontSize: '12px', color: '#0369a1', fontFamily: "'Consolas','Monaco','Courier New',monospace", cursor: 'pointer' }}
              >
                {curSession.id}
              </span>
              <button
                onClick={runAnalyze}
                disabled={analyzing}
                style={{
                  marginLeft: 'auto',
                  fontSize: '11px', fontWeight: 700,
                  color: analyzing ? '#94a3b8' : '#fff',
                  background: analyzing ? '#e2e8f0' : '#0ea5e9',
                  border: 'none', borderRadius: '5px', padding: '4px 12px',
                  cursor: analyzing ? 'not-allowed' : 'pointer',
                  transition: 'all .1s',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!analyzing) e.currentTarget.style.background = '#0284c7' }}
                onMouseLeave={e => { if (!analyzing) e.currentTarget.style.background = '#0ea5e9' }}
              >
                {analyzing ? '分析中…' : '🔍 Agent 分析'}
              </button>
              {/* cache choice popover */}
              {showCacheChoice && (
                <div style={{
                  position: 'absolute',
                  top: '40px',
                  right: '16px',
                  zIndex: 200,
                  background: '#fff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,.12)',
                  padding: '12px',
                  width: '200px',
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>已有分析缓存</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px', lineHeight: '1.4' }}>
                    该 session 之前已生成过分析，可以选择使用缓存或重新分析。
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <button
                      onClick={runAnalyzeCached}
                      style={{
                        fontSize: '11px', fontWeight: 700, color: '#fff',
                        background: '#0ea5e9', border: 'none', borderRadius: '4px',
                        padding: '5px 0', cursor: 'pointer',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#0284c7'}
                      onMouseLeave={e => e.currentTarget.style.background = '#0ea5e9'}
                    >
                      📋 使用缓存
                    </button>
                    <button
                      onClick={runAnalyzeForce}
                      style={{
                        fontSize: '11px', fontWeight: 700, color: '#475569',
                        background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px',
                        padding: '5px 0', cursor: 'pointer',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                    >
                      🔄 重新生成
                    </button>
                    <button
                      onClick={() => setShowCacheChoice(false)}
                      style={{
                        fontSize: '11px', color: '#64748b',
                        background: 'transparent', border: 'none',
                        padding: '4px 0', cursor: 'pointer',
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* filter bar */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '6px', flexWrap: 'wrap', background: '#fff' }}>
            {FILTER_ORDER.filter(k => k === 'All' || filterCounts[k] > 0).map(k => {
              const st = k === 'All' ? { bg: '#f1f5f9', color: '#64748b', label: 'All' } : getStyle(k)
              const active = k === filter
              return (
                <button key={k} onClick={() => setFilter(k)} style={{ background: active ? st.bg : '#f1f5f9', color: active ? st.color : '#64748b', border: active ? `1.5px solid ${st.color}55` : '1.5px solid #e2e8f0', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, transition: 'all .1s' }}>
                  {st.label} <span style={{ opacity: .7, fontSize: '11px' }}>({filterCounts[k]})</span>
                </button>
              )
            })}
          </div>
          {/* tool summary bar */}
          {(() => {
            const toolKinds = ['BASH','READ','WRITE','EDIT','WEBFETCH','WEBSEARCH','AGENT','TASKCREATE','TASKUPDATE']
            const totalTools = toolKinds.reduce((sum, k) => sum + (curSession?.tool_counts?.[k] || 0), 0)
            if (totalTools === 0) return null
            return (
              <div style={{ padding: '6px 16px', borderBottom: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '.05em' }}>TOOLS</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>{totalTools} calls</span>
                {toolKinds.filter(k => curSession?.tool_counts?.[k] > 0).map(k => {
                  const st = getStyle(k)
                  return (
                    <span key={k} style={{ fontSize: '11px', color: st.color, background: st.bg, padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                      {st.label} {curSession.tool_counts[k]}
                    </span>
                  )
                })}
              </div>
            )
          })()}
          {/* events */}
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, background: '#fff' }}>
            {loading ? (
              <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center', fontSize: '14px' }}>Loading…</div>
            ) : filteredEvents.length === 0 ? (
              <div style={{ color: '#94a3b8', padding: '40px', textAlign: 'center', fontSize: '14px' }}>
                {curEvents.length === 0 ? 'Select a session' : `No ${filter} events`}
              </div>
            ) : (() => {
              let lastTurnIdx = null
              return filteredEvents.map((e, i) => {
                const out = []
                if (e.turn_index !== undefined && e.turn_index !== lastTurnIdx) {
                  lastTurnIdx = e.turn_index
                  const turnAnalysis = analysis?.turns?.[e.turn_index]
                  if (turnAnalysis) {
                    out.push(
                      <TurnDivider
                        key={`ta-${e.turn_index}`}
                        turn={e.turn_index}
                        analysis={turnAnalysis}
                        isExpanded={expandedAnalysis.has(e.turn_index)}
                        onToggle={() => toggleAnalysis(e.turn_index)}
                      />
                    )
                  }
                }
                out.push(
                  <EventRow
                    key={`ev-${i}`}
                    event={e}
                    idx={i}
                    isExpanded={expanded.has(i)}
                    onToggle={toggleExpand}
                  />
                )
                return out
              })
            })()}
            {/* summary panel at bottom */}
            {analysis && analysis.summary && (
              <SummaryPanel
                summary={analysis.summary}
                agentInsight={analysis.agent_insight}
                isExpanded={summaryExpanded}
                onToggle={() => setSummaryExpanded(v => !v)}
                elapsedSec={analysis._analysis_elapsed_sec || 0}
              />
            )}
          </div>
        </div>

        {/* ── right: summary ── */}
        <div style={{ width: '260px', minWidth: '260px', overflowY: 'auto', height: 'calc(100vh - 55px)', background: '#fff', padding: '14px', borderLeft: '1px solid #e2e8f0' }}>
          {curSession && <>
            <SecTitle>RUN STATUS</SecTitle>
            {[
              ['Model',    curSession.model || '—',              '#0369a1'],
              ['Duration', fmtDur(curSession.dur_ms),            '#f59e0b'],
              ['Events',   String(curSession.total),             '#1e293b'],
              ['Thinking', String(curSession.tool_counts?.THINK || 0), '#7c3aed'],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>{label}</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color }}>{val}</span>
              </div>
            ))}

            <SecTitle>TOOL USAGE</SecTitle>
            <DonutChart tc={curSession.tool_counts || {}} />

            <SecTitle>MODIFIED FILES</SecTitle>
            {(() => {
              const files = Object.entries(curSession.file_counts || {}).sort((a, b) => b[1] - a[1])
              if (files.length === 0) return <div style={{ color: '#94a3b8', fontSize: '11px' }}>No file accesses</div>
              const maxC = files[0][1]
              return files.map(([name, cnt]) => (
                <div key={name} style={{ marginBottom: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1px' }}>
                    <span style={{ fontSize: '11px', color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                      {name.length > 22 ? name.substring(0, 22) : name}
                    </span>
                    <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: '4px' }}>{cnt}</span>
                  </div>
                  <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '2px' }}>
                    <div style={{ height: '3px', background: '#3b82f6', borderRadius: '2px', width: `${cnt / maxC * 100}%` }} />
                  </div>
                </div>
              ))
            })()}
          </>}
        </div>
      </div>
    </div>
  )
}
