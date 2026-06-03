# 项目笔记 — 学习记录

## 2026-06-03 项目初始分析
- WebSketch 为 Chrome MV3 扩展，Canvas 2D 绘图
- 事件系统使用 mousedown/mousemove/mouseup，未使用 Pointer Events
- freehand 路径对象：{type:'freehand', points:[{x,y}], color, lineWidth, opacity}
- 工具栏定义于 TOOL_DEFS 数组，图标使用 SVG 字符串
- 对象系统支持：rect, circle, line, arrow, freehand, eraser, text, counter
- 5 种状态按钮：fillEnabled, dashEnabled, gridEnabled, 以及 toggle 模式
- 快捷键定义在 TOOL_DEFS 中通过 key 字段绑定
- 吸附系统：端点吸附 + 网格吸附（50px 网格）
- Canvas 使用 devicePixelRatio 缩放，ctx.scale(dpr, dpr)

## 2026-06-03 压感支持（T1）
- 事件从 mousedown/move/up 迁移至 pointerdown/move/up（兼容 mouse fallback）
- freehand/eraser 路径 points 增加 pressure 字段：`{x, y, pressure}`
- redrawCanvas 中 freehand/eraser 渲染改为分段绘制，每段 lineWidth = baseWidth * Math.max(0.3, pressure * 1.2)
- 旧对象无 pressure 字段时默认 0.5，保持向后兼容
- 工具栏增加压感指示器，`pointerType === 'pen'` 时亮起绿色脉冲圆点
- canvas 增加 `touch-action:none` 防触控干扰
- 压力公式：mouse(0.5) → 0.6x，pen(1.0) → 1.2x，最小值 0.3x

## 2026-06-03 坐标系工具实现（T2）
- 新增 coord-grid 工具：拖拽从原点拉出 X/Y 轴，支持箭头、刻度、网格线、标签
- 对象模型：{type, originX, originY, axisLengthX, axisLengthY, tickSpacing, tickLength, showGridLines, color, lineWidth, opacity, labelX, labelY, rotation}
- drawCoordGridOnCanvas(ctx, obj, isPreview)：统一渲染函数，预览模式用虚线灰色
- 渲染分七段：轴线、箭头（12px）、刻度线（6px）、网格线（可选）、轴标签、原点标记、旋转支持
- 交互流程：pointerDown 记录原点 → pointerMove 预览虚线坐标系 → pointerUp 创建对象
- 命中检测：原点 15px / X 轴 10px / Y 轴 10px，支持旋转
- 吸附点：原点 + 两轴端点
- 拖拽支持：hand 工具通过 _dragOffsets 移动 originX/originY
- Fs 编辑模式同步支持 coord-grid（工具栏按钮 + 快捷键 + 渲染）
- 快捷键 X 切换坐标系工具（主模式 + Fs 模式）
- SVG 图标：十字坐标轴 + 四箭头

## 2026-06-03 坐标系工具完成（T2 实现）
- 补全 drawCoordGridOnCanvas 函数定义（七段渲染：轴线/箭头/刻度/网格/标签/原点/旋转）
- 补全 drawPreviewShape 中 coord-grid 分支（拖拽时虚线灰色预览）
- handlePointerDown/Up 中 coord-grid 状态设置和对象创建此前已存在
- 所有 render/includes 数组已验证包含 'coord-grid'

## 2026-06-03 合并上游 main 分支
- 拉取 origin/main 更新（+613/-158 行），含框选工具(select)、平滑绘制(smoothPoint)、双击编辑(dblclick)、光标管理(setCanvasCursor)、翻转功能
- 合并冲突 8 处，逐一保留双方改动
- 最终 content.js 3159 行，content.css +52 行
- 分支名 feature/pressure-coord
