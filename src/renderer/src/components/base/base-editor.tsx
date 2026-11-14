import React from 'react'

type Language = 'yaml' | 'javascript' | 'css' | 'json' | 'text'

interface Props {
  value: string
  readOnly?: boolean
  language: Language
  onChange?: (value: string) => void
}

// 轻量纯文本编辑器：取代 Monaco，避免打包数 MB 的编辑器与语言 worker。
export const BaseEditor: React.FC<Props> = ({ value, readOnly = false, language, onChange }) => {
  return (
    <textarea
      className="h-full w-full resize-none rounded-md bg-content2 p-3 font-mono text-sm leading-5 outline-none"
      value={value}
      readOnly={readOnly}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      data-language={language}
      onChange={(e) => onChange?.(e.target.value)}
      onKeyDown={(e) => {
        if (readOnly || e.key !== 'Tab') return
        e.preventDefault()
        const el = e.currentTarget
        const { selectionStart, selectionEnd } = el
        const next = `${el.value.slice(0, selectionStart)}  ${el.value.slice(selectionEnd)}`
        onChange?.(next)
        requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2))
      }}
    />
  )
}
