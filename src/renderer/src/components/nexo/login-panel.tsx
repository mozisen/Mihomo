import { Button, Card, CardBody, Input } from '@heroui/react'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IoEye, IoEyeOff } from 'react-icons/io5'
import NexoLogo from '@renderer/components/base/nexo-logo'
import { useNexoAccount } from '@renderer/hooks/use-nexo-account'
import { nexoCancel2fa, nexoLogin, nexoLogin2fa } from '@renderer/utils/ipc'
import { nexoErrorCode, nexoErrorDetail } from '../../../../shared/nexo'

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

/** 两步验证码：6 位数字，或恢复码（字母数字与连字符）。 */
export function normalizeTwoFactorCode(code: string): string {
  return code.replace(/\s+/g, '')
}

const LoginPanel: React.FC = () => {
  const { t } = useTranslation()
  const { state, mutate } = useNexoAccount()
  const [form, setForm] = useState<LoginForm>({ username: '', password: '' })
  const [errors, setErrors] = useState<LoginFormErrors>({})
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState('')

  const sessionError = state.status === 'loggedOut' ? state.error : undefined
  const message = error || (sessionError ? t(`account.error.${sessionError}`) : '')

  const update = (key: keyof LoginForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
    setError('')
  }

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError('')
    setDetail('')
    try {
      await action()
    } catch (e) {
      setError(t(`account.error.${nexoErrorCode(e)}`))
      setDetail(nexoErrorDetail(e) ?? '')
    } finally {
      setBusy(false)
      void mutate()
    }
  }

  const onLogin = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const nextErrors = validateLoginForm(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    void run(async () => {
      await nexoLogin(form.username, form.password)
      setForm((prev) => ({ ...prev, password: '' }))
    })
  }

  const onVerify = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const value = normalizeTwoFactorCode(code)
    if (!value) {
      setError(t('account.validation.codeRequired'))
      return
    }
    void run(() => nexoLogin2fa(value))
  }

  const needs2fa = state.status === 'needs2fa'

  return (
    <Card className="w-full max-w-sm" shadow="sm">
      <CardBody className="gap-5 p-6">
        <div className="flex flex-col items-center gap-2">
          <NexoLogo className="h-12 w-24" />
          <h2 className="text-xl font-bold">
            {t(needs2fa ? 'account.twoFactor.title' : 'account.login.title')}
          </h2>
          <p className="text-sm text-foreground-500 text-center">
            {t(needs2fa ? 'account.twoFactor.subtitle' : 'account.login.subtitle')}
          </p>
        </div>
        {needs2fa ? (
          <form className="flex flex-col gap-4" onSubmit={onVerify} noValidate>
            <Input
              name="code"
              autoComplete="one-time-code"
              autoFocus
              label={t('account.twoFactor.code')}
              placeholder={t('account.twoFactor.codePlaceholder')}
              value={code}
              onValueChange={(v) => {
                setCode(v)
                setError('')
              }}
            />
            <Button type="submit" color="primary" fullWidth isLoading={busy}>
              {t('account.twoFactor.submit')}
            </Button>
            <Button
              variant="light"
              fullWidth
              isDisabled={busy}
              onPress={() => {
                setCode('')
                void run(() => nexoCancel2fa())
              }}
            >
              {t('account.twoFactor.back')}
            </Button>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={onLogin} noValidate>
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
            <Button type="submit" color="primary" fullWidth isLoading={busy}>
              {t(busy ? 'account.login.submitting' : 'account.login.submit')}
            </Button>
          </form>
        )}
        {message && (
          <div role="alert" className="flex flex-col gap-1 text-center">
            <p className="text-sm text-danger">{message}</p>
            {error && detail && (
              <p className="text-xs text-foreground-400 break-all select-text">
                {t('account.error.detail', { detail })}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export default LoginPanel
