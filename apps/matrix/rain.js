window.startMatrixRain = function(canvas) {
  var ctx = canvas.getContext('2d');
  var W = canvas.width = canvas.parentElement.clientWidth;
  var H = canvas.height = canvas.parentElement.clientHeight;
  var fontSize = 14;
  var cols = Math.floor(W / fontSize);
  var drops = [];
  for (var i = 0; i < cols; i++) drops[i] = Math.random() * -100;

  // Character set: half-width katakana + digits
  var chars = '';
  for (var c = 0xFF66; c <= 0xFF9D; c++) chars += String.fromCharCode(c);
  chars += '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  function draw() {
    // Fade the previous frame slightly so each stream leaves a trailing tail.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = fontSize + 'px monospace';

    for (var i = 0; i < drops.length; i++) {
      var x = i * fontSize;
      var y = drops[i] * fontSize;

      // Bright, near-white leading glyph.
      ctx.fillStyle = '#CCFFCC';
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y);

      // Repaint the glyph one cell up (last frame's head) in Matrix green, so
      // the stream reads green as it falls instead of a fading white smear.
      // Without this, the only painted glyph is the white head and the whole
      // effect washes out to grey.
      ctx.fillStyle = '#00FF41';
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], x, y - fontSize);

      if (y > H && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }

    canvas._rafId = requestAnimationFrame(draw);
  }

  draw();
};
