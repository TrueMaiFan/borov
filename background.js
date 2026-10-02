(function () {
  "use strict";

  var canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var root = document.documentElement;
  var reduceQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  var width = 0;
  var height = 0;
  var dpr = 1;
  var linkDist = 130;
  var nodes = [];
  var masks = [];
  var rafId = null;
  var running = false;
  var resizeTimer = null;

  var dotColor = "30, 111, 217";
  var lineColor = "127, 176, 240";

  function toRgb(value, fallback) {
    var hex = (value || "").trim().replace("#", "");
    if (hex.length === 3) {
      hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
    var num = parseInt(hex, 16);
    return ((num >> 16) & 255) + ", " + ((num >> 8) & 255) + ", " + (num & 255);
  }

  function readColors() {
    var styles = getComputedStyle(root);
    dotColor = toRgb(styles.getPropertyValue("--blue-500"), "30, 111, 217");
    lineColor = toRgb(styles.getPropertyValue("--blue-300"), "127, 176, 240");
  }

  function documentHeight() {
    return Math.max(
      document.body ? document.body.scrollHeight : 0,
      root.scrollHeight,
      window.innerHeight
    );
  }

  function nodeCount() {
    var area = width * height;
    return Math.max(40, Math.min(300, Math.round(area / 18000)));
  }

  function createNodes() {
    var count = nodeCount();
    var speed = 0.24;
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        r: Math.random() * 1.5 + 1
      });
    }
  }

  function computeMasks() {
    var offsetX = window.pageXOffset;
    var offsetY = window.pageYOffset;
    var elements = document.querySelectorAll(".container");
    masks = [];

    for (var i = 0; i < elements.length; i++) {
      if (elements[i].closest(".site-header")) continue;

      var rect = elements[i].getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;

      masks.push({
        left: rect.left + offsetX - 8,
        top: rect.top + offsetY - 22,
        right: rect.right + offsetX + 8,
        bottom: rect.bottom + offsetY + 22
      });
    }
  }

  function headerMask() {
    var el = document.querySelector(".header-inner");
    if (!el) return null;

    var rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return null;

    var offsetY = window.pageYOffset;
    return {
      left: rect.left - 8,
      top: rect.top + offsetY - 6,
      right: rect.right + 8,
      bottom: rect.bottom + offsetY + 6
    };
  }

  function pointInRect(x, y, m) {
    return x >= m.left && x <= m.right && y >= m.top && y <= m.bottom;
  }

  function isMasked(x, y, header) {
    if (header && pointInRect(x, y, header)) return true;
    for (var i = 0; i < masks.length; i++) {
      if (pointInRect(x, y, masks[i])) return true;
    }
    return false;
  }

  function segmentHitsRect(x1, y1, x2, y2, m) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var t0 = 0;
    var t1 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [x1 - m.left, m.right - x1, y1 - m.top, m.bottom - y1];
    var i, t;

    for (i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > t1) return false;
          if (t > t0) t0 = t;
        } else {
          if (t < t0) return false;
          if (t < t1) t1 = t;
        }
      }
    }

    return true;
  }

  function segmentMasked(x1, y1, x2, y2, header) {
    if (header && segmentHitsRect(x1, y1, x2, y2, header)) return true;
    for (var i = 0; i < masks.length; i++) {
      if (segmentHitsRect(x1, y1, x2, y2, masks[i])) return true;
    }
    return false;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = documentHeight();
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    linkDist = Math.min(170, Math.max(95, Math.min(width, window.innerHeight) * 0.17));
    computeMasks();
    createNodes();
    draw();
  }

  function step() {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;

      if (n.x < -20) n.x = width + 20;
      else if (n.x > width + 20) n.x = -20;

      if (n.y < -20) n.y = height + 20;
      else if (n.y > height + 20) n.y = -20;
    }
  }

  function draw() {
    var header = headerMask();
    var margin = linkDist + 40;
    var top = window.pageYOffset - margin;
    var bottom = window.pageYOffset + window.innerHeight + margin;
    var list = [];
    var i, j;

    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.y < top || n.y > bottom) continue;
      if (isMasked(n.x, n.y, header)) continue;
      list.push(n);
    }

    ctx.clearRect(0, top, width, Math.max(1, bottom - top));

    for (i = 0; i < list.length; i++) {
      var a = list[i];
      for (j = i + 1; j < list.length; j++) {
        var b = list[j];
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < linkDist && !segmentMasked(a.x, a.y, b.x, b.y, header)) {
          var alpha = (1 - dist / linkDist) * 0.16;
          ctx.strokeStyle = "rgba(" + lineColor + ", " + alpha.toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (i = 0; i < list.length; i++) {
      var p = list[i];
      ctx.fillStyle = "rgba(" + dotColor + ", 0.5)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tick() {
    step();
    draw();
    rafId = window.requestAnimationFrame(tick);
  }

  function start() {
    if (running || (reduceQuery && reduceQuery.matches) || document.hidden) return;
    running = true;
    rafId = window.requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function renderStatic() {
    stop();
    draw();
  }

  function refresh() {
    readColors();
    if (reduceQuery && reduceQuery.matches) {
      renderStatic();
    } else if (!running) {
      start();
    } else {
      draw();
    }
  }

  function onResize() {
    if (resizeTimer) window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resize();
    }, 150);
  }

  readColors();
  resize();
  start();

  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize);
  window.addEventListener("focus", refresh);
  window.addEventListener("load", onResize);

  document.addEventListener("themechange", refresh);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stop();
    } else {
      refresh();
    }
  });

  if ("ResizeObserver" in window && document.body) {
    var observer = new ResizeObserver(onResize);
    observer.observe(document.body);
  }

  if (reduceQuery) {
    var onReduceChange = function () {
      if (reduceQuery.matches) {
        renderStatic();
      } else {
        start();
      }
    };
    if (reduceQuery.addEventListener) {
      reduceQuery.addEventListener("change", onReduceChange);
    } else if (reduceQuery.addListener) {
      reduceQuery.addListener(onReduceChange);
    }
  }
})();
