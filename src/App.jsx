import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from './lib/supabase';
import Login from './Login';

// ─── Initial Data ───────────────────────────────────────────────────────────
const INITIAL_PROJECTS = [
  {
    id: 'sth',
    name: 'STH',
    emoji: '\u{1F680}',
    priority: 'urgent',
    color: '#FF6B6B',
    tasks: [
      { id: 't1', text: 'News landing pages', status: 'todo' },
      { id: 't2', text: 'News cr\u00e9atives', status: 'todo' },
      { id: 't3', text: 'Obtenir BM Meta', status: 'todo' },
      { id: 't4', text: 'Obtenir Google Ads', status: 'todo' },
      { id: 't5', text: 'Lancer ads', status: 'todo' },
      { id: 't6', text: 'Campagne mail', status: 'todo' },
    ],
  },
  {
    id: 'desk',
    name: 'Desk Trading Analytics',
    emoji: '\u{1F4CA}',
    priority: 'urgent',
    color: '#4ECDC4',
    tasks: [
      { id: 't7', text: 'Structurer desk', status: 'todo' },
      { id: 't8', text: 'Utiliser database', status: 'todo' },
      { id: 't9', text: 'Mettre dash \u00e0 jour', status: 'todo' },
      { id: 't10', text: 'Voir LP flux', status: 'todo' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram Monitoring',
    emoji: '\u{1F4E1}',
    priority: 'important',
    color: '#A78BFA',
    tasks: [
      { id: 't11', text: 'New dashboard', status: 'todo' },
      { id: 't12', text: 'Canaux individuels', status: 'todo' },
    ],
  },
  {
    id: 'crm',
    name: 'CRM',
    emoji: '\u{1F91D}',
    priority: 'important',
    color: '#FFB347',
    tasks: [
      { id: 't13', text: 'Structurer Dashboard', status: 'todo' },
      { id: 't14', text: 'Tests connexion Telegram', status: 'todo' },
      { id: 't15', text: 'Tests situation r\u00e9els', status: 'todo' },
      { id: 't16', text: 'Feature "+1 new depot"', status: 'todo' },
    ],
  },
];

const STATUS_CYCLE = ['todo', 'inprogress', 'done'];
const STATUS_LABELS = { todo: '\u00c0 faire', inprogress: 'En cours', done: 'Fait' };
const STATUS_COLORS = { todo: '#6B7280', inprogress: '#F59E0B', done: '#10B981' };
const PRIORITY_LABELS = { urgent: 'Urgent', important: 'Important', normal: 'Normal' };
const PRIORITY_COLORS = { urgent: '#FF6B6B', important: '#FFB347', normal: '#10B981' };

// ─── Supabase Data Layer (with localStorage fallback) ───────────────────────

function loadLocalData() {
  try {
    const saved = localStorage.getItem('fxscale-mindmap-data');
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return INITIAL_PROJECTS;
}

function saveLocalData(projects) {
  localStorage.setItem('fxscale-mindmap-data', JSON.stringify(projects));
}

async function loadFromSupabase() {
  const { data, error } = await supabase
    .from('app_state')
    .select('state')
    .eq('id', 'main')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Row doesn't exist yet — seed from localStorage
      const local = loadLocalData();
      await saveToSupabase(local);
      return local;
    }
    throw error;
  }
  return data.state;
}

async function saveToSupabase(projects) {
  const { error } = await supabase
    .from('app_state')
    .upsert({
      id: 'main',
      state: projects,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

let idCounter = Date.now();
function genId() { return 'id_' + (idCounter++); }

// ─── Modal Component ────────────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: '#1a1a2e', borderRadius: 16, padding: 28, minWidth: 380, maxWidth: 500,
        border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Space Mono', monospace", fontSize: 18, color: '#fff' }}>{title}</h3>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer',
          }}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Mindmap View ───────────────────────────────────────────────────────────
function MindmapView({ projects, onCycleStatus, onAddTask, onDeleteTask, onEditTask, onAddProject, onEditProject, onDeleteProject }) {
  const containerRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.5 });
  const [dragging, setDragging] = useState(null);
  const [nodePositions, setNodePositions] = useState({});
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const [editTaskModal, setEditTaskModal] = useState(null);
  const [editProjectModal, setEditProjectModal] = useState(null);
  const [addTaskModal, setAddTaskModal] = useState(null);
  const [addProjectModal, setAddProjectModal] = useState(false);
  const [editText, setEditText] = useState('');
  const [editPriority, setEditPriority] = useState('normal');
  const [editColor, setEditColor] = useState('#FF6B6B');

  const centerX = 0;
  const centerY = 0;
  const projectRadius = 400;

  const getProjectPos = useCallback((index, total) => {
    const angle = (2 * Math.PI * index) / total - Math.PI / 2;
    return {
      x: centerX + projectRadius * Math.cos(angle),
      y: centerY + projectRadius * Math.sin(angle),
    };
  }, []);

  const getTaskPos = useCallback((projPos, taskIndex, totalTasks, projIndex, totalProjects) => {
    const baseAngle = (2 * Math.PI * projIndex) / totalProjects - Math.PI / 2;
    const spread = Math.PI / (Math.max(totalTasks, 2) + 1);
    const startAngle = baseAngle - (spread * (totalTasks - 1)) / 2;
    const angle = startAngle + spread * taskIndex;
    const taskRadius = Math.max(250, totalTasks * 80);
    return {
      x: projPos.x + taskRadius * Math.cos(angle),
      y: projPos.y + taskRadius * Math.sin(angle),
    };
  }, []);

  const getNodePos = useCallback((key, defaultPos) => {
    return nodePositions[key] || defaultPos;
  }, [nodePositions]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.2, Math.min(3, prev.scale * delta)),
    }));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.addEventListener('wheel', handleWheel, { passive: false });
    return () => { if (el) el.removeEventListener('wheel', handleWheel); };
  }, [handleWheel]);

  // Auto-fit zoom on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container || projects.length === 0) return;
      let minX = -65, maxX = 65, minY = -65, maxY = 65;
      projects.forEach((proj, pi) => {
        const pp = getProjectPos(pi, projects.length);
        minX = Math.min(minX, pp.x - 120); maxX = Math.max(maxX, pp.x + 120);
        minY = Math.min(minY, pp.y - 45); maxY = Math.max(maxY, pp.y + 45);
        proj.tasks.forEach((_, ti) => {
          const tp = getTaskPos(pp, ti, proj.tasks.length, pi, projects.length);
          minX = Math.min(minX, tp.x - 120); maxX = Math.max(maxX, tp.x + 120);
          minY = Math.min(minY, tp.y - 40); maxY = Math.max(maxY, tp.y + 40);
        });
      });
      const cw = maxX - minX + 60, ch = maxY - minY + 60;
      const s = Math.min(container.clientWidth / cw, container.clientHeight / ch, 1);
      setTransform({ x: 0, y: 0, scale: Math.max(s, 0.2) });
    });
    return () => cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.target === containerRef.current || e.target.tagName === 'svg') {
      setIsPanning(true);
      panStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  }, [transform]);

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y,
      }));
    }
    if (dragging) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.width / 2 - transform.x) / transform.scale;
      const y = (e.clientY - rect.height / 2 - transform.y) / transform.scale;
      setNodePositions(prev => ({ ...prev, [dragging]: { x, y } }));
    }
  }, [isPanning, dragging, transform]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragging(null);
  }, []);

  const curvedPath = (x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const cx = mx - dy * 0.15;
    const cy = my + dx * 0.15;
    return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
  };

  const allLines = [];
  const allNodes = [];

  const centralPos = getNodePos('central', { x: centerX, y: centerY });
  allNodes.push(
    <g key="central" style={{ cursor: 'grab' }}
       onMouseDown={(e) => { e.stopPropagation(); setDragging('central'); }}>
      <circle cx={centralPos.x} cy={centralPos.y} r={65} fill="#1a1a2e"
        stroke="#4ECDC4" strokeWidth={2.5}
        style={{ filter: 'drop-shadow(0 0 20px rgba(78,205,196,0.4))' }} />
      <text x={centralPos.x} y={centralPos.y - 8} textAnchor="middle" fill="#4ECDC4"
        style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700 }}>FXSCALE</text>
      <text x={centralPos.x} y={centralPos.y + 12} textAnchor="middle" fill="#A78BFA"
        style={{ fontFamily: "'Space Mono', monospace", fontSize: 12 }}>IA</text>
    </g>
  );

  projects.forEach((proj, pi) => {
    const defaultProjPos = getProjectPos(pi, projects.length);
    const projPos = getNodePos(proj.id, defaultProjPos);

    allLines.push(
      <path key={`line-c-${proj.id}`} d={curvedPath(centralPos.x, centralPos.y, projPos.x, projPos.y)}
        fill="none" stroke={proj.color} strokeWidth={2} opacity={0.5}
        strokeDasharray="6 4" />
    );

    allNodes.push(
      <g key={`proj-${proj.id}`} style={{ cursor: 'grab' }}
         onMouseDown={(e) => { e.stopPropagation(); setDragging(proj.id); }}>
        <rect x={projPos.x - 110} y={projPos.y - 32} width={220} height={65} rx={14}
          fill="#1a1a2e" stroke={proj.color} strokeWidth={2}
          style={{ filter: `drop-shadow(0 0 15px ${proj.color}44)` }} />
        <text x={projPos.x} y={projPos.y - 6} textAnchor="middle" fontSize={20}>
          {proj.emoji}
        </text>
        <text x={projPos.x} y={projPos.y + 18} textAnchor="middle" fill="#fff"
          style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600 }}>
          {proj.name}
        </text>
        <circle cx={projPos.x + 95} cy={projPos.y - 20} r={7}
          fill={PRIORITY_COLORS[proj.priority]} />
        <g style={{ cursor: 'pointer' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => {
          e.stopPropagation();
          setEditProjectModal(proj);
          setEditText(proj.name);
          setEditPriority(proj.priority);
          setEditColor(proj.color);
        }}>
          <circle cx={projPos.x - 95} cy={projPos.y - 20} r={9} fill="#333" stroke="#555" strokeWidth={1} />
          <text x={projPos.x - 95} y={projPos.y - 16} textAnchor="middle" fill="#aaa" fontSize={10}>&#9998;</text>
        </g>
        <g style={{ cursor: 'pointer' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => {
          e.stopPropagation();
          setAddTaskModal(proj.id);
          setEditText('');
        }}>
          <circle cx={projPos.x + 95} cy={projPos.y + 20} r={9} fill="#333" stroke="#555" strokeWidth={1} />
          <text x={projPos.x + 95} y={projPos.y + 24} textAnchor="middle" fill="#aaa" fontSize={14}>+</text>
        </g>
      </g>
    );

    proj.tasks.forEach((task, ti) => {
      const defaultTaskPos = getTaskPos(projPos, ti, proj.tasks.length, pi, projects.length);
      const taskKey = `${proj.id}-${task.id}`;
      const taskPos = getNodePos(taskKey, defaultTaskPos);

      allLines.push(
        <path key={`line-${taskKey}`} d={curvedPath(projPos.x, projPos.y, taskPos.x, taskPos.y)}
          fill="none" stroke={proj.color} strokeWidth={2} opacity={0.5}
          strokeDasharray="4 3" />
      );

      const statusColor = STATUS_COLORS[task.status];
      allNodes.push(
        <g key={`task-${taskKey}`} style={{ cursor: 'grab' }}
           onMouseDown={(e) => { e.stopPropagation(); setDragging(taskKey); }}>
          <rect x={taskPos.x - 110} y={taskPos.y - 30} width={220} height={60} rx={12}
            fill="#12121c" stroke={task.status === 'done' ? '#10B981' : proj.color}
            strokeWidth={1.5} opacity={task.status === 'done' ? 0.5 : 0.9}
            style={{ filter: task.status === 'inprogress' ? `drop-shadow(0 0 10px ${proj.color}44)` : 'none' }} />
          <text x={taskPos.x} y={taskPos.y - 4} textAnchor="middle" fill={task.status === 'done' ? '#666' : '#ccc'}
            style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 13,
              textDecoration: task.status === 'done' ? 'line-through' : 'none',
            }}>
            {task.text}
          </text>
          <g style={{ cursor: 'pointer' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onCycleStatus(proj.id, task.id); }}>
            <rect x={taskPos.x - 100} y={taskPos.y + 6} width={80} height={22} rx={4} fill="transparent" />
            <circle cx={taskPos.x - 90} cy={taskPos.y + 18} r={6} fill={statusColor} />
            <text x={taskPos.x - 80} y={taskPos.y + 22} fill={statusColor}
              style={{ fontFamily: "'Space Mono', monospace", fontSize: 10 }}>
              {STATUS_LABELS[task.status]}
            </text>
          </g>
          <g style={{ cursor: 'pointer' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => {
            e.stopPropagation();
            setEditTaskModal({ projId: proj.id, task });
            setEditText(task.text);
          }}>
            <text x={taskPos.x + 80} y={taskPos.y + 22} fill="#666" fontSize={11}
              style={{ cursor: 'pointer' }}>&#9998;</text>
          </g>
          <g style={{ cursor: 'pointer' }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDeleteTask(proj.id, task.id); }}>
            <text x={taskPos.x + 95} y={taskPos.y + 22} fill="#666" fontSize={11}
              style={{ cursor: 'pointer' }}>&times;</text>
          </g>
        </g>
      );
    });
  });

  return (
    <div ref={containerRef} style={{
      width: '100%', flex: 1, position: 'relative', overflow: 'hidden',
      cursor: isPanning ? 'grabbing' : 'default',
    }}
    onMouseDown={handleMouseDown}
    onMouseMove={handleMouseMove}
    onMouseUp={handleMouseUp}
    onMouseLeave={handleMouseUp}>
      <button onClick={() => { setAddProjectModal(true); setEditText(''); setEditPriority('normal'); setEditColor('#FF6B6B'); }}
        style={{
          position: 'absolute', top: 12, right: 16, zIndex: 10,
          background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)', border: 'none',
          color: '#fff', padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700,
        }}>+ Projet</button>

      <svg width="100%" height="100%" style={{
        position: 'absolute', inset: 0,
      }}>
        <g transform={`translate(${transform.x + (containerRef.current?.clientWidth || window.innerWidth) / 2}, ${transform.y + (containerRef.current?.clientHeight || window.innerHeight) / 2}) scale(${transform.scale})`}>
          {allLines}
          {allNodes}
        </g>
      </svg>

      <Modal open={!!editTaskModal} onClose={() => setEditTaskModal(null)} title="Modifier la t\u00e2che">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 16,
          }}
          placeholder="Texte de la t\u00e2che" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => {
            if (editTaskModal && editText.trim()) {
              onEditTask(editTaskModal.projId, editTaskModal.task.id, editText.trim());
              setEditTaskModal(null);
            }
          }} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none',
            background: '#4ECDC4', color: '#000', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
          }}>Sauvegarder</button>
          <button onClick={() => setEditTaskModal(null)} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #333',
            background: 'transparent', color: '#888', cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
          }}>Annuler</button>
        </div>
      </Modal>

      <Modal open={!!addTaskModal} onClose={() => setAddTaskModal(null)} title="Ajouter une t\u00e2che">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 16,
          }}
          placeholder="Nom de la t\u00e2che"
          onKeyDown={e => {
            if (e.key === 'Enter' && editText.trim()) {
              onAddTask(addTaskModal, editText.trim());
              setAddTaskModal(null);
            }
          }} />
        <button onClick={() => {
          if (editText.trim()) {
            onAddTask(addTaskModal, editText.trim());
            setAddTaskModal(null);
          }
        }} style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none',
          background: '#4ECDC4', color: '#000', fontWeight: 600, cursor: 'pointer',
          fontFamily: "'Outfit', sans-serif",
        }}>Ajouter</button>
      </Modal>

      <Modal open={addProjectModal} onClose={() => setAddProjectModal(false)} title="Nouveau projet">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 12,
          }}
          placeholder="Nom du projet" />
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Priorit\u00e9</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => setEditPriority(k)} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${editPriority === k ? PRIORITY_COLORS[k] : '#333'}`,
                background: editPriority === k ? PRIORITY_COLORS[k] + '22' : 'transparent',
                color: editPriority === k ? PRIORITY_COLORS[k] : '#888', cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600,
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Couleur</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['#FF6B6B', '#4ECDC4', '#A78BFA', '#FFB347', '#FF79C6', '#50FA7B'].map(c => (
              <div key={c} onClick={() => setEditColor(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: editColor === c ? '3px solid #fff' : '3px solid transparent',
                transition: 'border 0.2s',
              }} />
            ))}
          </div>
        </div>
        <button onClick={() => {
          if (editText.trim()) {
            onAddProject(editText.trim(), editPriority, editColor);
            setAddProjectModal(false);
          }
        }} style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)', color: '#000', fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
        }}>Cr\u00e9er le projet</button>
      </Modal>

      <Modal open={!!editProjectModal} onClose={() => setEditProjectModal(null)} title="Modifier le projet">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 12,
          }}
          placeholder="Nom du projet" />
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Priorit\u00e9</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => setEditPriority(k)} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${editPriority === k ? PRIORITY_COLORS[k] : '#333'}`,
                background: editPriority === k ? PRIORITY_COLORS[k] + '22' : 'transparent',
                color: editPriority === k ? PRIORITY_COLORS[k] : '#888', cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600,
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Couleur</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['#FF6B6B', '#4ECDC4', '#A78BFA', '#FFB347', '#FF79C6', '#50FA7B'].map(c => (
              <div key={c} onClick={() => setEditColor(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: editColor === c ? '3px solid #fff' : '3px solid transparent',
                transition: 'border 0.2s',
              }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => {
            if (editProjectModal && editText.trim()) {
              onEditProject(editProjectModal.id, editText.trim(), editPriority, editColor);
              setEditProjectModal(null);
            }
          }} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none',
            background: '#4ECDC4', color: '#000', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
          }}>Sauvegarder</button>
          <button onClick={() => {
            if (editProjectModal) {
              onDeleteProject(editProjectModal.id);
              setEditProjectModal(null);
            }
          }} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #FF6B6B',
            background: 'transparent', color: '#FF6B6B', cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif", fontWeight: 600,
          }}>Supprimer</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── List View ──────────────────────────────────────────────────────────────
function ListView({ projects, onCycleStatus, onAddTask, onDeleteTask, onEditTask, onAddProject, onEditProject, onDeleteProject }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [addTaskModal, setAddTaskModal] = useState(null);
  const [editTaskModal, setEditTaskModal] = useState(null);
  const [addProjectModal, setAddProjectModal] = useState(false);
  const [editProjectModal, setEditProjectModal] = useState(null);
  const [editText, setEditText] = useState('');
  const [editPriority, setEditPriority] = useState('normal');
  const [editColor, setEditColor] = useState('#FF6B6B');

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const filtered = filter === 'all' ? projects : projects.filter(p => p.priority === filter);

  return (
    <div style={{
      width: '100%', flex: 1, overflowY: 'auto',
      padding: '24px 32px',
    }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'urgent', 'important', 'normal'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
            background: filter === f
              ? (f === 'all' ? 'linear-gradient(135deg, #4ECDC4, #A78BFA)' : PRIORITY_COLORS[f])
              : '#1a1a2e',
            color: filter === f ? '#000' : '#888',
            fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 600,
            transition: 'all 0.2s',
          }}>
            {f === 'all' ? 'Tous' : PRIORITY_LABELS[f]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => { setAddProjectModal(true); setEditText(''); setEditPriority('normal'); setEditColor('#FF6B6B'); }}
          style={{
            background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)', border: 'none',
            color: '#000', padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
            fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700,
          }}>+ Projet</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
        {filtered.map(proj => {
          const isExpanded = expanded[proj.id] !== false;
          const doneTasks = proj.tasks.filter(t => t.status === 'done').length;
          const progress = proj.tasks.length ? Math.round((doneTasks / proj.tasks.length) * 100) : 0;

          return (
            <div key={proj.id} style={{
              background: '#12121c', borderRadius: 16, border: `1px solid ${proj.color}33`,
              overflow: 'hidden', transition: 'all 0.3s',
              boxShadow: `0 4px 20px ${proj.color}11`,
            }}>
              <div style={{
                padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: isExpanded ? '1px solid #1a1a2e' : 'none',
                cursor: 'pointer',
              }} onClick={() => toggleExpand(proj.id)}>
                <span style={{ fontSize: 24 }}>{proj.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: "'Space Mono', monospace", fontWeight: 700, color: '#fff', fontSize: 15,
                    }}>{proj.name}</span>
                    <span style={{
                      padding: '2px 10px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                      background: PRIORITY_COLORS[proj.priority] + '22',
                      color: PRIORITY_COLORS[proj.priority],
                      fontFamily: "'Space Mono', monospace",
                    }}>{PRIORITY_LABELS[proj.priority]}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <div style={{
                      flex: 1, height: 4, borderRadius: 2, background: '#1a1a2e', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: `linear-gradient(90deg, ${proj.color}, ${proj.color}88)`,
                        width: `${progress}%`, transition: 'width 0.3s',
                      }} />
                    </div>
                    <span style={{
                      fontSize: 11, color: '#666', fontFamily: "'Space Mono', monospace",
                    }}>{doneTasks}/{proj.tasks.length}</span>
                  </div>
                </div>
                <button onClick={(e) => {
                  e.stopPropagation();
                  setEditProjectModal(proj);
                  setEditText(proj.name);
                  setEditPriority(proj.priority);
                  setEditColor(proj.color);
                }} style={{
                  background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16,
                }}>&#9998;</button>
                <span style={{
                  color: '#555', fontSize: 14, transition: 'transform 0.2s',
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                  display: 'inline-block',
                }}>{'\u25BC'}</span>
              </div>

              {isExpanded && (
                <div style={{ padding: '12px 20px 16px' }}>
                  {proj.tasks.map(task => (
                    <div key={task.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 8, marginBottom: 6, background: '#0d0d18',
                      border: '1px solid #1a1a2e', transition: 'all 0.2s',
                      opacity: task.status === 'done' ? 0.5 : 1,
                    }}>
                      <button onClick={() => onCycleStatus(proj.id, task.id)} style={{
                        width: 22, height: 22, borderRadius: '50%', border: `2px solid ${STATUS_COLORS[task.status]}`,
                        background: task.status === 'done' ? STATUS_COLORS[task.status] : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'all 0.2s',
                      }}>
                        {task.status === 'done' && <span style={{ color: '#000', fontSize: 12, lineHeight: 1 }}>&#10003;</span>}
                        {task.status === 'inprogress' && <div style={{
                          width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[task.status],
                        }} />}
                      </button>
                      <span style={{
                        flex: 1, fontFamily: "'Outfit', sans-serif", fontSize: 13,
                        color: task.status === 'done' ? '#555' : '#ccc',
                        textDecoration: task.status === 'done' ? 'line-through' : 'none',
                      }}>{task.text}</span>
                      <span style={{
                        fontSize: 10, color: STATUS_COLORS[task.status],
                        fontFamily: "'Space Mono', monospace", fontWeight: 600,
                      }}>{STATUS_LABELS[task.status]}</span>
                      <button onClick={() => { setEditTaskModal({ projId: proj.id, task }); setEditText(task.text); }}
                        style={{
                          background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13,
                        }}>&#9998;</button>
                      <button onClick={() => onDeleteTask(proj.id, task.id)}
                        style={{
                          background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 16,
                        }}>&times;</button>
                    </div>
                  ))}
                  <button onClick={() => { setAddTaskModal(proj.id); setEditText(''); }}
                    style={{
                      width: '100%', padding: '8px', borderRadius: 8, border: '1px dashed #333',
                      background: 'transparent', color: '#555', cursor: 'pointer', marginTop: 4,
                      fontFamily: "'Outfit', sans-serif", fontSize: 12, transition: 'all 0.2s',
                    }}>+ Ajouter une t\u00e2che</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={!!addTaskModal} onClose={() => setAddTaskModal(null)} title="Ajouter une t\u00e2che">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 16,
          }}
          placeholder="Nom de la t\u00e2che"
          onKeyDown={e => {
            if (e.key === 'Enter' && editText.trim()) {
              onAddTask(addTaskModal, editText.trim());
              setAddTaskModal(null);
            }
          }} />
        <button onClick={() => {
          if (editText.trim()) {
            onAddTask(addTaskModal, editText.trim());
            setAddTaskModal(null);
          }
        }} style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none',
          background: '#4ECDC4', color: '#000', fontWeight: 600, cursor: 'pointer',
          fontFamily: "'Outfit', sans-serif",
        }}>Ajouter</button>
      </Modal>

      <Modal open={!!editTaskModal} onClose={() => setEditTaskModal(null)} title="Modifier la t\u00e2che">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 16,
          }}
          placeholder="Texte de la t\u00e2che" />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => {
            if (editTaskModal && editText.trim()) {
              onEditTask(editTaskModal.projId, editTaskModal.task.id, editText.trim());
              setEditTaskModal(null);
            }
          }} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none',
            background: '#4ECDC4', color: '#000', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
          }}>Sauvegarder</button>
          <button onClick={() => setEditTaskModal(null)} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #333',
            background: 'transparent', color: '#888', cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
          }}>Annuler</button>
        </div>
      </Modal>

      <Modal open={addProjectModal} onClose={() => setAddProjectModal(false)} title="Nouveau projet">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 12,
          }}
          placeholder="Nom du projet" />
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Priorit\u00e9</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => setEditPriority(k)} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${editPriority === k ? PRIORITY_COLORS[k] : '#333'}`,
                background: editPriority === k ? PRIORITY_COLORS[k] + '22' : 'transparent',
                color: editPriority === k ? PRIORITY_COLORS[k] : '#888', cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600,
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Couleur</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['#FF6B6B', '#4ECDC4', '#A78BFA', '#FFB347', '#FF79C6', '#50FA7B'].map(c => (
              <div key={c} onClick={() => setEditColor(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: editColor === c ? '3px solid #fff' : '3px solid transparent',
              }} />
            ))}
          </div>
        </div>
        <button onClick={() => {
          if (editText.trim()) {
            onAddProject(editText.trim(), editPriority, editColor);
            setAddProjectModal(false);
          }
        }} style={{
          width: '100%', padding: '10px', borderRadius: 8, border: 'none',
          background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)', color: '#000', fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
        }}>Cr\u00e9er le projet</button>
      </Modal>

      <Modal open={!!editProjectModal} onClose={() => setEditProjectModal(null)} title="Modifier le projet">
        <input value={editText} onChange={e => setEditText(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
            background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
            outline: 'none', marginBottom: 12,
          }}
          placeholder="Nom du projet" />
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Priorit\u00e9</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => setEditPriority(k)} style={{
                flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${editPriority === k ? PRIORITY_COLORS[k] : '#333'}`,
                background: editPriority === k ? PRIORITY_COLORS[k] + '22' : 'transparent',
                color: editPriority === k ? PRIORITY_COLORS[k] : '#888', cursor: 'pointer',
                fontFamily: "'Outfit', sans-serif", fontSize: 12, fontWeight: 600,
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>Couleur</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['#FF6B6B', '#4ECDC4', '#A78BFA', '#FFB347', '#FF79C6', '#50FA7B'].map(c => (
              <div key={c} onClick={() => setEditColor(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: editColor === c ? '3px solid #fff' : '3px solid transparent',
              }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => {
            if (editProjectModal && editText.trim()) {
              onEditProject(editProjectModal.id, editText.trim(), editPriority, editColor);
              setEditProjectModal(null);
            }
          }} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: 'none',
            background: '#4ECDC4', color: '#000', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif",
          }}>Sauvegarder</button>
          <button onClick={() => {
            if (editProjectModal) {
              onDeleteProject(editProjectModal.id);
              setEditProjectModal(null);
            }
          }} style={{
            flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #FF6B6B',
            background: 'transparent', color: '#FF6B6B', cursor: 'pointer',
            fontFamily: "'Outfit', sans-serif", fontWeight: 600,
          }}>Supprimer</button>
        </div>
      </Modal>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState('mindmap');
  const [projects, setProjects] = useState(loadLocalData);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const isRemoteUpdate = useRef(false);
  const saveTimeout = useRef(null);

  // Check auth state on mount + listen for changes
  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
      })
      .catch(() => {
        // Supabase unreachable — continue without auth
      })
      .finally(() => setAuthChecked(true));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load data from Supabase once authenticated
  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    loadFromSupabase()
      .then(data => {
        setProjects(data);
        saveLocalData(data);
      })
      .catch(() => {
        // Supabase failed — use localStorage (already loaded)
      })
      .finally(() => setLoading(false));
  }, [session]);

  // Subscribe to Realtime changes for live sync
  useEffect(() => {
    const channel = supabase
      .channel('app_state_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (payload) => {
        if (payload.new && payload.new.state) {
          isRemoteUpdate.current = true;
          setProjects(payload.new.state);
          saveLocalData(payload.new.state);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Save to Supabase (debounced) + localStorage on every change
  useEffect(() => {
    saveLocalData(projects);

    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }

    if (loading) return;

    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      saveToSupabase(projects).catch(() => {
        // Supabase save failed — data is still in localStorage
      });
    }, 500);
  }, [projects, loading]);

  const cycleStatus = useCallback((projId, taskId) => {
    setProjects(prev => prev.map(p => p.id === projId ? {
      ...p,
      tasks: p.tasks.map(t => t.id === taskId ? {
        ...t,
        status: STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status) + 1) % STATUS_CYCLE.length],
      } : t),
    } : p));
  }, []);

  const addTask = useCallback((projId, text) => {
    setProjects(prev => prev.map(p => p.id === projId ? {
      ...p,
      tasks: [...p.tasks, { id: genId(), text, status: 'todo' }],
    } : p));
  }, []);

  const deleteTask = useCallback((projId, taskId) => {
    setProjects(prev => prev.map(p => p.id === projId ? {
      ...p,
      tasks: p.tasks.filter(t => t.id !== taskId),
    } : p));
  }, []);

  const editTask = useCallback((projId, taskId, text) => {
    setProjects(prev => prev.map(p => p.id === projId ? {
      ...p,
      tasks: p.tasks.map(t => t.id === taskId ? { ...t, text } : t),
    } : p));
  }, []);

  const addProject = useCallback((name, priority, color) => {
    const emojis = ['\u{1F3AF}', '\u{1F4A1}', '\u{1F527}', '\u{1F4E6}', '\u{1F31F}', '\u26A1', '\u{1F3A8}', '\u{1F52C}'];
    setProjects(prev => [...prev, {
      id: genId(),
      name,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
      priority,
      color,
      tasks: [],
    }]);
  }, []);

  const editProject = useCallback((projId, name, priority, color) => {
    setProjects(prev => prev.map(p => p.id === projId ? { ...p, name, priority, color } : p));
  }, []);

  const deleteProject = useCallback((projId) => {
    setProjects(prev => prev.filter(p => p.id !== projId));
  }, []);

  const handlers = {
    onCycleStatus: cycleStatus,
    onAddTask: addTask,
    onDeleteTask: deleteTask,
    onEditTask: editTask,
    onAddProject: addProject,
    onEditProject: editProject,
    onDeleteProject: deleteProject,
  };

  const totalTasks = projects.reduce((a, p) => a + p.tasks.length, 0);
  const doneTasks = projects.reduce((a, p) => a + p.tasks.filter(t => t.status === 'done').length, 0);
  const inProgressTasks = projects.reduce((a, p) => a + p.tasks.filter(t => t.status === 'inprogress').length, 0);

  // Auth check: show login if not authenticated
  if (!authChecked || (!session && loading)) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0A0A0F', flexDirection: 'column', gap: 20,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 18, color: '#000',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>FX</div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.95); } }`}</style>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0A0A0F', flexDirection: 'column', gap: 20,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 18, color: '#000',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>FX</div>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, color: '#666' }}>
          Chargement...
        </span>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.95); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        borderBottom: '1px solid #1a1a2e', flexShrink: 0,
        background: 'linear-gradient(180deg, #0d0d18, #0A0A0F)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 24px', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 14, color: '#000',
            }}>FX</div>
            <span style={{
              fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: 18, color: '#fff',
            }}>FXSCALE</span>
            <span style={{
              fontFamily: "'Space Mono', monospace", fontSize: 13, color: '#A78BFA',
            }}>Mindmap</span>
          </div>

          <div style={{
            display: 'flex', background: '#1a1a2e', borderRadius: 10, padding: 4,
          }}>
            <button onClick={() => setView('mindmap')} style={{
              padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 600,
              background: view === 'mindmap' ? 'linear-gradient(135deg, #4ECDC4, #A78BFA)' : 'transparent',
              color: view === 'mindmap' ? '#000' : '#666',
              transition: 'all 0.2s',
            }}>{'🧠'} Mindmap</button>
            <button onClick={() => setView('list')} style={{
              padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 600,
              background: view === 'list' ? 'linear-gradient(135deg, #4ECDC4, #A78BFA)' : 'transparent',
              color: view === 'list' ? '#000' : '#666',
              transition: 'all 0.2s',
            }}>{'📋'} Liste</button>
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              background: 'rgba(78, 205, 196, 0.1)', border: '1px solid rgba(78, 205, 196, 0.3)',
              borderRadius: 12, padding: '6px 16px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: '#4ECDC4', lineHeight: 1.2 }}>
                {projects.length}
              </div>
              <div style={{ fontSize: 12, color: '#4ECDC4', fontFamily: "'Outfit', sans-serif", opacity: 0.8 }}>Projets</div>
            </div>
            <div style={{
              background: 'rgba(167, 139, 250, 0.1)', border: '1px solid rgba(167, 139, 250, 0.3)',
              borderRadius: 12, padding: '6px 16px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: '#A78BFA', lineHeight: 1.2 }}>
                {totalTasks}
              </div>
              <div style={{ fontSize: 12, color: '#A78BFA', fontFamily: "'Outfit', sans-serif", opacity: 0.8 }}>Tâches</div>
            </div>
            <div style={{
              background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 12, padding: '6px 16px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: '#F59E0B', lineHeight: 1.2 }}>
                {inProgressTasks}
              </div>
              <div style={{ fontSize: 12, color: '#F59E0B', fontFamily: "'Outfit', sans-serif", opacity: 0.8 }}>En cours</div>
            </div>
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 12, padding: '6px 16px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 24, fontWeight: 700, color: '#10B981', lineHeight: 1.2 }}>
                {doneTasks}/{totalTasks}
              </div>
              <div style={{ fontSize: 12, color: '#10B981', fontFamily: "'Outfit', sans-serif", opacity: 0.8 }}>Complétés</div>
            </div>
            <button onClick={() => supabase.auth.signOut()} style={{
              background: 'none', border: '1px solid #333', borderRadius: 8,
              color: '#666', padding: '6px 14px', cursor: 'pointer',
              fontFamily: "'Space Mono', monospace", fontSize: 11,
              transition: 'all 0.2s',
            }}>Deconnexion</button>
          </div>
        </div>

        <div style={{ padding: '0 24px 10px' }}>
          <div style={{
            width: '100%', height: 6, borderRadius: 3, background: '#1a1a2e', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, #4ECDC4, #A78BFA)',
              width: `${totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%`,
              transition: 'width 0.3s',
              boxShadow: '0 0 10px rgba(78, 205, 196, 0.4)',
            }} />
          </div>
        </div>
      </div>

      {view === 'mindmap' ? <MindmapView projects={projects} {...handlers} /> : <ListView projects={projects} {...handlers} />}
    </div>
  );
}
