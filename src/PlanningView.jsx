import { useState, useCallback, useEffect, useMemo } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────
const STATUS_CYCLE = ['todo', 'inprogress', 'done'];
const STATUS_LABELS = { todo: 'À faire', inprogress: 'En cours', done: 'Fait' };
const STATUS_COLORS = { todo: '#6B7280', inprogress: '#F59E0B', done: '#10B981' };
const PRIORITY_COLORS = { urgent: '#FF6B6B', important: '#FFB347', normal: '#10B981' };

const SLOTS = [
  { id: '8h-10h', label: '8h - 10h', start: 8 },
  { id: '10h-12h', label: '10h - 12h', start: 10 },
  { id: '12h-14h', label: '12h - 14h', start: 12 },
  { id: '14h-16h', label: '14h - 16h', start: 14 },
  { id: '16h-18h', label: '16h - 18h', start: 16 },
  { id: '18h-20h', label: '18h - 20h', start: 18 },
  { id: '20h-22h', label: '20h - 22h', start: 20 },
];

const DURATION_OPTIONS = [
  { value: 0.5, label: '30min' },
  { value: 1, label: '1h' },
  { value: 2, label: '2h' },
  { value: 4, label: '4h' },
];

const RECURRENCE_OPTIONS = [
  { value: null, label: 'Aucune' },
  { value: 'daily', label: 'Tous les jours' },
  { value: 'weekly', label: 'Chaque semaine' },
  { value: 'weekdays', label: 'Jours ouvrés (lun-ven)' },
  { value: 'monday', label: 'Chaque lundi' },
  { value: 'tuesday', label: 'Chaque mardi' },
  { value: 'wednesday', label: 'Chaque mercredi' },
  { value: 'thursday', label: 'Chaque jeudi' },
  { value: 'friday', label: 'Chaque vendredi' },
];

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

// ─── Date utilities ─────────────────────────────────────────────────────────
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShort(date) {
  return `${DAY_NAMES[date.getDay()]} ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatLong(date) {
  const jours = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return `${jours[date.getDay()]} ${date.getDate()} ${mois[date.getMonth()]}`;
}

function isToday(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function isPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

let planIdCounter = Date.now() + 100000;
function genPlanId() { return 'plan_' + (planIdCounter++); }

// ─── Recurrence matching ────────────────────────────────────────────────────
function matchesRecurrence(assignment, dateStr) {
  if (!assignment.recurrence) return false;
  const date = new Date(dateStr + 'T00:00:00');
  const baseDate = new Date(assignment.day + 'T00:00:00');
  if (date < baseDate) return false;
  if (dateStr === assignment.day) return false;
  if (assignment.exceptions && assignment.exceptions.includes(dateStr)) return false;

  const dayOfWeek = date.getDay();
  switch (assignment.recurrence) {
    case 'daily': return true;
    case 'weekly': return dayOfWeek === baseDate.getDay();
    case 'weekdays': return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'monday': return dayOfWeek === 1;
    case 'tuesday': return dayOfWeek === 2;
    case 'wednesday': return dayOfWeek === 3;
    case 'thursday': return dayOfWeek === 4;
    case 'friday': return dayOfWeek === 5;
    case 'saturday': return dayOfWeek === 6;
    case 'sunday': return dayOfWeek === 0;
    default: return false;
  }
}

// ─── Task info lookup ───────────────────────────────────────────────────────
function getTaskInfo(projects, taskId, projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return null;
  const task = project.tasks.find(t => t.id === taskId);
  if (!task) return null;
  return { ...task, project };
}

// ─── Modal ──────────────────────────────────────────────────────────────────
function PlanModal({ open, onClose, title, children }) {
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
        maxHeight: '80vh', overflowY: 'auto',
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

// ─── Task Card (in planning grid) ───────────────────────────────────────────
function TaskCard({ assignment, taskInfo, isVirtual, slotHeight, onCycleStatus, onRemove, onDurationChange, onRecurrence, onPostpone }) {
  if (!taskInfo) return null;
  const { project } = taskInfo;
  const isDone = taskInfo.status === 'done';
  const heightRatio = assignment.duration / 2;
  const cardHeight = Math.max(slotHeight * heightRatio - 4, 28);

  return (
    <div
      draggable={!isVirtual}
      onDragStart={e => {
        if (isVirtual) { e.preventDefault(); return; }
        e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'move', assignmentId: assignment.id }));
        e.dataTransfer.effectAllowed = 'all';
      }}
      style={{
        background: isDone ? 'rgba(16, 185, 129, 0.1)' : `${project.color}15`,
        border: `1px solid ${isDone ? 'rgba(16, 185, 129, 0.3)' : project.color + '44'}`,
        borderRadius: 8, padding: '6px 8px', marginBottom: 2,
        opacity: isDone ? 0.5 : 1, cursor: 'pointer',
        height: cardHeight, overflow: 'hidden',
        position: 'relative', transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <div
          onClick={e => { e.stopPropagation(); onCycleStatus(project.id, taskInfo.id); }}
          style={{
            width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${STATUS_COLORS[taskInfo.status]}`,
            background: isDone ? STATUS_COLORS.done : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isDone && <span style={{ color: '#000', fontSize: 8, lineHeight: 1 }}>&#10003;</span>}
        </div>
        <span style={{
          flex: 1, fontSize: 11, fontFamily: "'Outfit', sans-serif",
          color: isDone ? '#555' : '#ccc',
          textDecoration: isDone ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{taskInfo.text}</span>
        {assignment.recurrence && <span style={{ fontSize: 10 }} title="Récurrent">🔄</span>}
        {!isVirtual && (
          <span onClick={e => { e.stopPropagation(); onRemove(assignment.id); }}
            style={{ color: '#555', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>&times;</span>
        )}
      </div>
      {cardHeight > 36 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 4,
            background: project.color + '22', color: project.color,
            fontFamily: "'Space Mono', monospace", fontWeight: 600,
          }}>{project.emoji} {project.name}</span>
          <span onClick={e => { e.stopPropagation(); onDurationChange(assignment); }}
            style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', color: '#888',
              cursor: 'pointer', fontFamily: "'Space Mono', monospace",
            }}>{assignment.duration}h</span>
          {!isVirtual && (
            <span onClick={e => { e.stopPropagation(); onRecurrence(assignment); }}
              style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(255,255,255,0.05)', color: '#888',
                cursor: 'pointer',
              }}>🔄</span>
          )}
          {isVirtual && (
            <span onClick={e => { e.stopPropagation(); onRemove(assignment.id, true); }}
              style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(255,100,100,0.1)', color: '#FF6B6B',
                cursor: 'pointer',
              }}>Suppr. occurrence</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main PlanningView ──────────────────────────────────────────────────────
export default function PlanningView({ projects, planningData, setPlanningData, onCycleStatus, onAddTask }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showBriefing, setShowBriefing] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [filterProject, setFilterProject] = useState('all');
  const [slotModal, setSlotModal] = useState(null);
  const [recurrenceModal, setRecurrenceModal] = useState(null);
  const [postponeModal, setPostponeModal] = useState(null);
  const [splitModal, setSplitModal] = useState(null);
  const [splitTexts, setSplitTexts] = useState(['', '', '']);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskProject, setNewTaskProject] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(2);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [mobileDay, setMobileDay] = useState(0);
  const [overdueBanner, setOverdueBanner] = useState(true);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ─── Computed values ────────────────────────────────────────────────────
  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => getMonday(addDays(today, weekOffset * 7)), [weekOffset, today]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const todayStr = formatISO(today);
  const weekStartStr = formatISO(weekStart);
  const weekEndStr = formatISO(addDays(weekStart, 6));

  // Get all assignments for a given day+slot (direct + recurring)
  const getAssignmentsForDaySlot = useCallback((dayStr, slotId) => {
    const result = [];
    for (const a of planningData) {
      if (a.day === dayStr && a.slot === slotId) {
        result.push({ ...a, isVirtual: false });
      } else if (a.slot === slotId && matchesRecurrence(a, dayStr)) {
        result.push({ ...a, isVirtual: true, virtualDay: dayStr });
      }
    }
    return result;
  }, [planningData]);

  // Get all assignments for a given day
  const getAssignmentsForDay = useCallback((dayStr) => {
    const result = [];
    for (const a of planningData) {
      if (a.day === dayStr) {
        result.push({ ...a, isVirtual: false });
      } else if (matchesRecurrence(a, dayStr)) {
        result.push({ ...a, isVirtual: true, virtualDay: dayStr });
      }
    }
    return result;
  }, [planningData]);

  // Total hours planned for a day
  const getDayLoad = useCallback((dayStr) => {
    const assignments = getAssignmentsForDay(dayStr);
    return assignments.reduce((sum, a) => sum + a.duration, 0);
  }, [getAssignmentsForDay]);

  // Unplanned tasks (no assignment at all)
  const assignedTaskIds = useMemo(() => {
    const ids = new Set();
    planningData.forEach(a => ids.add(a.taskId));
    return ids;
  }, [planningData]);

  const unplannedTasks = useMemo(() => {
    const tasks = [];
    projects.forEach(proj => {
      proj.tasks.forEach(task => {
        if (!assignedTaskIds.has(task.id) && task.status !== 'done') {
          tasks.push({ ...task, project: proj });
        }
      });
    });
    if (filterProject !== 'all') {
      return tasks.filter(t => t.project.id === filterProject);
    }
    return tasks;
  }, [projects, assignedTaskIds, filterProject]);

  // Overdue assignments (past days, task not done)
  const overdueAssignments = useMemo(() => {
    const result = [];
    planningData.forEach(a => {
      if (isPast(a.day)) {
        const info = getTaskInfo(projects, a.taskId, a.projectId);
        if (info && info.status !== 'done') {
          result.push({ ...a, taskInfo: info });
        }
      }
    });
    return result;
  }, [planningData, projects]);

  // Today's assignments sorted by slot
  const todayAssignments = useMemo(() => {
    const assignments = getAssignmentsForDay(todayStr);
    return assignments
      .map(a => ({ ...a, taskInfo: getTaskInfo(projects, a.taskId, a.projectId) }))
      .filter(a => a.taskInfo)
      .sort((a, b) => {
        const slotA = SLOTS.find(s => s.id === a.slot);
        const slotB = SLOTS.find(s => s.id === b.slot);
        return (slotA?.start || 0) - (slotB?.start || 0);
      });
  }, [getAssignmentsForDay, todayStr, projects]);

  const todayPlannedHours = useMemo(() => todayAssignments.reduce((s, a) => s + a.duration, 0), [todayAssignments]);

  // Current time slot
  const currentHour = new Date().getHours();
  const currentSlot = SLOTS.find(s => currentHour >= s.start && currentHour < s.start + 2);

  // ─── Handlers ───────────────────────────────────────────────────────────
  const assignTask = useCallback((taskId, projectId, day, slot, duration = 2) => {
    setPlanningData(prev => [...prev, {
      id: genPlanId(), taskId, projectId, day, slot,
      duration, recurrence: null, postponeCount: 0, exceptions: [],
    }]);
  }, [setPlanningData]);

  const removeAssignment = useCallback((assignmentId, isVirtualDay) => {
    if (isVirtualDay) {
      // Add exception to skip this occurrence
      setPlanningData(prev => prev.map(a => a.id === assignmentId
        ? { ...a, exceptions: [...(a.exceptions || []), isVirtualDay] }
        : a
      ));
    } else {
      setPlanningData(prev => prev.filter(a => a.id !== assignmentId));
    }
  }, [setPlanningData]);

  const moveAssignment = useCallback((assignmentId, newDay, newSlot) => {
    setPlanningData(prev => prev.map(a => a.id === assignmentId
      ? { ...a, day: newDay, slot: newSlot }
      : a
    ));
  }, [setPlanningData]);

  const updateDuration = useCallback((assignmentId, duration) => {
    setPlanningData(prev => prev.map(a => a.id === assignmentId ? { ...a, duration } : a));
  }, [setPlanningData]);

  const setRecurrence = useCallback((assignmentId, recurrence) => {
    setPlanningData(prev => prev.map(a => a.id === assignmentId ? { ...a, recurrence } : a));
  }, [setPlanningData]);

  const postponeAssignment = useCallback((assignmentId, newDay) => {
    setPlanningData(prev => prev.map(a => a.id === assignmentId
      ? { ...a, day: newDay, postponeCount: (a.postponeCount || 0) + 1 }
      : a
    ));
  }, [setPlanningData]);

  const cycleDuration = useCallback((assignment) => {
    const idx = DURATION_OPTIONS.findIndex(d => d.value === assignment.duration);
    const next = DURATION_OPTIONS[(idx + 1) % DURATION_OPTIONS.length];
    updateDuration(assignment.id, next.value);
  }, [updateDuration]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e, dayStr, slotId) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type === 'assign') {
        assignTask(data.taskId, data.projectId, dayStr, slotId, 2);
      } else if (data.type === 'move') {
        moveAssignment(data.assignmentId, dayStr, slotId);
      }
    } catch (err) { /* ignore */ }
  }, [assignTask, moveAssignment]);

  // Slot click → assign modal
  const handleSlotClick = useCallback((dayStr, slotId) => {
    setSlotModal({ day: dayStr, slot: slotId });
    setNewTaskText('');
    setNewTaskProject(projects[0]?.id || '');
    setNewTaskDuration(2);
  }, [projects]);

  // Assign existing task from modal
  const handleAssignFromModal = useCallback((taskId, projectId) => {
    if (slotModal) {
      assignTask(taskId, projectId, slotModal.day, slotModal.slot, newTaskDuration);
      setSlotModal(null);
    }
  }, [slotModal, assignTask, newTaskDuration]);

  // Create new task and assign from modal
  const handleCreateAndAssign = useCallback(() => {
    if (slotModal && newTaskText.trim() && newTaskProject) {
      const taskId = onAddTask(newTaskProject, newTaskText.trim());
      if (taskId) {
        assignTask(taskId, newTaskProject, slotModal.day, slotModal.slot, newTaskDuration);
      }
      setSlotModal(null);
    }
  }, [slotModal, newTaskText, newTaskProject, newTaskDuration, onAddTask, assignTask]);

  // Split task handler
  const handleSplitTask = useCallback((assignment) => {
    const texts = splitTexts.filter(t => t.trim());
    if (texts.length === 0) return;
    texts.forEach(text => {
      const taskId = onAddTask(assignment.projectId, text.trim());
      if (taskId) {
        // Don't auto-assign, let user plan them
      }
    });
    // Remove the original assignment
    removeAssignment(assignment.id);
    setSplitModal(null);
    setSplitTexts(['', '', '']);
  }, [splitTexts, onAddTask, removeAssignment]);

  // ─── Load bar color ─────────────────────────────────────────────────────
  const getLoadColor = (hours) => {
    if (hours <= 8) return '#10B981';
    if (hours <= 12) return '#F59E0B';
    return '#FF6B6B';
  };

  // ─── Slot height ────────────────────────────────────────────────────────
  const SLOT_HEIGHT = 90;

  // ─── Render helpers ─────────────────────────────────────────────────────
  const renderTaskCard = (assignment, dayStr) => {
    const info = getTaskInfo(projects, assignment.taskId, assignment.projectId);
    if (!info) return null;
    return (
      <TaskCard
        key={`${assignment.id}-${dayStr}`}
        assignment={assignment}
        taskInfo={info}
        isVirtual={assignment.isVirtual}
        slotHeight={SLOT_HEIGHT}
        onCycleStatus={onCycleStatus}
        onRemove={(id, isVirtual) => removeAssignment(id, isVirtual ? dayStr : false)}
        onDurationChange={cycleDuration}
        onRecurrence={(a) => setRecurrenceModal(a)}
        onPostpone={(a) => setPostponeModal(a)}
      />
    );
  };

  const visibleDays = isMobile ? [weekDays[mobileDay]] : weekDays;

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Overdue Banner ────────────────────────────────────────────────── */}
      {overdueAssignments.length > 0 && overdueBanner && (
        <div style={{
          background: 'rgba(255, 60, 60, 0.1)', border: '1px solid rgba(255, 60, 60, 0.3)',
          borderRadius: 12, margin: '12px 16px 0', padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <span style={{ flex: 1, fontFamily: "'Outfit', sans-serif", color: '#FF6B6B', fontSize: 14, fontWeight: 600 }}>
            Tu as {overdueAssignments.length} tâche{overdueAssignments.length > 1 ? 's' : ''} en retard
          </span>
          <button onClick={() => {
            setPostponeModal(overdueAssignments[0]);
          }} style={{
            background: '#FF6B6B', border: 'none', borderRadius: 8, padding: '6px 14px',
            color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: "'Outfit', sans-serif",
          }}>Voir & reporter</button>
          <button onClick={() => setOverdueBanner(false)} style={{
            background: 'none', border: 'none', color: '#FF6B6B', cursor: 'pointer', fontSize: 18,
          }}>&times;</button>
        </div>
      )}

      {/* ── Daily Briefing ────────────────────────────────────────────────── */}
      <div style={{
        margin: '12px 16px 0', borderRadius: 12, overflow: 'hidden',
        border: '1px solid rgba(78, 205, 196, 0.2)',
      }}>
        <div
          onClick={() => setShowBriefing(!showBriefing)}
          style={{
            background: 'rgba(78, 205, 196, 0.05)', padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 18 }}>📅</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700, color: '#4ECDC4' }}>
            Aujourd&apos;hui — {formatLong(today)}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 10,
            background: 'rgba(167, 139, 250, 0.15)', color: '#A78BFA',
            fontFamily: "'Space Mono', monospace", fontWeight: 600,
          }}>{todayPlannedHours}h planifiées sur 14h</span>
          <div style={{ flex: 1 }} />
          <span style={{
            color: '#4ECDC4', fontSize: 12, transition: 'transform 0.2s',
            transform: showBriefing ? 'rotate(180deg)' : 'rotate(0)', display: 'inline-block',
          }}>▼</span>
        </div>

        {showBriefing && (
          <div style={{ padding: '10px 16px 14px', background: 'rgba(0,0,0,0.2)' }}>
            {/* Overdue tasks first */}
            {overdueAssignments.map(a => (
              <div key={`overdue-${a.id}`} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                borderRadius: 8, marginBottom: 4, background: 'rgba(255, 60, 60, 0.08)',
                border: '1px solid rgba(255, 60, 60, 0.2)',
              }}>
                <span style={{ fontSize: 12 }}>⚠️</span>
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 4,
                  background: '#FF6B6B22', color: '#FF6B6B',
                  fontFamily: "'Space Mono', monospace", fontWeight: 700,
                }}>En retard</span>
                <span style={{ flex: 1, fontSize: 13, color: '#FF6B6B', fontFamily: "'Outfit', sans-serif" }}>
                  {a.taskInfo?.text || '?'}
                </span>
                <span style={{
                  fontSize: 10, color: '#888', fontFamily: "'Space Mono', monospace",
                }}>{a.slot}</span>
                <button onClick={() => setPostponeModal(a)} style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid #333', borderRadius: 6,
                  color: '#ccc', padding: '3px 8px', fontSize: 10, cursor: 'pointer',
                  fontFamily: "'Outfit', sans-serif",
                }}>Reporter</button>
              </div>
            ))}

            {/* Today's tasks */}
            {todayAssignments.length === 0 && overdueAssignments.length === 0 && (
              <div style={{ color: '#555', fontSize: 13, fontFamily: "'Outfit', sans-serif", textAlign: 'center', padding: 12 }}>
                Aucune tâche planifiée aujourd&apos;hui
              </div>
            )}
            {todayAssignments.map(a => {
              const { taskInfo } = a;
              if (!taskInfo) return null;
              return (
                <div key={`today-${a.id}-${a.slot}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                  borderRadius: 8, marginBottom: 4, background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  opacity: taskInfo.status === 'done' ? 0.5 : 1,
                }}>
                  <div
                    onClick={() => onCycleStatus(taskInfo.project.id, taskInfo.id)}
                    style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${STATUS_COLORS[taskInfo.status]}`,
                      background: taskInfo.status === 'done' ? STATUS_COLORS.done : 'transparent',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {taskInfo.status === 'done' && <span style={{ color: '#000', fontSize: 10 }}>&#10003;</span>}
                  </div>
                  <span style={{
                    flex: 1, fontSize: 14, fontFamily: "'Outfit', sans-serif",
                    color: taskInfo.status === 'done' ? '#555' : '#eee', fontWeight: 500,
                    textDecoration: taskInfo.status === 'done' ? 'line-through' : 'none',
                  }}>{taskInfo.text}</span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 6,
                    background: taskInfo.project.color + '22', color: taskInfo.project.color,
                    fontFamily: "'Space Mono', monospace", fontWeight: 600,
                  }}>{taskInfo.project.emoji} {taskInfo.project.name}</span>
                  <span style={{
                    fontSize: 10, color: '#888', fontFamily: "'Space Mono', monospace",
                  }}>{a.slot} ({a.duration}h)</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Week Navigation ───────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
      }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{
          background: '#1a1a2e', border: '1px solid #333', borderRadius: 8,
          color: '#ccc', padding: '6px 14px', cursor: 'pointer',
          fontFamily: "'Space Mono', monospace", fontSize: 12,
        }}>← Sem. préc.</button>
        <button onClick={() => setWeekOffset(0)} style={{
          background: weekOffset === 0 ? 'linear-gradient(135deg, #4ECDC4, #A78BFA)' : '#1a1a2e',
          border: weekOffset === 0 ? 'none' : '1px solid #333', borderRadius: 8,
          color: weekOffset === 0 ? '#000' : '#ccc', padding: '6px 14px', cursor: 'pointer',
          fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 600,
        }}>Aujourd&apos;hui</button>
        <button onClick={() => setWeekOffset(w => w + 1)} style={{
          background: '#1a1a2e', border: '1px solid #333', borderRadius: 8,
          color: '#ccc', padding: '6px 14px', cursor: 'pointer',
          fontFamily: "'Space Mono', monospace", fontSize: 12,
        }}>Sem. suiv. →</button>
        <span style={{
          fontFamily: "'Space Mono', monospace", fontSize: 13, color: '#888', marginLeft: 8,
        }}>
          Semaine du {weekDays[0].getDate().toString().padStart(2, '0')}/{(weekDays[0].getMonth() + 1).toString().padStart(2, '0')} au {weekDays[6].getDate().toString().padStart(2, '0')}/{(weekDays[6].getMonth() + 1).toString().padStart(2, '0')}
        </span>
        <div style={{ flex: 1 }} />
        {isMobile && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setMobileDay(d => Math.max(0, d - 1))} style={{
              background: '#1a1a2e', border: '1px solid #333', borderRadius: 6,
              color: '#ccc', padding: '4px 10px', cursor: 'pointer', fontSize: 12,
            }}>←</button>
            <button onClick={() => setMobileDay(d => Math.min(6, d + 1))} style={{
              background: '#1a1a2e', border: '1px solid #333', borderRadius: 6,
              color: '#ccc', padding: '4px 10px', cursor: 'pointer', fontSize: 12,
            }}>→</button>
          </div>
        )}
        <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
          background: sidebarOpen ? 'rgba(167, 139, 250, 0.15)' : '#1a1a2e',
          border: sidebarOpen ? '1px solid rgba(167, 139, 250, 0.3)' : '1px solid #333',
          borderRadius: 8, color: sidebarOpen ? '#A78BFA' : '#888',
          padding: '6px 12px', cursor: 'pointer', fontSize: 12,
          fontFamily: "'Outfit', sans-serif",
        }}>
          {sidebarOpen ? '◀ Tâches' : '▶ Tâches'}
        </button>
      </div>

      {/* ── Main Area: Sidebar + Grid ─────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 16px 16px' }}>

        {/* ── Sidebar: Unplanned tasks ──────────────────────────────────── */}
        {sidebarOpen && (
          <div style={{
            width: isMobile ? '100%' : 240, flexShrink: 0,
            background: '#12121c', borderRadius: 12, marginRight: isMobile ? 0 : 12,
            border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            ...(isMobile ? { position: 'absolute', zIndex: 50, left: 16, right: 16, top: 'auto', maxHeight: '50vh' } : {}),
          }}>
            <div style={{ padding: '12px 12px 8px' }}>
              <div style={{
                fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700,
                color: '#A78BFA', marginBottom: 8,
              }}>Tâches non planifiées</div>
              <select
                value={filterProject}
                onChange={e => setFilterProject(e.target.value)}
                style={{
                  width: '100%', padding: '6px 8px', borderRadius: 6,
                  background: '#0d0d1a', color: '#ccc', border: '1px solid #333',
                  fontFamily: "'Outfit', sans-serif", fontSize: 12, outline: 'none',
                }}
              >
                <option value="all">Tous les projets</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
              {unplannedTasks.length === 0 && (
                <div style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: 16, fontFamily: "'Outfit', sans-serif" }}>
                  Toutes les tâches sont planifiées !
                </div>
              )}
              {unplannedTasks.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({
                      type: 'assign', taskId: task.id, projectId: task.project.id,
                    }));
                    e.dataTransfer.effectAllowed = 'all';
                  }}
                  style={{
                    padding: '8px 10px', marginBottom: 4, borderRadius: 8,
                    background: `${task.project.color}08`,
                    border: `1px solid ${task.project.color}22`,
                    cursor: 'grab', transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = `${task.project.color}18`; }}
                  onMouseOut={e => { e.currentTarget.style.background = `${task.project.color}08`; }}
                >
                  <div style={{
                    fontSize: 12, color: task.status === 'done' ? '#555' : '#ccc',
                    fontFamily: "'Outfit', sans-serif",
                    textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    marginBottom: 3,
                  }}>{task.text}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 4,
                      background: task.project.color + '22', color: task.project.color,
                      fontFamily: "'Space Mono', monospace", fontWeight: 600,
                    }}>{task.project.emoji} {task.project.name}</span>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 4,
                      background: STATUS_COLORS[task.status] + '22', color: STATUS_COLORS[task.status],
                      fontFamily: "'Space Mono', monospace",
                    }}>{STATUS_LABELS[task.status]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Planning Grid ────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto' }}>
          <div style={{ display: 'flex', minWidth: isMobile ? 'auto' : 700 }}>

            {/* Time column */}
            <div style={{ width: 60, flexShrink: 0 }}>
              <div style={{ height: 52 }} /> {/* header spacer */}
              {SLOTS.map(slot => (
                <div key={slot.id} style={{
                  height: SLOT_HEIGHT, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                  paddingTop: 4,
                }}>
                  <span style={{
                    fontSize: 10, color: '#555', fontFamily: "'Space Mono', monospace",
                    whiteSpace: 'nowrap',
                  }}>{slot.label.split(' - ')[0]}</span>
                </div>
              ))}
            </div>

            {/* Day columns */}
            {visibleDays.map((day, dayIdx) => {
              const dayStr = formatISO(day);
              const dayIsToday = isToday(day);
              const load = getDayLoad(dayStr);
              const loadColor = getLoadColor(load);

              return (
                <div key={dayStr} style={{
                  flex: 1, minWidth: isMobile ? 'auto' : 100,
                  borderLeft: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {/* Day header */}
                  <div style={{
                    padding: '6px 4px', textAlign: 'center',
                    background: dayIsToday ? 'rgba(78, 205, 196, 0.08)' : 'transparent',
                    borderBottom: dayIsToday ? '2px solid #4ECDC4' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: dayIsToday ? '8px 8px 0 0' : 0,
                  }}>
                    <div style={{
                      fontFamily: "'Space Mono', monospace", fontSize: 12, fontWeight: 700,
                      color: dayIsToday ? '#4ECDC4' : '#888',
                    }}>{formatShort(day)}</div>
                    {/* Load bar */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4,
                    }}>
                      <div style={{
                        width: '70%', height: 4, borderRadius: 2, background: '#1a1a2e', overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', borderRadius: 2, background: loadColor,
                          width: `${Math.min(100, (load / 14) * 100)}%`, transition: 'width 0.3s',
                        }} />
                      </div>
                      <span style={{
                        fontSize: 9, color: loadColor, fontFamily: "'Space Mono', monospace", fontWeight: 600,
                      }}>{load}h</span>
                    </div>
                  </div>

                  {/* Slots */}
                  {SLOTS.map(slot => {
                    const assignments = getAssignmentsForDaySlot(dayStr, slot.id);
                    const isCurrentSlot = dayIsToday && currentSlot?.id === slot.id;
                    const isEmpty = assignments.length === 0;

                    return (
                      <div
                        key={slot.id}
                        onDragOver={handleDragOver}
                        onDragEnter={e => {
                          handleDragEnter(e);
                          e.currentTarget.style.background = 'rgba(78, 205, 196, 0.12)';
                          e.currentTarget.style.outline = '1px dashed rgba(78, 205, 196, 0.4)';
                        }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget)) {
                            e.currentTarget.style.background = isCurrentSlot ? 'rgba(78, 205, 196, 0.04)' : 'rgba(255,255,255,0.01)';
                            e.currentTarget.style.outline = 'none';
                          }
                        }}
                        onDrop={e => {
                          handleDrop(e, dayStr, slot.id);
                          e.currentTarget.style.background = isCurrentSlot ? 'rgba(78, 205, 196, 0.04)' : 'rgba(255,255,255,0.01)';
                          e.currentTarget.style.outline = 'none';
                        }}
                        onClick={() => isEmpty && handleSlotClick(dayStr, slot.id)}
                        style={{
                          height: SLOT_HEIGHT, padding: 3,
                          background: isCurrentSlot ? 'rgba(78, 205, 196, 0.04)' : 'rgba(255,255,255,0.01)',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          borderLeft: isCurrentSlot ? '2px solid #4ECDC4' : undefined,
                          cursor: isEmpty ? 'pointer' : 'default',
                          position: 'relative',
                          transition: 'background 0.15s',
                        }}
                        onMouseOver={e => {
                          if (isEmpty) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        }}
                        onMouseOut={e => {
                          if (isEmpty) e.currentTarget.style.background = isCurrentSlot ? 'rgba(78, 205, 196, 0.04)' : 'rgba(255,255,255,0.01)';
                        }}
                      >
                        {assignments.map(a => renderTaskCard(a, dayStr))}
                        {isEmpty && (
                          <div style={{
                            width: '100%', height: '100%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                          }}>
                            <span style={{ fontSize: 16, color: '#1a1a2e', transition: 'color 0.15s' }}>+</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Slot Modal (assign or create task) ────────────────────────────── */}
      <PlanModal open={!!slotModal} onClose={() => setSlotModal(null)} title="Assigner un créneau">
        {slotModal && (
          <>
            <div style={{
              fontSize: 12, color: '#888', marginBottom: 16,
              fontFamily: "'Space Mono', monospace",
            }}>
              {formatShort(new Date(slotModal.day + 'T00:00:00'))} — {SLOTS.find(s => s.id === slotModal.slot)?.label}
            </div>

            {/* Duration selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>Durée</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {DURATION_OPTIONS.map(d => (
                  <button key={d.value} onClick={() => setNewTaskDuration(d.value)} style={{
                    flex: 1, padding: '6px', borderRadius: 6, cursor: 'pointer',
                    background: newTaskDuration === d.value ? '#4ECDC422' : 'transparent',
                    border: `1px solid ${newTaskDuration === d.value ? '#4ECDC4' : '#333'}`,
                    color: newTaskDuration === d.value ? '#4ECDC4' : '#888',
                    fontFamily: "'Space Mono', monospace", fontSize: 11, fontWeight: 600,
                  }}>{d.label}</button>
                ))}
              </div>
            </div>

            {/* Existing unplanned tasks */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>
                Tâche existante
              </label>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {unplannedTasks.length === 0 && (
                  <div style={{ color: '#444', fontSize: 12, padding: 8, textAlign: 'center' }}>
                    Aucune tâche non planifiée
                  </div>
                )}
                {unplannedTasks.map(task => (
                  <div key={task.id} onClick={() => handleAssignFromModal(task.id, task.project.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    borderRadius: 8, marginBottom: 3, cursor: 'pointer',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                    transition: 'all 0.15s',
                  }}
                    onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                  >
                    <span style={{
                      fontSize: 12, color: '#ccc', fontFamily: "'Outfit', sans-serif", flex: 1,
                    }}>{task.text}</span>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 4,
                      background: task.project.color + '22', color: task.project.color,
                      fontFamily: "'Space Mono', monospace", fontWeight: 600,
                    }}>{task.project.emoji} {task.project.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Separator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#333' }} />
              <span style={{ fontSize: 11, color: '#555' }}>ou</span>
              <div style={{ flex: 1, height: 1, background: '#333' }} />
            </div>

            {/* Create new task */}
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>
              Nouvelle tâche
            </label>
            <select
              value={newTaskProject}
              onChange={e => setNewTaskProject(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8,
                background: '#0d0d1a', color: '#ccc', border: '1px solid #333',
                fontFamily: "'Outfit', sans-serif", fontSize: 13, outline: 'none', marginBottom: 8,
              }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
              ))}
            </select>
            <input
              value={newTaskText}
              onChange={e => setNewTaskText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAssign(); }}
              placeholder="Nom de la tâche"
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
                background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
                outline: 'none', marginBottom: 12,
              }}
            />
            <button onClick={handleCreateAndAssign} style={{
              width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg, #4ECDC4, #A78BFA)', color: '#000',
              fontWeight: 600, cursor: 'pointer', fontFamily: "'Outfit', sans-serif",
            }}>Créer & assigner</button>
          </>
        )}
      </PlanModal>

      {/* ── Recurrence Modal ──────────────────────────────────────────────── */}
      <PlanModal open={!!recurrenceModal} onClose={() => setRecurrenceModal(null)} title="🔄 Récurrence">
        {recurrenceModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {RECURRENCE_OPTIONS.map(opt => (
              <button key={opt.value || 'none'} onClick={() => {
                setRecurrence(recurrenceModal.id, opt.value);
                setRecurrenceModal(null);
              }} style={{
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                background: recurrenceModal.recurrence === opt.value ? '#4ECDC422' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${recurrenceModal.recurrence === opt.value ? '#4ECDC4' : '#333'}`,
                color: recurrenceModal.recurrence === opt.value ? '#4ECDC4' : '#ccc',
                fontFamily: "'Outfit', sans-serif", fontSize: 13, textAlign: 'left',
                transition: 'all 0.15s',
              }}>{opt.label}</button>
            ))}
          </div>
        )}
      </PlanModal>

      {/* ── Postpone Modal ────────────────────────────────────────────────── */}
      <PlanModal open={!!postponeModal} onClose={() => setPostponeModal(null)} title="📅 Reporter la tâche">
        {postponeModal && (() => {
          const info = getTaskInfo(projects, postponeModal.taskId, postponeModal.projectId);
          const pCount = postponeModal.postponeCount || 0;
          const showSplit = pCount >= 3;

          return (
            <>
              <div style={{
                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ fontSize: 14, color: '#ccc', fontFamily: "'Outfit', sans-serif", marginBottom: 4 }}>
                  {info?.text || '?'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {info && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: info.project.color + '22', color: info.project.color,
                      fontFamily: "'Space Mono', monospace",
                    }}>{info.project.emoji} {info.project.name}</span>
                  )}
                  {pCount > 0 && (
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: '#FF6B6B22', color: '#FF6B6B',
                      fontFamily: "'Space Mono', monospace",
                    }}>Reporté {pCount}x</span>
                  )}
                </div>
              </div>

              {showSplit && (
                <div style={{
                  padding: '12px 14px', borderRadius: 8, marginBottom: 16,
                  background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                  <div style={{ fontSize: 13, color: '#F59E0B', fontFamily: "'Outfit', sans-serif", marginBottom: 8 }}>
                    ⚡ Cette tâche a été reportée {pCount} fois. Tu veux la découper en sous-tâches plus petites ?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => {
                      setSplitModal(postponeModal);
                      setSplitTexts([info?.text ? info.text + ' (partie 1)' : '', info?.text ? info.text + ' (partie 2)' : '', '']);
                      setPostponeModal(null);
                    }} style={{
                      flex: 1, padding: '8px', borderRadius: 8, border: 'none',
                      background: '#F59E0B', color: '#000', fontWeight: 600, cursor: 'pointer',
                      fontFamily: "'Outfit', sans-serif", fontSize: 12,
                    }}>Découper</button>
                    <button onClick={() => {
                      removeAssignment(postponeModal.id);
                      setPostponeModal(null);
                    }} style={{
                      flex: 1, padding: '8px', borderRadius: 8,
                      border: '1px solid #FF6B6B', background: 'transparent',
                      color: '#FF6B6B', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontSize: 12,
                    }}>Supprimer</button>
                  </div>
                </div>
              )}

              <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
                Reporter à quel jour ?
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Quick options: next 7 days */}
                {Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + (isToday(new Date(postponeModal.day + 'T00:00:00')) ? 1 : 0))).map(d => {
                  const dStr = formatISO(d);
                  return (
                    <button key={dStr} onClick={() => {
                      postponeAssignment(postponeModal.id, dStr);
                      setPostponeModal(null);
                    }} style={{
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      background: isToday(d) ? 'rgba(78, 205, 196, 0.08)' : 'rgba(255,255,255,0.02)',
                      border: isToday(d) ? '1px solid rgba(78, 205, 196, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                      color: isToday(d) ? '#4ECDC4' : '#ccc',
                      fontFamily: "'Outfit', sans-serif", fontSize: 13, textAlign: 'left',
                      transition: 'all 0.15s',
                    }}>
                      {formatLong(d)} {isToday(d) ? '(Aujourd\'hui)' : ''}
                    </button>
                  );
                })}
              </div>

              {showSplit && (
                <button onClick={() => {
                  const tomorrow = formatISO(addDays(new Date(), 1));
                  postponeAssignment(postponeModal.id, tomorrow);
                  setPostponeModal(null);
                }} style={{
                  width: '100%', marginTop: 12, padding: '10px', borderRadius: 8,
                  border: '1px solid #333', background: 'transparent',
                  color: '#888', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontSize: 12,
                }}>Reporter quand même (demain)</button>
              )}
            </>
          );
        })()}
      </PlanModal>

      {/* ── Split Modal ───────────────────────────────────────────────────── */}
      <PlanModal open={!!splitModal} onClose={() => setSplitModal(null)} title="✂️ Découper la tâche">
        {splitModal && (
          <>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16, fontFamily: "'Outfit', sans-serif" }}>
              Divise cette tâche en 2-3 sous-tâches plus petites
            </div>
            {[0, 1, 2].map(i => (
              <input
                key={i}
                value={splitTexts[i]}
                onChange={e => {
                  const copy = [...splitTexts];
                  copy[i] = e.target.value;
                  setSplitTexts(copy);
                }}
                placeholder={`Sous-tâche ${i + 1}${i === 2 ? ' (optionnel)' : ''}`}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #333',
                  background: '#0d0d1a', color: '#fff', fontFamily: "'Outfit', sans-serif", fontSize: 14,
                  outline: 'none', marginBottom: 8,
                }}
              />
            ))}
            <button onClick={() => handleSplitTask(splitModal)} style={{
              width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              background: '#F59E0B', color: '#000', fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Outfit', sans-serif", marginTop: 4,
            }}>Découper & créer les sous-tâches</button>
          </>
        )}
      </PlanModal>
    </div>
  );
}
