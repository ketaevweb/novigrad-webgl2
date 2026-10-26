# Worklog — Новиград (Witcher 3) WebGL2 GPU city life simulation

---
Task ID: 1
Agent: main (orchestrator)
Task: Изучить проект, спланировать, зафиксировать контракт движка

Work Log:
- Изучена структура Next.js 16 + TS + Tailwind 4 + shadcn/ui (все ui-компоненты есть в src/components/ui).
- Определена архитектура: единственная страница `/` с полноэкранным canvas и оверлей-UI.
- Движок (клиентский, без SSR): src/lib/novigrad/{types,gl,shaders,city,simulation,engine}.ts
  - GPU-симуляция горожан: ping-pong RGBA32F текстуры через MRT (3 attachments), steering по графу дорог (waypoint-текстуры), коллизии через occupancy-текстуру 256x256.
  - Рендер: instancing (дома/крыши/цилиндры/конусы/горожане/спрайты), процедурные фахверк-фасады в фрагментном шейдере, день/ночь, планарные тени-блобы, порт с водой, храм Вечного Огня, маяк, чайки.
- Зафиксирован публичный контракт в src/lib/novigrad/types.ts (NovigradEngineAPI, NovigradStats, CameraMode, POI).

Stage Summary:
- Контракт заморожен; UI-агент может строить оверлей по types.ts, движок реализую по тому же контракту.

---
Task ID: 2-a
Agent: frontend-styling-expert
Task: UI-оверлей Новиграда (React-слой поверх WebGL2-движка)

Work Log:
- Прочитан контракт src/lib/novigrad/types.ts (заморожен) и worklog от orchestrator.
- Создана папка src/components/novigrad/ с 6 файлами (только оверлей, src/lib/** и page.tsx не тронуты):
  - NovigradApp.tsx — 'use client', default export; fixed canvas (z-0, touch-none) + engine-подключение строго в useEffect (new NovigradEngine → onError/onStats/onReady → attach → dispose в cleanup); в onReady движок синхронизируется с дефолтами UI (setAutoTime(true), setTimeSpeed(0.02), setCitizenSpeed(1)); оверлей-корень pointer-events-none fixed inset-0 z-10, панели — pointer-events-auto; Header «НОВИГРАД» (Cormorant, uppercase, tracking, amber-градиент) + подпись; на <640px кнопка Info (sm:hidden) открывает Sheet side="left" с InfoContent.
  - StatsBar.tsx — чипы FPS/Горожане/Время/Такт (Gauge, Users, Clock, Cpu), tabular-nums, подписи скрыты на мобильных, значения из stats.
  - InfoPanel.tsx — Collapsible (defaultOpen, ≥640px, hidden sm:block): 4 факта о GPU-симуляции + подсказка «ЛКМ — вращение · Колесо — масштаб · ПКМ — обзор»; экспортирует InfoContent для переиспользования в мобильном Sheet.
  - ControlBar.tsx — нижняя панель с группами и вертикальными Separator: Население (1024/4096/9216/16384, активная = pendingPop с оптимистичной подсветкой, синхронизируется со stats.population без setState-in-effect), Камера (Свободная/Тур/За горожанином + кнопка «Следующий» с SkipForward в follow-режиме), Места (Площадь/Храм/Порт/Стены/Маяк с MapPin → focusPOI), шестерёнка Settings2 → Popover: Slider времени 0..24 (значение чч:мм, при авто «живёт» вместе с stats.clock, во время drag — локальное значение через onValueCommit; Switch «Авто»), Slider хода времени 0..0.1/0.005 («ч/сек»), Slider темпа жизни 0.25..3/0.05 («×»).
  - EventTicker.tsx — 10 новостей, смена каждые 11с через setInterval + fade (transition-opacity 500ms, swap через 600ms), cleanup таймеров, aria-live="polite".
  - Overlays.tsx — LoadingOverlay (Flame с локальными CSS-keyframes flicker/breathe/scan в <style>, «Ворота Новиграда открываются…» + подзаголовок) и ErrorOverlay (role="alert", красная рамка, текст ошибки, подсказка про WebGL2/EXT_color_buffer_float, кнопка «Обновить страницу» → window.location.reload()).
- Стиль: bg-black/60 backdrop-blur-md, border-amber-800/40, ring-1 ring-amber-500/20, text-amber-50, акцент amber-300/400 (#d4a94e), шрифты инлайном ('Cormorant', Georgia, serif / 'Alegreya Sans', system-ui, sans-serif), без эмодзи, весь текст на русском, aria-label на всех кнопках, интерактивные элементы min-h-11 (44px), слайдеры h-11.
- Проверки: tsc против type-stub контракта (папка вне проекта, удалена после проверки) — 0 ошибок по 6 файлам; eslint только по src/components/novigrad — 0 ошибок (устранены react-hooks/refs: движок передаётся в ControlBar как RefObject и читается лишь в обработчиках; react-hooks/set-state-in-effect: убран эффект синхронизации населения). Глобальный lint и dev-сервер не запускались.

Stage Summary:
- UI-оверлей полностью готов и изолирован в src/components/novigrad/ (NovigradApp.tsx + 5 подкомпонентов); интеграция — только по замороженному контракту '@/lib/novigrad/types'.
- Единственный оставшийся TS-ошибкой в оверлее является ожидаемый import '@/lib/novigrad/engine' — файл появится от движкового агента (контракт совпадает со стабом, на котором проверка прошла).
- Для полного вида шрифтов рекомендуется добавить Google Fonts (Cormorant, Alegreya Sans) в layout.tsx — сейчас работают fallback Georgia/system-ui (правки layout вне моей зоны).
- Оркестратору: отрендерить <NovigradApp /> на странице '/'; файлы src/lib/novigrad/*, page.tsx, layout.tsx не изменялись.

---
Task ID: 2-b/2-c/2-d/2-e + 3/4
Agent: main (orchestrator)
Task: WebGL2-движок Новиграда: шейдеры, генерация города, GPU-симуляция, рендер; интеграция и E2E-верификация

Work Log:
- gl.ts: программа/VAO/текстуры/FBO-хелперы, процедурная геометрия (куб y∈[0,1], призма-крыша, цилиндр, конус, квад), mat4 (perspective/lookAt/mul).
- shaders.ts (14 программ): SIM_FS — MRT-симуляция (steering к waypoint из RGBA32F-текстур, расталкивание 3 случайных соседей, коллизии через occupancy R8 256², осевые слайды при блокировке, idle/площадь-поведение, сглаживание facing); ENCODE — readback позиции follow-горожанина в RGBA8 1×1; SKY (солнце/луна/звёзды/облака/диск); TERRAIN (трава/брусчатка/дерево/дно); WATER (аналитические волны, Френель, спекуляр, прибой); BOX (типы 0-10: фахверк с балками/раскосами/окнами с ночным светом, камень стен/башен, храм с арками и Вечным Огнём, доски, склад, полосатые навесы, парус, набережная с водорослями); ROOF (черепица/фронтоны); CYL/CONE (камень/бочки с обручами/листва/патина/вода фонтана); CITIZEN (4 части из одного куба: ноги-маятники по phase, торс, голова, палитра 14 цветов, стража); SHADOW_BOX (проекция куба на землю по свету, depthFunc LESS против двойного блендинга) + SHADOW_BLOB; SPRITE (пламя-teardrop с wobble, glow, световые пятна, чайки, Вечное пламя, маяк); POST (FXAA-lite, виньетка, зерно, тёплый грейд).
- city.ts: seeded-генерация — кольцевая дорога r95 + 7 радиал + bypass вокруг храма, стены r100 (64 сегмента, ворота, башни), храм Вечного Огня (зал 24×34, шпиль 26м, лестницы, фланкирующие башни), фонтан, 20 лавок вокруг площади + 560 домов (отсев по дорогам/зданиям, ориентация на улицу), склады порта, причалы/кран/бочки/ящики/навесы, 4 корабля + 2 лодки (bob в VS), маяк на скале, ~70 факелов со спрайтами, деревья, 24 чайки; граф 187 waypoints (блок площади [0,46), кольцо, радиалы, набережная, пирсы) с adjacency ≤8 в RGBA32F-текстурах; occupancy 256²: вода/за стенами — блок, дороги/площадь/причалы — свободно, здания/дерева/реквизит — блок.
- simulation.ts: ping-pong 2×(S0,S1,T RGBA32F + FBO MRT), populate (14% стартуют на площади), step (uniforms: dt, TS, plaza-диапазон), readFollow через RGBA8-энкодер, nextCitizen.
- engine.ts: камера orbit (yaw/pitch/dist, автоспин до первого ввода, pinch/pan/zoom), кинематографический тур (catmull-rom 8 ключей), follow (readback каждые 4 кадра), focusPOI с tween по target/dist/pitch/yaw (кратчайшая дуга); день/ночь по tod (φ=(tod−6)/12·π), цвета солнца/ambient/fog/зенит/горизонт, nightF → окна/факелы; passes: sky→terrain→box-тени→blob-тени→opaque(boxes/roofs/cyl/cone/citizens)→water→sprites(alpha/additive)→post; scene FBO RGBA8+D24, DPR ≤1.5; URL-параметры ?pop=, ?lite=1; статистика 2×/сек.
- Интеграция: page.tsx → NovigradApp; layout.tsx — lang=ru, метаданные «Новиград», Google Fonts (Cormorant + Alegreya Sans), overflow-hidden; UI-агентские компоненты приняты, ControlBar дополнен setCameraMode('free') при клике POI (синхронизация активной кнопки).
- Верификация agent-browser (SwiftShader): рендер города ✓; 16384 горожан без крашей ✓; ночь 22:00 — окна/факелы/глоу ✓; Тур ✓; Follow + «Следующий» ✓; POI Площадь/Храм/Порт/Стены/Маяк ✓; слайдеры настроек ✓; мобильный 390×844 ✓; dev.log без ошибок; lint 0 errors (1 допустимый warning о шрифтах); tsc чисто по novigrad.
- Исправления по ходу: форма пламени teardrop вместо шара, размер чаек, glow Вечного Огня 26→13м, yaw в focusPOI (камера не застревает в домах), мобильный хедер, приватные поля CitizenSim → public, SHADOW_BOX переписан на проекцию куба.

Stage Summary:
- Полностью рабочий Новиград: процедурный город (~1250 инстансов геометрии, ~12 draw call'ов) + GPU-симуляция до 16 384 горожан (ping-pong RGBA32F, MRT, occupancy-коллизии) + день/ночь + 3 режима камеры + 5 POI + ведьмачий UI-оверлей.
- Ключевые файлы: src/lib/novigrad/{types,gl,shaders,city,simulation,engine}.ts, src/components/novigrad/*.tsx, src/app/{page,layout}.tsx.
- На реальном GPU ожидается 60 FPS (в headless SwiftShader — единицы FPS, это ограничение софтверного рендера, не баг).
