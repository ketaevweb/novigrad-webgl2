'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

import { NovigradEngine } from '@/lib/novigrad/engine';
import type { NovigradEngineAPI, NovigradStats } from '@/lib/novigrad/types';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import ControlBar from './ControlBar';
import EventTicker from './EventTicker';
import InfoPanel, { InfoContent } from './InfoPanel';
import StatsBar from './StatsBar';
import { ErrorOverlay, LoadingOverlay } from './Overlays';

const SERIF = "'Cormorant', Georgia, serif";
const SANS = "'Alegreya Sans', system-ui, sans-serif";

/** Начальная статистика до первого тика движка. */
const INITIAL_STATS: NovigradStats = { fps: 0, population: 4096, clock: '10:00', simMs: 0 };

/**
 * Полноэкранное WebGL2-приложение «Новиград»: canvas на весь экран (z-0)
 * и React-оверлей поверх него. Оверлей-корень пропускает события мыши
 * к canvas (pointer-events-none), перехватывают только панели.
 */
export default function NovigradApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<NovigradEngineAPI | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<NovigradStats>(INITIAL_STATS);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);

  useEffect(() => {
    const engine = new NovigradEngine();
    engineRef.current = engine;
    engine.onError((m) => setError(m));
    engine.onStats((s) => setStats(s));
    engine.onReady(() => {
      // Синхронизируем значения UI с движком, чтобы панель настроек
      // всегда показывала то, что реально происходит в симуляции.
      engine.setAutoTime(true);
      engine.setTimeSpeed(0.02);
      engine.setCitizenSpeed(1);
      setReady(true);
    });
    engine.attach(canvasRef.current!);
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <>
      {/* Сцена: события мыши уходят в движок */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Интерактивная 3D-сцена: вольный город Новиград"
        className="fixed inset-0 z-0 block h-full w-full touch-none"
      />

      {/* Оверлей: корень пропускает ввод к canvas, панели перехватывают */}
      <div
        className="pointer-events-none fixed inset-0 z-10 select-none"
        style={{ fontFamily: SANS }}
      >
        {/* Мягкие градиенты для читаемости панелей */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/55 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/65 to-transparent" aria-hidden />

        {/* Шапка + кнопка «Info» для мобильных */}
        <header className="absolute left-3 top-3 flex items-start gap-3 sm:left-5 sm:top-5">
          <div className="min-w-0">
            <h1
              className="bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text text-2xl font-semibold uppercase leading-none tracking-[0.1em] text-transparent drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)] sm:text-5xl sm:tracking-[0.14em]"
              style={{ fontFamily: SERIF }}
            >
              Новиград
            </h1>
            <p className="mt-1.5 hidden text-[11px] uppercase tracking-[0.22em] text-amber-100/55 sm:block sm:text-xs">
              Вольный город · симуляция жизни на GPU · WebGL2
            </p>
          </div>

          <Sheet open={mobileInfoOpen} onOpenChange={setMobileInfoOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="О симуляции"
                className="pointer-events-auto size-11 shrink-0 border-amber-800/40 bg-black/60 text-amber-200 backdrop-blur-md hover:bg-amber-500/15 hover:text-amber-50 sm:hidden"
              >
                <Info className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-80 border-amber-800/40 bg-[#0d0a07]/95 text-amber-50 backdrop-blur-md ring-1 ring-amber-500/20 sm:w-96"
              style={{ fontFamily: SANS }}
            >
              <SheetHeader>
                <SheetTitle
                  className="text-xl uppercase tracking-[0.18em] text-amber-200"
                  style={{ fontFamily: SERIF }}
                >
                  О симуляции
                </SheetTitle>
                <SheetDescription className="text-xs leading-relaxed text-amber-100/55">
                  Как устроен вольный город под капотом
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto px-4 pb-8">
                <InfoContent />
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Метрики в правом верхнем углу */}
        <div className="absolute right-3 top-3 sm:right-5 sm:top-5">
          <StatsBar stats={stats} />
        </div>

        {/* Панель «О симуляции» (десктоп, ≥ 640px) */}
        <div className="absolute left-3 top-24 hidden sm:left-5 sm:top-28 sm:block">
          <InfoPanel />
        </div>

        {/* Нижний блок: новости + панель управления */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3 sm:p-5">
          <div className="flex justify-start">
            <EventTicker />
          </div>
          <div className="flex justify-center">
            {ready && <ControlBar engineRef={engineRef} stats={stats} />}
          </div>
        </div>
      </div>

      {/* Экраны загрузки и ошибки */}
      {!ready && !error && <LoadingOverlay />}
      {error && <ErrorOverlay message={error} />}
    </>
  );
}
