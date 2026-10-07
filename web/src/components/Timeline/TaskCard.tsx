import { useState } from 'react';
import type { Task } from '../../pages/ProjectView';

const DAY_LABEL_WIDTH = 56;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

function dayIndex(isoDate: string, dayHeaders: Date[]) {
  const target = dateKey(isoDate);
  for (let i = 0; i < dayHeaders.length; i++) {
    const d = dayHeaders[i];
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (key === target) return i;
  }
  return -1;
}

function formatLabel(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function fallbackColor(task: Task): string {
  if (task.summary) return '#545454';
  if (task.milestone) return '#00b0f0';
  if (task.critical) return '#ff0000';
  return '#8abbed';
}

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return yiq >= 128 ? 'text-slate-900' : 'text-white';
}

interface TaskCardProps {
  task: Task;
  dayHeaders: Date[];
  topOffset?: number;
  onClick: () => void;
}

export function TaskCard({ task, dayHeaders, topOffset = 0, onClick }: TaskCardProps) {
  const [hover, setHover] = useState(false);

  const startIdx = dayIndex(task.start, dayHeaders);
  const endIdx = dayIndex(task.finish, dayHeaders);

  function headerKey(i: number) {
    const d = dayHeaders[i];
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const targetStart = dateKey(task.start);
  const targetEnd = dateKey(task.finish);
  const firstKey = dayHeaders.length > 0 ? headerKey(0) : '';
  const lastKey = dayHeaders.length > 0 ? headerKey(dayHeaders.length - 1) : '';

  if (targetEnd < firstKey || targetStart > lastKey) return null;

  const beforeGrid = targetStart < firstKey;
  const afterGrid = targetEnd > lastKey;

  const start = beforeGrid ? 0 : startIdx;
  const end = afterGrid ? dayHeaders.length - 1 : Math.max(endIdx, startIdx);
  const span = end - start + 1;

  const left = start * DAY_LABEL_WIDTH + 4;
  const width = Math.max(span * DAY_LABEL_WIDTH - 8, 80);

  const barColor = task.color || fallbackColor(task);
  const textColorClass = contrastColor(barColor);

  if (task.summary) {
    return (
      <div
        className={`absolute flex flex-col justify-center rounded-lg border border-white/20 border-l-4 px-2 py-1.5 text-left shadow-sm ${textColorClass}`}
        style={{
          left,
          width,
          top: 4 + topOffset,
          minHeight: 50,
          backgroundColor: barColor,
          borderLeftColor: 'rgba(0,0,0,0.2)',
        }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <span className="truncate text-sm font-semibold">{task.name}</span>
        <span className="text-[11px] opacity-70">
          {formatLabel(task.start)} – {formatLabel(task.finish)}
        </span>
        {hover && (
          <div className="absolute left-full z-30 ml-1.5 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg">
            {task.name} — {task.percent_complete}%
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`absolute flex flex-col gap-0.5 rounded-lg border border-white/20 border-l-4 px-2 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md active:shadow-md ${textColorClass}`}
      style={{
        left,
        width,
        top: 4 + topOffset,
        minHeight: 50,
        backgroundColor: barColor,
        borderLeftColor: 'rgba(0,0,0,0.2)',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="truncate text-sm font-medium">{task.name}</span>
      <span className="text-xs opacity-70">
        {task.outline_number}
      </span>
      <span className="text-[11px] opacity-70">
        {formatLabel(task.start)} – {formatLabel(task.finish)}
      </span>
      {/* Progress fill */}
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/30">
        <div
          className="h-full rounded-full bg-current"
          style={{ width: `${task.percent_complete}%` }}
        />
      </div>
      {hover && (
        <div className="absolute left-full z-30 ml-1.5 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg">
          {task.name} — {task.percent_complete}%
        </div>
      )}
    </button>
  );
}
