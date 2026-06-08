# MatrixRainBackground 渲染修复 Spec

## Why

`MatrixRainBackground` 组件已实现但 **Canvas 上无任何视觉输出**——用户在浏览器中看不到任何矩阵雨效果。经过代码追踪，发现以下根因导致渲染管线断裂。

## What Changes

* 修复 `MatrixRainBackground` 的渲染管线断裂：ResizeObserver 回调中 `initSize()` 重置画布后未触发重绘

* 修复初始渲染时序竞态：首次 `draw()` 执行时容器尺寸可能为 0，导致提前返回

* 恢复 `StatusIndicator` 中被注释掉的 `MatrixRain` 内联组件

* 将 `chat-panel.tsx` 中的硬编码 `THREAD_STATUS.STREAMING` 改回响应式 `threadStatus`

* 增加防御性渲染保障：确保 `initSize()` 后必定触发一次 `draw()`

## Impact

* Affected code:

  * `src/components/chat/status-indicator.tsx` — `MatrixRainBackground` 组件 + `StatusIndicator` 中的 `MatrixRain`

  * `src/components/chat/chat-panel.tsx` — Header 区域集成

* Affected specs: 无（纯 UI 修复）

***

## ADDED Requirements

### Requirement: MatrixRainBackground 可靠渲染

系统 SHALL 保证 `MatrixRainBackground` 在组件挂载后立即显示矩阵雨背景，不受容器布局时序影响。

#### Scenario: 首次挂载即显示

* **WHEN** `MatrixRainBackground` 组件挂载到 DOM

* **THEN** Canvas SHALL 在最多 2 帧（\~32ms）内显示可见的矩阵雨字符

#### Scenario: 容器 resize 后持续渲染

* **WHEN** 父容器尺寸变化触发 ResizeObserver

* **THEN** Canvas SHALL 自动适配新尺寸并继续/重新开始渲染矩阵雨

#### Scenario: idle/streaming 状态切换

* **WHEN** status 从 `idle` 切换到 `streaming`

* **THEN** 矩阵雨从静态微光变为持续下落动画

* **WHEN** status 从 `streaming` 切换回 `idle`

* **THEN** 矩阵雨冻结在当前帧，保持微光透明度

### Requirement: StatusIndicator 内联 MatrixRain 可用

系统 SHALL 在 `StatusIndicator` 组件中同时展示内联小尺寸矩阵雨（32×24px）和红绿灯+状态文字。

#### Scenario: StatusIndicator 完整渲染

* **WHEN** `StatusIndicator` 接收任意 `ThreadStatus`

* **THEN** 组件 SHALL 同时渲染：红绿灯 + 矩阵雨（inline）+ 状态文字标签

***

## MODIFIED Requirements

### Requirement: ChatPanel Header 正确集成

`chat-panel.tsx` 的 Header 区域 SHALL 使用响应式状态变量驱动 `MatrixRainBackground`，而非硬编码常量。

#### Scenario: 状态联动

* **WHEN** 聊天线程状态变化（idle ↔ streaming ↔ error）

* **THEN** `MatrixRainBackground` 的颜色、动画行为、透明度 SHALL 跟随状态同步变化

***

## 根因分析（已确认）

| #  | 根因                       | 位置                              | 影响                                                                         |
| -- | ------------------------ | ------------------------------- | -------------------------------------------------------------------------- |
| R1 | **ResizeObserver 不触发重绘** | `status-indicator.tsx` L266-268 | `initSize()` 重置了 drops 和 sizeRef 但不调用 `draw()`，resize 后 Canvas 内容停滞        |
| R2 | **初始尺寸竞态**               | `status-indicator.tsx` L274     | 首次 `draw()` 时 `sizeRef` 可能仍为 `{0,0}`，直接 `return` 跳过绘制；若非 streaming 则永远不再绘制 |
| R3 | **MatrixRain 被注释**       | `status-indicator.tsx` L193     | `StatusIndicator` 中的内联矩阵雨被 `{/* */}` 注释掉，只显示红绿灯+文字                         |
| R4 | **硬编码状态**                | `chat-panel.tsx` L238           | 传 `THREAD_STATUS.STREAMING` 常量而非 `threadStatus` 变量，状态不联动                   |

