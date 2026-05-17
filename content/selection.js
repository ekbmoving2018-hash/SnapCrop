window.SnapCrop = window.SnapCrop || {};

window.SnapCrop.Selection = (function () {
  let overlayEl = null;
  let selectionEl = null;
  let sizeEl = null;
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let onComplete = null;

  function start(callback) {
    onComplete = callback;
    render();
    attachEvents();
  }

  function render() {
    overlayEl = document.createElement('div');
    overlayEl.id = 'snapcrop-overlay';

    selectionEl = document.createElement('div');
    selectionEl.id = 'snapcrop-selection';
    selectionEl.style.display = 'none';

    sizeEl = document.createElement('div');
    sizeEl.id = 'snapcrop-size';

    overlayEl.appendChild(selectionEl);
    document.body.appendChild(overlayEl);
  }

  function attachEvents() {
    overlayEl.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  }

  function onMouseDown(e) {
    e.preventDefault();
    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionEl.style.display = 'block';
    updateRect(e.clientX, e.clientY);
  }

  function onMouseMove(e) {
    if (!isDrawing) return;
    updateRect(e.clientX, e.clientY);
  }

  function onMouseUp(e) {
    if (!isDrawing) return;
    isDrawing = false;

    const bounds = calcBounds(startX, startY, e.clientX, e.clientY);
    if (bounds.width < 10 || bounds.height < 10) {
      resetSelection();
      return;
    }

    destroy();
    onComplete(bounds);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      destroy();
      window.SnapCrop.cleanup();
    }
  }

  function updateRect(x, y) {
    const b = calcBounds(startX, startY, x, y);
    selectionEl.style.left = b.x + 'px';
    selectionEl.style.top = b.y + 'px';
    selectionEl.style.width = b.width + 'px';
    selectionEl.style.height = b.height + 'px';

    if (!sizeEl.parentNode) selectionEl.appendChild(sizeEl);
    sizeEl.textContent = `${b.width} × ${b.height}`;
  }

  function calcBounds(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1)
    };
  }

  function resetSelection() {
    isDrawing = false;
    selectionEl.style.display = 'none';
    const msg = document.createElement('div');
    msg.id = 'snapcrop-hint';
    msg.textContent = 'Too small — drag a larger area';
    overlayEl.appendChild(msg);
    setTimeout(() => msg.remove(), 1500);
  }

  function destroy() {
    if (!overlayEl) return;
    overlayEl.remove();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    overlayEl = null;
  }

  return { start, destroy };
})();
