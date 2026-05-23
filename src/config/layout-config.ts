// 界面布局配置文件
// 集中管理所有关键布局变量

interface LayoutConfig {
  sidebar: {
    minWidth: number
    maxWidthPercent: number
    defaultWidth: number
  }
  chatInput: {
    minRows: number
    maxRows: number
    lineHeight: number
  }
  resizeHandle: {
    width: number
    height: number
    offset: number
  }
  header: {
    height: number
  }
  chatPanel: {
    minHeight: number
  }
}

export const LAYOUT_CONFIG: LayoutConfig = {
  sidebar: {
    minWidth: 500,
    maxWidthPercent: 50,
    defaultWidth: 600,
  },
  chatInput: {
    minRows: 3,
    maxRows: 10,
    lineHeight: 24,
  },
  resizeHandle: {
    width: 24,
    height: 48,
    offset: -12,
  },
  header: {
    height: 56,
  },
  chatPanel: {
    minHeight: 300,
  },
}

// 计算侧边栏最大宽度（基于窗口宽度）
export function getSidebarMaxWidth(windowWidth: number): number {
  return Math.max(
    LAYOUT_CONFIG.sidebar.minWidth,
    Math.floor(windowWidth * (LAYOUT_CONFIG.sidebar.maxWidthPercent / 100))
  )
}

// 计算输入框最小高度
export function getChatInputMinHeight(): number {
  return LAYOUT_CONFIG.chatInput.minRows * LAYOUT_CONFIG.chatInput.lineHeight
}

// 计算输入框最大高度
export function getChatInputMaxHeight(): number {
  return LAYOUT_CONFIG.chatInput.maxRows * LAYOUT_CONFIG.chatInput.lineHeight
}
