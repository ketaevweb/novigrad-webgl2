'use client';

import type { ReactNode } from 'react';
import { Clock, Cpu, Gauge, Users } from 'lucide-react';

import type { NovigradStats } from '@/lib/novigrad/types';

const SANS = "'Alegreya Sans', system-ui, sans-serif";

interface ChipProps {
  icon: ReactNode;
  label: string;
  value: string;
}

function Chip({ icon, label, value }: ChipProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-amber-800/40 bg-black/60 px-2.5 py-2 ring-1 ring-amber-500/20 backdrop-blur-md">
      {icon}
      <span className="hidden text-[10px] uppercase tracking-[0.16em] text-amber-100/50 md:inline">
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums text-amber-200">{value}</span>
    </div>
  );
}

interface StatsBarProps {
  stats: NovigradStats;
}

/** Компактная строка метрик в правом верхнем углу. */
export default function StatsBar({ stats }: StatsBarProps) {
  return (
    <div
      className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5"
      style={{ fontFamily: SANS }}
    >
      <Chip
        icon={<Gauge className="size-3.5 text-amber-400" aria-hidden />}
        label="FPS"
        value={String(Math.round(stats.fps))}
      />
      <Chip
        icon={<Users className="size-3.5 text-amber-400" aria-hidden />}
        label="Горожане"
        value={stats.population.toLocaleString('ru-RU')}
      />
      <Chip
        icon={<Clock className="size-3.5 text-amber-400" aria-hidden />}
        label="Время"
        value={stats.clock}
      />
      <Chip
        icon={<Cpu className="size-3.5 text-amber-400" aria-hidden />}
        label="Такт"
        value={`${stats.simMs.toFixed(1)} мс`}
      />
    </div>
  );
}
