// 用区域指示符 emoji 显示国旗（Windows 由内置的 Noto Color Emoji 字体渲染），不再打包 flag-icons 的 SVG。
export function countryFlagEmoji(code?: string): string | null {
  if (!code || !/^[a-z]{2}$/i.test(code)) return null
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
