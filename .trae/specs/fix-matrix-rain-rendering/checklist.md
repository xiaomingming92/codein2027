# Checklist

- [x] MatrixRainBackground 在组件挂载后显示可见矩阵雨字符（rAF 延迟 + 有效尺寸检测）
- [x] ResizeObserver 触发 resize 后 Canvas 自动适配新尺寸并继续渲染（initSize + draw）
- [x] idle 状态：矩阵雨静态显示，透明度 0.20，颜色 #00ff41（人眼可辨）
- [x] streaming 状态：矩阵雨持续下落动画，透明度 0.30（清晰可见）
- [x] error 状态：矩阵雨静态显示，颜色 #ff0040，透明度 0.30
- [x] warning 状态：矩阵雨静态显示，颜色 #ffaa00，透明度 0.25
- [x] StatusIndicator 同时渲染红绿灯 + 内联 MatrixRain（32×24px）+ 状态标签文字
- [x] chat-panel.tsx 使用 threadStatus（响应式）驱动 MatrixRainBackground
- [x] `npx tsc --noEmit` 编译零错误
- [x] `check_phase_symmetry` 通过
- [x] `check_failure_path` 通过
