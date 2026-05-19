window.SnapCrop = window.SnapCrop || {};

window.SnapCrop.Annotations = (function () {
  let items = [];
  let screenshotImage = null;
  let canvas = null;
  let ctx = null;

  function init(canvasEl, imgSrc) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    items = [];
    screenshotImage = new Image();
    screenshotImage.onload = () => redraw();
    screenshotImage.src = imgSrc;
  }

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (screenshotImage) ctx.drawImage(screenshotImage, 0, 0);
    items.forEach(drawItem);
  }

  function drawItem(item) {
    ctx.save();
    if (item.type === 'arrow') drawArrow(item);
    else if (item.type === 'marker') drawMarker(item);
    else if (item.type === 'ellipse') drawEllipse(item);
    else if (item.type === 'text') drawText(item);
    ctx.restore();
  }

  function drawArrow(item) {
    const { x1, y1, x2, y2, color } = item;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 14;

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  function drawMarker(item) {
    const { x, y, width, height, color } = item;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
  }

  function drawEllipse(item) {
    const { cx, cy, rx, ry, color } = item;
    if (rx < 1 || ry < 1) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawText(item) {
    const { x, y, content, color } = item;
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(content, x, y);
  }

  function preview(item) {
    redraw();
    ctx.save();
    drawItem(item);
    ctx.restore();
  }

  function add(item) {
    items.push(item);
    redraw();
  }

  function undo() {
    if (items.length === 0) return;
    items.pop();
    redraw();
  }

  function clear() {
    items = [];
    redraw();
  }

  function getCanvas() {
    return canvas;
  }

  return { init, add, undo, clear, getCanvas, preview };
})();
