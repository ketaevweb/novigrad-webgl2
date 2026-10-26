'use client';

import { useEffect, useState } from 'react';
import { Newspaper } from 'lucide-react';

const SANS = "'Alegreya Sans', system-ui, sans-serif";

const NEWS: readonly string[] = [
  'На площади объявили о прибывшем караване из Оксенфурта',
  'Стража задержала карманника у Восточных ворот',
  'В таверне „Пьяный грифон“ затеялась драка',
  'В храм Вечного Огня стекаются паломники',
  'Рыбаки вернулись в порт с богатым уловом',
  'Глашатай читает указ градоначальника',
  'Купец из Цидариса торгуется за специи',
  'На пристани выгрузили шесть бочек ракса',
  'Дети гоняют мяч у фонтана',
  'Бард настроил лютню — вечером концерт у ратуши',
];

const SWAP_MS = 600; // длительность fade-перехода
const TICK_MS = 11000; // период смены новости

/** Узкая строка городских новостей в левом нижнем углу, смена каждые 11 секунд. */
export default function EventTicker() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let swapTimer: ReturnType<typeof setTimeout> | undefined;

    const interval = setInterval(() => {
      setVisible(false);
      swapTimer = setTimeout(() => {
        setIndex((prev) => (prev + 1) % NEWS.length);
        setVisible(true);
      }, SWAP_MS);
    }, TICK_MS);

    return () => {
      clearInterval(interval);
      if (swapTimer !== undefined) clearTimeout(swapTimer);
    };
  }, []);

  return (
    <div
      className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-md border border-amber-800/40 bg-black/60 px-3 py-2 ring-1 ring-amber-500/20 backdrop-blur-md"
      style={{ fontFamily: SANS }}
    >
      <Newspaper className="size-4 shrink-0 text-amber-400" aria-hidden />
      <p className="min-w-0 text-xs leading-snug text-amber-100/75" aria-live="polite">
        <span className={`block truncate transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
          {NEWS[index]}
        </span>
      </p>
    </div>
  );
}
