/**
 * Публичный контракт движка Новиграда.
 * ЭТИ ТИПЫ МЕНЯТЬ НЕЛЬЗЯ — от них зависят UI (src/components/novigrad) и движок.
 */

export type CameraMode = 'free' | 'cinematic' | 'follow';

export type POI = 'plaza' | 'temple' | 'harbor' | 'walls' | 'lighthouse';

export interface NovigradStats {
  /** усреднённый FPS (за ~0.5с) */
  fps: number;
  /** текущая численность горожан */
  population: number;
  /** игровое время строкой, например "13:45" */
  clock: string;
  /** длительность такта GPU-симуляции, мс (CPU-замер) */
  simMs: number;
}

export interface NovigradEngineAPI {
  /** Инициализирует WebGL2 и запускает цикл рендера. Вызывать один раз из useEffect. */
  attach(canvas: HTMLCanvasElement): void;
  dispose(): void;

  /** город готов (первый кадр отрисован) */
  onReady(cb: () => void): void;
  /** статистика ~2 раза в секунду */
  onStats(cb: (s: NovigradStats) => void): void;
  /** фатальная ошибка (нет WebGL2 / EXT_color_buffer_float и т.п.) */
  onError(cb: (msg: string) => void): void;

  /** население: 1024 | 4096 | 9216 | 16384 (пересоздаёт GPU-состояния) */
  setPopulation(n: number): void;

  /** авто-ход времени суток вкл/выкл */
  setAutoTime(v: boolean): void;
  /** установить время суток в часах 0..24 (авто при этом продолжает с этой точки) */
  setTimeOfDay(t: number): void;
  /** скорость суточного цикла, игровых часов за реальную секунду (0..0.25) */
  setTimeSpeed(v: number): void;
  /** множитель скорости горожан 0.25..3 */
  setCitizenSpeed(v: number): void;

  /** режим камеры: свободная / кинематографический тур / следовать за горожанином */
  setCameraMode(m: CameraMode): void;
  /** плавный перелёт к достопримечательности */
  focusPOI(p: POI): void;
  /** в режиме follow: переключить наблюдаемого горожанина */
  nextCitizen(): void;
}
