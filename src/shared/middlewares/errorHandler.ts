import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../errors/AppError'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Erros de validação do Zod
  if (err instanceof ZodError) {
    res.status(422).json({
      status: 'error',
      message: 'Dados inválidos',
      errors: err.flatten().fieldErrors,
    })
    return
  }

  // Erros operacionais conhecidos (AppError)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    })
    return
  }

  // Erro inesperado
  console.error('Erro não tratado:', err)
  res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor',
  })
}
