import { Request, Response } from 'express'
import { z } from 'zod'
import { authService } from './auth.service'

// ─── Schemas de validação ─────────────────────────────────────────────────────

const registerClientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(10, 'Telefone inválido').max(15, 'Telefone inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  birth_date: z.string().optional(),
})

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

// ─── Controller ───────────────────────────────────────────────────────────────

export const authController = {

  async registerClient(req: Request, res: Response): Promise<void> {
    const data = registerClientSchema.parse(req.body)
    const result = await authService.registerClient(data)
    res.status(201).json(result)
  },

  async loginClient(req: Request, res: Response): Promise<void> {
    const data = loginSchema.parse(req.body)
    const result = await authService.loginClient(data)
    res.json(result)
  },

  async loginProfessional(req: Request, res: Response): Promise<void> {
    const data = loginSchema.parse(req.body)
    const result = await authService.loginProfessional(data)
    res.json(result)
  },

}
