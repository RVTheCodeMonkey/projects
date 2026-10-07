import { useState } from 'react';
import type { Task } from '../../pages/ProjectView';
import { TaskCard } from './TaskCard';

const DAY_LABEL_WIDTH = 56;

function isToday(d: Date) {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isWeekend(d: Date) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TimelineRowProps {
  label: string;
  tasks: Task[];
  dayHeaders: Date[];
  weekStarts: Set<number>;
  onTaskClick: (task: Task) => void;
  onAddTask?: () => void;
  onRenameRow?: (newName: string) => void;
}

export function TimelineRow({ label, tasks, dayHeaders, weekStarts, onTaskClick, onAddTask, onRenameRow }: TimelineRowProps) {
  const totalWidth = dayHeaders.length * DAY_LABEL_WIDTH;

  const taskLevel = new Map<string, number>();
  if (tasks.length > 0 && dayHeaders.length > 0) {
    function idx(iso: string) {
      const target = iso.slice(0, 10);
      for (let i = 0; i < dayHeaders.length; i++) {
        if (dateKey(dayHeaders[i]) === target) return i;
      }
      const first = dateKey(dayHeaders[0]);
      const last = dateKey(dayHeaders[dayHeaders.length - 1]);
      if (target < first) return 0;
      if (target > last) return dayHeaders.length - 1;
      return -1;
    }

    const sorted = [...tasks].sort(
      (a, b) => a.start.localeCompare(b.start) || a.finish.localeCompare(b.finish)
    );
    const levels: number[] = [];
    const endsAt: number[] = [];
    for (const t of sorted) {
      const ts = idx(t.start);
      const te = idx(t.finish);
      let placed = false;
      for (let l = 0; l < endsAt.length; l++) {
        if (ts > endsAt[l]) {
          endsAt[l] = te;
          levels.push(l);
          placed = true;
          break;
        }
      }
      if (!placed) {
        endsAt.push(te);
        levels.push(endsAt.length - 1);
      }
    }
    sorted.forEach((t, i) => taskLevel.set(t.uid, levels[i]));
  }
  const maxLevel = taskLevel.size > 0 ? Math.max(...taskLevel.values()) : 0;

  const canRename = Boolean(onRenameRow);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(label);

  const startRename = () => {
    setEditName(label);
    setIsEditingName(true);
  };

  const commitRename = () => {
    const trimmed = editName.trim();
    if (onRenameRow && trimmed) {
      onRenameRow(trimmed);
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitRename();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

  return (
    <div className="flex border-b border-slate-200">
      <div className="sticky left-0 z-10 flex w-40 shrink-0 items-center justify-between bg-slate-100 px-3 py-2">
        {isEditingName ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitRename}
            className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-sm focus:border-green-600 focus:outline-none"
          />
        ) : (
          <span className="truncate text-sm font-semibold text-slate-700">{label}</span>
        )}
        <div className="flex shrink-0 items-center">
          {canRename && !isEditingName && (
            <button
              onClick={startRename}
              title="Rename row"
              className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </button>
          )}
          {onAddTask && !isEditingName && (
            <button
              onClick={onAddTask}
              title="Add task to this group"
              className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700"
            >
              +
            </button>
          )}
        </div>
      </div>
      <div className="relative" style={{ width: totalWidth }}>
        {/* Grid lines */}
        {dayHeaders.map((d, i) => (
          <div
            key={d.toISOString()}
            className={`absolute top-0 h-full ${
              isToday(d)
                ? 'border-l-4 border-l-green-600'
                : isWeekend(d)
                  ? 'border-l border-l-slate-100'
                  : weekStarts.has(i)
                    ? 'border-l border-l-slate-400'
                    : 'border-l border-l-slate-200'
            } ${i === dayHeaders.length - 1 ? 'border-r border-r-slate-200' : ''}`}
            style={{ left: i * DAY_LABEL_WIDTH, width: DAY_LABEL_WIDTH }}
          />
        ))}

        {/* Task cards */}
        <div className="relative px-3 py-2" style={{ minHeight: 80 + maxLevel * 26 }}>
          {[...tasks]
            .sort((a, b) => {
              const da = a.finish.localeCompare(a.start);
              const db = b.finish.localeCompare(b.start);
              return db - da; // longest first → rendered behind
            })
            .map((task) => (
              <TaskCard
                key={task.uid}
                task={task}
                dayHeaders={dayHeaders}
                topOffset={taskLevel.get(task.uid)! * 26}
                onClick={() => onTaskClick(task)}
              />
            ))}
          {tasks.length === 0 && (
            <span className="text-sm italic text-slate-400">No tasks</span>
          )}
        </div>
      </div>
    </div>
  );
}
