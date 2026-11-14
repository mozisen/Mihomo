// Windows/Linux 无边框窗口右上角的系统按钮区（titleBarOverlay）颜色要跟随页面主题。

function isTransparent(color: string | undefined): boolean {
  if (!color) return true
  const c = color.replace(/\s+/g, '').toLowerCase()
  return c === 'transparent' || /^rgba\(.*,0(\.0+)?\)$/.test(c)
}

/** 依次取 html、body 的背景色；都透明时按深浅色给默认值。 */
export function resolveOverlayColors(
  html: { backgroundColor: string; color: string },
  body: { backgroundColor: string; color: string } | undefined,
  dark: boolean
): { color: string; symbolColor: string } {
  const source = !isTransparent(html.backgroundColor)
    ? html
    : body && !isTransparent(body.backgroundColor)
      ? body
      : undefined
  if (source) return { color: source.backgroundColor, symbolColor: source.color }
  return dark
    ? { color: '#000000', symbolColor: '#ffffff' }
    : { color: '#ffffff', symbolColor: '#000000' }
}

/**
 * next-themes 在 setTheme 之后才异步改 html 的 class，立刻读样式拿到的是旧主题的颜色。
 * 监听 html 的 class/style 变化，在样式真正生效后再更新。返回取消监听的函数。
 */
export function watchThemeChanges(onChange: () => void): () => void {
  let frame = 0
  const schedule = (): void => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(onChange)
  }
  const observer = new MutationObserver(schedule)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-theme']
  })
  schedule()
  return (): void => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
}
