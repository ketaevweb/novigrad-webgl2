'use client';

import { useState, type ReactNode, type RefObject } from 'react';
import { MapPin, Settings2, SkipForward } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { CameraMode, NovigradEngineAPI, NovigradStats, POI } from '@/lib/novigrad/types';

const SERIF = "'Cormorant', Georgia, serif";
const SANS = "'Alegreya Sans', system-ui, sans-serif";

const POPULATIONS: readonly number[] = [1024, 4096, 9216, 16384];

const CAMERAS: ReadonlyArray<{ mode: CameraMode; label: string }> = [
  { mode: 'free', label: 'Свободная' },
  { mode: 'cinematic', label: 'Тур' },
  { mode: 'follow', label: 'За горожанином' },
];

const PLACES: ReadonlyArray<{ poi: POI; label: string }> = [
  { poi: 'plaza', label: 'Площадь' },
  { poi: 'temple', label: 'Храм' },
  { poi: 'harbor', label: 'Порт' },
  { poi: 'walls', label: 'Стены' },
  { poi: 'lighthouse', label: 'Маяк' },
];

/** Значения по умолчанию — синхронизируются с движком в NovigradApp при onReady. */
const DEFAULT_TIME_SPEED = 0.02;
const DEFAULT_CITIZEN_SPEED = 1;
const FALLBACK_TIME = 10;

function clockToHours(clock: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return FALLBACK_TIME;
  const h = Math.min(23, Number.parseInt(match[1], 10));
  const m = Math.min(59, Number.parseInt(match[2], 10));
  return h + m / 60;
}

function hoursToClock(t: number): string {
  const wrapped = ((t % 24) + 24) % 24;
  const h = Math.floor(wrapped);
  const m = Math.floor((wrapped - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fmtSpeed(v: number): string {
  return parseFloat(v.toFixed(3)).toString();
}

const GROUP_CAPTION =
  'text-center text-[10px] font-medium uppercase leading-none tracking-[0.2em] text-amber-100/40';

const BASE_BUTTON =
  'min-h-11 whitespace-nowrap rounded-md border border-amber-800/40 bg-black/30 px-3 text-xs text-amber-100/80 transition-colors hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-50';

const ACTIVE_BUTTON =
  'border-amber-400/60 bg-amber-500/20 text-amber-50 shadow-[0_0_14px_rgba(212,169,78,0.25)] hover:border-amber-400/70 hover:bg-amber-500/25';

function Group({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-1.5 py-1">
      <span className={GROUP_CAPTION}>{caption}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

interface ControlBarProps {
  /** Ref на экземпляр движка; читается только в обработчиках событий. */
  engineRef: RefObject<NovigradEngineAPI | null>;
  stats: NovigradStats;
}

/**
 * Нижняя панель управления: население, камера, достопримечательности
 * и настройки (время суток, ход времени, темп жизни).
 */
export default function ControlBar({ engineRef, stats }: ControlBarProps) {
  const [cameraMode, setCameraMode] = useState<CameraMode>('free');
  // Оптимистичная подсветка: пока статистика движка не догнала клик,
  // подсвечиваем выбранное значение, затем возвращаемся к stats.population.
  const [pendingPop, setPendingPop] = useState<number | null>(null);
  const [autoTime, setAutoTime] = useState(true);
  const [manualTime, setManualTime] = useState<number>(FALLBACK_TIME);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [timeSpeed, setTimeSpeed] = useState<number>(DEFAULT_TIME_SPEED);
  const [citizenSpeed, setCitizenSpeed] = useState<number>(DEFAULT_CITIZEN_SPEED);

  const engineHours = clockToHours(stats.clock);
  const activePop =
    pendingPop !== null && pendingPop !== stats.population ? pendingPop : stats.population;
  // При автовремени слайдер «живёт» вместе с часами движка; во время перетаскивания
  // показываем локальное значение, чтобы ползунок не дёргался между тиками статистики.
  const displayTime = scrubTime ?? (autoTime ? engineHours : manualTime);

  const handlePopulation = (n: number) => {
    setPendingPop(n);
    engineRef.current?.setPopulation(n);
  };

  const handleCamera = (mode: CameraMode) => {
    setCameraMode(mode);
    engineRef.current?.setCameraMode(mode);
  };

  const handleTimeScrub = (values: number[]) => {
    const t = values[0] ?? FALLBACK_TIME;
    setScrubTime(t);
    if (!autoTime) setManualTime(t);
    // по контракту: авто-ход продолжается с новой точки
    engineRef.current?.setTimeOfDay(t);
  };

  const handleAutoChange = (next: boolean) => {
    setAutoTime(next);
    engineRef.current?.setAutoTime(next);
    if (!next) setManualTime(engineHours);
  };

  return (
    <div
      className="pointer-events-auto flex max-w-full items-stretch gap-0.5 overflow-x-auto rounded-md border border-amber-800/40 bg-black/60 p-1.5 ring-1 ring-amber-500/20 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ fontFamily: SANS }}
    >
      <Group caption="Население">
        {POPULATIONS.map((n) => (
          <Button
            key={n}
            variant="ghost"
            aria-label={`Установить население ${n.toLocaleString('ru-RU')}`}
            className={cn(BASE_BUTTON, activePop === n && ACTIVE_BUTTON)}
            onClick={() => handlePopulation(n)}
          >
            {n.toLocaleString('ru-RU')}
          </Button>
        ))}
      </Group>

      <Separator orientation="vertical" className="bg-amber-800/50" />

      <Group caption="Камера">
        {CAMERAS.map((c) => (
          <Button
            key={c.mode}
            variant="ghost"
            aria-label={`Камера: ${c.label}`}
            className={cn(BASE_BUTTON, cameraMode === c.mode && ACTIVE_BUTTON)}
            onClick={() => handleCamera(c.mode)}
          >
            {c.label}
          </Button>
        ))}
        {cameraMode === 'follow' && (
          <Button
            variant="ghost"
            aria-label="Следующий горожанин"
            className={cn(BASE_BUTTON, 'gap-1.5 px-2.5')}
            onClick={() => engineRef.current?.nextCitizen()}
          >
            <SkipForward className="size-3.5 text-amber-400" aria-hidden />
            Следующий
          </Button>
        )}
      </Group>

      <Separator orientation="vertical" className="bg-amber-800/50" />

      <Group caption="Места">
        {PLACES.map((p) => (
          <Button
            key={p.poi}
            variant="ghost"
            aria-label={`Показать: ${p.label}`}
            className={cn(BASE_BUTTON, 'gap-1.5')}
            onClick={() => {
              // перелёт к месту работает от свободной камеры — синхронизируем UI
              setCameraMode('free');
              engineRef.current?.setCameraMode('free');
              engineRef.current?.focusPOI(p.poi);
            }}
          >
            <MapPin className="size-3.5 text-amber-400/80" aria-hidden />
            {p.label}
          </Button>
        ))}
      </Group>

      <Separator orientation="vertical" className="bg-amber-800/50" />

      <div className="flex items-center px-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Настройки симуляции"
              className="size-11 rounded-md border border-amber-800/40 bg-black/30 text-amber-100/80 transition-colors hover:border-amber-500/40 hover:bg-amber-500/15 hover:text-amber-50 data-[state=open]:border-amber-400/60 data-[state=open]:bg-amber-500/20 data-[state=open]:text-amber-50"
            >
              <Settings2 className="size-4" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="end"
            className="w-80 rounded-md border-amber-800/40 bg-[#0d0a07]/95 p-4 text-amber-50 ring-1 ring-amber-500/20 backdrop-blur-md"
            style={{ fontFamily: SANS }}
          >
            <p className="text-base uppercase tracking-[0.18em] text-amber-200" style={{ fontFamily: SERIF }}>
              Настройки
            </p>

            <div className="mt-4 space-y-5">
              {/* Время суток */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-widest text-amber-100/60">Время суток</span>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold tabular-nums text-amber-200">
                      {hoursToClock(displayTime)}
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-amber-100/70">
                      <Switch
                        checked={autoTime}
                        onCheckedChange={handleAutoChange}
                        aria-label="Автоматический ход времени"
                        className="h-6 w-11 [&>span]:size-5 [&[data-state=checked]>span]:translate-x-[22px]"
                      />
                      Авто
                    </label>
                  </div>
                </div>
                <Slider
                  min={0}
                  max={24}
                  step={0.1}
                  value={[displayTime]}
                  onValueChange={handleTimeScrub}
                  onValueCommit={() => setScrubTime(null)}
                  aria-label="Время суток, часы"
                  className="h-11"
                />
              </div>

              {/* Ход времени */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-widest text-amber-100/60">Ход времени</span>
                  <span className="text-xs font-semibold tabular-nums text-amber-200">
                    {fmtSpeed(timeSpeed)} ч/сек
                  </span>
                </div>
                <Slider
                  min={0}
                  max={0.1}
                  step={0.005}
                  value={[timeSpeed]}
                  onValueChange={(values) => {
                    const v = values[0] ?? DEFAULT_TIME_SPEED;
                    setTimeSpeed(v);
                    engineRef.current?.setTimeSpeed(v);
                  }}
                  aria-label="Скорость суточного цикла, часов в секунду"
                  className="h-11"
                />
              </div>

              {/* Темп жизни */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-widest text-amber-100/60">Темп жизни</span>
                  <span className="text-xs font-semibold tabular-nums text-amber-200">
                    {citizenSpeed.toFixed(2)}×
                  </span>
                </div>
                <Slider
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={[citizenSpeed]}
                  onValueChange={(values) => {
                    const v = values[0] ?? DEFAULT_CITIZEN_SPEED;
                    setCitizenSpeed(v);
                    engineRef.current?.setCitizenSpeed(v);
                  }}
                  aria-label="Множитель скорости горожан"
                  className="h-11"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
