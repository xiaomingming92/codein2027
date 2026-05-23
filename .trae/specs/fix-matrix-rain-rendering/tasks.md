# Tasks

- [x] Task 1: 修复 MatrixRainBackground ResizeObserver 不触发重绘的 bug
  - [x] 在 ResizeObserver 回调的 `initSize()` 之后添加 `draw()` 调用
  - [x] 确保 streaming 状态下 resize 后 rAF 循环不中断

- [x] Task 2: 修复初始渲染时序竞态
  - [x] 在 `draw()` 函数中，当检测到 dropsRef 为空时强制重新初始化
  - [x] 首次 `draw()` 改为 `requestAnimationFrame(() => draw())` 延迟到布局后执行

- [x] Task 3: 恢复 StatusIndicator 内联 MatrixRain 组件
  - [x] 取消 L193 注释，恢复内联矩阵雨
  - [x] 内联 MatrixRain 的首次 draw 也改为 rAF 延迟

- [x] Task 4: 修复 chat-panel.tsx 状态传递
  - [x] 改为 `<MatrixRainBackground status={threadStatus} />`
  - [x] 移除未使用的 THREAD_STATUS 导入

- [x] Task 5: 修复背景透明度过低导致不可见
  - [x] IDLE: 0.08 → 0.20（提升 2.5 倍）
  - [x] STREAMING: 0.10 → 0.30（提升 3 倍）
  - [x] WARNING: 0.12 → 0.25（提升 2 倍）
  - [x] ERROR: 0.12 → 0.30（提升 2.5 倍）

- [x] Task 6: 编译验证与 ADD 合规检查
  - [x] `npx tsc --noEmit` 零错误
  - [x] check_phase_symmetry 通过
  - [x] check_failure_path 通过

# Task Dependencies
- [Task 1-2] 同文件耦合已连续修改 ✅
- [Task 3-4] 并行完成 ✅
- [Task 5] 独立修复常量 ✅
- [Task 6] 最终验证 ✅
