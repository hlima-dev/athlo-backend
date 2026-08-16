import crypto from 'crypto'
import { CookieOptions, Response } from 'express'
import ms from 'ms'
import { env } from '../config/env'

// Tokens de autenticação viajam só via cookies httpOnly — nunca no corpo
// da resposta JSON, para que um script malicioso injetado por XSS não
// consiga lê-los (localStorage/JS conseguem, cookie httpOnly não).
export const ACCESS_COOKIE = 'athlo_access'
export const REFRESH_COOKIE = 'athlo_refresh'
export const CSRF_COOKIE = 'athlo_csrf'

// Front (Vercel) e back (Render) são domínios diferentes, então o cookie
// precisa de SameSite=None para ser enviado nas chamadas da API — o que
// por si só abriria brecha de CSRF. O token de CSRF (dupla submissão)
// fecha essa brecha: vai num cookie httpOnly E no corpo da resposta; o
// front ecoa o valor recebido no corpo como header em cada escrita. Um
// site atacante não consegue ler nem o cookie nem o corpo da resposta
// (bloqueado por CORS), então não tem como montar o header certo.
const isProd = env.NODE_ENV === 'production'

function baseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  }
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
): string {
  const options = baseCookieOptions()

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...options,
    maxAge: ms(env.JWT_EXPIRES_IN as ms.StringValue),
  })
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...options,
    maxAge: ms(env.JWT_REFRESH_EXPIRES_IN as ms.StringValue),
  })

  const csrfToken = generateCsrfToken()
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...options,
    maxAge: ms(env.JWT_REFRESH_EXPIRES_IN as ms.StringValue),
  })

  return csrfToken
}

export function clearAuthCookies(res: Response): void {
  const options = baseCookieOptions()
  res.clearCookie(ACCESS_COOKIE, options)
  res.clearCookie(REFRESH_COOKIE, options)
  res.clearCookie(CSRF_COOKIE, options)
}
