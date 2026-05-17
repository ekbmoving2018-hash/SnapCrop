window.SnapCrop = window.SnapCrop || {};

window.SnapCrop.Editor = (function () {
  const COLORS = [
    { name: 'Red',    hex: '#FF3B30' },
    { name: 'Yellow', hex: '#FFD60A' },
    { name: 'Black',  hex: '#000000' },
    { name: 'White',  hex: '#FFFFFF' }
  ];

  let editorEl = null;
  let canvasEl = null;
  let currentTool = 'arrow';
  let currentColor = '#FF3B30';
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let activeTextInput = null;
  let format = 'png';

  function open(croppedDataURL) {
    editorEl = document.createElement('div');
    editorEl.id = 'snapcrop-editor';

    editorEl.appendChild(buildToolbar());
    editorEl.appendChild(buildCanvasWrap(croppedDataURL));
    editorEl.appendChild(buildFooter());
    document.body.appendChild(editorEl);

    attachEvents();
  }

  /* ── TOOLBAR ── */

  function buildToolbar() {
    const bar = document.createElement('div');
    bar.id = 'snapcrop-toolbar';

    [
      { id: 'arrow',  label: '→ Arrow'  },
      { id: 'marker', label: '■ Marker' },
      { id: 'text',   label: 'T Text'   }
    ].forEach(t => {
      const btn = el('button', 'sc-tool-btn' + (t.id === 'arrow' ? ' active' : ''));
      btn.dataset.tool = t.id;
      btn.textContent = t.label;
      bar.appendChild(btn);
    });

    bar.appendChild(sep());

    COLORS.forEach(c => {
      const btn = el('button', 'sc-color-btn' + (c.hex === '#FF3B30' ? ' active' : ''));
      btn.dataset.color = c.hex;
      btn.title = c.name;
      btn.style.setProperty('--sc-color', c.hex);
      bar.appendChild(btn);
    });

    bar.appendChild(sep());

    const undoBtn = el('button', 'sc-action-btn');
    undoBtn.id = 'sc-undo';
    undoBtn.textContent = '↩ Undo';

    const clearBtn = el('button', 'sc-action-btn');
    clearBtn.id = 'sc-clear';
    clearBtn.textContent = '✕ Clear';

    const closeBtn = el('button', 'sc-action-btn sc-close');
    closeBtn.id = 'sc-close';
    closeBtn.textContent = '✕ Close';

    bar.appendChild(undoBtn);
    bar.appendChild(clearBtn);
    bar.appendChild(closeBtn);

    return bar;
  }

  /* ── CANVAS ── */

  function buildCanvasWrap(croppedDataURL) {
    const wrap = document.createElement('div');
    wrap.id = 'snapcrop-canvas-wrap';

    canvasEl = document.createElement('canvas');
    canvasEl.id = 'snapcrop-canvas';

    const img = new Image();
    img.onload = () => {
      canvasEl.width = img.naturalWidth;
      canvasEl.height = img.naturalHeight;
      window.SnapCrop.Annotations.init(canvasEl, croppedDataURL);
    };
    img.src = croppedDataURL;

    wrap.appendChild(canvasEl);
    return wrap;
  }

  /* ── FOOTER ── */

  function buildFooter() {
    const footer = document.createElement('div');
    footer.id = 'snapcrop-footer';

    const fmtLabel = el('span', 'sc-fmt-label');
    fmtLabel.textContent = 'Format:';
    footer.appendChild(fmtLabel);

    ['png', 'pdf'].forEach(f => {
      const label = el('label', 'sc-fmt-radio');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'sc-format';
      radio.value = f;
      radio.checked = f === 'png';
      label.appendChild(radio);
      label.append(' ' + f.toUpperCase());
      footer.appendChild(label);
    });

    const dlBtn = el('button', 'sc-download-btn');
    dlBtn.id = 'sc-download';
    dlBtn.textContent = '↓ Download';
    footer.appendChild(dlBtn);

    return footer;
  }

  /* ── EVENTS ── */

  function attachEvents() {
    editorEl.addEventListener('click', onToolbarClick);
    canvasEl.addEventListener('mousedown', onCanvasMouseDown);
    document.addEventListener('mousemove', onCanvasMouseMove);
    document.addEventListener('mouseup', onCanvasMouseUp);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('beforeunload', () => window.SnapCrop.cleanup());
  }

  function onToolbarClick(e) {
    const toolBtn = e.target.closest('.sc-tool-btn');
    if (toolBtn) {
      currentTool = toolBtn.dataset.tool;
      editorEl.querySelectorAll('.sc-tool-btn').forEach(b => b.classList.remove('active'));
      toolBtn.classList.add('active');
      return;
    }

    const colorBtn = e.target.closest('.sc-color-btn');
    if (colorBtn) {
      currentColor = colorBtn.dataset.color;
      editorEl.querySelectorAll('.sc-color-btn').forEach(b => b.classList.remove('active'));
      colorBtn.classList.add('active');
      return;
    }

    const id = e.target.id;
    if (id === 'sc-undo')     { window.SnapCrop.Annotations.undo();  return; }
    if (id === 'sc-clear')    { window.SnapCrop.Annotations.clear(); return; }
    if (id === 'sc-close')    { window.SnapCrop.cleanup();           return; }
    if (id === 'sc-download') { onDownload();                        return; }
  }

  function canvasPos(e) {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvasEl.width  / rect.width),
      y: (e.clientY - rect.top)  * (canvasEl.height / rect.height)
    };
  }

  function onCanvasMouseDown(e) {
    e.preventDefault();
    if (currentTool === 'text') { startTextInput(e); return; }
    isDrawing = true;
    const pos = canvasPos(e);
    startX = pos.x;
    startY = pos.y;
  }

  function onCanvasMouseMove(e) {
    if (!isDrawing) return;
    // live preview handled on mouseup commit — keeps code simple for v1
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
    }
  }

  function startTextInput(e) {
    if (activeTextInput) commitText();

    const rect = canvasEl.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasEl.width  / rect.width);
    const cy = (e.clientY - rect.top)  * (canvasEl.height / rect.height);

    const input = document.createElement('input');
    input.id = 'sc-text-input';
    input.type = 'text';
    input.style.left  = e.clientX + 'px';
    input.style.top   = e.clientY + 'px';
    input.style.color = currentColor;
    document.body.appendChild(input);
    input.focus();
    activeTextInput = { el: input, cx, cy };

    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter')  { commitText(); }
      if (ev.key === 'Escape') { cancelText(); }
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

  async function onDownload() {
    const selectedFormat = editorEl.querySelector('input[name="sc-format"]:checked').value;
    const canvas = window.SnapCrop.Annotations.getCanvas();
    await window.SnapCrop.Exporter.download(canvas, selectedFormat);
    window.SnapCrop.cleanup();
  }

  /* ── UTILS ── */

  function el(tag, className) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  function sep() {
    return el('div', 'sc-sep');
  }

  function destroy() {
    if (!editorEl) return;
    if (activeTextInput) activeTextInput.el.remove();
    document.removeEventListener('mousemove', onCanvasMouseMove);
    document.removeEventListener('mouseup', onCanvasMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    editorEl.remove();
    editorEl = null;
    canvasEl = null;
    activeTextInput = null;
    isDrawing = false;
  }

  return { open, destroy };
})();
