window.SnapCrop = window.SnapCrop || {};

window.SnapCrop.Selection = (function () {
  let overlayEl    = null;
  let selectionEl  = null;
  let sizeEl       = null;
  let onDrawnCb    = null;

  let bounds = null; // {x, y, width, height} — current selection, updated by resize

  // Initial draw
  let isDrawing  = false;
  let drawStartX = 0;
  let drawStartY = 0;

  // Resize
  let isResizing       = false;
  let resizeHandle     = null; // {hx, hy}
  let resizeOrigin     = null; // {x, y} mouse position at resize start
  let resizeBoundsSnap = null; // bounds snapshot at resize start

  // Cursors per handle position
  const CURSORS = {
    '0-0': 'nwse-resize', '50-0': 'ns-resize',   '100-0': 'nesw-resize',
    '0-50': 'ew-resize',                           '100-50': 'ew-resize',
    '0-100': 'nesw-resize', '50-100': 'ns-resize', '100-100': 'nwse-resize'
  };

  function start(callback) {
    onDrawnCb = callback;
    render();
    attachEvents();
  }

  function getCurrentBounds() {
    return bounds ? { ...bounds } : null;
  }

  function render() {
    overlayEl = document.createElement('div');
    overlayEl.id = 'snapcrop-overlay';

    selectionEl = document.createElement('div');
    selectionEl.id = 'snapcrop-selection';
    selectionEl.style.display = 'none';

    [[0,0],[50,0],[100,0],[0,50],[100,50],[0,100],[50,100],[100,100]].forEach(([x, y]) => {
      const h = document.createElement('div');
      h.className = 'sc-handle';
      h.style.left = x + '%';
      h.style.top  = y + '%';
      h.style.cursor = CURSORS[`${x}-${y}`] || 'pointer';
      h.dataset.hx = x;
      h.dataset.hy = y;
      selectionEl.appendChild(h);
    });

    sizeEl = document.createElement('div');
    sizeEl.id = 'snapcrop-size';
    selectionEl.appendChild(sizeEl);

    overlayEl.appendChild(selectionEl);
    document.body.appendChild(overlayEl);
  }

  function attachEvents() {
    overlayEl.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    document.addEventListener('keydown',   onKeyDown);
  }

  function onMouseDown(e) {
    if (bounds) {
      // After initial draw: only handle-drags are allowed
      const handle = e.target.closest('.sc-handle');
      if (!handle) return;
      e.preventDefault();
      e.stopPropagation();
      isResizing       = true;
      resizeHandle     = { hx: parseInt(handle.dataset.hx), hy: parseInt(handle.dataset.hy) };
      resizeOrigin     = { x: e.clientX, y: e.clientY };
      resizeBoundsSnap = { ...bounds };
      return;
    }

    // No selection yet — start drawing
    e.preventDefault();
    overlayEl.style.background = 'transparent';
    isDrawing  = true;
    drawStartX = e.clientX;
    drawStartY = e.clientY;
    selectionEl.style.display = 'block';
    applyVisual({ x: drawStartX, y: drawStartY, width: 0, height: 0 });
  }

  function onMouseMove(e) {
    if (isDrawing) {
      applyVisual(fromTwoPoints(drawStartX, drawStartY, e.clientX, e.clientY));
    } else if (isResizing) {
      bounds = resizedBounds(e.clientX, e.clientY);
      applyVisual(bounds);
    }
  }

  function onMouseUp(e) {
    if (isDrawing) {
      isDrawing = false;
      const b = fromTwoPoints(drawStartX, drawStartY, e.clientX, e.clientY);
      if (b.width < 10 || b.height < 10) {
        selectionEl.style.display = 'none';
        showHint('Too small — drag a larger area');
        return;
      }
      bounds = b;
      applyVisual(bounds);
      onDrawnCb(bounds); // fire once → index.js shows panel
    } else if (isResizing) {
      isResizing   = false;
      resizeHandle = null;
    }
  }

  function resizedBounds(mx, my) {
    const dx = mx - resizeOrigin.x;
    const dy = my - resizeOrigin.y;
    const sb = resizeBoundsSnap;
    const { hx, hy } = resizeHandle;

    let x = sb.x, y = sb.y, w = sb.width, h = sb.height;

    if      (hx === 0)   { x = sb.x + dx; w = sb.width  - dx; }
    else if (hx === 100) {                 w = sb.width  + dx; }

    if      (hy === 0)   { y = sb.y + dy; h = sb.height - dy; }
    else if (hy === 100) {                 h = sb.height + dy; }

    if (w < 10) { w = 10; if (hx === 0) x = sb.x + sb.width  - 10; }
    if (h < 10) { h = 10; if (hy === 0) y = sb.y + sb.height - 10; }

    return { x, y, width: w, height: h };
  }

  function applyVisual(b) {
    selectionEl.style.left   = b.x + 'px';
    selectionEl.style.top    = b.y + 'px';
    selectionEl.style.width  = b.width  + 'px';
    selectionEl.style.height = b.height + 'px';
    sizeEl.textContent = `${Math.round(b.width)} × ${Math.round(b.height)}`;
  }

  function fromTwoPoints(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width:  Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }

  function showHint(text) {
    const msg = document.createElement('div');
    msg.id = 'snapcrop-hint';
    msg.textContent = text;
    overlayEl.appendChild(msg);
    setTimeout(() => msg.remove(), 1500);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      destroy();
      window.SnapCrop.cleanup();
    }
  }

  function destroy() {
    if (!overlayEl) return;
    overlayEl.remove();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup',   onMouseUp);
    document.removeEventListener('keydown',   onKeyDown);
    overlayEl = null;
    bounds    = null;
  }

  return { start, destroy, getCurrentBounds };
})();
