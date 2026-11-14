import { driver, type Config } from 'driver.js'
import { TFunction } from 'i18next'
import { NavigateFunction } from 'react-router-dom'

let driverInstance: ReturnType<typeof driver> | null = null

export function getDriver(): ReturnType<typeof driver> | null {
  return driverInstance
}

export function createTourDriver(t: TFunction, navigate: NavigateFunction): void {
  const config: Config = {
    showProgress: true,
    nextBtnText: t('common.next'),
    prevBtnText: t('common.prev'),
    doneBtnText: t('common.done'),
    progressText: '{{current}} / {{total}}',
    overlayOpacity: 0.9,
    steps: [
      {
        element: 'none',
        popover: {
          title: t('guide.welcome.title'),
          description: t('guide.welcome.description'),
          side: 'top',
          align: 'center'
        }
      },
      {
        element: '.side',
        popover: {
          title: t('guide.sider.title'),
          description: t('guide.sider.description'),
          side: 'right',
          align: 'center'
        }
      },
      {
        element: '.sysproxy-card',
        popover: {
          title: t('guide.card.title'),
          description: t('guide.card.description'),
          side: 'right',
          align: 'start'
        }
      },
      {
        element: '.main',
        popover: {
          title: t('guide.main.title'),
          description: t('guide.main.description'),
          side: 'left',
          align: 'center'
        }
      },
      {
        element: '.account-card',
        popover: {
          title: t('guide.account.title'),
          description: t('guide.account.description'),
          side: 'right',
          align: 'start'
        }
      },
      {
        element: '.sysproxy-card',
        popover: {
          title: t('guide.sysproxy.title'),
          description: t('guide.sysproxy.description'),
          side: 'right',
          align: 'start',
          onNextClick: async (): Promise<void> => {
            navigate('/sysproxy')
            setTimeout(() => {
              driverInstance?.moveNext()
            }, 0)
          }
        }
      },
      {
        element: '.sysproxy-settings',
        popover: {
          title: t('guide.sysproxySetting.title'),
          description: t('guide.sysproxySetting.description'),
          side: 'top',
          align: 'start'
        }
      },
      {
        element: '.tun-card',
        popover: {
          title: t('guide.tun.title'),
          description: t('guide.tun.description'),
          side: 'right',
          align: 'start',
          onNextClick: async (): Promise<void> => {
            navigate('/tun')
            setTimeout(() => {
              driverInstance?.moveNext()
            }, 0)
          }
        }
      },
      {
        element: '.tun-settings',
        popover: {
          title: t('guide.tunSetting.title'),
          description: t('guide.tunSetting.description'),
          side: 'bottom',
          align: 'start'
        }
      },
      {
        element: 'none',
        popover: {
          title: t('guide.end.title'),
          description: t('guide.end.description'),
          side: 'top',
          align: 'center',
          onNextClick: async (): Promise<void> => {
            navigate('/account')
            setTimeout(() => {
              driverInstance?.destroy()
            }, 0)
          }
        }
      }
    ]
  }
  if (driverInstance) {
    // Tour text is resolved eagerly; refresh it when the app language changes.
    driverInstance.setConfig(config)
    if (driverInstance.isActive()) {
      driverInstance.drive(driverInstance.getActiveIndex() ?? 0)
    }
  } else {
    driverInstance = driver(config)
  }
}

export function startTourIfNeeded(): void {
  const tourShown = window.localStorage.getItem('tourShown')
  if (!tourShown && driverInstance) {
    window.localStorage.setItem('tourShown', 'true')
    driverInstance.drive()
  }
}
