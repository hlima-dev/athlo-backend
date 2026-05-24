import { Request, Response } from 'express'
import { z } from 'zod'
import { AuthService } from '../services/AuthService'
import { successResponse } from '../utils/pagination'
import { UserRole } from '@prisma/client'

const authService = new AuthService()

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'Senha deve ter ao menos 8 caracteres')
    .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
    .regex(/[0-9]/, 'Senha deve conter ao menos um número'),
  role: z.nativeEnum(UserRole).optional(),
  phone: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const data = registerSchema.parse(req.body)
    const result = await authService.register(data)
    res.status(201).json(successResponse(result, 'Cadastro realizado com sucesso'))
  }

  async login(req: Request, res: Response): Promise<void> {
    const data = loginSchema.parse(req.body)
    const result = await authService.login(data)
    res.status(200).json(successResponse(result, 'Login realizado com sucesso'))
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const { refreshToken } = refreshSchema.parse(req.body)
    const tokens = await authService.refreshToken(refreshToken)
    res.status(200).json(successResponse(tokens))
  }

  async logout(req: Request, res: Response): Promise<void> {
    await authService.logout(req.user!.id)
    res.status(204).send()
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await authService.me(req.user!.id)
    res.status(200).json(successResponse(user))
  }
}
