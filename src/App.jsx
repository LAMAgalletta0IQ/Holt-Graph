import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'

function useHoltGraph() {
  const [nodes, setNodes] = useState([])
  const [arrows, setArrows] = useState([])
  const usedLabelsRef = useRef({ process: new Set(), resource: new Set() })

  const nextLabel = useCallback((type) => {
    const prefix = type === 'process' ? 'P' : 'R'
    const used = usedLabelsRef.current[type]
    let i = 1
    while (used.has(i)) i++
    used.add(i)
    return { label: `${prefix}${i}`, num: i }
  }, [])

  const freeLabel = useCallback((type, num) => {
    usedLabelsRef.current[type].delete(num)
  }, [])

  const addNode = useCallback((type, canvasRect) => {
    const { label, num } = nextLabel(type)
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const x = 80 + Math.random() * (canvasRect.width - 160)
    const y = 80 + Math.random() * (canvasRect.height - 160)
    const node = { id, type, label, num, x, y, mult: type === 'resource' ? 1 : null }
    setNodes(prev => [...prev, node])
    return node
  }, [nextLabel])

  const deleteNode = useCallback((id) => {
    setNodes(prev => {
      const node = prev.find(n => n.id === id)
      if (node) freeLabel(node.type, node.num)
      return prev.filter(n => n.id !== id)
    })
    setArrows(prev => prev.filter(a => a.from !== id && a.to !== id))
  }, [freeLabel])

  const updateNodePos = useCallback((id, x, y) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n))
  }, [])

  const addArrow = useCallback((from, to, type) => {
    const id = `a-${Date.now()}`
    setArrows(prev => [...prev, { id, from, to, type }])
  }, [])

  const deleteArrow = useCallback((id) => {
    setArrows(prev => prev.filter(a => a.id !== id))
  }, [])

  const clearAll = useCallback(() => {
    setNodes([])
    setArrows([])
    usedLabelsRef.current = { process: new Set(), resource: new Set() }
  }, [])

  const changeMult = useCallback((id, delta) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== id) return n
      const used = arrows.filter(a => a.type === 'assign' && a.from === id).length
      const next = n.mult + delta
      if (next < 1 || next < used) return n
      return { ...n, mult: next }
    }))
  }, [arrows])

  return {
    nodes, arrows, addNode, deleteNode, updateNodePos,
    addArrow, deleteArrow, clearAll, changeMult, usedLabelsRef
  }
}

function detectDeadlock(nodes, arrows) {
  const procs = nodes.filter(n => n.type === 'process')
  const waitFor = {}
  procs.forEach(p => { waitFor[p.id] = [] })

  arrows.filter(a => a.type === 'request').forEach(req => {
    const res = nodes.find(n => n.id === req.to)
    if (!res) return
    arrows.filter(a => a.type === 'assign' && a.from === res.id && a.to !== req.from)
      .forEach(asgn => { waitFor[req.from]?.push(asgn.to) })
  })

  const vis = {}
  const stk = {}

  function dfs(nid, path) {
    vis[nid] = true
    stk[nid] = true
    for (const nb of (waitFor[nid] || [])) {
      if (!vis[nb]) {
        const r = dfs(nb, [...path, nb])
        if (r) return r
      } else if (stk[nb]) {
        const ci = path.indexOf(nb)
        return path.slice(ci).map(id => nodes.find(n => n.id === id)?.label || id)
      }
    }
    stk[nid] = false
    return null
  }

  for (const p of procs) {
    if (!vis[p.id]) {
      const r = dfs(p.id, [p.id])
      if (r) return r
    }
  }
  return null
}

function isReducible(nodes, arrows) {
  return nodes.filter(n => n.type === 'process')
    .some(p => arrows.filter(a => a.from === p.id && a.type === 'request').length === 0)
}

function edgePt(node, toward) {
  const dx = toward.x - node.x
  const dy = toward.y - node.y
  const dist = Math.hypot(dx, dy) || 1
  const nx = dx / dist
  const ny = dy / dist
  if (node.type === 'process') {
    return { x: node.x + nx * 28, y: node.y + ny * 28 }
  }
  const hw = 34
  const hh = 26
  let t = Infinity
  if (nx !== 0) t = Math.min(t, Math.abs(hw / nx))
  if (ny !== 0) t = Math.min(t, Math.abs(hh / ny))
  return { x: node.x + nx * t, y: node.y + ny * t }
}

export default function App() {
  const {
    nodes, arrows, addNode, deleteNode, updateNodePos,
    addArrow, deleteArrow, clearAll, changeMult
  } = useHoltGraph()

  const [mode, setMode] = useState('none')
  const [conn, setConn] = useState({ active: false, from: null })
  const [drag, setDrag] = useState({ active: false, id: null })
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [toast, setToast] = useState({ msg: '', type: '', show: false })
  const canvasRef = useRef(null)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const [selectedNodes, setSelectedNodes] = useState(new Set())
  const [selecting, setSelecting] = useState(false)
  const [selectRect, setSelectRect] = useState(null)
  const selectStartRef = useRef({ x: 0, y: 0 })
  const selectRectRef = useRef(null)
  const selectingRef = useRef(false)
  const selectAddRef = useRef(false)
  const groupDragRef = useRef(null)

  const selectedNodesRef = useRef(selectedNodes)
  selectedNodesRef.current = selectedNodes

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMode('none')
        setConn({ active: false, from: null })
        setSelectedNodes(new Set())
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
        const sel = selectedNodesRef.current
        if (sel.size > 0) {
          sel.forEach(id => deleteNode(id))
          setSelectedNodes(new Set())
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [deleteNode])

  const showToast = useCallback((msg, type = '') => {
    setToast({ msg, type, show: true })
    setTimeout(() => setToast(t => ({ ...t, show: false })), 2600)
  }, [])

  const handleAddNode = useCallback((type) => {
    if (!canvasRef.current) return
    addNode(type, canvasRef.current.getBoundingClientRect())
  }, [addNode])

  const handleNodeClick = useCallback((id, e) => {
    e.stopPropagation()
    if (mode === 'none') return

    const node = nodes.find(n => n.id === id)
    if (!node) return

    if (!conn.active) {
      if (mode === 'assign' && node.type !== 'resource') {
        showToast('Assignment: click the RESOURCE first', 'err')
        return
      }
      if (mode === 'request' && node.type !== 'process') {
        showToast('Request: click the PROCESS first', 'err')
        return
      }
      setConn({ active: true, from: id })
      showToast(`${node.label} selected — now click the target`, '')
    } else {
      if (conn.from === id) {
        setConn({ active: false, from: null })
        return
      }

      const fromN = nodes.find(n => n.id === conn.from)
      const toN = node

      if (mode === 'assign' && toN.type !== 'process') {
        setConn({ active: false, from: null })
        showToast('Assignment: target must be a PROCESS', 'err')
        return
      }
      if (mode === 'request' && toN.type !== 'resource') {
        setConn({ active: false, from: null })
        showToast('Request: target must be a RESOURCE', 'err')
        return
      }
      if (arrows.find(a => a.from === conn.from && a.to === id && a.type === mode)) {
        setConn({ active: false, from: null })
        showToast('This arrow already exists', 'err')
        return
      }
      if (mode === 'assign') {
        const used = arrows.filter(a => a.type === 'assign' && a.from === fromN.id).length
        if (used >= fromN.mult) {
          setConn({ active: false, from: null })
          showToast(`${fromN.label} has no free instances`, 'err')
          return
        }
      }

      addArrow(conn.from, id, mode)
      setConn({ active: false, from: null })
      showToast('Arrow added', 'ok')
    }
  }, [mode, conn, nodes, arrows, addArrow, showToast])

  const handleNodeMouseDown = useCallback((nodeId, e) => {
    if (e.target.closest('.nctrl')) return
    if (mode !== 'none') {
      handleNodeClick(nodeId, e)
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedNodes(prev => {
        const next = new Set(prev)
        if (next.has(nodeId)) next.delete(nodeId)
        else next.add(nodeId)
        return next
      })
      e.preventDefault()
      return
    }
    if (!selectedNodes.has(nodeId)) {
      setSelectedNodes(new Set())
      groupDragRef.current = null
    } else if (selectedNodes.size > 1) {
      const node = nodesRef.current.find(n => n.id === nodeId)
      if (node) {
        groupDragRef.current = []
        selectedNodes.forEach(sid => {
          if (sid !== nodeId) {
            const sn = nodesRef.current.find(n => n.id === sid)
            if (sn) groupDragRef.current.push({ id: sid, dx: sn.x - node.x, dy: sn.y - node.y })
          }
        })
      }
    }
    setDrag({ active: true, id: nodeId })
    e.preventDefault()
  }, [mode, handleNodeClick, selectedNodes])

  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    setMousePos({ x: mx, y: my })

    if (drag.active) {
      updateNodePos(drag.id, mx, my)
      if (groupDragRef.current) {
        groupDragRef.current.forEach(({ id, dx, dy }) => {
          updateNodePos(id, mx + dx, my + dy)
        })
      }
    }

    if (selecting) {
      const start = selectStartRef.current
      const r = {
        x: Math.min(start.x, mx),
        y: Math.min(start.y, my),
        w: Math.abs(mx - start.x),
        h: Math.abs(my - start.y)
      }
      selectRectRef.current = r
      setSelectRect(r)
    }
  }, [drag, updateNodePos, selecting])

  const handleMouseUp = useCallback(() => {
    if (selectingRef.current) {
      const r = selectRectRef.current
      if (r && (r.w > 4 || r.h > 4)) {
        const ns = nodesRef.current
        setSelectedNodes(prev => {
          const next = selectAddRef.current ? new Set(prev) : new Set()
          ns.forEach(node => {
            if (node.x >= r.x && node.x <= r.x + r.w &&
                node.y >= r.y && node.y <= r.y + r.h) {
              next.add(node.id)
            }
          })
          return next
        })
      }
      selectingRef.current = false
      selectRectRef.current = null
      setSelecting(false)
      setSelectRect(null)
    }
    setDrag({ active: false, id: null })
    groupDragRef.current = null
  }, [])

  const handleCanvasMouseDown = useCallback((e) => {
    if (e.target.closest('.g-node')) return
    if (e.target.closest('.arrow-hit')) return
    if (mode !== 'none') {
      setConn({ active: false, from: null })
      return
    }
    selectAddRef.current = e.ctrlKey || e.metaKey
    const rect = canvasRef.current.getBoundingClientRect()
    selectStartRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
    selectRectRef.current = null
    selectingRef.current = true
    setSelecting(true)
    setSelectRect(null)
  }, [mode])

  const handleModeChange = useCallback((m) => {
    setMode(m)
    setConn({ active: false, from: null })
  }, [])

  const handleDeleteNode = useCallback((id, e) => {
    e.stopPropagation()
    deleteNode(id)
  }, [deleteNode])

  const handleChangeMult = useCallback((id, delta, e) => {
    e.stopPropagation()
    const node = nodes.find(n => n.id === id)
    if (!node) return
    const used = arrows.filter(a => a.type === 'assign' && a.from === id).length
    const next = node.mult + delta
    if (next < 1) {
      showToast('Minimum multiplicity: 1', 'err')
      return
    }
    if (next < used) {
      showToast('Cannot reduce: active assignments exist!', 'err')
      return
    }
    changeMult(id, delta)
  }, [nodes, arrows, changeMult, showToast])

  const handleClearAll = useCallback(() => {
    clearAll()
    setConn({ active: false, from: null })
    setDrag({ active: false, id: null })
    showToast('Canvas cleared', '')
  }, [clearAll, showToast])

  const cycle = detectDeadlock(nodes, arrows)
  const reducible = isReducible(nodes, arrows)
  const procCount = nodes.filter(n => n.type === 'process').length
  const resCount = nodes.filter(n => n.type === 'resource').length

  const hints = {
    none: 'Drag nodes to move them freely',
    assign: 'Click RESOURCE → then PROCESS\n(R assigns to P)',
    request: 'Click PROCESS → then RESOURCE\n(P requests R)',
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div>
            <div className="brand-title">Grafo di Holt</div>
            <div className="brand-sub">TPSIT · Builder</div>
          </div>
        </div>
        <div className="topbar-status">
          <span className="status-label">System:</span>
          <span className={`status-value ${cycle ? 'deadlock' : nodes.length ? 'ok' : ''}`}>
            {cycle ? 'DEADLOCK' : nodes.length ? (reducible ? 'Reducible' : 'No deadlock') : '—'}
          </span>
        </div>
        <div className="topbar-actions">
          <button className="tbtn danger" onClick={handleClearAll}>Delete all</button>
        </div>
      </header>

      <aside className="left-panel">
        <div className="panel-section">
          <div className="panel-heading">Add node</div>
          <button className="add-btn" onClick={() => handleAddNode('process')}>
            <div className="btn-shape-p" />
            Process
          </button>
          <button className="add-btn" onClick={() => handleAddNode('resource')}>
            <div className="btn-shape-r" />
            Resource
          </button>
        </div>

        <div className="panel-section">
          <div className="panel-heading">Mode</div>
          <button className={`mode-btn ${mode === 'none' ? 'active' : ''}`} onClick={() => handleModeChange('none')}>
            <div className="mode-pip" style={{ background: 'var(--ink-dim)' }} />
            Move
          </button>
          <button className={`mode-btn ${mode === 'assign' ? 'active-assign' : ''}`} onClick={() => handleModeChange('assign')}>
            <div className="mode-pip" style={{ background: 'var(--assign-color)' }} />
            Assignment R→P
          </button>
          <button className={`mode-btn ${mode === 'request' ? 'active-request' : ''}`} onClick={() => handleModeChange('request')}>
            <div className="mode-pip" style={{ background: 'var(--request-color)' }} />
            Request P→R
          </button>
          <div className="hint-box">{hints[mode]}</div>
        </div>

        <div className="panel-section">
          <div className="panel-heading">Legend</div>
          <div className="legend-row">
            <div className="btn-shape-p" style={{ width: 18, height: 18, border: '2px solid var(--ink)', flexShrink: 0 }} />
            Process
          </div>
          <div className="legend-row">
            <div className="btn-shape-r" style={{ width: 20, height: 14, border: '2px solid var(--ink)', flexShrink: 0 }} />
            Resource
          </div>
          <div className="legend-row">
            <div className="leg-line leg-assign" />
            R→P assigned
          </div>
          <div className="legend-row">
            <div className="leg-line leg-request" />
            P→R requested
          </div>
        </div>
      </aside>

      <main
        ref={canvasRef}
        className="canvas-area"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onMouseDown={handleCanvasMouseDown}
      >
        <svg className="graph-svg">
          <defs>
            <marker id="mk-assign" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#3fb950" />
            </marker>
            <marker id="mk-request" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#f85149" />
            </marker>
            <marker id="mk-temp" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#58a6ff" />
            </marker>
          </defs>
          <g className="arrows-g">
            {arrows.map(a => {
              const f = nodes.find(n => n.id === a.from)
              const t = nodes.find(n => n.id === a.to)
              if (!f || !t) return null
              const p1 = edgePt(f, t)
              const p2 = edgePt(t, f)
              const color = a.type === 'assign' ? '#3fb950' : '#f85149'
              return (
                <g key={a.id}>
                  <line
                    className="arrow-hit"
                    x1={p1.x} y1={p1.y}
                    x2={p2.x} y2={p2.y}
                    stroke="transparent"
                    strokeWidth="12"
                    strokeLinecap="round"
                    onClick={() => { deleteArrow(a.id); showToast('Arrow deleted', '') }}
                  />
                  <line
                    x1={p1.x} y1={p1.y}
                    x2={p2.x} y2={p2.y}
                    stroke={color}
                    strokeWidth="2"
                    markerEnd={a.type === 'assign' ? 'url(#mk-assign)' : 'url(#mk-request)'}
                    strokeLinecap="round"
                  />
                </g>
              )
            })}
          </g>
          {conn.active && (() => {
            const fn = nodes.find(n => n.id === conn.from)
            if (!fn) return null
            return (
              <line
                className="temp-line"
                x1={fn.x} y1={fn.y}
                x2={mousePos.x} y2={mousePos.y}
              />
            )
          })()}
        </svg>

        {selecting && selectRect && selectRect.w > 2 && selectRect.h > 2 && (
          <div
            className="select-rect"
            style={{
              left: selectRect.x,
              top: selectRect.y,
              width: selectRect.w,
              height: selectRect.h,
            }}
          />
        )}

        <div className="nodes-layer">
          {nodes.map(node => (
            <NodeElement
              key={node.id}
              node={node}
              mode={mode}
              isSelected={conn.active && conn.from === node.id}
              isMultiSelected={selectedNodes.has(node.id)}
              arrows={arrows}
              onMouseDown={handleNodeMouseDown}
              onDelete={handleDeleteNode}
              onChangeMult={handleChangeMult}
            />
          ))}
        </div>

        {nodes.length === 0 && (
          <div className="empty-state">
            <div className="e-title">Empty canvas</div>
            <div className="e-sub">← add nodes from the sidebar</div>
          </div>
        )}
      </main>

      <aside className="right-panel">
        <div className="rpanel-section">
          <div className="panel-heading">Statistics</div>
          <div className="stat-grid">
            <div className="stat-box"><div className="stat-num">{procCount}</div><div className="stat-sub">Processes</div></div>
            <div className="stat-box"><div className="stat-num">{resCount}</div><div className="stat-sub">Resources</div></div>
            <div className="stat-box" style={{ gridColumn: '1/-1' }}><div className="stat-num">{arrows.length}</div><div className="stat-sub">Arrows</div></div>
          </div>
        </div>

        <div className="rpanel-section">
          <div className="panel-heading">System status</div>
          <div className={`system-box ${cycle ? 'deadlock' : nodes.length ? 'ok' : ''}`}>
            {cycle ? (
              <>
                <strong>DEADLOCK DETECTED</strong><br />
                Cycle: {cycle.join(' → ')}<br /><br />
                Circular wait detected (Coffman).
              </>
            ) : nodes.length ? (
              reducible
                ? 'Reducible graph: at least one process can proceed.'
                : 'System stable. No deadlock detected.'
            ) : 'Add nodes to begin'}
          </div>
        </div>

        <div className="rpanel-section" style={{ borderBottom: 'none', flex: 1, display: 'flex', flexDirection: 'column', paddingBottom: 0 }}>
          <div className="panel-heading">Connections <span style={{ color: 'var(--ink-faint)' }}>(click to delete)</span></div>
          <div className="connections-scroll">
            {arrows.length === 0 ? (
              <div className="no-conn">no arrows</div>
            ) : (
              arrows.map(a => {
                const f = nodes.find(n => n.id === a.from)
                const t = nodes.find(n => n.id === a.to)
                if (!f || !t) return null
                const cls = a.type === 'assign' ? 'cr-assign' : 'cr-request'
                const lbl = a.type === 'assign' ? 'ASS' : 'REQ'
                return (
                  <div key={a.id} className="conn-row"                     onClick={() => { deleteArrow(a.id); showToast('Arrow deleted', '') }}>
                    <span className={`cr-type ${cls}`}>[{lbl}]</span>
                    <span>{f.label} → {t.label}</span>
                    <span className="cr-del">✕ delete</span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </aside>

      <div className={`toast ${toast.show ? 'show' : ''} ${toast.type}`}>{toast.msg}</div>
      {cycle && (
        <div className="toast err show deadlock-banner">
          DEADLOCK &mdash; {cycle.join(' \u2192 ')}
        </div>
      )}
    </div>
  )
}

function NodeElement({ node, mode, isSelected, isMultiSelected, arrows, onMouseDown, onDelete, onChangeMult }) {
  if (node.type === 'process') {
    return (
      <div
        className={`g-node ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multiselected' : ''} ${mode !== 'none' ? 'connectable' : ''}`}
        style={{ left: node.x, top: node.y }}
        onMouseDown={(e) => onMouseDown(node.id, e)}
      >
        <div className="proc-wrap">
          <div className="proc-circle">
            {node.label}
            <div className="node-controls">
              <div className="nctrl del" onClick={(e) => onDelete(node.id, e)} title="Delete">✕</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const used = arrows.filter(a => a.type === 'assign' && a.from === node.id).length

  return (
    <div
      className={`g-node ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multiselected' : ''} ${mode !== 'none' ? 'connectable' : ''}`}
      style={{ left: node.x, top: node.y }}
      onMouseDown={(e) => onMouseDown(node.id, e)}
    >
      <div className="res-wrap">
        <div className="res-rect">
          <div className="node-controls">
            <div className="nctrl" onClick={(e) => onChangeMult(node.id, 1, e)} title="+1 instance">+</div>
            <div className="nctrl" onClick={(e) => onChangeMult(node.id, -1, e)} title="-1 instance">−</div>
            <div className="nctrl del" onClick={(e) => onDelete(node.id, e)} title="Delete">✕</div>
          </div>
          <div className="dots-row">
            {Array.from({ length: node.mult }).map((_, i) => (
              <div key={i} className={`inst-dot ${i < used ? 'used' : ''}`} />
            ))}
          </div>
          <div className="res-lbl-inside">{node.label}</div>
        </div>
      </div>
    </div>
  )
}
