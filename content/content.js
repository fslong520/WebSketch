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
    fontSize: 18, fontFamily: 'Microsoft YaHei, sans-serif',
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
    screenshotEndY: 0
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

  function drawPreviewShape(ex, ey) {
    clearPreview();
    previewCtx.strokeStyle = state.color;
    previewCtx.lineWidth = state.lineWidth;
    
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
        </div>
        <div class="wph-divider"></div>
        <div class="wph-setting-group">
          <label>颜色</label>
          <input type="color" class="wph-color" value="${state.color}">
          <button class="wph-icon-btn" id="wph-color-palette" title="预设颜色">🎨</button>
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
        <div class="wph-setting-group"><label>粗细</label><input type="range" class="wph-range" min="1" max="50" value="${state.lineWidth}"><span class="wph-value">${state.lineWidth}</span></div>
        <div class="wph-setting-group wph-font-group" style="display:none"><label>字号</label><input type="range" class="wph-font-size" min="12" max="72" value="${state.fontSize}"><span>${state.fontSize}px</span></div>
        <div class="wph-divider"></div>
        <div class="wph-mode-group">
          <button class="wph-mode-btn" id="wph-fill-btn" title="填充模式">🖌️ 填充</button>
          <button class="wph-mode-btn" id="wph-dash-btn" title="虚线模式">📐 虚线</button>
          <button class="wph-mode-btn" id="wph-grid-btn" title="网格辅助线">📏 网格</button>
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
        fontFamily: state.fontFamily
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
    toolbar.querySelector('.wph-range').addEventListener('input', e => {
      state.lineWidth = +e.target.value;
      toolbar.querySelector('.wph-range + .wph-value').textContent = state.lineWidth;
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
    }
    
    if (bounds) {
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
    
    ctx.restore();
  }

  function handleMouseDown(e) {
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
    state.startX = e.clientX;
    state.startY = e.clientY;
    if (state.tool === 'brush' || state.tool === 'eraser') {
      // 创建新路径对象
      const newPathObj = {
        type: state.tool === 'brush' ? 'freehand' : 'eraser',
        points: [{x: e.clientX, y: e.clientY}],
        color: state.color,
        lineWidth: state.tool === 'eraser' ? state.lineWidth * 3 : state.lineWidth
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
      drawPreviewShape(e.clientX, e.clientY);
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
        saveState();
      }
      return;
    }
    
    if (!state.isDrawing) return;
    state.isDrawing = false;
    previewCanvas.style.display = 'none';
    clearPreview();

    const ex = e.clientX, ey = e.clientY;
    
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
        dashEnabled: state.dashEnabled
      });
      redrawCanvas();
    }
    
    saveState();
  }

  function handleKeyDown(e) {
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
    const temp = document.createElement('canvas');
    temp.width = canvas.width; temp.height = canvas.height;
    const tCtx = temp.getContext('2d');
    tCtx.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.download = `paint-${Date.now()}.png`;
    link.href = temp.toDataURL('image/png');
    link.click();
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
    if (!state.gridEnabled) {
      overlay.style.backgroundImage = 'none';
      return;
    }
    const gridSize = 50;
    overlay.style.backgroundImage = `
      linear-gradient(to right, rgba(0,0,0,0.1) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0,0,0,0.1) 1px, transparent 1px)
    `;
    overlay.style.backgroundSize = `${gridSize}px ${gridSize}px`;
  }

  // 开始截图模式
  function startScreenshot() {
    state.isScreenshotMode = true;
    canvas.style.cursor = 'crosshair';
    
    // 创建截图遮罩
    if (!document.getElementById('wph-screenshot-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'wph-screenshot-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2147483645;
        cursor: crosshair;
      `;
      document.body.appendChild(overlay);
    } else {
      document.getElementById('wph-screenshot-overlay').style.display = 'block';
    }
    
    // 显示提示
    showScreenshotTip();
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

  // 绘制截图选择区域
  function drawScreenshotOverlay() {
    // 清除之前的预览
    if (previewCanvas) {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      
      const x = Math.min(state.screenshotStartX, state.screenshotEndX);
      const y = Math.min(state.screenshotStartY, state.screenshotEndY);
      const width = Math.abs(state.screenshotEndX - state.screenshotStartX);
      const height = Math.abs(state.screenshotEndY - state.screenshotStartY);
      
      previewCtx.strokeStyle = '#0066ff';
      previewCtx.lineWidth = 2;
      previewCtx.setLineDash([5, 5]);
      previewCtx.strokeRect(x, y, width, height);
      previewCtx.setLineDash([]);
      
      // 显示区域大小
      previewCtx.fillStyle = 'rgba(0, 102, 255, 0.8)';
      previewCtx.font = '12px Microsoft YaHei';
      previewCtx.fillText(`${Math.round(width)} x ${Math.round(height)}`, x + 5, y - 5);
      
      previewCanvas.style.display = 'block';
    }
  }

  // 捕获选中的区域
  function captureSelectedArea() {
    const x = Math.min(state.screenshotStartX, state.screenshotEndX);
    const y = Math.min(state.screenshotStartY, state.screenshotEndY);
    const width = Math.abs(state.screenshotEndX - state.screenshotStartX);
    const height = Math.abs(state.screenshotEndY - state.screenshotStartY);
    
    console.log('开始截图，区域:', { x, y, width, height });
    
    // 如果区域太小，不处理
    if (width < 10 || height < 10) {
      console.log('区域太小，取消截图');
      exitScreenshotMode();
      return;
    }
    
    // 隐藏绘图工具和截图遮罩
    toolbar.style.display = 'none';
    canvas.style.display = 'none';
    const screenshotOverlay = document.getElementById('wph-screenshot-overlay');
    if (screenshotOverlay) screenshotOverlay.style.display = 'none';
    previewCanvas.style.display = 'none';
    hideScreenshotTip();
    
    console.log('向 background 发送截图请求');
    
    // 通过消息传递让 background 执行截图
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, function(response) {
      console.log('收到截图响应:', response);
      
      // 恢复绘图工具
      toolbar.style.display = 'block';
      canvas.style.display = 'block';
      if (screenshotOverlay) screenshotOverlay.style.display = 'block';
      
      if (!response || !response.success) {
        console.error('截图失败:', response ? response.error : '无响应');
        alert('截图失败: ' + (response ? response.error : '未知错误'));
        exitScreenshotMode();
        return;
      }
      
      const dataUrl = response.dataUrl;
      console.log('截图成功，数据长度:', dataUrl.length);
      
      // 截取选中的区域
      const img = new Image();
      img.onload = function() {
        console.log('图片加载成功，尺寸:', img.width, 'x', img.height);
        
        // 创建设备像素比调整后的 canvas
        const tempCanvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        tempCanvas.width = width * dpr;
        tempCanvas.height = height * dpr;
        const tempCtx = tempCanvas.getContext('2d');
        
        console.log('开始裁剪图片...');
        
        // 根据设备像素比裁剪
        tempCtx.drawImage(
          img,
          x * dpr, y * dpr, width * dpr, height * dpr,
          0, 0, width * dpr, height * dpr
        );
        
        console.log('开始下载图片...');
        
        // 直接下载（最可靠的方式）
        const link = document.createElement('a');
        link.download = `screenshot-${Date.now()}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        
        console.log('下载链接:', link.href.substring(0, 50) + '...');
        console.log('文件名:', link.download);
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log('下载触发完成');
        showCopySuccessTip('截图已下载');
        exitScreenshotMode();
      };
      img.onerror = function(e) {
        console.error('图片加载失败:', e);
        alert('截图处理失败：图片加载错误');
        exitScreenshotMode();
      };
      img.src = dataUrl;
    });
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
    state.isScreenshotMode = false;
    state.isDrawing = false;
    
    const screenshotOverlay = document.getElementById('wph-screenshot-overlay');
    if (screenshotOverlay) screenshotOverlay.remove();
    
    hideScreenshotTip();
    previewCanvas.style.display = 'none';
    updateCursor();
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
