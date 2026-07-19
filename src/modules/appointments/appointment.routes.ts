import { Router } from 'express'
import { appointmentController } from './appointment.controller'
import { authenticate, requireProfessional, requireClient } from '../../shared/middlewares/authenticate'

export const appointmentRoutes = Router()

const auth = (req: any, res: any, next: any) => authenticate(req, res, next)
const onlyClient = (req: any, res: any, next: any) => requireClient(req, res, next)
const onlyProfessional = (req: any, res: any, next: any) => requireProfessional(req, res, next)

// Horários disponíveis — qualquer usuário autenticado
// GET /api/appointments/available?date=&service_id=&professional_id=
appointmentRoutes.get('/available', auth,
  (req, res, next) => appointmentController.getAvailableSlots(req, res).catch(next)
)

// Agendamentos do cliente logado
// GET /api/appointments/my
appointmentRoutes.get('/my', auth, onlyClient,
  (req, res, next) => appointmentController.myAppointments(req, res).catch(next)
)

// Agendamentos do profissional
// GET /api/appointments
appointmentRoutes.get('/', auth, onlyProfessional,
  (req, res, next) => appointmentController.listForProfessional(req, res).catch(next)
)

// Cliente cria agendamento
// POST /api/appointments
appointmentRoutes.post('/', auth, onlyClient,
  (req, res, next) => appointmentController.create(req, res).catch(next)
)

// Cliente cancela agendamento
// PATCH /api/appointments/:id/cancel
appointmentRoutes.patch('/:id/cancel', auth, onlyClient,
  (req, res, next) => appointmentController.cancelByClient(req, res).catch(next)
)

// Cliente reagenda
// PATCH /api/appointments/:id/reschedule
appointmentRoutes.patch('/:id/reschedule', auth, onlyClient,
  (req, res, next) => appointmentController.rescheduleByClient(req, res).catch(next)
)

// Profissional cancela agendamento do cliente
// PATCH /api/appointments/:id/professional-cancel
appointmentRoutes.patch('/:id/professional-cancel', auth, onlyProfessional,
  (req, res, next) => appointmentController.cancelByProfessional(req, res).catch(next)
)

// Profissional reagenda agendamento do cliente
// PATCH /api/appointments/:id/professional-reschedule
appointmentRoutes.patch('/:id/professional-reschedule', auth, onlyProfessional,
  (req, res, next) => appointmentController.rescheduleByProfessional(req, res).catch(next)
)
