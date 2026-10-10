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
  var TRAIL = 7;      // copies of each polygon on screen
  var GAP = 4;        // frames between copies

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

    // Win98 drew Mystify as hard 1px lines: a fixed set of evenly spaced
    // copies of each polygon in solid colours, no fading or glow. Each copy
    // keeps the colour it was drawn in, so a slow colour drift shows as a
    // gradient along the echoes.
    function step() {
      w = canvas.width; h = canvas.height;
      ctx.fillStyle = '#000';
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

        // Record a copy every few frames.
        if (frame % GAP === 0 || !shape.trail.length) {
          var hue = Math.round(frame * 0.4 + shape.hue * 40) % 360;
          shape.trail.push({
            color: 'hsl(' + hue + ',100%,50%)',
            pts: shape.pts.map(function (p) { return { x: p.x, y: p.y }; })
          });
          if (shape.trail.length > TRAIL) shape.trail.shift();
        }

        ctx.lineWidth = 1;
        for (var t = 0; t < shape.trail.length; t++) {
          var snap = shape.trail[t];
          ctx.strokeStyle = snap.color;
          ctx.beginPath();
          for (var i = 0; i < snap.pts.length; i++) {
            // Pixel centres keep the 1px lines sharp.
            var qx = Math.round(snap.pts[i].x) + 0.5, qy = Math.round(snap.pts[i].y) + 0.5;
            if (i === 0) ctx.moveTo(qx, qy);
            else ctx.lineTo(qx, qy);
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
