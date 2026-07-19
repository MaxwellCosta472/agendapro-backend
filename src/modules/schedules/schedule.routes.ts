import { Router } from 'express'
import { scheduleController } from './schedule.controller'
import { authenticate, requireProfessional } from '../../shared/middlewares/authenticate'

export const scheduleRoutes = Router()

const auth = [
  (req: any, res: any, next: any) => authenticate(req, res, next),
  (req: any, res: any, next: any) => requireProfessional(req, res, next),
]

// ─── Agenda semanal ───────────────────────────────────────────────────────────

// GET /api/schedules
scheduleRoutes.get('/', ...auth,
  (req, res, next) => scheduleController.listSchedules(req, res).catch(next)
)

// PUT /api/schedules/day — configura períodos de um dia
scheduleRoutes.put('/day', ...auth,
  (req, res, next) => scheduleController.upsertDay(req, res).catch(next)
)

// DELETE /api/schedules/day/:day_of_week — remove horários de um dia
scheduleRoutes.delete('/day/:day_of_week', ...auth,
  (req, res, next) => scheduleController.clearDay(req, res).catch(next)
)

// ─── Dias fechados ────────────────────────────────────────────────────────────

// GET /api/schedules/closed-days
scheduleRoutes.get('/closed-days', ...auth,
  (req, res, next) => scheduleController.listClosedDays(req, res).catch(next)
)

// POST /api/schedules/closed-days
scheduleRoutes.post('/closed-days', ...auth,
  (req, res, next) => scheduleController.closeDay(req, res).catch(next)
)

// DELETE /api/schedules/closed-days/:date
scheduleRoutes.delete('/closed-days/:date', ...auth,
  (req, res, next) => scheduleController.openDay(req, res).catch(next)
)

// ─── Bloqueios avulsos ────────────────────────────────────────────────────────

// GET /api/schedules/blocked-slots
scheduleRoutes.get('/blocked-slots', ...auth,
  (req, res, next) => scheduleController.listBlockedSlots(req, res).catch(next)
)

// POST /api/schedules/blocked-slots
scheduleRoutes.post('/blocked-slots', ...auth,
  (req, res, next) => scheduleController.blockSlot(req, res).catch(next)
)

// DELETE /api/schedules/blocked-slots/:id
scheduleRoutes.delete('/blocked-slots/:id', ...auth,
  (req, res, next) => scheduleController.removeBlockedSlot(req, res).catch(next)
)
