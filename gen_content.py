#!/usr/bin/env python3
"""Generate content.js for web-paint-zh extension"""
import os

path = os.path.expanduser("~/桌面/copaw/web-paint-zh/content/content.js")

p1 = """/**
 * 网页绘图助手 - Content Script
 * 核心：支持中文输入法 (IME) 的绘图工具，拖拽轨迹实时预览
 */
(function() {
  'use strict';

  function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { fn.apply(this, args); timer = null; }, delay);
    };
  }

  const state = {
    enabled: false, tool: 'brush', color: '#e74c3c', lineWidth: 3,
    fontSize: 18, fontFamily: 'Microsoft YaHei, PingFang SC, sans-serif',
    isDrawing: false, startX: 0, startY: 0,
    history: [], historyIndex: -1, maxHistory: 50
  };

  let overlay = null, canvas = null, ctx = null;
  let toolbar = null, textInput = null;
  let previewCanvas = null, previewCtx = null;

  function init() {
    if (canvas && toolbar && overlay) return;
    createOverlay(); createCanvas(); createPreviewCanvas();
    createToolbar(); createTextInput(); bindEvents(); saveState();
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

  function createPreviewCanvas() {
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
    if (!previewCtx) return;
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  }

  function drawPreviewShape(endX, endY) {
    clearPreview();
    previewCtx.strokeStyle = state.color;
    previewCtx.lineWidth = state.lineWidth;
    previewCtx.setLineDash([6, 4]);
    const sx = state.startX, sy = state.startY;
    if (state.tool === 'rect') {
      previewCtx.strokeRect(sx, sy, endX - sx, endY - sy);
    } else if (state.tool === 'circle') {
      const rx = Math.max(Math.abs(endX - sx) / 2, 0.1);
      const ry = Math.max(Math.abs(endY - sy) / 2, 0.1);
      previewCtx.beginPath();
      previewCtx.ellipse((sx + endX) / 2, (sy + endY) / 2, rx, ry, 0, 0, Math.PI * 2);
      previewCtx.stroke();
    } else if (state.tool === 'line') {
      previewCtx.beginPath(); previewCtx.moveTo(sx, sy); previewCtx.lineTo(endX, endY); previewCtx.stroke();
    } else if (state.tool === 'arrow') {
      previewCtx.beginPath(); previewCtx.moveTo(sx, sy); previewCtx.lineTo(endX, endY); previewCtx.stroke();
      const angle = Math.atan2(endY - sy, endX - sx);
      const hl = Math.max(12, state.lineWidth * 4);
      previewCtx.beginPath();
      previewCtx.moveTo(endX, endY);
      previewCtx.lineTo(endX - hl * Math.cos(angle - Math.PI / 6), endY - hl * Math.sin(angle - Math.PI / 6));
      previewCtx.moveTo(endX, endY);
      previewCtx.lineTo(endX - hl * Math.cos(angle + Math.PI / 6), endY - hl * Math.sin(angle + Math.PI / 6));
      previewCtx.stroke();
    }
    previewCtx.setLineDash([]);
  }
"""

p2 = """
  function createToolbar() {
    toolbar = document.createElement('div');
    toolbar.id = 'wph-toolbar';
    toolbar.innerHTML = `
      <div class="wph-toolbar-header">
        <span class="wph-title">绘图助手</span>
        <button class="wph-close" title="关闭">\u00d7</button>
      </div>
      <div class="wph-toolbar-body">
        <div class="wph-tool-group">
          <button class="wph-tool active" data-tool="brush" title="画笔 (B)"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.37l-1.34-1.34a.996.996 0 0 0-1.41 0L9 12.25 11.75 15l8.96-8.96a.996.996 0 0 0 0-1.41z"/></svg></button>
          <button class="wph-tool" data-tool="eraser" title="橡皮擦 (E)"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.14 3c-.51 0-1.02.2-1.41.59L2.59 14.73c-.78.77-.78 2.04 0 2.83l3.85 3.85c.78.78 2.05.78 2.83 0L20.41 10.27c.78-.78.78-2.05 0-2.83l-3.86-3.85c-.39-.39-.9-.59-1.41-.59zM6.44 19.56L4.44 17.56l7.59-7.59 2 2-7.59 7.59z"/></svg></button>
          <button class="wph-tool" data-tool="text" title="文字 (T)"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M5 4v3h5.5v12h3V7H19V4z"/></svg></button>
          <button class="wph-tool" data-tool="rect" title="矩形 (R)"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 3h18v18H3V3zm2 2v14h14V5H5z"/></svg></button>
          <button class="wph-tool" data-tool="circle" title="圆形 (C)"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg></button>
          <button class="wph-tool" data-tool="line" title="直线 (L)"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg></button>
          <button class="wph-tool" data-tool="arrow" title="