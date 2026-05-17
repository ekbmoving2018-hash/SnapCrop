window.SnapCrop = window.SnapCrop || {};

(function () {
  if (window.SnapCrop._active) return;
  window.SnapCrop._active = true;

  let pendingBounds = null;

  function cleanup() {
    window.SnapCrop._active = false;
    window.SnapCrop.Selection.destroy();
    window.SnapCrop.Editor.destroy();
    const toast = document.getElementById('snapcrop-toast');
    if (toast) toast.remove();
  }
  window.SnapCrop.cleanup = cleanup;

  function showToast(message) {
    const existing = document.getElementById('snapcrop-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'snapcrop-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'captured') {
      window.SnapCrop.Selection.destroy();
      window.SnapCrop.Editor.open(msg.croppedDataURL, pendingBounds);
    } else if (msg.action === 'capture_error') {
      cleanup();
      showToast('Screenshot failed, try again');
    }
  });

  window.addEventListener('beforeunload', cleanup);

  window.SnapCrop.Selection.start((initialBounds) => {
    pendingBounds = initialBounds;

    // Show panel immediately — capture not triggered yet
    window.SnapCrop.Editor.showPanel(initialBounds, () => {
      // User clicked a tool or color → capture now
      const currentBounds = window.SnapCrop.Selection.getCurrentBounds() || pendingBounds;
      pendingBounds = currentBounds;

      const overlay = document.getElementById('snapcrop-overlay');
      if (overlay) overlay.style.visibility = 'hidden';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          chrome.runtime.sendMessage({
            action: 'capture',
            bounds: currentBounds,
            devicePixelRatio: window.devicePixelRatio || 1
          });
        });
      });
    });
  });
})();
