window.SnapCrop = window.SnapCrop || {};

window.SnapCrop.Exporter = (function () {
  async function normalizeForPdf(sourceCanvas) {
    const MAX_WIDTH = 1920;
    if (sourceCanvas.width <= MAX_WIDTH) return sourceCanvas;

    const scale = MAX_WIDTH / sourceCanvas.width;
    const w = Math.round(sourceCanvas.width * scale);
    const h = Math.round(sourceCanvas.height * scale);

    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = h;
    tmp.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
    return tmp;
  }

  function toPNG(canvas) {
    return canvas.toDataURL('image/png');
  }

  async function toPDF(canvas) {
    const normalized = await normalizeForPdf(canvas);
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = 190;
    const pageH = 277;
    const ratio = Math.min(pageW / normalized.width, pageH / normalized.height);
    const drawW = normalized.width * ratio;
    const drawH = normalized.height * ratio;
    const offsetX = (210 - drawW) / 2;
    const offsetY = (297 - drawH) / 2;

    pdf.addImage(
      normalized.toDataURL('image/jpeg', 0.92),
      'JPEG',
      offsetX, offsetY, drawW, drawH
    );
    return pdf.output('datauristring');
  }

  async function download(canvas, format) {
    const dataURL = format === 'pdf' ? await toPDF(canvas) : toPNG(canvas);
    chrome.runtime.sendMessage({ action: 'download', dataURL, format });
  }

  return { download };
})();
