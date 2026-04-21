/**
 * WebSketch - Content Script
 * 支持中文输入法 (IME)，对象级编辑系统
 */
(function() {
  'use strict';

  // 防抖
  function debounce(fn, delay) {
    let t = null;
    return function(...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => { fn.apply(this, args); t = null; }, delay);
    };
  }

  const state = {
    enabled: false, tool: 'brush', color: '#e74c3c', lineWidth: 3,
    opacity: 1, fontSize: 18, fontFamily: 'Microsoft YaHei, sans-serif',
    isDrawing: false, startX: 0, startY: 0,
    history: [], historyIndex: -1, maxHistory: 50,
    fillEnabled: false, dashEnabled: false, gridEnabled: false,
    showColorPalette: false,
    // 对象系统
    objects: [], // 存储所有绘制对象
    selectedObject: null, // 当前选中的对象
    isDragging: false,
    isRotating: false,
    dragOffsetX: 0, dragOffsetY: 0,
    rotationAngle: 0,
    rotationStartX: 0,
    lastMouseX: 0,
    // 截图功能
    isScreenshotMode: false,
    screenshotStartX: 0,
    screenshotStartY: 0,
    screenshotEndX: 0,
    screenshotEndY: 0,
    // 工具栏拖动
    isDraggingToolbar: false,
    toolbarOffsetX: 0,
    toolbarOffsetY: 0,
    // flameshot风格截图
    isFlameshotMode: false,
    flameshotRect: null,
    flameshotCanvas: null,
    flameshotCtx: null,
    flameshotImage: null,
    // 计数圆圈
    counterNumber: 1,
    // 取色器
    isPickingColor: false
  };

  let overlay, canvas, ctx, toolbar, textInput, previewCanvas, previewCtx;

  function init() {
    if (canvas && toolbar && overlay) return;
    createOverlay();
    createCanvas();
    createPreview();
    createToolbar();
    createTextInput();
    bindEvents();
    saveState();
  }

  function setCanvasSize(c) {
    c.width = window.innerWidth * window.devicePixelRatio;
    c.height = window.innerHeight * window.devicePixelRatio;
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'wph-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;display:none;pointer-events:none;';
    document.body.appendChild(overlay);
  }

  function createCanvas() {
    canvas = document.createElement('canvas');
    canvas.id = 'wph-canvas';
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;cursor:crosshair;display:none;pointer-events:auto;';
    setCanvasSize(canvas);
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }

  function createPreview() {
    previewCanvas = document.createElement('canvas');
    previewCanvas.id = 'wph-preview';
    previewCanvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;display:none;';
    setCanvasSize(previewCanvas);
    document.body.appendChild(previewCanvas);
    previewCtx = previewCanvas.getContext('2d');
    previewCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    previewCtx.lineCap = 'round'; previewCtx.lineJoin = 'round';
  }

  function clearPreview() {
    if (previewCtx) previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }

  // Shift约束：正方形/正圆/45度线
  function constrainShape(sx, sy, ex, ey, shiftKey) {
    if (!shiftKey) return { ex, ey };
    
    if (state.tool === 'rect') {
      // 正方形：取较大边
      const dx = ex - sx;
      const dy = ey - sy;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      return { ex: sx + size * Math.sign(dx || 1), ey: sy + size * Math.sign(dy || 1) };
    }
    
    if (state.tool === 'circle') {
      // 正圆：取较大半径
      const dx = ex - sx;
      const dy = ey - sy;
      const size = Math.max(Math.abs(dx), Math.abs(dy));
      return { ex: sx + size * Math.sign(dx || 1), ey: sy + size * Math.sign(dy || 1) };
    }
    
    if (state.tool === 'line' || state.tool === 'arrow') {
      // 约束到0/45/90度
      const dx = ex - sx;
      const dy = ey - sy;
      const angle = Math.atan2(dy, dx);
      const dist = Math.sqrt(dx * dx + dy * dy);
      // 量化到45度
      const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
      return { ex: sx + dist * Math.cos(snapAngle), ey: sy + dist * Math.sin(snapAngle) };
    }
    
    return { ex, ey };
  }
  
  // 端点吸附
  const SNAP_DISTANCE = 10;
  
  function getSnapPoints() {
    const points = [];
    state.objects.forEach(obj => {
      if (obj.type === 'rect') {
        // 四角 + 四边中点
        points.push({ x: obj.x, y: obj.y });
        points.push({ x: obj.x + obj.width, y: obj.y });
        points.push({ x: obj.x, y: obj.y + obj.height });
        points.push({ x: obj.x + obj.width, y: obj.y + obj.height });
        points.push({ x: obj.x + obj.width / 2, y: obj.y });
        points.push({ x: obj.x + obj.width / 2, y: obj.y + obj.height });
        points.push({ x: obj.x, y: obj.y + obj.height / 2 });
        points.push({ x: obj.x + obj.width, y: obj.y + obj.height / 2 });
      } else if (obj.type === 'circle') {
        // 圆心 + 四极点
        points.push({ x: obj.x, y: obj.y });
        points.push({ x: obj.x + obj.radiusX, y: obj.y });
        points.push({ x: obj.x - obj.radiusX, y: obj.y });
        points.push({ x: obj.x, y: obj.y + obj.radiusY });
        points.push({ x: obj.x, y: obj.y - obj.radiusY });
      } else if (obj.type === 'line' || obj.type === 'arrow') {
        // 两端点
        points.push({ x: obj.x1, y: obj.y1 });
        points.push({ x: obj.x2, y: obj.y2 });
      } else if (obj.type === 'text') {
        points.push({ x: obj.x, y: obj.y });
      } else if (obj.type === 'counter') {
        points.push({ x: obj.x, y: obj.y });
      } else if ((obj.type === 'freehand' || obj.type === 'eraser') && obj.points) {
        // 路径首尾
        if (obj.points.length > 0) {
          points.push({ x: obj.points[0].x, y: obj.points[0].y });
          points.push({ x: obj.points[obj.points.length - 1].x, y: obj.points[obj.points.length - 1].y });
        }
      }
    });
    return points;
  }
  
  function snapToPoint(x, y) {
    const snapPoints = getSnapPoints();
    let bestDist = SNAP_DISTANCE;
    let snapped = { x, y, snapped: false };
    
    // 端点吸附
    for (const p of snapPoints) {
      const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        snapped = { x: p.x, y: p.y, snapped: true };
      }
    }
    
    // 网格吸附 - 独立判断，网格吸附距离更大
    if (state.gridEnabled) {
      const gridSize = 50;
      const gridSnapDist = 15; // 网格吸附距离更大
      const gx = Math.round(x / gridSize) * gridSize;
      const gy = Math.round(y / gridSize) * gridSize;
      const gDist = Math.sqrt((x - gx) ** 2 + (y - gy) ** 2);
      // 网格吸附：只有当没有端点吸附，或网格点更近时才生效
      if (gDist < gridSnapDist && (!snapped.snapped || gDist < bestDist)) {
        snapped = { x: gx, y: gy, snapped: true };
      }
    }
    
    return snapped;
  }
  
  // 拖拽对象吸附
  function snapDraggedObject(obj) {
    if (!obj) return;
    
    let snapX, snapY;
    
    if (obj.type === 'rect' || obj.type === 'text' || obj.type === 'counter') {
      snapX = obj.x; snapY = obj.y;
    } else if (obj.type === 'circle') {
      snapX = obj.x; snapY = obj.y;
    } else if (obj.type === 'line' || obj.type === 'arrow') {
      // 线段/箭头：吸附起点
      const snapped1 = snapToPoint(obj.x1, obj.y1);
      const dx = snapped1.x - obj.x1;
      const dy = snapped1.y - obj.y1;
      // 如果起点吸附了，整条线平移
      if (snapped1.snapped) {
        obj.x1 += dx; obj.y1 += dy;
        obj.x2 += dx; obj.y2 += dy;
      }
      return;
    } else if ((obj.type === 'freehand' || obj.type === 'eraser') && obj.bbox) {
      snapX = obj.bbox.minX; snapY = obj.bbox.minY;
    } else {
      return;
    }
    
    const snapped = snapToPoint(snapX, snapY);
    if (snapped.snapped) {
      const dx = snapped.x - snapX;
      const dy = snapped.y - snapY;
      
      if (obj.type === 'freehand' || obj.type === 'eraser') {
        obj.points.forEach(p => { p.x += dx; p.y += dy; });
        obj.bbox.minX += dx; obj.bbox.minY += dy;
        obj.bbox.maxX += dx; obj.bbox.maxY += dy;
      } else {
        obj.x += dx; obj.y += dy;
      }
    }
  }
  
  function drawSnapIndicator(x, y) {
    // 在预览层绘制吸附指示器
    if (!previewCtx) return;
    previewCtx.save();
    previewCtx.strokeStyle = '#0066ff';
    previewCtx.lineWidth = 1.5;
    previewCtx.setLineDash([]);
    const size = 6;
    previewCtx.beginPath();
    previewCtx.moveTo(x - size, y);
    previewCtx.lineTo(x + size, y);
    previewCtx.moveTo(x, y - size);
    previewCtx.lineTo(x, y + size);
    previewCtx.stroke();
    previewCtx.restore();
  }
  
  function drawPreviewShape(ex, ey, shiftKey) {
    clearPreview();
    
    // Shift约束
    const constrained = constrainShape(state.startX, state.startY, ex, ey, shiftKey);
    ex = constrained.ex;
    ey = constrained.ey;
    
    // 端点吸附（只对终点吸附）
    const snapped = snapToPoint(ex, ey);
    if (snapped.snapped) {
      ex = snapped.x;
      ey = snapped.y;
    }
    
    previewCtx.strokeStyle = state.color;
    previewCtx.lineWidth = state.lineWidth;
    previewCtx.globalAlpha = state.opacity;
    
    if (state.dashEnabled) {
      previewCtx.setLineDash([10, 5]);
    } else {
      previewCtx.setLineDash([6, 4]);
    }
    
    const sx = state.startX, sy = state.startY;
    if (state.tool === 'rect') {
      previewCtx.strokeRect(sx, sy, ex - sx, ey - sy);
    } else if (state.tool === 'circle') {
      const rx = Math.max(Math.abs(ex - sx) / 2, 1);
      const ry = Math.max(Math.abs(ey - sy) / 2, 1);
      previewCtx.beginPath();
      previewCtx.ellipse((sx + ex) / 2, (sy + ey) / 2, rx, ry, 0, 0, Math.PI * 2);
      previewCtx.stroke();
    } else if (state.tool === 'line') {
      previewCtx.beginPath(); previewCtx.moveTo(sx, sy); previewCtx.lineTo(ex, ey); previewCtx.stroke();
    } else if (state.tool === 'arrow') {
      previewCtx.beginPath(); previewCtx.moveTo(sx, sy); previewCtx.lineTo(ex, ey); previewCtx.stroke();
      const a = Math.atan2(ey - sy, ex - sx), hl = Math.max(12, state.lineWidth * 4);
      previewCtx.beginPath();
      previewCtx.moveTo(ex, ey);
      previewCtx.lineTo(ex - hl * Math.cos(a - 0.5), ey - hl * Math.sin(a - 0.5));
      previewCtx.moveTo(ex, ey);
      previewCtx.lineTo(ex - hl * Math.cos(a + 0.5), ey - hl * Math.sin(a + 0.5));
      previewCtx.stroke();
    }
    previewCtx.setLineDash([]);
    previewCtx.globalAlpha = 1;
    
    // 绘制吸附指示器
    if (snapped.snapped) {
      drawSnapIndicator(ex, ey);
    }
    // 起点吸附指示器
    const startSnapped = snapToPoint(state.startX, state.startY);
    if (startSnapped.snapped && (Math.abs(startSnapped.x - state.startX) > 0.1 || Math.abs(startSnapped.y - state.startY) > 0.1)) {
      drawSnapIndicator(state.startX, state.startY);
    }
  }

  function createToolbar() {
    toolbar = document.createElement('div');
    toolbar.id = 'wph-toolbar';
    toolbar.innerHTML = `<div class="wph-toolbar-header"><span class="wph-title">绘图助手</span><button class="wph-close" title="关闭">×</button></div>
      <div class="wph-toolbar-body">
        <div class="wph-tool-group">
          <button class="wph-tool active" data-tool="brush" title="画笔(B)">✏️</button>
          <button class="wph-tool" data-tool="eraser" title="橡皮擦(E)">🧹</button>
          <button class="wph-tool" data-tool="text" title="文字(T)">T</button>
          <button class="wph-tool" data-tool="hand" title="手形(H)">✋</button>
          <button class="wph-tool" data-tool="rect" title="矩形(R)">▢</button>
          <button class="wph-tool" data-tool="circle" title="圆形(C)">○</button>
          <button class="wph-tool" data-tool="line" title="直线(L)">╱</button>
          <button class="wph-tool" data-tool="arrow" title="箭头(A)">→</button>
          <button class="wph-tool" data-tool="counter" title="计数圆圈(N)">①</button>
        </div>
        <div class="wph-divider"></div>
        <div class="wph-setting-group">
          <label>颜色</label>
          <input type="color" class="wph-color" value="${state.color}">
          <button class="wph-icon-btn" id="wph-color-palette" title="预设颜色">🎨</button>
          <button class="wph-icon-btn" id="wph-pick-color" title="取色器(P)">💉</button>
        </div>
        <div class="wph-color-palette" id="wph-color-palette-panel" style="display:none">
          <div class="wph-color-row">
            <span class="wph-color-swatch" data-color="#000000"></span>
            <span class="wph-color-swatch" data-color="#ffffff"></span>
            <span class="wph-color-swatch" data-color="#e74c3c"></span>
            <span class="wph-color-swatch" data-color="#e67e22"></span>
            <span class="wph-color-swatch" data-color="#f1c40f"></span>
          </div>
          <div class="wph-color-row">
            <span class="wph-color-swatch" data-color="#2ecc71"></span>
            <span class="wph-color-swatch" data-color="#3498db"></span>
            <span class="wph-color-swatch" data-color="#9b59b6"></span>
            <span class="wph-color-swatch" data-color="#1abc9c"></span>
            <span class="wph-color-swatch" data-color="#e91e63"></span>
          </div>
        </div>
        <div class="wph-setting-group"><label>粗细</label><input type="range" class="wph-range" id="wph-line-width" min="1" max="50" value="${state.lineWidth}"><span class="wph-value" id="wph-line-width-value">${state.lineWidth}</span></div>
        <div class="wph-setting-group"><label>透明</label><input type="range" class="wph-range" id="wph-opacity" min="0.1" max="1" step="0.1" value="${state.opacity}"><span class="wph-value" id="wph-opacity-value">${Math.round(state.opacity * 100)}%</span></div>
        <div class="wph-setting-group wph-font-group" style="display:none"><label>字号</label><input type="range" class="wph-font-size" min="12" max="72" value="${state.fontSize}"><span>${state.fontSize}px</span></div>
        <div class="wph-divider"></div>
        <div class="wph-mode-group">
          <button class="wph-mode-btn" id="wph-fill-btn" title="填充模式">🖌️ 填充</button>
          <button class="wph-mode-btn" id="wph-dash-btn" title="虚线模式">📐 虚线</button>
          <button class="wph-mode-btn" id="wph-grid-btn" title="网格辅助线">📏 网格</button>
          <button class="wph-mode-btn" id="wph-reset-counter" title="重置计数为1">🔢 重置</button>
        </div>
        <div class="wph-divider"></div>
        <div class="wph-action-group">
          <button class="wph-action" id="wph-screenshot" title="截图标注">📷</button>
          <button class="wph-action" id="wph-undo" title="撤销">↩</button>
          <button class="wph-action" id="wph-redo" title="重做">↪</button>
          <button class="wph-action" id="wph-clear" title="清除">🗑</button>
          <button class="wph-action" id="wph-save" title="保存">💾</button>
        </div>
      </div>`;
    document.body.appendChild(toolbar);
  }

  function createTextInput() {
    textInput = document.createElement('textarea');
    textInput.id = 'wph-text-input';
    textInput.placeholder = '输入文字...';
    textInput.style.cssText = `position:fixed;background:#fff;border:2px solid ${state.color};border-radius:4px;padding:6px 10px;z-index:2147483648;display:none;outline:none;resize:none;font-family:Microsoft YaHei, sans-serif;`;
    document.body.appendChild(textInput);
    
    textInput.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { 
        e.preventDefault(); 
        commitText(); 
      }
      if (e.key === 'Escape') { 
        textInput.style.display = 'none'; 
        textInput.value = ''; 
      }
    });
    
    textInput.addEventListener('mousedown', e => e.stopPropagation());
    textInput.addEventListener('click', e => e.stopPropagation());
    textInput.addEventListener('focus', e => e.stopPropagation());
  }

  function commitText() {
    const text = textInput.value.trim();
    if (text) {
      const rect = textInput.getBoundingClientRect();
      // 添加文字对象
      state.objects.push({
        type: 'text',
        x: rect.left,
        y: rect.top,
        text: text,
        color: state.color,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        opacity: state.opacity
      });
      redrawCanvas();
      saveState();
    }
    textInput.style.display = 'none';
    textInput.value = '';
  }

  function showTextInput(x, y) {
    textInput.style.cssText = `position:fixed;left:${x}px;top:${y}px;background:#fff;border:2px solid ${state.color};border-radius:4px;padding:6px 10px;z-index:2147483648;display:block;outline:none;resize:none;font-family:Microsoft YaHei, sans-serif;font-size:${state.fontSize}px;min-width:200px;min-height:40px;box-shadow:0 4px 12px rgba(0,0,0,0.15);`;
    textInput.value = '';
    requestAnimationFrame(() => {
      textInput.focus();
      textInput.select();
    });
  }

  function bindEvents() {
    // 工具栏拖动
    const toolbarHeader = toolbar.querySelector('.wph-toolbar-header');
    toolbarHeader.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('wph-close')) return;
      state.isDraggingToolbar = true;
      state.toolbarOffsetX = e.clientX - toolbar.offsetLeft;
      state.toolbarOffsetY = e.clientY - toolbar.offsetTop;
      toolbar.style.transition = 'none';
      e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!state.isDraggingToolbar) return;
      const newX = Math.max(0, Math.min(window.innerWidth - toolbar.offsetWidth, e.clientX - state.toolbarOffsetX));
      const newY = Math.max(0, Math.min(window.innerHeight - toolbar.offsetHeight, e.clientY - state.toolbarOffsetY));
      toolbar.style.left = newX + 'px';
      toolbar.style.top = newY + 'px';
      toolbar.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      if (state.isDraggingToolbar) {
        state.isDraggingToolbar = false;
        toolbar.style.transition = '';
      }
    });
    
    toolbar.querySelectorAll('.wph-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('.wph-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.tool = btn.dataset.tool;
        updateCursor();
        toolbar.querySelector('.wph-font-group').style.display = state.tool === 'text' ? 'flex' : 'none';
      });
    });
    toolbar.querySelector('.wph-color').addEventListener('input', e => state.color = e.target.value);
    toolbar.querySelector('#wph-line-width').addEventListener('input', e => {
      state.lineWidth = +e.target.value;
      toolbar.querySelector('#wph-line-width-value').textContent = state.lineWidth;
    });
    toolbar.querySelector('#wph-opacity').addEventListener('input', e => {
      state.opacity = +e.target.value;
      toolbar.querySelector('#wph-opacity-value').textContent = Math.round(state.opacity * 100) + '%';
    });
    toolbar.querySelector('.wph-font-size').addEventListener('input', e => {
      state.fontSize = +e.target.value;
      toolbar.querySelector('.wph-font-size + span').textContent = state.fontSize + 'px';
    });
    
    toolbar.querySelector('#wph-color-palette').addEventListener('click', () => {
      const panel = toolbar.querySelector('#wph-color-palette-panel');
      state.showColorPalette = !state.showColorPalette;
      panel.style.display = state.showColorPalette ? 'block' : 'none';
    });
    toolbar.querySelectorAll('.wph-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        state.color = swatch.dataset.color;
        toolbar.querySelector('.wph-color').value = state.color;
        state.showColorPalette = false;
        toolbar.querySelector('#wph-color-palette-panel').style.display = 'none';
      });
    });
    
    // 取色器
    toolbar.querySelector('#wph-pick-color').addEventListener('click', () => {
      state.isPickingColor = true;
      canvas.style.cursor = 'crosshair';
      showColorPickerTip();
    });
    
    toolbar.querySelector('#wph-fill-btn').addEventListener('click', () => {
      state.fillEnabled = !state.fillEnabled;
      toolbar.querySelector('#wph-fill-btn').classList.toggle('active', state.fillEnabled);
    });
    
    toolbar.querySelector('#wph-dash-btn').addEventListener('click', () => {
      state.dashEnabled = !state.dashEnabled;
      toolbar.querySelector('#wph-dash-btn').classList.toggle('active', state.dashEnabled);
    });
    
    toolbar.querySelector('#wph-grid-btn').addEventListener('click', () => {
      state.gridEnabled = !state.gridEnabled;
      toolbar.querySelector('#wph-grid-btn').classList.toggle('active', state.gridEnabled);
      drawGrid();
    });
    
    toolbar.querySelector('#wph-reset-counter').addEventListener('click', () => {
      state.counterNumber = 1;
      showCopySuccessTip('计数已重置为 1');
    });
    
    toolbar.querySelector('#wph-screenshot').addEventListener('click', startScreenshot);
    toolbar.querySelector('#wph-undo').addEventListener('click', undo);
    toolbar.querySelector('#wph-redo').addEventListener('click', redo);
    toolbar.querySelector('#wph-clear').addEventListener('click', clearCanvas);
    toolbar.querySelector('#wph-save').addEventListener('click', saveImage);
    toolbar.querySelector('.wph-close').addEventListener('click', disable);

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', debounce(handleResize, 200));
    
    document.addEventListener('mousedown', (e) => {
      if (textInput.style.display === 'block' && 
          !textInput.contains(e.target) && 
          e.target !== textInput) {
        commitText();
      }
    }, true);
  }

  // 命中检测 - 查找点击位置的对象
  function hitTest(x, y) {
    // 从后往前遍历（后绘制的在上层）
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const obj = state.objects[i];
      if (obj.type === 'freehand' || obj.type === 'eraser') {
        // 检查是否点击在路径附近
        for (let j = 0; j < obj.points.length - 1; j++) {
          const dist = pointToLineDistance(x, y, obj.points[j].x, obj.points[j].y, obj.points[j+1].x, obj.points[j+1].y);
          if (dist < Math.max(10, obj.lineWidth)) {
            return i;
          }
        }
      } else if (obj.type === 'rect') {
        if (obj.rotation) {
          // 旋转后的矩形：将点击坐标反向旋转到矩形的本地坐标系
          const centerX = obj.x + obj.width / 2;
          const centerY = obj.y + obj.height / 2;
          const angle = -obj.rotation * Math.PI / 180;
          const dx = x - centerX;
          const dy = y - centerY;
          const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + centerX;
          const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + centerY;
          
          if (localX >= obj.x && localX <= obj.x + obj.width && 
              localY >= obj.y && localY <= obj.y + obj.height) {
            return i;
          }
        } else {
          if (x >= obj.x && x <= obj.x + obj.width && y >= obj.y && y <= obj.y + obj.height) {
            return i;
          }
        }
      } else if (obj.type === 'circle') {
        // 圆形旋转后形状不变，不需要特殊处理
        const dx = (x - obj.x) / obj.radiusX;
        const dy = (y - obj.y) / obj.radiusY;
        if (dx * dx + dy * dy <= 1) return i;
      } else if (obj.type === 'text') {
        if (obj.rotation) {
          // 旋转后的文字：将点击坐标反向旋转到文字的本地坐标系
          const angle = -obj.rotation * Math.PI / 180;
          const dx = x - obj.x;
          const dy = y - obj.y;
          const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + obj.x;
          const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + obj.y;
          
          ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
          const metrics = ctx.measureText(obj.text);
          const textWidth = metrics.width;
          const textHeight = obj.fontSize;
          
          if (localX >= obj.x && localX <= obj.x + textWidth && 
              localY >= obj.y && localY <= obj.y + textHeight) {
            return i;
          }
        } else {
          ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
          const metrics = ctx.measureText(obj.text);
          const textWidth = metrics.width;
          const textHeight = obj.fontSize;
          if (x >= obj.x && x <= obj.x + textWidth && y >= obj.y && y <= obj.y + textHeight) {
            return i;
          }
        }
      } else if (obj.type === 'line' || obj.type === 'arrow') {
        if (obj.rotation) {
          // 旋转后的线段：将点击坐标反向旋转
          const centerX = (obj.x1 + obj.x2) / 2;
          const centerY = (obj.y1 + obj.y2) / 2;
          const angle = -obj.rotation * Math.PI / 180;
          const dx = x - centerX;
          const dy = y - centerY;
          const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + centerX;
          const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + centerY;
          
          const dist = pointToLineDistance(localX, localY, obj.x1, obj.y1, obj.x2, obj.y2);
          if (dist < 10) return i;
        } else {
          const dist = pointToLineDistance(x, y, obj.x1, obj.y1, obj.x2, obj.y2);
          if (dist < 10) return i;
        }
      } else if (obj.type === 'counter') {
        // 计数圆圈命中检测
        const dx = x - obj.x;
        const dy = y - obj.y;
        const r = obj.radius || 20;
        if (dx * dx + dy * dy <= r * r) return i;
      }
    }
    return -1;
  }

  function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;
    param = Math.max(0, Math.min(1, param));
    const xx = x1 + param * C, yy = y1 + param * D;
    return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
  }

  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
    
    // 绘制对象（包括画笔路径对象）
    state.objects.forEach(obj => {
      ctx.strokeStyle = obj.color;
      ctx.fillStyle = obj.color;
      ctx.lineWidth = obj.lineWidth || 3;
      ctx.globalAlpha = obj.opacity !== undefined ? obj.opacity : 1;
      
      if (obj.dashEnabled) {
        ctx.setLineDash([10, 5]);
      } else {
        ctx.setLineDash([]);
      }
      
      if (obj.type === 'freehand') {
        // 绘制自由画笔路径
        if (obj.points && obj.points.length >= 2) {
          ctx.save();
          
          // 应用旋转
          if (obj.rotation) {
            const centerX = (obj.bbox.minX + obj.bbox.maxX) / 2;
            const centerY = (obj.bbox.minY + obj.bbox.maxY) / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(obj.rotation * Math.PI / 180);
            ctx.translate(-centerX, -centerY);
          }
          
          ctx.strokeStyle = obj.color;
          ctx.lineWidth = obj.lineWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.stroke();
          ctx.restore();
        }
      } else if (obj.type === 'eraser') {
        // 绘制橡皮擦路径
        if (obj.points && obj.points.length >= 2) {
          ctx.save();
          
          // 应用旋转
          if (obj.rotation) {
            const centerX = (obj.bbox.minX + obj.bbox.maxX) / 2;
            const centerY = (obj.bbox.minY + obj.bbox.maxY) / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate(obj.rotation * Math.PI / 180);
            ctx.translate(-centerX, -centerY);
          }
          
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = obj.lineWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.beginPath();
          ctx.moveTo(obj.points[0].x, obj.points[0].y);
          for (let i = 1; i < obj.points.length; i++) {
            ctx.lineTo(obj.points[i].x, obj.points[i].y);
          }
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          ctx.restore();
        }
      } else if (obj.type === 'rect') {
        ctx.save();
        
        // 应用旋转
        if (obj.rotation) {
          const centerX = obj.x + obj.width / 2;
          const centerY = obj.y + obj.height / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(obj.rotation * Math.PI / 180);
          ctx.translate(-centerX, -centerY);
        }
        
        if (obj.fillEnabled) {
          ctx.fillRect(obj.x, obj.y, obj.width, obj.height);
        }
        ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
        ctx.restore();
      } else if (obj.type === 'circle') {
        ctx.save();
        
        // 应用旋转
        if (obj.rotation) {
          ctx.translate(obj.x, obj.y);
          ctx.rotate(obj.rotation * Math.PI / 180);
          ctx.translate(-obj.x, -obj.y);
        }
        
        ctx.beginPath();
        ctx.ellipse(obj.x, obj.y, obj.radiusX, obj.radiusY, 0, 0, Math.PI * 2);
        if (obj.fillEnabled) ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (obj.type === 'line') {
        ctx.save();
        
        // 应用旋转
        if (obj.rotation) {
          const centerX = (obj.x1 + obj.x2) / 2;
          const centerY = (obj.y1 + obj.y2) / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(obj.rotation * Math.PI / 180);
          ctx.translate(-centerX, -centerY);
        }
        
        ctx.beginPath();
        ctx.moveTo(obj.x1, obj.y1);
        ctx.lineTo(obj.x2, obj.y2);
        ctx.stroke();
        ctx.restore();
      } else if (obj.type === 'arrow') {
        ctx.save();
        
        // 应用旋转
        if (obj.rotation) {
          const centerX = (obj.x1 + obj.x2) / 2;
          const centerY = (obj.y1 + obj.y2) / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(obj.rotation * Math.PI / 180);
          ctx.translate(-centerX, -centerY);
        }
        
        ctx.beginPath();
        ctx.moveTo(obj.x1, obj.y1);
        ctx.lineTo(obj.x2, obj.y2);
        ctx.stroke();
        const a = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
        const hl = Math.max(12, (obj.lineWidth || 3) * 4);
        ctx.beginPath();
        ctx.moveTo(obj.x2, obj.y2);
        ctx.lineTo(obj.x2 - hl * Math.cos(a - 0.5), obj.y2 - hl * Math.sin(a - 0.5));
        ctx.moveTo(obj.x2, obj.y2);
        ctx.lineTo(obj.x2 - hl * Math.cos(a + 0.5), obj.y2 - hl * Math.sin(a + 0.5));
        ctx.stroke();
        ctx.restore();
      } else if (obj.type === 'text') {
        ctx.save();
        
        // 应用旋转
        if (obj.rotation) {
          ctx.translate(obj.x, obj.y);
          ctx.rotate(obj.rotation * Math.PI / 180);
          ctx.translate(-obj.x, -obj.y);
        }
        
        ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
        ctx.textBaseline = 'top';
        obj.text.split('\n').forEach((line, i) => {
          ctx.fillText(line, obj.x, obj.y + i * obj.fontSize * 1.2);
        });
        ctx.restore();
      } else if (obj.type === 'counter') {
        // 计数圆圈
        ctx.save();
        
        const r = obj.radius || 20;
        
        // 绘制圆形背景（白色填充）
        ctx.beginPath();
        ctx.arc(obj.x, obj.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        
        // 绘制圆形边框
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = Math.max(2, obj.lineWidth || 3);
        ctx.stroke();
        
        // 绘制数字
        ctx.fillStyle = obj.color;
        ctx.font = `bold ${r}px Microsoft YaHei, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.number, obj.x, obj.y);
        
        ctx.restore();
      }
    });
    
    ctx.setLineDash([]);
    
    // 绘制选中框
    if (state.selectedObject !== null) {
      drawSelectionBox(state.objects[state.selectedObject]);
    }
  }

  function drawSelectionBox(obj) {
    if (!obj) return;
    
    ctx.save();
    ctx.strokeStyle = '#0066ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    let bounds;
    if (obj.type === 'rect') {
      bounds = { x: obj.x - 5, y: obj.y - 5, width: obj.width + 10, height: obj.height + 10 };
    } else if (obj.type === 'circle') {
      bounds = { x: obj.x - obj.radiusX - 5, y: obj.y - obj.radiusY - 5, width: obj.radiusX * 2 + 10, height: obj.radiusY * 2 + 10 };
    } else if (obj.type === 'freehand' || obj.type === 'eraser') {
      // 使用边界框
      if (obj.bbox) {
        bounds = { x: obj.bbox.minX - 5, y: obj.bbox.minY - 5, width: obj.bbox.maxX - obj.bbox.minX + 10, height: obj.bbox.maxY - obj.bbox.minY + 10 };
      }
    } else if (obj.type === 'text') {
      ctx.font = `${obj.fontSize}px ${obj.fontFamily}`;
      const metrics = ctx.measureText(obj.text);
      bounds = { x: obj.x - 5, y: obj.y - 5, width: metrics.width + 10, height: obj.fontSize + 10 };
    } else if (obj.type === 'line' || obj.type === 'arrow') {
      const minX = Math.min(obj.x1, obj.x2) - 10;
      const minY = Math.min(obj.y1, obj.y2) - 10;
      const maxX = Math.max(obj.x1, obj.x2) + 10;
      const maxY = Math.max(obj.y1, obj.y2) + 10;
      bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    } else if (obj.type === 'counter') {
      const r = obj.radius || 20;
      bounds = { x: obj.x - r - 5, y: obj.y - r - 5, width: r * 2 + 10, height: r * 2 + 10 };
    }
    
    if (bounds) {
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function handleMouseDown(e) {
    // 取色器模式
    if (state.isPickingColor) {
      pickColorAt(e.clientX, e.clientY);
      return;
    }
    
    // 截图模式下处理区域选择
    if (state.isScreenshotMode) {
      state.screenshotStartX = e.clientX;
      state.screenshotStartY = e.clientY;
      state.screenshotEndX = e.clientX;
      state.screenshotEndY = e.clientY;
      state.isDrawing = true;
      return;
    }
    
    if (textInput.style.display === 'block') return;
    
    if (state.tool === 'text') { 
      showTextInput(e.clientX, e.clientY); 
      return; 
    }
    
    // 计数圆圈工具
    if (state.tool === 'counter') {
      addCounterCircle(e.clientX, e.clientY);
      return;
    }
    
    // 手形工具 - 选择并拖拽对象
    if (state.tool === 'hand') {
      const hitIndex = hitTest(e.clientX, e.clientY);
      if (hitIndex !== -1) {
        state.selectedObject = hitIndex;
        state.isDragging = true;
        const obj = state.objects[hitIndex];
        
        if (obj.type === 'rect' || obj.type === 'text' || obj.type === 'freehand' || obj.type === 'eraser') {
          // 计算边界框
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          if (obj.type === 'freehand' || obj.type === 'eraser') {
            obj.points.forEach(p => {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            });
            state.dragOffsetX = e.clientX - minX;
            state.dragOffsetY = e.clientY - minY;
            obj.bbox = { minX, minY, maxX, maxY }; // 缓存边界框
          } else {
            state.dragOffsetX = e.clientX - obj.x;
            state.dragOffsetY = e.clientY - obj.y;
          }
        } else if (obj.type === 'circle') {
          state.dragOffsetX = e.clientX - obj.x;
          state.dragOffsetY = e.clientY - obj.y;
        } else if (obj.type === 'counter') {
          state.dragOffsetX = e.clientX - obj.x;
          state.dragOffsetY = e.clientY - obj.y;
        } else if (obj.type === 'line' || obj.type === 'arrow') {
          state.dragOffsetX1 = e.clientX - obj.x1;
          state.dragOffsetY1 = e.clientY - obj.y1;
          state.dragOffsetX2 = e.clientX - obj.x2;
          state.dragOffsetY2 = e.clientY - obj.y2;
        }
        
        // 初始化旋转状态
        state.isRotating = false;
        state.rotationAngle = obj.rotation || 0;
        state.rotationStartX = e.clientX;
        state.lastMouseX = e.clientX;
        
        redrawCanvas();
        canvas.style.cursor = 'grabbing';
      } else {
        state.selectedObject = null;
        redrawCanvas();
      }
      return;
    }
    
    state.isDrawing = true;
    // 起点吸附
    const startSnapped = snapToPoint(e.clientX, e.clientY);
    state.startX = startSnapped.x;
    state.startY = startSnapped.y;
    if (state.tool === 'brush' || state.tool === 'eraser') {
      // 创建新路径对象
      const newPathObj = {
        type: state.tool === 'brush' ? 'freehand' : 'eraser',
        points: [{x: e.clientX, y: e.clientY}],
        color: state.color,
        lineWidth: state.tool === 'eraser' ? state.lineWidth * 3 : state.lineWidth,
        opacity: state.opacity
      };
      state.objects.push(newPathObj);
    }
    if (['rect', 'circle', 'line', 'arrow'].includes(state.tool)) {
      previewCanvas.style.display = 'block';
    }
  }

  function handleMouseMove(e) {
    // 截图模式下显示选择区域
    if (state.isScreenshotMode && state.isDrawing) {
      state.screenshotEndX = e.clientX;
      state.screenshotEndY = e.clientY;
      drawScreenshotOverlay();
      return;
    }
    
    // 手形工具 - 拖拽或旋转对象
    if (state.tool === 'hand' && state.isDragging && state.selectedObject !== null) {
      const obj = state.objects[state.selectedObject];
      
      // 按住Shift键旋转
      if (e.shiftKey) {
        if (!state.isRotating) {
          state.isRotating = true;
          state.lastMouseX = e.clientX;
        }
        
        const dx = e.clientX - state.lastMouseX;
        const rotationDelta = dx * 0.5; // 每像素0.5度
        state.rotationAngle += rotationDelta;
        state.lastMouseX = e.clientX;
        
        // 保存旋转角度到对象
        obj.rotation = state.rotationAngle;
        
        redrawCanvas();
        return;
      }
      
      // 普通拖拽
      if (state.isRotating) {
        state.isRotating = false;
      }
      
      if (obj.type === 'rect' || obj.type === 'text') {
        obj.x = e.clientX - state.dragOffsetX;
        obj.y = e.clientY - state.dragOffsetY;
        canvas.style.cursor = 'grabbing';
      } else if (obj.type === 'freehand' || obj.type === 'eraser') {
        // 移动路径的所有点
        const dx = e.clientX - state.dragOffsetX - obj.bbox.minX;
        const dy = e.clientY - state.dragOffsetY - obj.bbox.minY;
        obj.points.forEach(p => {
          p.x += dx;
          p.y += dy;
        });
        // 更新边界框
        obj.bbox.minX = e.clientX - state.dragOffsetX;
        obj.bbox.minY = e.clientY - state.dragOffsetY;
        obj.bbox.maxX += dx;
        obj.bbox.maxY += dy;
        canvas.style.cursor = 'grabbing';
      } else if (obj.type === 'circle') {
        obj.x = e.clientX - state.dragOffsetX;
        obj.y = e.clientY - state.dragOffsetY;
        canvas.style.cursor = 'grabbing';
      } else if (obj.type === 'counter') {
        obj.x = e.clientX - state.dragOffsetX;
        obj.y = e.clientY - state.dragOffsetY;
        canvas.style.cursor = 'grabbing';
      } else if (obj.type === 'line' || obj.type === 'arrow') {
        obj.x1 = e.clientX - state.dragOffsetX1;
        obj.y1 = e.clientY - state.dragOffsetY1;
        obj.x2 = e.clientX - state.dragOffsetX2;
        obj.y2 = e.clientY - state.dragOffsetY2;
        canvas.style.cursor = 'grabbing';
      }
      
      redrawCanvas();
      return;
    }
    
    if (!state.isDrawing) return;
    if (state.tool === 'brush' || state.tool === 'eraser') {
      // 添加点到当前路径对象
      const lastObj = state.objects[state.objects.length - 1];
      if (lastObj && (lastObj.type === 'freehand' || lastObj.type === 'eraser')) {
        lastObj.points.push({x: e.clientX, y: e.clientY});
        redrawCanvas();
      }
    } else if (['rect', 'circle', 'line', 'arrow'].includes(state.tool)) {
      drawPreviewShape(e.clientX, e.clientY, e.shiftKey);
    }
  }

  function handleMouseUp(e) {
    // 截图模式下完成区域选择
    if (state.isScreenshotMode && state.isDrawing) {
      state.isDrawing = false;
      captureSelectedArea();
      return;
    }
    
    // 手形工具 - 结束拖拽或旋转
    if (state.tool === 'hand' && state.isDragging) {
      state.isDragging = false;
      state.isRotating = false;
      canvas.style.cursor = state.tool === 'hand' ? 'grab' : 'crosshair';
      if (state.selectedObject !== null) {
        // 拖拽结束时吸附
        snapDraggedObject(state.objects[state.selectedObject]);
        redrawCanvas();
        saveState();
      }
      return;
    }
    
    if (!state.isDrawing) return;
    state.isDrawing = false;
    previewCanvas.style.display = 'none';
    clearPreview();

    let ex = e.clientX, ey = e.clientY;
    
    // Shift约束
    const constrained = constrainShape(state.startX, state.startY, ex, ey, e.shiftKey);
    ex = constrained.ex;
    ey = constrained.ey;
    
    // 端点吸附
    const snapped = snapToPoint(ex, ey);
    if (snapped.snapped) {
      ex = snapped.x;
      ey = snapped.y;
    }
    
    // 将新绘制的内容添加到对象数组
    if (state.tool === 'rect') {
      state.objects.push({
        type: 'rect',
        x: state.startX,
        y: state.startY,
        width: ex - state.startX,
        height: ey - state.startY,
        color: state.color,
        lineWidth: state.lineWidth,
        opacity: state.opacity,
        fillEnabled: state.fillEnabled,
        dashEnabled: state.dashEnabled
      });
      redrawCanvas();
    } else if (state.tool === 'circle') {
      const rx = Math.max(Math.abs(ex - state.startX) / 2, 1);
      const ry = Math.max(Math.abs(ey - state.startY) / 2, 1);
      state.objects.push({
        type: 'circle',
        x: (state.startX + ex) / 2,
        y: (state.startY + ey) / 2,
        radiusX: rx,
        radiusY: ry,
        color: state.color,
        lineWidth: state.lineWidth,
        opacity: state.opacity,
        fillEnabled: state.fillEnabled,
        dashEnabled: state.dashEnabled
      });
      redrawCanvas();
    } else if (state.tool === 'line') {
      state.objects.push({
        type: 'line',
        x1: state.startX,
        y1: state.startY,
        x2: ex,
        y2: ey,
        color: state.color,
        lineWidth: state.lineWidth,
        opacity: state.opacity,
        dashEnabled: state.dashEnabled
      });
      redrawCanvas();
    } else if (state.tool === 'arrow') {
      state.objects.push({
        type: 'arrow',
        x1: state.startX,
        y1: state.startY,
        x2: ex,
        y2: ey,
        color: state.color,
        lineWidth: state.lineWidth,
        opacity: state.opacity,
        dashEnabled: state.dashEnabled
      });
      redrawCanvas();
    }
    
    saveState();
  }

  function handleKeyDown(e) {
    // 取色器模式下按 ESC 取消
    if (state.isPickingColor && e.key === 'Escape') {
      e.preventDefault();
      state.isPickingColor = false;
      hideColorPickerTip();
      updateCursor();
      return;
    }
    
    // 截图模式下按 ESC 取消
    if (state.isScreenshotMode && e.key === 'Escape') {
      e.preventDefault();
      exitScreenshotMode();
      return;
    }
    
    if (!state.enabled) return;
    const key = e.key.toLowerCase();
    if (key === 'b') selectTool('brush');
    else if (key === 'e') selectTool('eraser');
    else if (key === 't') selectTool('text');
    else if (key === 'h') selectTool('hand');
    else if (key === 'r') selectTool('rect');
    else if (key === 'c') selectTool('circle');
    else if (key === 'l') selectTool('line');
    else if (key === 'a') selectTool('arrow');
    else if (key === 'n') selectTool('counter');
    else if (key === 'p') {
      state.isPickingColor = true;
      canvas.style.cursor = 'crosshair';
      showColorPickerTip();
    }
    else if (e.ctrlKey && key === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey && key === 'y') { e.preventDefault(); redo(); }
    else if (key === 'delete' || key === 'backspace') {
      if (state.selectedObject !== null && document.activeElement !== textInput) {
        e.preventDefault();
        state.objects.splice(state.selectedObject, 1);
        state.selectedObject = null;
        redrawCanvas();
        saveState();
      }
    }
  }

  function selectTool(tool) {
    state.tool = tool;
    toolbar.querySelectorAll('.wph-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    updateCursor();
    toolbar.querySelector('.wph-font-group').style.display = tool === 'text' ? 'flex' : 'none';
  }

  function updateCursor() {
    if (!canvas) return;
    canvas.style.cursor = state.tool === 'eraser' ? 'cell' : 
                          state.tool === 'text' ? 'text' : 
                          state.tool === 'hand' ? 'grab' : 
                          'crosshair';
  }
  
  // 取色器功能
  function showColorPickerTip() {
    const tip = document.createElement('div');
    tip.id = 'wph-picker-tip';
    tip.textContent = '点击屏幕任意位置取色，按 ESC 取消';
    tip.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 2147483650;
      pointer-events: none;
    `;
    document.body.appendChild(tip);
  }
  
  function hideColorPickerTip() {
    const tip = document.getElementById('wph-picker-tip');
    if (tip) tip.remove();
  }
  
  function pickColorAt(x, y) {
    // 创建临时canvas来获取屏幕颜色
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, function(response) {
      if (!response || !response.success) {
        state.isPickingColor = false;
        hideColorPickerTip();
        updateCursor();
        return;
      }
      
      const img = new Image();
      img.onload = function() {
        const tempCanvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        tempCanvas.width = window.innerWidth * dpr;
        tempCanvas.height = window.innerHeight * dpr;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0);
        
        try {
          const pixel = tempCtx.getImageData(x * dpr, y * dpr, 1, 1).data;
          const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
          
          state.color = hex;
          toolbar.querySelector('.wph-color').value = hex;
          showCopySuccessTip(`已选取颜色: ${hex}`);
        } catch (e) {
          console.error('取色失败:', e);
        }
        
        state.isPickingColor = false;
        hideColorPickerTip();
        updateCursor();
      };
      img.src = response.dataUrl;
    });
  }
  
  // 计数圆圈功能
  function addCounterCircle(x, y) {
    const radius = Math.max(15, state.lineWidth * 3);
    
    state.objects.push({
      type: 'counter',
      x: x,
      y: y,
      radius: radius,
      number: state.counterNumber,
      color: state.color,
      lineWidth: state.lineWidth,
      opacity: state.opacity
    });
    
    state.counterNumber++; // 自动递增
    redrawCanvas();
    saveState();
    
    // 显示当前计数
    showCopySuccessTip(`计数: ${state.counterNumber - 1}`);
  }

  function saveState() {
    const snapshot = JSON.parse(JSON.stringify(state.objects));
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    if (state.history.length > state.maxHistory) state.history.shift();
    else state.historyIndex++;
  }

  function undo() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      state.objects = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
      state.selectedObject = null;
      redrawCanvas();
    }
  }

  function redo() {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex++;
      state.objects = JSON.parse(JSON.stringify(state.history[state.historyIndex]));
      state.selectedObject = null;
      redrawCanvas();
    }
  }

  function clearCanvas() {
    state.objects = [];
    state.selectedObject = null;
    redrawCanvas();
    saveState();
  }

  function saveImage() {
    // 先截取网页内容，再合成绘图内容
    // 收集所有绘图UI元素并隐藏
    const uiElements = [
      canvas, toolbar, overlay,
      document.getElementById('wph-grid-canvas'),
      document.getElementById('wph-fs-edit'),
      document.getElementById('wph-fs-toolbar'),
      document.getElementById('wph-flameshot-overlay'),
      document.getElementById('wph-screenshot-overlay'),
      document.getElementById('wph-screenshot-tip'),
      document.getElementById('wph-fs-style'),
      textInput
    ].filter(Boolean);
    
    const prevDisplays = uiElements.map(el => el.style.display);
    uiElements.forEach(el => el.style.display = 'none');
    
    // 需要短暂延迟让浏览器完成重绘
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ action: 'captureScreenshot' }, function(response) {
        // 恢复UI
        uiElements.forEach((el, i) => el.style.display = prevDisplays[i]);
        
        if (response && response.success) {
          // 合成：网页截图 + 绘图内容
          const img = new Image();
          img.onload = function() {
            const temp = document.createElement('canvas');
            temp.width = canvas.width;
            temp.height = canvas.height;
            const tCtx = temp.getContext('2d');
            
            // 先绘制网页截图
            tCtx.drawImage(img, 0, 0);
            
            // 再叠加绘图内容
            tCtx.drawImage(canvas, 0, 0);
            
            const link = document.createElement('a');
            link.download = `paint-${Date.now()}.png`;
            link.href = temp.toDataURL('image/png');
            link.click();
            showCopySuccessTip('已保存（含网页内容）');
          };
          img.src = response.dataUrl;
        } else {
          // 降级：只保存绘图内容
          const temp = document.createElement('canvas');
          temp.width = canvas.width;
          temp.height = canvas.height;
          const tCtx = temp.getContext('2d');
          tCtx.drawImage(canvas, 0, 0);
          const link = document.createElement('a');
          link.download = `paint-${Date.now()}.png`;
          link.href = temp.toDataURL('image/png');
          link.click();
        }
      });
    });
  }

  function handleResize() {
    const oldObjects = JSON.parse(JSON.stringify(state.objects));
    setCanvasSize(canvas);
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    setCanvasSize(previewCanvas);
    previewCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    if (state.gridEnabled) drawGrid();
    redrawCanvas();
  }

  function drawGrid() {
    // 清除旧网格canvas
    const oldGrid = document.getElementById('wph-grid-canvas');
    if (oldGrid) oldGrid.remove();
    
    if (!state.gridEnabled) {
      overlay.style.display = state.enabled ? 'block' : 'none';
      return;
    }
    
    overlay.style.display = 'block';
    
    // 使用独立canvas绘制网格，确保在任何背景上都可见
    const gridSize = 50;
    const gridCanvas = document.createElement('canvas');
    gridCanvas.id = 'wph-grid-canvas';
    const dpr = window.devicePixelRatio || 1;
    gridCanvas.width = window.innerWidth * dpr;
    gridCanvas.height = window.innerHeight * dpr;
    gridCanvas.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none;`;
    document.body.appendChild(gridCanvas);
    
    const gCtx = gridCanvas.getContext('2d');
    gCtx.scale(dpr, dpr);
    
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // 绘制网格线 - 使用双色方案确保在任何背景上可见
    // 先画浅色线（在深色背景上可见）
    gCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    gCtx.lineWidth = 1;
    gCtx.beginPath();
    for (let x = 0; x <= w; x += gridSize) {
      gCtx.moveTo(x, 0);
      gCtx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += gridSize) {
      gCtx.moveTo(0, y);
      gCtx.lineTo(w, y);
    }
    gCtx.stroke();
    
    // 再画深色线（在浅色背景上可见）
    gCtx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
    gCtx.lineWidth = 1;
    gCtx.beginPath();
    for (let x = 0; x <= w; x += gridSize) {
      gCtx.moveTo(x, 0);
      gCtx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += gridSize) {
      gCtx.moveTo(0, y);
      gCtx.lineTo(w, y);
    }
    gCtx.stroke();
    
    // 绘制网格交叉点 - 小圆点更醒目
    gCtx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    for (let x = 0; x <= w; x += gridSize) {
      for (let y = 0; y <= h; y += gridSize) {
        gCtx.beginPath();
        gCtx.arc(x, y, 1.5, 0, Math.PI * 2);
        gCtx.fill();
      }
    }
    // 白色圆点叠加
    gCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let x = 0; x <= w; x += gridSize) {
      for (let y = 0; y <= h; y += gridSize) {
        gCtx.beginPath();
        gCtx.arc(x, y, 1.5, 0, Math.PI * 2);
        gCtx.fill();
      }
    }
  }

  // 开始截图模式 - flameshot风格
  function startScreenshot() {
    state.isScreenshotMode = true;
    state.isFlameshotMode = true;
    
    // 创建截图遮罩（同时作为选区交互层）
    let screenshotOverlay = document.getElementById('wph-screenshot-overlay');
    if (!screenshotOverlay) {
      screenshotOverlay = document.createElement('div');
      screenshotOverlay.id = 'wph-screenshot-overlay';
      document.body.appendChild(screenshotOverlay);
    }
    screenshotOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      cursor: crosshair;
      pointer-events: auto;
    `;
    
    // 创建flameshot风格的选区预览层
    let flameshotOverlay = document.getElementById('wph-flameshot-overlay');
    if (!flameshotOverlay) {
      flameshotOverlay = document.createElement('canvas');
      flameshotOverlay.id = 'wph-flameshot-overlay';
      document.body.appendChild(flameshotOverlay);
    }
    flameshotOverlay.width = window.innerWidth * window.devicePixelRatio;
    flameshotOverlay.height = window.innerHeight * window.devicePixelRatio;
    flameshotOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483648;
      pointer-events: none;
    `;
    state.flameshotCanvas = flameshotOverlay;
    state.flameshotCtx = flameshotOverlay.getContext('2d');
    state.flameshotCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    // 显示提示
    showScreenshotTip();
    
    // 隐藏主工具栏和画布（但截图交互在遮罩层上）
    toolbar.style.display = 'none';
    canvas.style.display = 'none';
    
    // 在遮罩层上绑定截图选区事件
    screenshotOverlay.onmousedown = (e) => {
      state.screenshotStartX = e.clientX;
      state.screenshotStartY = e.clientY;
      state.screenshotEndX = e.clientX;
      state.screenshotEndY = e.clientY;
      state.isDrawing = true;
    };
    
    screenshotOverlay.onmousemove = (e) => {
      if (state.isScreenshotMode && state.isDrawing) {
        state.screenshotEndX = e.clientX;
        state.screenshotEndY = e.clientY;
        drawScreenshotOverlay();
      }
    };
    
    screenshotOverlay.onmouseup = (e) => {
      if (state.isScreenshotMode && state.isDrawing) {
        state.isDrawing = false;
        state.screenshotEndX = e.clientX;
        state.screenshotEndY = e.clientY;
        captureSelectedArea();
      }
    };
  }

  // 显示截图提示
  function showScreenshotTip() {
    if (!document.getElementById('wph-screenshot-tip')) {
      const tip = document.createElement('div');
      tip.id = 'wph-screenshot-tip';
      tip.textContent = '拖拽选择截图区域，按 ESC 取消';
      tip.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        font-size: 14px;
        z-index: 2147483649;
        pointer-events: none;
      `;
      document.body.appendChild(tip);
    }
  }

  // 隐藏截图提示
  function hideScreenshotTip() {
    const tip = document.getElementById('wph-screenshot-tip');
    if (tip) tip.remove();
  }

  // 绘制截图选择区域 - flameshot风格
  function drawScreenshotOverlay() {
    const ctx = state.flameshotCtx;
    if (!ctx) return;
    
    ctx.clearRect(0, 0, state.flameshotCanvas.width / window.devicePixelRatio, state.flameshotCanvas.height / window.devicePixelRatio);
    
    const x = Math.min(state.screenshotStartX, state.screenshotEndX);
    const y = Math.min(state.screenshotStartY, state.screenshotEndY);
    const width = Math.abs(state.screenshotEndX - state.screenshotStartX);
    const height = Math.abs(state.screenshotEndY - state.screenshotStartY);
    
    if (width < 5 || height < 5) return;
    
    // 绘制flameshot风格的选区
    // 1. 选区边框
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, width, height);
    
    // 2. 角落手柄
    const handleSize = 8;
    ctx.fillStyle = '#e74c3c';
    // 左上
    ctx.fillRect(x - handleSize/2, y - handleSize/2, handleSize, handleSize);
    // 右上
    ctx.fillRect(x + width - handleSize/2, y - handleSize/2, handleSize, handleSize);
    // 左下
    ctx.fillRect(x - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
    // 右下
    ctx.fillRect(x + width - handleSize/2, y + height - handleSize/2, handleSize, handleSize);
    
    // 3. 中间辅助线（十字线）
    ctx.strokeStyle = 'rgba(231, 76, 60, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    // 水平中线
    ctx.beginPath();
    ctx.moveTo(x, y + height/2);
    ctx.lineTo(x + width, y + height/2);
    ctx.stroke();
    // 垂直中线
    ctx.beginPath();
    ctx.moveTo(x + width/2, y);
    ctx.lineTo(x + width/2, y + height);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // 4. 显示尺寸信息
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 12px Microsoft YaHei, sans-serif';
    const sizeText = `${Math.round(width)} × ${Math.round(height)}`;
    const textWidth = ctx.measureText(sizeText).width;
    
    // 尺寸背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const padding = 6;
    const textX = x + width/2 - textWidth/2 - padding;
    const textY = y - 28;
    ctx.fillRect(textX, textY, textWidth + padding * 2, 20);
    
    // 尺寸文字
    ctx.fillStyle = '#fff';
    ctx.fillText(sizeText, textX + padding, textY + 14);
    
    // 5. 显示坐标
    ctx.font = '11px Microsoft YaHei, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText(`(${Math.round(x)}, ${Math.round(y)})`, x, y + height + 16);
  }

  // 捕获选中的区域 - flameshot风格
  function captureSelectedArea() {
    const x = Math.min(state.screenshotStartX, state.screenshotEndX);
    const y = Math.min(state.screenshotStartY, state.screenshotEndY);
    const width = Math.abs(state.screenshotEndX - state.screenshotStartX);
    const height = Math.abs(state.screenshotEndY - state.screenshotStartY);
    
    if (width < 10 || height < 10) {
      exitScreenshotMode();
      return;
    }
    
    // 保存截图区域
    state.flameshotRect = { x, y, width, height };
    
    // 隐藏所有绘图UI，确保截图是纯网页内容
    const screenshotOverlay = document.getElementById('wph-screenshot-overlay');
    if (screenshotOverlay) screenshotOverlay.style.display = 'none';
    if (state.flameshotCanvas) state.flameshotCanvas.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    const gridCanvas = document.getElementById('wph-grid-canvas');
    if (gridCanvas) gridCanvas.style.display = 'none';
    hideScreenshotTip();
    
    // 请求截图（此时页面是干净的，没有绘图UI遮挡）
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, function(response) {
      // 恢复overlay
      if (overlay) overlay.style.display = 'block';
      if (gridCanvas) gridCanvas.style.display = 'block';
      
      if (!response || !response.success) {
        alert('截图失败: ' + (response ? response.error : '未知错误'));
        exitScreenshotMode();
        return;
      }
      
      const img = new Image();
      img.onload = function() {
        enterFlameshotEdit(img, x, y, width, height);
      };
      img.onerror = function() {
        alert('截图处理失败');
        exitScreenshotMode();
      };
      img.src = response.dataUrl;
    });
  }
  
  // Flameshot风格编辑模式
  let fsEditCanvas, fsEditCtx, fsObjects = [], fsHistory = [], fsHistoryIdx = -1;
  let fsDrawing = false, fsStartX = 0, fsStartY = 0, fsCurrentPath = null;
  
  function enterFlameshotEdit(img, x, y, width, height) {
    state.isFlameshotMode = true;
    state.flameshotImage = img;
    fsObjects = [];
    fsHistory = [];
    fsHistoryIdx = -1;
    
    // 创建编辑画布
    fsEditCanvas = document.createElement('canvas');
    fsEditCanvas.id = 'wph-fs-edit';
    const dpr = window.devicePixelRatio || 1;
    fsEditCanvas.width = width * dpr;
    fsEditCanvas.height = height * dpr;
    fsEditCanvas.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:2147483647;cursor:crosshair;box-shadow:0 0 0 2px #e74c3c;`;
    document.body.appendChild(fsEditCanvas);
    
    fsEditCtx = fsEditCanvas.getContext('2d');
    fsEditCtx.scale(dpr, dpr);
    fsEditCtx.drawImage(img, x * dpr, y * dpr, width * dpr, height * dpr, 0, 0, width, height);
    
    saveFsState();
    createFsToolbar(x, y, width, height);
    bindFsEditEvents();
  }
  
  function createFsToolbar(x, y, width, height) {
    const tb = document.createElement('div');
    tb.id = 'wph-fs-toolbar';
    let tbY = y + height + 12;
    if (tbY + 50 > window.innerHeight) tbY = y - 55;
    let tbX = Math.min(x, window.innerWidth - 420);
    
    tb.innerHTML = `<span class="fs-drag" title="拖动">⋮⋮</span>
      <button class="fs-tool active" data-tool="brush" title="画笔(B)">✏️</button>
      <button class="fs-tool" data-tool="arrow" title="箭头(A)">→</button>
      <button class="fs-tool" data-tool="rect" title="矩形(R)">▢</button>
      <button class="fs-tool" data-tool="circle" title="圆形(C)">○</button>
      <button class="fs-tool" data-tool="line" title="直线(L)">╱</button>
      <button class="fs-tool" data-tool="text" title="文字(T)">T</button>
      <button class="fs-tool" data-tool="counter" title="计数圆圈(N)">①</button>
      <button class="fs-tool" data-tool="eraser" title="橡皮擦(E)">🧹</button>
      <span class="fs-div"></span>
      <input type="color" class="fs-color" value="${state.color}">
      <button class="fs-btn" id="fs-pick" title="取色器(P)">💉</button>
      <input type="range" class="fs-size" min="1" max="20" value="${state.lineWidth}">
      <span class="fs-div"></span>
      <button class="fs-btn" id="fs-undo" title="撤销">↩</button>
      <button class="fs-btn" id="fs-save" title="保存">💾</button>
      <button class="fs-btn" id="fs-copy" title="复制">📋</button>
      <button class="fs-btn fs-close" id="fs-close" title="关闭">✕</button>`;
    
    tb.style.cssText = `position:fixed;left:${tbX}px;top:${tbY}px;z-index:2147483649;display:flex;align-items:center;gap:4px;padding:8px 12px;background:rgba(30,30,30,0.95);border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.4);font-family:Microsoft YaHei,sans-serif;user-select:none;`;
    document.body.appendChild(tb);
    
    // 样式
    if (!document.getElementById('wph-fs-style')) {
      const s = document.createElement('style');
      s.id = 'wph-fs-style';
      s.textContent = `#wph-fs-toolbar .fs-drag{cursor:move;color:#888;padding:4px;font-size:14px;}#wph-fs-toolbar .fs-drag:hover{color:#fff}#wph-fs-toolbar .fs-div{width:1px;height:20px;background:rgba(255,255,255,0.2);margin:0 4px}#wph-fs-toolbar .fs-tool,#wph-fs-toolbar .fs-btn{width:30px;height:30px;border:none;background:rgba(255,255,255,0.1);color:#fff;border-radius:6px;cursor:pointer;font-size:14px}#wph-fs-toolbar .fs-tool:hover,#wph-fs-toolbar .fs-btn:hover{background:rgba(255,255,255,0.2)}#wph-fs-toolbar .fs-tool.active{background:#e74c3c}#wph-fs-toolbar .fs-close:hover{background:#c0392b}#wph-fs-toolbar .fs-color{width:26px;height:26px;border:none;border-radius:6px;cursor:pointer}#wph-fs-toolbar .fs-size{width:50px;height:4px;appearance:none;background:rgba(255,255,255,0.3);border-radius:2px;cursor:pointer}#wph-fs-toolbar .fs-size::-webkit-slider-thumb{appearance:none;width:10px;height:10px;border-radius:50%;background:#e74c3c}`;
      document.head.appendChild(s);
    }
    
    // 拖动
    let dragging = false, ox, oy;
    tb.querySelector('.fs-drag').addEventListener('mousedown', e => { dragging = true; ox = e.clientX - tb.offsetLeft; oy = e.clientY - tb.offsetTop; e.preventDefault(); });
    document.addEventListener('mousemove', e => { if (dragging) { tb.style.left = (e.clientX - ox) + 'px'; tb.style.top = (e.clientY - oy) + 'px'; } });
    document.addEventListener('mouseup', () => { dragging = false; });
    
    // 工具
    tb.querySelectorAll('.fs-tool').forEach(b => b.addEventListener('click', () => { tb.querySelectorAll('.fs-tool').forEach(x => x.classList.remove('active')); b.classList.add('active'); state.tool = b.dataset.tool; }));
    tb.querySelector('.fs-color').addEventListener('input', e => state.color = e.target.value);
    tb.querySelector('.fs-size').addEventListener('input', e => state.lineWidth = +e.target.value);
    
    // 取色器
    tb.querySelector('#fs-pick').addEventListener('click', () => {
      state.isPickingColor = true;
      fsEditCanvas.style.cursor = 'crosshair';
      const tip = document.createElement('div');
      tip.id = 'fs-picker-tip';
      tip.textContent = '点击图片取色';
      tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;z-index:2147483650;';
      document.body.appendChild(tip);
    });
    
    // 操作
    tb.querySelector('#fs-undo').addEventListener('click', undoFs);
    tb.querySelector('#fs-save').addEventListener('click', saveFs);
    tb.querySelector('#fs-copy').addEventListener('click', copyFs);
    tb.querySelector('#fs-close').addEventListener('click', exitFs);
  }
  
  function bindFsEditEvents() {
    const rect = fsEditCanvas.getBoundingClientRect();
    
    fsEditCanvas.addEventListener('mousedown', e => {
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      
      // 取色器模式
      if (state.isPickingColor) {
        const dpr = window.devicePixelRatio || 1;
        const pixel = fsEditCtx.getImageData(mx * dpr, my * dpr, 1, 1).data;
        const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        state.color = hex;
        const tb = document.getElementById('wph-fs-toolbar');
        if (tb) tb.querySelector('.fs-color').value = hex;
        state.isPickingColor = false;
        fsEditCanvas.style.cursor = 'crosshair';
        const tip = document.getElementById('fs-picker-tip');
        if (tip) tip.remove();
        showCopySuccessTip(`已选取颜色: ${hex}`);
        return;
      }
      
      if (state.tool === 'text') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = '输入文字...';
        inp.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;background:#fff;border:2px solid ${state.color};border-radius:4px;padding:4px 8px;font-size:${state.fontSize}px;z-index:2147483650;`;
        document.body.appendChild(inp);
        inp.focus();
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' && inp.value.trim()) {
            fsObjects.push({ type: 'text', x: mx, y: my + state.fontSize, text: inp.value.trim(), color: state.color, fontSize: state.fontSize });
            redrawFs();
            saveFsState();
          }
          if (ev.key === 'Enter' || ev.key === 'Escape') inp.remove();
        });
        return;
      }
      
      // 计数圆圈
      if (state.tool === 'counter') {
        const radius = Math.max(15, state.lineWidth * 3);
        fsObjects.push({
          type: 'counter',
          x: mx,
          y: my,
          radius: radius,
          number: state.counterNumber,
          color: state.color,
          lineWidth: state.lineWidth
        });
        state.counterNumber++;
        redrawFs();
        saveFsState();
        showCopySuccessTip(`计数: ${state.counterNumber - 1}`);
        return;
      }
      
      fsDrawing = true;
      // 起点吸附
      const fsStartSnapped = snapToPoint(mx, my);
      fsStartX = fsStartSnapped.x; fsStartY = fsStartSnapped.y;
      if (state.tool === 'brush' || state.tool === 'eraser') {
        fsCurrentPath = { type: state.tool === 'brush' ? 'freehand' : 'eraser', points: [{ x: mx, y: my }], color: state.color, lineWidth: state.tool === 'eraser' ? state.lineWidth * 3 : state.lineWidth };
        fsObjects.push(fsCurrentPath);
      }
    });
    
    fsEditCanvas.addEventListener('mousemove', e => {
      if (!fsDrawing) return;
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (state.tool === 'brush' || state.tool === 'eraser') {
        if (fsCurrentPath) fsCurrentPath.points.push({ x: mx, y: my });
        redrawFs();
      } else if (['rect', 'circle', 'line', 'arrow'].includes(state.tool)) {
        redrawFs();
        drawFsPreview(fsStartX, fsStartY, mx, my, e.shiftKey);
      }
    });
    
    fsEditCanvas.addEventListener('mouseup', e => {
      if (!fsDrawing) return;
      fsDrawing = false;
      let mx = e.clientX - rect.left, my = e.clientY - rect.top;
      
      // Shift约束
      const c = constrainShape(fsStartX, fsStartY, mx, my, e.shiftKey);
      mx = c.ex; my = c.ey;
      
      if (state.tool === 'rect') fsObjects.push({ type: 'rect', x: fsStartX, y: fsStartY, width: mx - fsStartX, height: my - fsStartY, color: state.color, lineWidth: state.lineWidth });
      else if (state.tool === 'circle') fsObjects.push({ type: 'circle', x: (fsStartX + mx) / 2, y: (fsStartY + my) / 2, radiusX: Math.abs(mx - fsStartX) / 2, radiusY: Math.abs(my - fsStartY) / 2, color: state.color, lineWidth: state.lineWidth });
      else if (state.tool === 'line') fsObjects.push({ type: 'line', x1: fsStartX, y1: fsStartY, x2: mx, y2: my, color: state.color, lineWidth: state.lineWidth });
      else if (state.tool === 'arrow') fsObjects.push({ type: 'arrow', x1: fsStartX, y1: fsStartY, x2: mx, y2: my, color: state.color, lineWidth: state.lineWidth });
      
      fsCurrentPath = null;
      redrawFs();
      saveFsState();
    });
    
    // 快捷键
    const kh = e => {
      if (!state.isFlameshotMode) { document.removeEventListener('keydown', kh); return; }
      const k = e.key.toLowerCase();
      if (k === 'b') selectFsTool('brush');
      else if (k === 'e') selectFsTool('eraser');
      else if (k === 't') selectFsTool('text');
      else if (k === 'r') selectFsTool('rect');
      else if (k === 'c') selectFsTool('circle');
      else if (k === 'l') selectFsTool('line');
      else if (k === 'a') selectFsTool('arrow');
      else if (k === 'n') selectFsTool('counter');
      else if (k === 'p') {
        state.isPickingColor = true;
        fsEditCanvas.style.cursor = 'crosshair';
        const tip = document.createElement('div');
        tip.id = 'fs-picker-tip';
        tip.textContent = '点击图片取色';
        tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;z-index:2147483650;';
        document.body.appendChild(tip);
      }
      else if (e.ctrlKey && k === 'z') { e.preventDefault(); undoFs(); }
      else if (e.ctrlKey && k === 's') { e.preventDefault(); saveFs(); }
      else if (e.ctrlKey && k === 'c') { e.preventDefault(); copyFs(); }
      else if (k === 'escape') {
        if (state.isPickingColor) {
          state.isPickingColor = false;
          const tip = document.getElementById('fs-picker-tip');
          if (tip) tip.remove();
        } else {
          exitFs();
        }
      }
    };
    document.addEventListener('keydown', kh);
  }
  
  function selectFsTool(tool) {
    state.tool = tool;
    const tb = document.getElementById('wph-fs-toolbar');
    if (tb) tb.querySelectorAll('.fs-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  }
  
  function redrawFs() {
    const rect = state.flameshotRect;
    const dpr = window.devicePixelRatio || 1;
    fsEditCtx.clearRect(0, 0, rect.width, rect.height);
    fsEditCtx.drawImage(state.flameshotImage, rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr, 0, 0, rect.width, rect.height);
    
    fsObjects.forEach(o => {
      fsEditCtx.strokeStyle = o.color;
      fsEditCtx.fillStyle = o.color;
      fsEditCtx.lineWidth = o.lineWidth || 3;
      fsEditCtx.lineCap = 'round';
      
      if (o.type === 'freehand' && o.points.length >= 2) {
        fsEditCtx.beginPath();
        fsEditCtx.moveTo(o.points[0].x, o.points[0].y);
        o.points.forEach(p => fsEditCtx.lineTo(p.x, p.y));
        fsEditCtx.stroke();
      } else if (o.type === 'eraser' && o.points.length >= 2) {
        fsEditCtx.globalCompositeOperation = 'destination-out';
        fsEditCtx.beginPath();
        fsEditCtx.moveTo(o.points[0].x, o.points[0].y);
        o.points.forEach(p => fsEditCtx.lineTo(p.x, p.y));
        fsEditCtx.stroke();
        fsEditCtx.globalCompositeOperation = 'source-over';
      } else if (o.type === 'rect') {
        fsEditCtx.strokeRect(o.x, o.y, o.width, o.height);
      } else if (o.type === 'circle') {
        fsEditCtx.beginPath();
        fsEditCtx.ellipse(o.x, o.y, Math.max(1, o.radiusX), Math.max(1, o.radiusY), 0, 0, Math.PI * 2);
        fsEditCtx.stroke();
      } else if (o.type === 'line') {
        fsEditCtx.beginPath();
        fsEditCtx.moveTo(o.x1, o.y1);
        fsEditCtx.lineTo(o.x2, o.y2);
        fsEditCtx.stroke();
      } else if (o.type === 'arrow') {
        fsEditCtx.beginPath();
        fsEditCtx.moveTo(o.x1, o.y1);
        fsEditCtx.lineTo(o.x2, o.y2);
        fsEditCtx.stroke();
        const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), hl = Math.max(12, o.lineWidth * 4);
        fsEditCtx.beginPath();
        fsEditCtx.moveTo(o.x2, o.y2);
        fsEditCtx.lineTo(o.x2 - hl * Math.cos(a - 0.5), o.y2 - hl * Math.sin(a - 0.5));
        fsEditCtx.moveTo(o.x2, o.y2);
        fsEditCtx.lineTo(o.x2 - hl * Math.cos(a + 0.5), o.y2 - hl * Math.sin(a + 0.5));
        fsEditCtx.stroke();
      } else if (o.type === 'text') {
        fsEditCtx.font = `${o.fontSize}px Microsoft YaHei`;
        fsEditCtx.fillText(o.text, o.x, o.y);
      } else if (o.type === 'counter') {
        // 计数圆圈
        const r = o.radius || 20;
        
        // 绘制圆形背景（白色填充）
        fsEditCtx.beginPath();
        fsEditCtx.arc(o.x, o.y, r, 0, Math.PI * 2);
        fsEditCtx.fillStyle = '#fff';
        fsEditCtx.fill();
        
        // 绘制圆形边框
        fsEditCtx.strokeStyle = o.color;
        fsEditCtx.lineWidth = Math.max(2, o.lineWidth || 3);
        fsEditCtx.stroke();
        
        // 绘制数字
        fsEditCtx.fillStyle = o.color;
        fsEditCtx.font = `bold ${r}px Microsoft YaHei, Arial`;
        fsEditCtx.textAlign = 'center';
        fsEditCtx.textBaseline = 'middle';
        fsEditCtx.fillText(o.number, o.x, o.y);
      }
    });
  }
  
  function drawFsPreview(sx, sy, ex, ey, shiftKey) {
    // Shift约束
    const c = constrainShape(sx, sy, ex, ey, shiftKey);
    ex = c.ex; ey = c.ey;
    
    fsEditCtx.strokeStyle = state.color;
    fsEditCtx.lineWidth = state.lineWidth;
    fsEditCtx.setLineDash([5, 5]);
    
    if (state.tool === 'rect') fsEditCtx.strokeRect(sx, sy, ex - sx, ey - sy);
    else if (state.tool === 'circle') { fsEditCtx.beginPath(); fsEditCtx.ellipse((sx + ex) / 2, (sy + ey) / 2, Math.abs(ex - sx) / 2, Math.abs(ey - sy) / 2, 0, 0, Math.PI * 2); fsEditCtx.stroke(); }
    else if (state.tool === 'line' || state.tool === 'arrow') {
      fsEditCtx.beginPath();
      fsEditCtx.moveTo(sx, sy);
      fsEditCtx.lineTo(ex, ey);
      fsEditCtx.stroke();
      if (state.tool === 'arrow') {
        const a = Math.atan2(ey - sy, ex - sx), hl = Math.max(12, state.lineWidth * 4);
        fsEditCtx.beginPath();
        fsEditCtx.moveTo(ex, ey);
        fsEditCtx.lineTo(ex - hl * Math.cos(a - 0.5), ey - hl * Math.sin(a - 0.5));
        fsEditCtx.moveTo(ex, ey);
        fsEditCtx.lineTo(ex - hl * Math.cos(a + 0.5), ey - hl * Math.sin(a + 0.5));
        fsEditCtx.stroke();
      }
    }
    fsEditCtx.setLineDash([]);
  }
  
  function saveFsState() {
    fsHistory = fsHistory.slice(0, fsHistoryIdx + 1);
    fsHistory.push(JSON.stringify(fsObjects));
    fsHistoryIdx++;
    if (fsHistory.length > 50) { fsHistory.shift(); fsHistoryIdx--; }
  }
  
  function undoFs() {
    if (fsHistoryIdx > 0) { fsHistoryIdx--; fsObjects = JSON.parse(fsHistory[fsHistoryIdx]); redrawFs(); }
  }
  
  function saveFs() {
    const link = document.createElement('a');
    link.download = `screenshot-${Date.now()}.png`;
    link.href = fsEditCanvas.toDataURL('image/png');
    link.click();
    showCopySuccessTip('截图已保存');
  }
  
  async function copyFs() {
    try {
      const blob = await new Promise(r => fsEditCanvas.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showCopySuccessTip('已复制到剪贴板');
    } catch (e) { saveFs(); }
  }
  
  function exitFs() {
    state.isFlameshotMode = false;
    state.isScreenshotMode = false;
    state.flameshotImage = null;
    fsObjects = []; fsHistory = []; fsHistoryIdx = -1;
    
    const el = document.getElementById('wph-fs-edit'); if (el) el.remove();
    const tb = document.getElementById('wph-fs-toolbar'); if (tb) tb.remove();
    const ov = document.getElementById('wph-flameshot-overlay'); if (ov) ov.remove();
    const so = document.getElementById('wph-screenshot-overlay');
    if (so) {
      so.onmousedown = null;
      so.onmousemove = null;
      so.onmouseup = null;
      so.remove();
    }
    hideScreenshotTip();
    
    if (state.enabled) { canvas.style.display = 'block'; toolbar.style.display = 'block'; }
  }

  // 下载图片
  function downloadImage(canvas, filename) {
    const link = document.createElement('a');
    link.download = `${filename}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // 显示复制成功提示
  function showCopySuccessTip(message = '已复制到剪贴板') {
    const tip = document.createElement('div');
    tip.textContent = '✓ ' + message;
    tip.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(46, 204, 113, 0.9);
      color: white;
      padding: 12px 24px;
      border-radius: 5px;
      font-size: 14px;
      font-weight: bold;
      z-index: 2147483649;
      pointer-events: none;
      animation: fadeOut 2s forwards;
    `;
    
    // 添加淡出动画
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeOut {
        0% { opacity: 1; transform: translateX(-50%) translateY(0); }
        70% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(tip);
    
    // 2秒后移除提示
    setTimeout(() => {
      tip.remove();
      style.remove();
    }, 2000);
  }

  // 退出截图模式
  function exitScreenshotMode() {
    // 如果在flameshot编辑模式，使用专门的退出函数
    if (state.isFlameshotMode) {
      exitFs();
      return;
    }
    
    state.isScreenshotMode = false;
    state.isDrawing = false;
    
    const screenshotOverlay = document.getElementById('wph-screenshot-overlay');
    if (screenshotOverlay) {
      // 清理事件
      screenshotOverlay.onmousedown = null;
      screenshotOverlay.onmousemove = null;
      screenshotOverlay.onmouseup = null;
      screenshotOverlay.remove();
    }
    
    const flameshotOverlay = document.getElementById('wph-flameshot-overlay');
    if (flameshotOverlay) flameshotOverlay.remove();
    
    hideScreenshotTip();
    previewCanvas.style.display = 'none';
    updateCursor();
    
    // 恢复主画布
    if (state.enabled) {
      canvas.style.display = 'block';
      toolbar.style.display = 'block';
    }
  }

  async function captureScreenshot() {
    try {
      toolbar.style.display = 'none';
      canvas.style.display = 'none';
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        toolbar.style.display = 'block';
        canvas.style.display = 'block';
        
        if (chrome.runtime.lastError) {
          console.error('截图失败:', chrome.runtime.lastError);
          return;
        }
        
        const img = new Image();
        img.onload = () => {
          ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
          ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);
          saveState();
        };
        img.src = dataUrl;
      });
    } catch (e) {
      console.error('截图失败:', e);
      toolbar.style.display = 'block';
      canvas.style.display = 'block';
    }
  }

  function enable() {
    if (!canvas || !toolbar) init();
    canvas.style.display = 'block';
    toolbar.style.display = 'block';
    overlay.style.display = 'block';
    state.enabled = true;
    updateCursor();
    if (state.gridEnabled) drawGrid();
    redrawCanvas();
  }

  function disable() {
    if (!canvas) return;
    canvas.style.display = 'none';
    toolbar.style.display = 'none';
    overlay.style.display = 'none';
    previewCanvas.style.display = 'none';
    textInput.style.display = 'none';
    state.enabled = false;
  }

  function toggle() {
    state.enabled ? disable() : enable();
  }

  chrome.runtime.onMessage.addListener((req, sender, sendRes) => {
    if (req.action === 'toggle') { toggle(); sendRes({ enabled: state.enabled }); }
    else if (req.action === 'enable') { enable(); sendRes({ enabled: true }); }
    else if (req.action === 'disable') { disable(); sendRes({ enabled: false }); }
    else if (req.action === 'getStatus') { sendRes({ enabled: state.enabled }); }
    return true;
  });

})();
