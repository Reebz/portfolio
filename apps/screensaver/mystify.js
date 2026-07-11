/*
 * Mystify screensaver — bouncing polylines with fading trails, the classic
 * Win98 idle animation. Canvas only, no assets. Mirrors the matrix-rain
 * contract: window.startMystify(canvas) stores the RAF id on canvas._rafId,
 * window.stopMystify(canvas) cancels it.
 */
(function () {
  'use strict';

  var VERTS = 4;      // vertices per polygon
  var SHAPES = 2;     // number of independent polygons
  var TRAIL = 12;     // how many past frames to echo

  function makeShape(w, h, hue) {
    var pts = [];
    for (var i = 0; i < VERTS; i++) {
      pts.push({
        x: Math.abs((Math.sin(i * 12.9 + hue) * 10000) % 1) * w,
        y: Math.abs((Math.cos(i * 78.2 + hue) * 10000) % 1) * h,
        vx: ((i % 2) ? 1 : -1) * (1.5 + (i * 0.4)),
        vy: ((i % 3) ? 1 : -1) * (1.7 + (i * 0.3))
      });
    }
    return { pts: pts, hue: hue, trail: [] };
  }

  function startMystify(canvas) {
    if (!canvas || canvas._rafId) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    function size() {
      canvas.width = canvas.clientWidth || window.innerWidth;
      canvas.height = canvas.clientHeight || window.innerHeight;
    }
    size();
    canvas._onResize = size;
    window.addEventListener('resize', size);

    var w = canvas.width, h = canvas.height;
    var shapes = [];
    for (var s = 0; s < SHAPES; s++) shapes.push(makeShape(w, h, s * 3.1));
    var frame = 0;

    function step() {
      w = canvas.width; h = canvas.height;
      // Fade the whole frame slightly for a soft trail rather than a hard clear.
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, 0, w, h);

      frame++;
      shapes.forEach(function (shape) {
        shape.pts.forEach(function (p) {
          p.x += p.vx; p.y += p.vy;
          if (p.x <= 0) { p.x = 0; p.vx = Math.abs(p.vx); }
          if (p.x >= w) { p.x = w; p.vx = -Math.abs(p.vx); }
          if (p.y <= 0) { p.y = 0; p.vy = Math.abs(p.vy); }
          if (p.y >= h) { p.y = h; p.vy = -Math.abs(p.vy); }
        });

        // Record a snapshot for the trail.
        shape.trail.push(shape.pts.map(function (p) { return { x: p.x, y: p.y }; }));
        if (shape.trail.length > TRAIL) shape.trail.shift();

        for (var t = 0; t < shape.trail.length; t++) {
          var snap = shape.trail[t];
          var alpha = (t + 1) / shape.trail.length;
          var hue = (frame * 0.6 + shape.hue * 40) % 360;
          ctx.strokeStyle = 'hsla(' + hue + ',90%,60%,' + (alpha * 0.9) + ')';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (var i = 0; i < snap.length; i++) {
            var q = snap[i];
            if (i === 0) ctx.moveTo(q.x, q.y);
            else ctx.lineTo(q.x, q.y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      });

      canvas._rafId = requestAnimationFrame(step);
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    canvas._rafId = requestAnimationFrame(step);
  }

  function stopMystify(canvas) {
    if (!canvas) return;
    if (canvas._rafId) {
      cancelAnimationFrame(canvas._rafId);
      canvas._rafId = null;
    }
    if (canvas._onResize) {
      window.removeEventListener('resize', canvas._onResize);
      canvas._onResize = null;
    }
  }

  window.startMystify = startMystify;
  window.stopMystify = stopMystify;
})();
