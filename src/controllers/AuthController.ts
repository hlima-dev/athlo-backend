import { Request, Response } from 'express'
import { z } from 'zod'
import { AuthService } from '../services/AuthService'
import { successResponse } from '../utils/pagination'
import { optionalUrl } from '../utils/validation'
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../utils/authCookies'
import { UnauthorizedError } from '../utils/AppError'

const authService = new AuthService()

const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter ao menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
  .regex(/[0-9]/, 'Senha deve conter ao menos um número')

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: passwordSchema,
  phone: z.string().optional(),
  organizationName: z.string().min(2, 'Nome da empresa deve ter ao menos 2 caracteres').optional(),
  inviteToken: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token obrigatório'),
  password: passwordSchema,
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual obrigatória'),
  newPassword: passwordSchema,
})

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token obrigatório'),
})

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').optional(),
  phone: z.string().optional(),
  avatar: optionalUrl,
})

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const data = registerSchema.parse(req.body)
    const { user, accessToken, refreshToken } = await authService.register(data)
    const csrfToken = setAuthCookies(res, { accessToken, refreshToken })
    res.status(201).json(successResponse({ user, csrfToken }, 'Cadastro realizado com sucesso'))
  }

  async login(req: Request, res: Response): Promise<void> {
    const data = loginSchema.parse(req.body)
    const { user, accessToken, refreshToken } = await authService.login(data)
    const csrfToken = setAuthCookies(res, { accessToken, refreshToken })
    res.status(200).json(successResponse({ user, csrfToken }, 'Login realizado com sucesso'))
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies?.[REFRESH_COOKIE]
    if (!refreshToken) {
      throw new UnauthorizedError('Sessão expirada. Faça login novamente.')
    }

    const tokens = await authService.refreshToken(refreshToken)
    const csrfToken = setAuthCookies(res, tokens)
    res.status(200).json(successResponse({ csrfToken }))
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = forgotPasswordSchema.parse(req.body)
    const result = await authService.forgotPassword(email)

    res
      .status(200)
      .json(successResponse(result, 'Solicitação de recuperação enviada'))
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const data = resetPasswordSchema.parse(req.body)
    const result = await authService.resetPassword(data)

    res.status(200).json(successResponse(result, 'Senha redefinida com sucesso'))
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
    const result = await authService.changePassword(req.user!.id, currentPassword, newPassword)

    res.status(200).json(successResponse(result, 'Senha alterada com sucesso'))
  }

  async logout(req: Request, res: Response): Promise<void> {
    await authService.logout(req.user!.id)
    clearAuthCookies(res)
    res.status(204).send()
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await authService.me(req.user!.id)
    res.status(200).json(successResponse(user))
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const data = updateProfileSchema.parse(req.body)
    const user = await authService.updateProfile(req.user!.id, data)
    res.status(200).json(successResponse(user, 'Perfil atualizado com sucesso'))
  }

  async verifyEmail(req: Request, res: Response): Promise<void> {
    const { token } = verifyEmailSchema.parse(req.body)
    const result = await authService.verifyEmail(token)
    res.status(200).json(successResponse(result, 'E-mail verificado com sucesso'))
  }

  async resendVerification(req: Request, res: Response): Promise<void> {
    const result = await authService.resendVerificationEmail(req.user!.id)
    res.status(200).json(successResponse(result))
  }
}
