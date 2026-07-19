import { Router } from 'express'
import { clientController } from './client.controller'
import { authenticate, requireProfessional, requireClient } from '../../shared/middlewares/authenticate'

export const clientRoutes = Router()

const auth = (req: any, res: any, next: any) => authenticate(req, res, next)
const onlyProfessional = (req: any, res: any, next: any) => requireProfessional(req, res, next)
const onlyClient = (req: any, res: any, next: any) => requireClient(req, res, next)

// ─── Rotas do cliente (próprio perfil) ───────────────────────────────────────

// GET /api/clients/me
clientRoutes.get('/me', auth, onlyClient,
  (req, res, next) => clientController.getProfile(req, res).catch(next)
)

// PATCH /api/clients/me
clientRoutes.patch('/me', auth, onlyClient,
  (req, res, next) => clientController.updateProfile(req, res).catch(next)
)

// ─── Rotas do profissional (gestão de clientes) ───────────────────────────────

// GET /api/clients — lista todos os clientes
clientRoutes.get('/', auth, onlyProfessional,
  (req, res, next) => clientController.list(req, res).catch(next)
)

// GET /api/clients/:id — dados completos de um cliente
clientRoutes.get('/:id', auth, onlyProfessional,
  (req, res, next) => clientController.findById(req, res).catch(next)
)

// POST /api/clients/:id/ban — bane cliente
clientRoutes.post('/:id/ban', auth, onlyProfessional,
  (req, res, next) => clientController.ban(req, res).catch(next)
)

// DELETE /api/clients/:id/ban — desbane cliente
clientRoutes.delete('/:id/ban', auth, onlyProfessional,
  (req, res, next) => clientController.unban(req, res).catch(next)
)
