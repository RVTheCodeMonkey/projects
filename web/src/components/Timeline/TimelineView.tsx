import { useEffect, useRef, useMemo } from 'react';
import type { Task } from '../../pages/ProjectView';
import { TimelineRow } from './TimelineRow';
import { useDragScroll } from '../../hooks/useDragScroll';

const DAY_LABEL_WIDTH = 56;
const PADDING_DAYS = 2;

function parseDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function generateDayHeaders(start: Date, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

function getDayLabel(d: Date) {
  return ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][d.getDay() === 0 ? 6 : d.getDay() - 1];
}

function getWeekNumber(d: Date) {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export interface TimelineViewProps {
  tasks: Task[];
  rowLabels?: Record<string, string>;
  onTaskClick: (task: Task) => void;
  onAddTask?: (groupOutlineNumber: string) => void;
  onRenameRow?: (groupOutlineNumber: string, newName: string) => void;
}

export function TimelineView({ tasks, rowLabels = {}, onTaskClick, onAddTask, onRenameRow }: TimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useDragScroll(scrollRef);
  const hasScrolledToToday = useRef(false);

  const { dayHeaders, rows, totalWidth, weekStarts } = useMemo(() => {
    if (tasks.length === 0) {
      return { dayHeaders: [], rows: [], totalWidth: 0, weekStarts: new Set<number>() };
    }

    let min = parseDate(tasks[0].start);
    let max = parseDate(tasks[0].finish);
    for (const t of tasks) {
      const s = parseDate(t.start);
      const f = parseDate(t.finish);
      if (s < min) min = s;
      if (f > max) max = f;
    }

    const rangeStart = addDays(min, -PADDING_DAYS);
    const rangeEnd = addDays(max, PADDING_DAYS);
    const dayCount = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);
    const headers = generateDayHeaders(rangeStart, dayCount);

    const weekStarts = new Set<number>();
    let lastW = -1;
    headers.forEach((d, i) => {
      const wn = getWeekNumber(d);
      if (wn !== lastW) {
        weekStarts.add(i);
        lastW = wn;
      }
    });

    // Group by top-level outline number (WBS first segment)
    const groupMap = new Map<string, { label: string; tasks: Task[] }>();
    const keyOrder: string[] = [];
    for (const t of tasks) {
      const key = t.outline_number.split('.')[0];
      if (!groupMap.has(key)) {
        groupMap.set(key, { label: key, tasks: [] });
        keyOrder.push(key);
      }
      groupMap.get(key)!.tasks.push(t);
    }
    // Determine row label: custom row label first, then top-level task name, then outline key
    for (const [key, entry] of groupMap) {
      if (rowLabels[key]) {
        entry.label = rowLabels[key];
      } else {
        const topLevelTask = entry.tasks.find((t) => !t.outline_number.includes('.'));
        entry.label = topLevelTask?.name || key;
      }
    }

    const rows = keyOrder.map((key) => groupMap.get(key)!);

    return { dayHeaders: headers, rows, totalWidth: dayCount * DAY_LABEL_WIDTH, weekStarts };
  }, [tasks, rowLabels]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || dayHeaders.length === 0 || hasScrolledToToday.current) return;

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let idx = dayHeaders.findIndex((d) => dateKey(d) === todayKey);
    if (idx === -1) {
      // Today is outside the project range: focus start or end
      const firstKey = dateKey(dayHeaders[0]);
      idx = todayKey < firstKey ? 0 : dayHeaders.length - 1;
    }

    requestAnimationFrame(() => {
      const maxScroll = container.scrollWidth - container.clientWidth;
      let target = idx * DAY_LABEL_WIDTH - container.clientWidth / 2 + DAY_LABEL_WIDTH / 2;
      target = Math.max(0, Math.min(target, maxScroll));
      container.scrollLeft = target;
      hasScrolledToToday.current = true;
    });
  }, [dayHeaders]);

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">
        No tasks to display.
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="border-b border-slate-200 px-4 py-2 text-right">
        <span className="text-xs text-slate-500">
          Pan: middle-drag, Shift+scroll, or swipe
        </span>
      </div>
      <div
        className={`timeline-scroll relative min-h-0 flex-1 overflow-x-auto overflow-y-auto ${
          isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
        ref={scrollRef}
      >
        <div style={{ width: totalWidth }}>
          {/* Month headers */}
          <div className="sticky top-0 z-20 flex bg-white">
            <div className="sticky left-0 z-10 w-40 shrink-0 bg-slate-100" />
            <div className="relative flex" style={{ width: totalWidth }}>
              {(() => {
                let lastMonth = -1;
                const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                return dayHeaders.map((d, i) => {
                  const showMonth = d.getMonth() !== lastMonth;
                  if (showMonth) lastMonth = d.getMonth();
                  return (
                    <div
                      key={`m-${i}`}
                      className={`flex shrink-0 items-center justify-center border-b border-slate-300 text-[11px] font-semibold uppercase tracking-wider text-green-600 ${
                        weekStarts.has(i) ? 'border-l border-slate-400' : ''
                      }`}
                      style={{ width: DAY_LABEL_WIDTH, height: 18 }}
                    >
                      {showMonth ? monthLabels[d.getMonth()] : ''}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Week number */}
          <div className="sticky top-[18px] z-20 flex bg-white">
            <div className="sticky left-0 z-10 w-40 shrink-0 bg-slate-100" />
            <div className="flex" style={{ width: totalWidth }}>
              {(() => {
                let lastWeek = -1;
                return dayHeaders.map((d, i) => {
                  const wn = getWeekNumber(d);
                  const showWeek = wn !== lastWeek;
                  if (showWeek) lastWeek = wn;
                  return (
                    <div
                      key={`w-${i}`}
                      className={`flex shrink-0 items-center justify-center border-b text-xs font-bold ${
                        showWeek
                          ? 'border-l border-slate-400 text-[#ffff00]'
                          : 'border-slate-300 text-amber-400'
                      }`}
                      style={{ width: DAY_LABEL_WIDTH, height: 16 }}
                    >
                      {showWeek ? `W${wn}` : ''}
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Day-of-week + day number */}
          <div className="sticky top-[34px] z-20 flex bg-white">
            <div className="sticky left-0 z-10 w-40 shrink-0 bg-slate-100" />
            <div className="flex" style={{ width: totalWidth }}>
              {dayHeaders.map((d, i) => {
                const today = isToday(d);
                const weekend = isWeekend(d);
                return (
                  <div
                    key={`d-${i}`}
                    className={`flex shrink-0 flex-col items-center justify-center border-b text-[10px] leading-tight ${
                      weekStarts.has(i) ? 'border-l border-slate-400' : ''
                    } ${
                      today
                        ? 'border-b-4 border-b-green-600 bg-green-100 font-bold text-green-800'
                        : weekend
                          ? 'border-b border-slate-200 bg-slate-50 text-slate-400'
                          : 'border-b border-slate-200 text-slate-500'
                    }`}
                    style={{ width: DAY_LABEL_WIDTH, height: 28 }}
                  >
                    <span>{getDayLabel(d)}</span>
                    <span>{d.getDate()}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {rows.map((row) => {
            const groupKey = row.tasks[0]?.outline_number.split('.')[0] ?? row.label;
            return (
              <TimelineRow
                key={row.label}
                label={row.label}
                tasks={row.tasks}
                dayHeaders={dayHeaders}
                weekStarts={weekStarts}
                onTaskClick={onTaskClick}
                onAddTask={onAddTask ? () => onAddTask(groupKey) : undefined}
                onRenameRow={onRenameRow ? (newName) => onRenameRow(groupKey, newName) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
