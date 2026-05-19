window.SnapCrop = window.SnapCrop || {};

window.SnapCrop.Editor = (function () {
  const COLORS = [
    { name: 'Red',    hex: '#FF3B30' },
    { name: 'Yellow', hex: '#FFD60A' },
    { name: 'Black',  hex: '#000000' },
    { name: 'White',  hex: '#FFFFFF' }
  ];

  const PANEL_WIDTH = 116;
  const PANEL_GAP   = 12;

  // mode: 'idle' | 'panel' | 'editing'
  let mode = 'idle';
  let onCaptureCallback = null;

  let frameEl = null;
  let panelEl = null;
  let canvasEl = null;

  let currentTool  = 'arrow';
  let currentColor = '#FF3B30';
  let isDrawing    = false;
  let startX = 0;
  let startY = 0;
  let activeTextInput = null;

  /* ── Phase 1: show panel only (no capture yet) ── */

  function showPanel(bounds, onCapture) {
    mode = 'panel';
    onCaptureCallback = onCapture;
    panelEl = buildPanel(bounds);
    document.body.appendChild(panelEl);
    panelEl.addEventListener('click', onPanelClick);
    document.addEventListener('keydown', onKeyDown);
  }

  /* ── Phase 2: capture done, switch to edit mode ── */

  function open(croppedDataURL, bounds) {
    mode = 'editing';
    onCaptureCallback = null;

    frameEl = document.createElement('div');
    frameEl.id = 'sc-canvas-frame';
    frameEl.style.cssText = [
      'position: fixed !important',
      `left: ${bounds.x}px`,
      `top: ${bounds.y}px`,
      `width: ${bounds.width}px`,
      `height: ${bounds.height}px`,
      'z-index: 2147483646 !important',
      'box-shadow: 0 0 0 9999px rgba(0,0,0,0.55)',
      'line-height: 0'
    ].join(';');

    canvasEl = document.createElement('canvas');
    canvasEl.id = 'snapcrop-canvas';
    frameEl.appendChild(canvasEl);
    document.body.appendChild(frameEl);

    const img = new Image();
    img.onload = () => {
      canvasEl.width  = img.naturalWidth;
      canvasEl.height = img.naturalHeight;
      window.SnapCrop.Annotations.init(canvasEl, croppedDataURL);
    };
    img.src = croppedDataURL;

    canvasEl.addEventListener('mousedown', onCanvasMouseDown);
    document.addEventListener('mousemove', onCanvasMouseMove);
    document.addEventListener('mouseup',   onCanvasMouseUp);
  }

  /* ── PANEL BUILDER ── */

  function buildPanel(bounds) {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let left = bounds.x + bounds.width + PANEL_GAP;
    if (left + PANEL_WIDTH > viewW) left = bounds.x - PANEL_WIDTH - PANEL_GAP;
    left = Math.max(8, left);

    let top = Math.max(8, Math.min(bounds.y, viewH - 360));

    const panel = document.createElement('div');
    panel.id = 'sc-panel';
    panel.style.cssText = [
      'position: fixed !important',
      `left: ${left}px`,
      `top: ${top}px`,
      'z-index: 2147483647 !important'
    ].join(';');

    // Close button at top right
    const header = el('div', 'sc-panel-header');
    const closeBtn = el('button', 'sc-panel-close-top');
    closeBtn.id = 'sc-close';
    closeBtn.textContent = '✕';
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Tool icons 2×2 grid
    const toolGrid = el('div', 'sc-tools-grid');
    [
      { id: 'arrow',   icon: '↗', title: 'Стрелка'       },
      { id: 'marker',  icon: '□', title: 'Прямоугольник'  },
      { id: 'ellipse', icon: '○', title: 'Круг'           },
      { id: 'text',    icon: 'T', title: 'Текст'          }
    ].forEach(t => {
      const btn = el('button', 'sc-tool-icon-btn sc-tool-btn');
      btn.dataset.tool = t.id;
      btn.textContent  = t.icon;
      btn.title        = t.title;
      toolGrid.appendChild(btn);
    });
    panel.appendChild(toolGrid);

    panel.appendChild(divider());

    const colorRow = el('div', 'sc-panel-colors');
    COLORS.forEach(c => {
      const btn = el('button', 'sc-color-btn' + (c.hex === '#FF3B30' ? ' active' : ''));
      btn.dataset.color = c.hex;
      btn.title = c.name;
      btn.style.setProperty('--sc-color', c.hex);
      colorRow.appendChild(btn);
    });
    panel.appendChild(colorRow);

    panel.appendChild(divider());

    const undoBtn = el('button', 'sc-panel-btn');
    undoBtn.id = 'sc-undo';
    undoBtn.textContent = '↩ Undo';
    panel.appendChild(undoBtn);

    panel.appendChild(divider());

    ['png', 'pdf'].forEach(f => {
      const label = el('label', 'sc-panel-radio');
      const radio = document.createElement('input');
      radio.type    = 'radio';
      radio.name    = 'sc-format';
      radio.value   = f;
      radio.checked = (f === 'png');
      label.appendChild(radio);
      label.append(' ' + f.toUpperCase());
      panel.appendChild(label);
    });

    panel.appendChild(divider());

    const copyBtn = el('button', 'sc-copy-btn');
    copyBtn.id = 'sc-copy';
    copyBtn.textContent = 'Copy';
    panel.appendChild(copyBtn);

    const dlBtn = el('button', 'sc-panel-download');
    dlBtn.id = 'sc-download';
    dlBtn.textContent = '↓ Download';
    panel.appendChild(dlBtn);

    return panel;
  }

  /* ── EVENT HANDLERS ── */

  function onPanelClick(e) {
    const toolBtn = e.target.closest('.sc-tool-btn');
    if (toolBtn) {
      currentTool = toolBtn.dataset.tool;
      panelEl.querySelectorAll('.sc-tool-btn').forEach(b => b.classList.remove('active'));
      toolBtn.classList.add('active');
      if (mode === 'panel') { triggerCapture(); return; }
      return;
    }

    const colorBtn = e.target.closest('.sc-color-btn');
    if (colorBtn) {
      currentColor = colorBtn.dataset.color;
      panelEl.querySelectorAll('.sc-color-btn').forEach(b => b.classList.remove('active'));
      colorBtn.classList.add('active');
      if (mode === 'panel') { triggerCapture(); return; }
      return;
    }

    const id = e.target.id;
    if (id === 'sc-close') { window.SnapCrop.cleanup(); return; }

    if (mode !== 'editing') return;

    if (id === 'sc-undo')     { window.SnapCrop.Annotations.undo();  return; }
    if (id === 'sc-copy')     { onCopy();                            return; }
    if (id === 'sc-download') { onDownload();                        return; }
  }

  function triggerCapture() {
    if (!onCaptureCallback) return;
    const cb = onCaptureCallback;
    onCaptureCallback = null;
    cb();
  }

  function onCanvasMouseDown(e) {
    if (mode !== 'editing') return;
    e.preventDefault();
    if (currentTool === 'text') { startTextInput(e); return; }
    isDrawing = true;
    const pos = canvasPos(e);
    startX = pos.x;
    startY = pos.y;
  }

  function onCanvasMouseMove(e) {
    if (!isDrawing) return;
  }

  function onCanvasMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    const { x: endX, y: endY } = canvasPos(e);

    if (currentTool === 'arrow') {
      window.SnapCrop.Annotations.add({
        type: 'arrow', color: currentColor,
        x1: startX, y1: startY, x2: endX, y2: endY
      });
    } else if (currentTool === 'marker') {
      window.SnapCrop.Annotations.add({
        type: 'marker', color: currentColor,
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width:  Math.abs(endX - startX),
        height: Math.abs(endY - startY)
      });
    } else if (currentTool === 'ellipse') {
      window.SnapCrop.Annotations.add({
        type: 'ellipse', color: currentColor,
        cx: (startX + endX) / 2,
        cy: (startY + endY) / 2,
        rx: Math.abs(endX - startX) / 2,
        ry: Math.abs(endY - startY) / 2
      });
    }
  }

  function canvasPos(e) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasEl.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvasEl.height / rect.height)
    };
  }

  function startTextInput(e) {
    if (activeTextInput) commitText();
    const rect = canvasEl.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasEl.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvasEl.height / rect.height);

    const input = document.createElement('input');
    input.id    = 'sc-text-input';
    input.type  = 'text';
    input.style.left  = e.clientX + 'px';
    input.style.top   = e.clientY + 'px';
    input.style.color = currentColor;
    document.body.appendChild(input);
    input.focus();
    activeTextInput = { el: input, cx, cy };

    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter')  commitText();
      if (ev.key === 'Escape') cancelText();
    });
    input.addEventListener('blur', () => commitText());
  }

  function commitText() {
    if (!activeTextInput) return;
    const { el: input, cx, cy } = activeTextInput;
    if (input.value.trim()) {
      window.SnapCrop.Annotations.add({
        type: 'text', color: currentColor,
        x: cx, y: cy + 16,
        content: input.value
      });
    }
    input.remove();
    activeTextInput = null;
  }

  function cancelText() {
    if (!activeTextInput) return;
    activeTextInput.el.remove();
    activeTextInput = null;
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && !activeTextInput) {
      window.SnapCrop.cleanup();
    }
  }

  async function onCopy() {
    const canvas = window.SnapCrop.Annotations.getCanvas();
    if (!canvas) return;
    try {
      const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      // clipboard unavailable (HTTP page or permission denied)
    }
  }

  async function onDownload() {
    const checked = panelEl.querySelector('input[name="sc-format"]:checked');
    const fmt = checked ? checked.value : 'png';
    const canvas = window.SnapCrop.Annotations.getCanvas();
    await window.SnapCrop.Exporter.download(canvas, fmt);
    window.SnapCrop.cleanup();
  }

  /* ── UTILS ── */

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function divider() { return el('div', 'sc-panel-divider'); }

  function destroy() {
    if (activeTextInput) { activeTextInput.el.remove(); activeTextInput = null; }
    document.removeEventListener('mousemove', onCanvasMouseMove);
    document.removeEventListener('mouseup',   onCanvasMouseUp);
    document.removeEventListener('keydown',   onKeyDown);
    if (frameEl) { frameEl.remove(); frameEl = null; }
    if (panelEl) { panelEl.remove(); panelEl = null; }
    canvasEl = null;
    isDrawing = false;
    mode = 'idle';
    onCaptureCallback = null;
  }

  return { showPanel, open, destroy };
})();
