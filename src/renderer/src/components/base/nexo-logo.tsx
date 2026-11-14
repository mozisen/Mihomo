import React from 'react'
import nexoLogo from '@renderer/assets/nexo-logo.png'
import nexoLogoMono from '@renderer/assets/nexo-logo-mono.png'

interface Props {
  className?: string
  /** `mono` renders a white silhouette for use on colored backgrounds. */
  variant?: 'color' | 'mono'
}

function NexoLogo({ className = '', variant = 'color' }: Props): React.JSX.Element {
  return (
    <img
      src={variant === 'mono' ? nexoLogoMono : nexoLogo}
      alt="NEXO"
      draggable={false}
      className={`object-contain select-none ${className}`}
    />
  )
}

export default NexoLogo
