import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import { AppError } from '../errors/AppError'
import { JwtPayload } from '../../types'

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Token de autenticação não fornecido.', 401)
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    req.user = payload
    next()
  } catch {
    throw new AppError('Token inválido ou expirado.', 401)
  }
}

// Garante que apenas o profissional (ADM) acesse a rota
export function requireProfessional(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'professional') {
    throw new AppError('Acesso restrito ao profissional.', 403)
  }
  next()
}

// Garante que apenas clientes acessem a rota
export function requireClient(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'client') {
    throw new AppError('Acesso restrito a clientes.', 403)
  }
  next()
}
