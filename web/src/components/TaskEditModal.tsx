import { useState, useEffect } from 'react';
import type { Task } from '../pages/ProjectView';

interface TaskEditModalProps {
  task: Task | null;
  onSave: (updated: Task) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function toDatetimeLocal(value: string) {
  if (!value) return '';
  // value is like 2026-01-06T08:00:00
  return value.slice(0, 16);
}

function fromDatetimeLocal(value: string) {
  if (!value) return '';
  return `${value}:00`;
}

function defaultColor(task: Task): string {
  if (task.summary) return '#545454';
  if (task.milestone) return '#00b0f0';
  if (task.critical) return '#ff0000';
  return '#8abbed';
}

const PALETTE = [
  '#545454',
  '#ff0000',
  '#ff9900',
  '#ffd966',
  '#00b050',
  '#00b0f0',
  '#8abbed',
  '#4472c4',
  '#7030a0',
  '#c55a11',
];

export default function TaskEditModal({ task, onSave, onDelete, onClose }: TaskEditModalProps) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [finish, setFinish] = useState('');
  const [percent, setPercent] = useState(0);
  const [color, setColor] = useState('');

  useEffect(() => {
    if (task) {
      setName(task.name);
      setStart(toDatetimeLocal(task.start));
      setFinish(toDatetimeLocal(task.finish));
      setPercent(task.percent_complete);
      setColor(task.color || defaultColor(task));
    }
  }, [task]);

  if (!task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...task,
      name,
      start: fromDatetimeLocal(start),
      finish: fromDatetimeLocal(finish),
      percent_complete: percent,
      color,
    });
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this task?')) {
      onDelete?.();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Edit Task</h2>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Start</label>
              <input
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Finish</label>
              <input
                type="datetime-local"
                required
                value={finish}
                onChange={(e) => setFinish(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">% Complete</label>
            <input
              type="number"
              min={0}
              max={100}
              required
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Color</label>
            <div className="grid grid-cols-5 gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Select color ${c}`}
                  title={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border border-slate-200 transition-transform hover:scale-110 ${
                    color === c ? 'ring-2 ring-offset-2 ring-green-600' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
              >
                Delete
              </button>
            )}
            <button
              type="submit"
              className="flex-1 rounded-lg bg-green-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-700 active:bg-green-800"
            >
              Update Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
