let sessionCounter = 0;

function generateFilename(format) {
  sessionCounter++;
  const date = new Date().toISOString().slice(0, 10);
  const count = String(sessionCounter).padStart(3, '0');
  return `screen_to_pdf_${date}_${count}.${format}`;
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['content/overlay.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['lib/jspdf.umd.min.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [
        'content/annotations.js',
        'content/exporter.js',
        'content/selection.js',
        'content/editor.js',
        'content/index.js'
      ]
    });
  } catch (err) {
    console.error('SnapCrop: injection failed', err);
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === 'capture') {
    handleCapture(msg, sender);
  } else if (msg.action === 'download') {
    handleDownload(msg);
  }
  return false;
});

async function handleCapture(msg, sender) {
  const tabId = sender.tab.id;
  const windowId = sender.tab.windowId;
  try {
    const dataURL = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    const croppedDataURL = await cropImage(dataURL, msg.bounds, msg.devicePixelRatio);
    chrome.tabs.sendMessage(tabId, { action: 'captured', croppedDataURL });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, { action: 'capture_error', message: err.message });
  }
}

async function cropImage(dataURL, bounds, dpr) {
  const response = await fetch(dataURL);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const scale = dpr || 1;
  const canvas = new OffscreenCanvas(
    Math.round(bounds.width * scale),
    Math.round(bounds.height * scale)
  );
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    bitmap,
    Math.round(bounds.x * scale),
    Math.round(bounds.y * scale),
    Math.round(bounds.width * scale),
    Math.round(bounds.height * scale),
    0, 0,
    canvas.width,
    canvas.height
  );
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataURL(croppedBlob);
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function handleDownload(msg) {
  const filename = generateFilename(msg.format);
  await chrome.downloads.download({
    url: msg.dataURL,
    filename,
    saveAs: false
  });
}
