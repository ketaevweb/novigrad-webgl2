'use client';

import { ChevronDown } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const SERIF = "'Cormorant', Georgia, serif";
const SANS = "'Alegreya Sans', system-ui, sans-serif";

const FACTS: readonly string[] = [
  'До 16 384 горожан живут полностью на GPU: состояние каждого — строки float-текстур (ping-pong, MRT).',
  'Поведение: steering по графу дорог, расталкивание в толпе, коллизии через occupancy-карту 256×256.',
  'Рендер: один draw call на всех горожан (instancing), фахверк-фасады и черепица считаются в шейдерах.',
  'Цикл дня и ночи: в сумерках зажигаются окна, факелы и Вечный Огонь над храмом.',
];

/**
 * Содержимое панели «О симуляции».
 * Экспортируется отдельно, чтобы переиспользовать в мобильном Sheet.
 */
export function InfoContent() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-amber-50/85">
      {FACTS.map((fact) => (
        <p key={fact} className="flex gap-2.5">
          <span className="mt-[7px] size-1.5 shrink-0 rotate-45 bg-amber-400/80" aria-hidden />
          <span>{fact}</span>
        </p>
      ))}
      <p className="rounded-sm border border-amber-800/40 bg-amber-500/5 px-3 py-2 text-xs tracking-wide text-amber-100/70">
        «ЛКМ — вращение · Колесо — масштаб · ПКМ — обзор»
      </p>
    </div>
  );
}

/**
 * Панель «О симуляции» для десктопа: Collapsible в левом верхнем углу,
 * по умолчанию открыта. На экранах < 640px скрыта (там её заменяет Sheet).
 */
export default function InfoPanel() {
  return (
    <Collapsible
      defaultOpen
      className="pointer-events-auto w-72 rounded-md border border-amber-800/40 bg-black/60 ring-1 ring-amber-500/20 backdrop-blur-md lg:w-80"
      style={{ fontFamily: SANS }}
    >
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left">
        <span className="text-lg uppercase tracking-[0.18em] text-amber-200" style={{ fontFamily: SERIF }}>
          О симуляции
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-amber-400/80 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <InfoContent />
      </CollapsibleContent>
    </Collapsible>
  );
}
