'use client';

import { Flame, RefreshCw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';

const SERIF = "'Cormorant', Georgia, serif";
const SANS = "'Alegreya Sans', system-ui, sans-serif";

/** Локальные keyframes для экрана загрузки ( globals.css трогать нельзя ). */
const LOADING_KEYFRAMES = `
@keyframes novigrad-flicker {
  0%, 100% { transform: scale(1) rotate(-2deg); opacity: 0.85; }
  50% { transform: scale(1.14) rotate(2deg); opacity: 1; }
}
@keyframes novigrad-breathe {
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50% { opacity: 0.8; transform: scale(1.15); }
}
@keyframes novigrad-scan {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(440%); }
}
`;

/** Полноэкранный экран загрузки: показывается, пока движок не отрисовал первый кадр. */
export function LoadingOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[#0b0906] px-4 text-center"
      style={{ fontFamily: SANS }}
      aria-live="polite"
    >
      <style>{LOADING_KEYFRAMES}</style>

      <div className="relative flex size-28 items-center justify-center">
        <div
          className="absolute inset-0 rounded-full bg-amber-500/10 blur-xl"
          style={{ animation: 'novigrad-breathe 2.4s ease-in-out infinite' }}
          aria-hidden
        />
        <div className="relative flex size-20 items-center justify-center rounded-full border border-amber-800/50 bg-black/70 ring-1 ring-amber-500/25">
          <Flame
            className="size-9 text-amber-400"
            aria-hidden
            style={{ animation: 'novigrad-flicker 1.7s ease-in-out infinite' }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p
          className="text-2xl uppercase tracking-[0.22em] text-amber-100 drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)] sm:text-3xl"
          style={{ fontFamily: SERIF }}
        >
          Ворота Новиграда открываются…
        </p>
        <p className="text-xs uppercase tracking-[0.18em] text-amber-100/50 sm:text-sm">
          Генерация города · сборка GPU-состояний горожан
        </p>
      </div>

      <div className="h-px w-56 overflow-hidden rounded-full bg-amber-900/40" aria-hidden>
        <div
          className="h-full w-1/3 rounded-full bg-amber-400/80"
          style={{ animation: 'novigrad-scan 1.5s ease-in-out infinite' }}
        />
      </div>
    </div>
  );
}

interface ErrorOverlayProps {
  message: string;
}

/** Полноэкранный экран фатальной ошибки инициализации (нет WebGL2 и т.п.). */
export function ErrorOverlay({ message }: ErrorOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      style={{ fontFamily: SANS }}
    >
      <div
        role="alert"
        className="pointer-events-auto w-full max-w-md rounded-md border border-red-900/60 bg-[#12080a]/90 p-6 ring-1 ring-red-500/25"
      >
        <div className="flex items-center gap-2.5 text-red-300">
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          <h2 className="text-xl uppercase tracking-[0.18em]" style={{ fontFamily: SERIF }}>
            Ошибка инициализации
          </h2>
        </div>
        <p className="mt-3 break-words text-sm leading-relaxed text-amber-50/75">{message}</p>
        <p className="mt-2 text-xs leading-relaxed text-amber-50/45">
          Убедитесь, что браузер поддерживает WebGL2 и расширение EXT_color_buffer_float.
        </p>
        <Button
          onClick={() => window.location.reload()}
          className="mt-5 min-h-11 gap-2 bg-amber-500/90 text-[#171007] hover:bg-amber-400"
        >
          <RefreshCw className="size-4" aria-hidden />
          Обновить страницу
        </Button>
      </div>
    </div>
  );
}
