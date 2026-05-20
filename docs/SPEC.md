# Technical Specification — Screen To PDF Chrome Extension

**Version:** 1.0  
**Date:** 2026-05-16  
**Author:** Architecture decision  
**Stack:** Vanilla JS · No build step · Manifest V3  

---

## 1. Technology Decisions

| Решение | Выбор | Обоснование |
|---------|-------|-------------|
| Язык | Vanilla JavaScript (ES2022) | Нет build-шага, минимальный вес, нативная поддержка в MV3 |
| Сборщик | Отсутствует | Manifest V3 поддерживает ES Modules нативно |
| Тесты | Ручное тестирование (v1.0) | Нет дедлайна, маленький scope |
| PDF | jsPDF (UMD bundle) | Lightweight, без зависимостей, работает в браузере |
| Иконки | SVG → Canvas → PNG (генерация скриптом) | Не нужны внешние ассеты |
| Цвета аннотаций | Фиксированный набор: Red · Yellow · Black · White | По требованию |

---

## 2. File Structure

```
snapcrop/
├── manifest.json
├── background/
│   └── service-worker.js        # захват вкладки, скачивание файла
├── content/
│   ├── overlay.js               # инъекция в страницу: выделение + редактор
│   └── overlay.css              # стили overlay
├── lib/
│   └── jspdf.umd.min.js         # PDF генерация (локальная копия)
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── scripts/
    └── generate-icons.js        # одноразовый скрипт генерации иконок
```

---

## 3. Architecture & Data Flow

### 3.1 Полный flow

```
[1] Активация
    Пользователь кликает иконку / нажимает Alt+Shift+S
    → background service-worker получает событие

[2] Инъекция overlay
    service-worker → chrome.scripting.executeScript()
    → overlay.js + overlay.css инъектируются в активную вкладку

[3] Выделение области
    overlay.js показывает полноэкранный затемнённый div
    Пользователь рисует прямоугольник (mousedown → mousemove → mouseup)
    overlay.js записывает bounds: { x, y, width, height } в px

[4] Захват скриншота
    overlay.js прячет overlay (visibility: hidden, 16ms)
    overlay.js → chrome.runtime.sendMessage({ action: "capture", bounds })
    service-worker → chrome.tabs.captureVisibleTab() → dataURL (PNG, полный viewport)
    service-worker обрезает изображение под bounds через OffscreenCanvas
    service-worker → sendMessage({ action: "captured", croppedDataURL })

[5] Редактор
    overlay.js показывает editor-overlay поверх страницы
    Рисует croppedDataURL на <canvas>
    Пользователь аннотирует (стрелка / маркер / текст)

[6] Скачивание
    Пользователь выбирает PNG или PDF → нажимает "Download"
    overlay.js экспортирует canvas → dataURL
    overlay.js → chrome.runtime.sendMessage({ action: "download", dataURL, format, filename })
    service-worker → chrome.downloads.download()

[7] Завершение
    overlay.js удаляет все DOM-элементы
    Страница возвращается в исходное состояние
```

### 3.2 Script Injection Order

При активации service-worker выполняет вызовы **строго последовательно**:

```js
await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/overlay.css'] });
await chrome.scripting.executeScript({ target: { tabId }, files: ['lib/jspdf.umd.min.js'] });
await chrome.scripting.executeScript({ target: { tabId }, files: ['content/overlay.js'] });
```

jsPDF должен быть загружен до overlay.js — иначе `jsPDF` будет undefined при экспорте PDF.

### 3.3 Message Protocol

Полная таблица сообщений между content script и service-worker:

| Направление | `action` | Данные | Когда |
|-------------|----------|--------|-------|
| content → SW | `"capture"` | `{ bounds: {x,y,w,h}, devicePixelRatio }` | После выделения области |
| SW → content | `"captured"` | `{ croppedDataURL }` | После обрезки скриншота |
| SW → content | `"capture_error"` | `{ message }` | При ошибке captureVisibleTab |
| content → SW | `"download"` | `{ dataURL, format, filename }` | Нажата кнопка Download |

**Важно:** SW получает `tabId` из `sender.tab.id` в `chrome.runtime.onMessage` listener.  
Для ответа SW использует `chrome.tabs.sendMessage(sender.tab.id, { action: 'captured', ... })`.

### 3.4 Обработка devicePixelRatio (Retina)

`captureVisibleTab` возвращает изображение в физических пикселях.  
Bounds из overlay записываются в CSS-пикселях.  
При обрезке: `physicalX = cssX * window.devicePixelRatio`

---

## 4. manifest.json

```json
{
  "manifest_version": 3,
  "name": "Screen To PDF",
  "version": "1.0.0",
  "description": "Capture any area of the page, annotate, and save as PNG or PDF.",
  "permissions": [
    "activeTab",
    "scripting",
    "downloads"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    },
    "default_title": "Screen To PDF — Take Screenshot (Alt+Shift+S)"
  },
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Alt+Shift+S",
        "mac": "Alt+Shift+S"
      },
      "description": "Activate Screen To PDF"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  "web_accessible_resources": [
    {
      "resources": ["lib/jspdf.umd.min.js", "content/overlay.css"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

---

## 5. Background Service Worker

**Файл:** `background/service-worker.js`

### Ответственности
- Слушать `chrome.action.onClicked` → инъектировать overlay
- Слушать сообщение `capture` → вызвать `captureVisibleTab` → обрезать → ответить
- Слушать сообщение `download` → вызвать `chrome.downloads.download`
- Хранить сессионный счётчик файлов

### Счётчик файлов
```js
// In-memory, сбрасывается при перезагрузке расширения
let sessionCounter = 0;

function generateFilename(format) {
  sessionCounter++;
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const count = String(sessionCounter).padStart(3, '0');
  return `snapcrop_${date}_${count}.${format}`;
}
```

### Обрезка через OffscreenCanvas
```js
async function cropImage(dataURL, bounds, devicePixelRatio) {
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  
  const dpr = devicePixelRatio || 1;
  const canvas = new OffscreenCanvas(
    bounds.width * dpr,
    bounds.height * dpr
  );
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap,
    bounds.x * dpr, bounds.y * dpr,
    bounds.width * dpr, bounds.height * dpr,
    0, 0,
    bounds.width * dpr, bounds.height * dpr
  );
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return await blobToDataURL(croppedBlob);
}
```

---

## 6. Content Script — Overlay

**Файл:** `content/overlay.js`

### 6.1 Capture Timing — надёжное скрытие overlay

**Проблема:** фиксированная задержка 16ms ненадёжна — браузер может не успеть перерисовать страницу.  
**Решение:** двойной `requestAnimationFrame` гарантирует что overlay убран до захвата:

```js
overlay.style.visibility = 'hidden';
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    chrome.runtime.sendMessage({
      action: 'capture',
      bounds,
      devicePixelRatio: window.devicePixelRatio
    });
  });
});
```

### 6.2 Фазы overlay

| Фаза | Описание |
|------|----------|
| `SELECTION` | Полноэкранный тёмный div, cursor: crosshair, подсказка "Drag to select area" |
| `HIDDEN` | overlay скрыт через double-rAF пока captureVisibleTab делает снимок |
| `EDITOR` | overlay снова видим, показывает canvas с редактором |

### 6.2 Selection overlay

```
┌─────────────────────────────────────────────┐
│  (тёмный фон, opacity 0.5)                  │
│                                             │
│         Drag to select area  [ESC to cancel]│
│                                             │
│    ┌──────────────────────┐                 │
│    │  (выделенная область │                 │
│    │   — светлее фона)    │                 │
│    │  W: 540  H: 320      │                 │
│    └──────────────────────┘                 │
│                                             │
└─────────────────────────────────────────────┘
```

- Overlay: `position: fixed`, `inset: 0`, `z-index: 2147483647`
- Выделенная область: `mix-blend-mode: normal`, фон прозрачный (punch-through через clip-path или второй div)
- Размеры отображаются внутри выделения

### 6.3 Editor overlay

```
┌─────────────────────────────────────────────┐
│ TOOLBAR  [→ Arrow][■ Marker][T Text] ────── │
│          [● Red][● Yellow][● Black][● White] │
│          [↩ Undo][✕ Clear]    [✕ Close]     │
├─────────────────────────────────────────────┤
│                                             │
│          ┌────────────────────┐             │
│          │                   │             │
│          │   CANVAS (crop)   │             │
│          │                   │             │
│          └────────────────────┘             │
│                                             │
├─────────────────────────────────────────────┤
│ FORMAT: ( ) PNG  ( ) PDF      [↓ Download]  │
└─────────────────────────────────────────────┘
```

---

## 7. Annotation Engine

### 7.1 Модель данных

Аннотации хранятся как список команд (не пиксели). Это позволяет Undo без потери качества.

```js
// Структура аннотации
{
  type: 'arrow' | 'marker' | 'text',
  color: '#FF3B30' | '#FFD60A' | '#000000' | '#FFFFFF',
  // arrow:
  x1, y1, x2, y2,
  // marker:
  x, y, width, height,
  // text:
  x, y, content,
}
```

При каждом изменении: очищаем canvas → рисуем исходный скриншот → применяем все аннотации из списка.

### 7.2 Инструмент: Стрелка

- Stroke: 3px, цвет из выбранного свотча
- Arrowhead: равносторонний треугольник, размер = 12px, угол вычисляется из `atan2(y2-y1, x2-x1)`
- Рисуется: mousedown (start) → mousemove (preview) → mouseup (commit)

### 7.3 Инструмент: Маркер

- Прямоугольник, fill: выбранный цвет, opacity: `0.35`
- Нет stroke
- Рисуется: mousedown → mousemove → mouseup

### 7.4 Инструмент: Текст

- Click на canvas → появляется нативный `<input>` поверх canvas в той же позиции
- Font: `bold 16px Arial, sans-serif`
- Enter или click вне input → commit → input удаляется → текст рисуется на canvas
- ESC → отменяет без коммита

### 7.5 Фиксированные цвета

| Название | HEX | Применение |
|----------|-----|-----------|
| Red | `#FF3B30` | Акцент, ошибки |
| Yellow | `#FFD60A` | Выделение |
| Black | `#000000` | Текст, стрелки |
| White | `#FFFFFF` | На тёмном фоне |

Цвет по умолчанию: Red.

### 7.6 Undo / Clear

- **Undo:** `annotations.pop()` → перерисовка
- **Clear:** `annotations = []` → перерисовка
- Сам исходный скриншот всегда хранится отдельно, не затрагивается

---

## 8. Export

### 8.1 PNG

```js
const dataURL = canvas.toDataURL('image/png');
```

### 8.2 PDF (A4)

```js
const pdf = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4'
});

// A4: 210 x 297 mm
// Вписываем изображение с сохранением пропорций, отступ 10mm
const pageW = 190; // 210 - 2*10
const pageH = 277; // 297 - 2*10

const imgW = canvas.width;
const imgH = canvas.height;
const ratio = Math.min(pageW / imgW, pageH / imgH);

const drawW = imgW * ratio;
const drawH = imgH * ratio;
const offsetX = (210 - drawW) / 2;
const offsetY = (297 - drawH) / 2;

pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG',
  offsetX, offsetY, drawW, drawH);

const pdfDataURL = pdf.output('datauristring');
```

### 8.3 Скачивание

```js
// overlay.js → service-worker
chrome.runtime.sendMessage({
  action: 'download',
  dataURL: pdfDataURL || pngDataURL,
  format: 'png' | 'pdf'
});

// service-worker
chrome.downloads.download({
  url: dataURL,
  filename: generateFilename(format),
  saveAs: false  // сразу в Downloads без диалога
});
```

---

## 9. Overlay CSS — ключевые правила

### CSS Isolation
Страница может иметь глобальные стили (reset, font, box-sizing), которые сломают overlay.  
Каждый корневой элемент Screen To PDF начинается с `all: initial` чтобы сбросить наследование:

```css
/* Применяется к каждому корневому элементу overlay */
#snapcrop-overlay,
#snapcrop-editor,
#snapcrop-toolbar,
#snapcrop-toast {
  all: initial;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

```css
#snapcrop-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483647 !important;
  background: rgba(0, 0, 0, 0.5);
  cursor: crosshair;
  user-select: none;
}

#snapcrop-editor {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483647 !important;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

#snapcrop-toolbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: #1C1C1E;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  z-index: 2147483647;
}

#snapcrop-canvas {
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 120px);
  object-fit: contain;
  cursor: crosshair;
}

#snapcrop-toast {
  position: fixed !important;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #FF3B30;
  color: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 2147483647 !important;
  animation: snapcrop-fadein 0.2s ease, snapcrop-fadeout 0.3s ease 2.7s forwards;
}
```

---

## 10. Edge Cases & Error Handling

| Ситуация | Поведение |
|----------|-----------|
| Пользователь нажал ESC во время выделения | Overlay удаляется, страница нормальная |
| Выделение меньше 10×10px | Выделение сбрасывается; подсказка мигает "Select a larger area" |
| `captureVisibleTab` вернул ошибку | Overlay закрывается + toast "Screenshot failed, try again" (3 сек) |
| Overlay уже активен при повторной активации | Второй overlay не создаётся (проверка `document.getElementById('snapcrop-overlay')`) |
| Страница с `chrome://` или `edge://` URL | Chrome блокирует `scripting.executeScript` — исключение поймать в SW, молча игнорировать |
| jsPDF не загружен | PDF-кнопка `disabled`, PNG всегда доступен |
| Пользователь переходит на другую страницу пока overlay открыт | `window.addEventListener('beforeunload', cleanup)` — cleanup() удаляет все DOM-элементы Screen To PDF |

### Error UX — Toast реализация

```js
function showToast(message) {
  const existing = document.getElementById('snapcrop-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'snapcrop-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// В обработчике сообщений от SW:
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'capture_error') {
    cleanup();
    showToast('Screenshot failed, try again');
  }
});
```

---

## 11. PDF / Retina Strategy

На Retina-дисплеях `devicePixelRatio = 2`, поэтому canvas имеет физическое разрешение в 2× раза больше CSS-пикселей. Без нормализации PDF будет избыточно тяжёлым.

**Стратегия:** перед `pdf.addImage()` нормализовать canvas до максимальной ширины 1920px:

```js
async function getExportCanvas(sourceCanvas) {
  const MAX_WIDTH = 1920;
  if (sourceCanvas.width <= MAX_WIDTH) return sourceCanvas;

  const scale = MAX_WIDTH / sourceCanvas.width;
  const offscreen = new OffscreenCanvas(
    Math.round(sourceCanvas.width * scale),
    Math.round(sourceCanvas.height * scale)
  );
  const ctx = offscreen.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, offscreen.width, offscreen.height);
  return offscreen;
}
```

Для PNG экспорта нормализация не применяется — сохраняем полное качество.

## 12. Icons Generation

**Файл:** `scripts/generate-icons.js` (Node.js ≥ 18, запускается **один раз** перед публикацией)

**Зависимость:** пакет `canvas` (`npm install canvas --save-dev` — только для генерации, не попадает в расширение).

```bash
# Одноразовая команда:
node scripts/generate-icons.js
# Результат: icons/icon16.png, icon32.png, icon48.png, icon128.png
```

Иконка: синий прямоугольник (`#2563EB`) с белым crosshair — минималистично, узнаваемо.  
Размеры: 16 · 32 · 48 · 128 px

---

## 13. Implementation Phases

| Фаза | Задачи | Результат |
|------|--------|-----------|
| **Phase 1** | manifest.json, service-worker скелет, инъекция content script | Расширение загружается, иконка видна |
| **Phase 2** | Selection overlay, захват области, captureVisibleTab, обрезка | Скриншот выделенной области |
| **Phase 3** | Editor overlay, Canvas, базовое рисование аннотаций | Стрелка + маркер + текст работают |
| **Phase 4** | Undo/Clear, выбор цвета, PNG/PDF экспорт, скачивание | Полный рабочий flow |
| **Phase 5** | Иконки, polish UI, edge cases, тестирование в Web Store | Готово к публикации |

---

## 14. Chrome Web Store — Checklist

- [ ] Privacy policy URL (обязательна для расширений с `activeTab`)
- [ ] Screenshots 1280×800 или 640×400 (минимум 1)
- [ ] Описание на английском (до 132 символов — краткое, до 16 000 — полное)
- [ ] Категория: `Productivity`
- [ ] Версия в manifest.json соответствует Store
