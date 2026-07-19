import { Request, Response } from 'express'
import { z } from 'zod'
import { appointmentService } from './appointment.service'
import { availabilityService } from './availability.service'

const createSchema = z.object({
  professional_id: z.string().uuid('ID do profissional inválido'),
  service_id: z.string().uuid('ID do serviço inválido'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido. Use YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM'),
})

const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido. Use YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM'),
})

export const appointmentController = {

  // GET /api/appointments/available?date=&service_id=&professional_id=
  async getAvailableSlots(req: Request, res: Response): Promise<void> {
    const { date, service_id, professional_id } = req.query

    if (!date || !service_id || !professional_id) {
      res.status(400).json({
        status: 'error',
        message: 'date, service_id e professional_id são obrigatórios.',
      })
      return
    }

    const slots = await availabilityService.getAvailableSlots(
      professional_id as string,
      date as string,
      service_id as string
    )

    res.json(slots)
  },

  // GET /api/appointments/my — agendamentos do cliente logado
  async myAppointments(req: Request, res: Response): Promise<void> {
    const client_id = req.user!.sub
    const appointments = await appointmentService.listByClient(client_id)
    res.json(appointments)
  },

  // GET /api/appointments — agendamentos do profissional
  async listForProfessional(req: Request, res: Response): Promise<void> {
    const professional_id = req.user!.sub
    const { date, status } = req.query

    const appointments = await appointmentService.listByProfessional(professional_id, {
      date: date as string | undefined,
      status: status as string | undefined,
    })

    res.json(appointments)
  },

  // POST /api/appointments — cliente cria agendamento
  async create(req: Request, res: Response): Promise<void> {
    const data = createSchema.parse(req.body)
    const client_id = req.user!.sub

    const appointment = await appointmentService.create({
      ...data,
      client_id,
    })

    res.status(201).json(appointment)
  },

  // PATCH /api/appointments/:id/cancel — cliente cancela
  async cancelByClient(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const client_id = req.user!.sub
    await appointmentService.cancelByClient(id, client_id)
    res.status(204).send()
  },

  // PATCH /api/appointments/:id/reschedule — cliente reagenda
  async rescheduleByClient(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const data = rescheduleSchema.parse(req.body)
    const client_id = req.user!.sub
    const appointment = await appointmentService.rescheduleByClient(id, client_id, data)
    res.json(appointment)
  },

  // PATCH /api/appointments/:id/professional-cancel — profissional cancela
  async cancelByProfessional(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const professional_id = req.user!.sub
    await appointmentService.cancelByProfessional(id, professional_id)
    res.status(204).send()
  },

  // PATCH /api/appointments/:id/professional-reschedule — profissional reagenda
  async rescheduleByProfessional(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const data = rescheduleSchema.parse(req.body)
    const professional_id = req.user!.sub
    const appointment = await appointmentService.rescheduleByProfessional(
      id,
      professional_id,
      data
    )
    res.json(appointment)
  },

}
