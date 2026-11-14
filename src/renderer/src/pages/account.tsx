import { Button, Card, CardBody, Input } from '@heroui/react'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoEye, IoEyeOff } from 'react-icons/io5'
import BasePage from '@renderer/components/base/base-page'
import NexoLogo from '@renderer/components/base/nexo-logo'

export interface LoginForm {
  username: string
  password: string
}

export type LoginFormErrors = Partial<Record<keyof LoginForm, string>>

/** 返回 i18n key 形式的校验错误；为空对象时表示可以提交。 */
export function validateLoginForm(form: LoginForm): LoginFormErrors {
  const errors: LoginFormErrors = {}
  if (!form.username.trim()) errors.username = 'account.validation.usernameRequired'
  if (!form.password) errors.password = 'account.validation.passwordRequired'
  return errors
}

const Account: React.FC = () => {
  const { t } = useTranslation()
  const [form, setForm] = useState<LoginForm>({ username: '', password: '' })
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState('')

  const update = (key: keyof LoginForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
    setNotice('')
  }

  const onSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const nextErrors = validateLoginForm(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    // 登录接口待对接：具体的登录方式与服务地址确定后在这里接入。
    setNotice(t('account.login.notReady'))
  }

  return (
    <BasePage title={t('account.title')}>
      <div className="flex min-h-full items-center justify-center p-4">
        <Card className="w-full max-w-sm" shadow="sm">
          <CardBody className="gap-5 p-6">
            <div className="flex flex-col items-center gap-2">
              <NexoLogo className="h-12 w-24" />
              <h2 className="text-xl font-bold">{t('account.login.title')}</h2>
              <p className="text-sm text-foreground-500">{t('account.login.subtitle')}</p>
            </div>
            <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
              <Input
                name="username"
                autoComplete="username"
                label={t('account.field.username')}
                placeholder={t('account.field.usernamePlaceholder')}
                value={form.username}
                onValueChange={update('username')}
                isInvalid={!!errors.username}
                errorMessage={errors.username ? t(errors.username) : undefined}
              />
              <Input
                name="password"
                autoComplete="current-password"
                label={t('account.field.password')}
                placeholder={t('account.field.passwordPlaceholder')}
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onValueChange={update('password')}
                isInvalid={!!errors.password}
                errorMessage={errors.password ? t(errors.password) : undefined}
                endContent={
                  <button
                    type="button"
                    className="text-foreground-400 text-lg"
                    aria-label={t(
                      showPassword ? 'account.field.hidePassword' : 'account.field.showPassword'
                    )}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <IoEyeOff /> : <IoEye />}
                  </button>
                }
              />
              <Button type="submit" color="primary" fullWidth>
                {t('account.login.submit')}
              </Button>
              {notice && (
                <p role="status" className="text-center text-sm text-warning">
                  {notice}
                </p>
              )}
            </form>
          </CardBody>
        </Card>
      </div>
    </BasePage>
  )
}

export default Account
