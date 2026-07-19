import { Router } from 'express'
import { authController } from './auth.controller'

export const authRoutes = Router()

// Cadastro de cliente
// POST /api/auth/client/register
authRoutes.post('/client/register', (req, res, next) => {
  authController.registerClient(req, res).catch(next)
})

// Login de cliente
// POST /api/auth/client/login
authRoutes.post('/client/login', (req, res, next) => {
  authController.loginClient(req, res).catch(next)
})

// Login do profissional (ADM)
// POST /api/auth/professional/login
authRoutes.post('/professional/login', (req, res, next) => {
  authController.loginProfessional(req, res).catch(next)
})
