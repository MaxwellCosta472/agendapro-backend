import { Router } from 'express'
import { serviceController } from './service.controller'
import { authenticate, requireProfessional } from '../../shared/middlewares/authenticate'

export const serviceRoutes = Router()

// Lista serviços — cliente vê só ativos, profissional vê todos
// GET /api/services
serviceRoutes.get(
  '/',
  (req, res, next) => authenticate(req, res, next),
  (req, res, next) => serviceController.list(req, res).catch(next)
)

// Cria serviço — apenas profissional
// POST /api/services
serviceRoutes.post(
  '/',
  (req, res, next) => authenticate(req, res, next),
  (req, res, next) => requireProfessional(req, res, next),
  (req, res, next) => serviceController.create(req, res).catch(next)
)

// Edita serviço — apenas profissional
// PUT /api/services/:id
serviceRoutes.put(
  '/:id',
  (req, res, next) => authenticate(req, res, next),
  (req, res, next) => requireProfessional(req, res, next),
  (req, res, next) => serviceController.update(req, res).catch(next)
)

// Exclui serviço — apenas profissional
// DELETE /api/services/:id
serviceRoutes.delete(
  '/:id',
  (req, res, next) => authenticate(req, res, next),
  (req, res, next) => requireProfessional(req, res, next),
  (req, res, next) => serviceController.remove(req, res).catch(next)
)
