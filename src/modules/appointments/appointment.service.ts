import { db } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { Appointment } from '../../types'
import { availabilityService } from './availability.service'
import { toDateString } from '../../shared/utils/dateUtils'

interface CreateAppointmentInput {
  client_id: string
  professional_id: string
  service_id: string
  date: string
  start_time: string
}

interface RescheduleInput {
  date: string
  start_time: string
}

export const appointmentService = {

  // ─── Listar agendamentos do cliente ───────────────────────────────────────

  async listByClient(client_id: string): Promise<Appointment[]> {
    const result = await db.query<Appointment>(
      `SELECT a.*,
              s.name        AS service_name,
              s.price       AS service_price,
              s.duration_minutes AS service_duration
         FROM appointments a
         JOIN services s ON s.id = a.service_id
        WHERE a.client_id = $1
        ORDER BY a.date DESC, a.start_time DESC`,
      [client_id]
    )
    return result.rows
  },

  // ─── Listar agendamentos do profissional ──────────────────────────────────

  async listByProfessional(
    professional_id: string,
    filters: { date?: string; status?: string }
  ): Promise<any[]> {
    let query = `
      SELECT a.*,
             c.name  AS client_name,
             c.phone AS client_phone,
             s.name  AS service_name,
             s.price AS service_price
        FROM appointments a
        JOIN clients c ON c.id = a.client_id
        JOIN services s ON s.id = a.service_id
       WHERE a.professional_id = $1
    `
    const params: any[] = [professional_id]

    if (filters.date) {
      params.push(filters.date)
      query += ` AND a.date = $${params.length}`
    }

    if (filters.status) {
      params.push(filters.status)
      query += ` AND a.status = $${params.length}`
    }

    query += ' ORDER BY a.date ASC, a.start_time ASC'

    const result = await db.query(query, params)
    return result.rows
  },

  // ─── Criar agendamento ────────────────────────────────────────────────────

  async create(input: CreateAppointmentInput): Promise<Appointment> {
    const { client_id, professional_id, service_id, date, start_time } = input

    // Verifica se o cliente está banido
    const banned = await db.query(
      `SELECT id FROM banned_clients
       WHERE professional_id = $1 AND client_id = $2 AND is_active = true`,
      [professional_id, client_id]
    )
    if (banned.rowCount && banned.rowCount > 0) {
      throw new AppError('Você não tem permissão para agendar com este profissional.', 403)
    }

    // Verifica restrição de mesmo dia (cancelado pelo profissional)
    const today = toDateString(new Date())
    if (date === today) {
      const restriction = await db.query(
        `SELECT id FROM appointments
         WHERE client_id = $1
           AND date = $2
           AND cancelled_by = 'professional'
           AND DATE(cancelled_at) = CURRENT_DATE`,
        [client_id, date]
      )
      if (restriction.rowCount && restriction.rowCount > 0) {
        throw new AppError(
          'Seu horário foi cancelado pelo profissional hoje. Para remarcar no mesmo dia, entre em contato com o profissional.',
          403
        )
      }
    }

    // Verifica disponibilidade do slot
    const slots = await availabilityService.getAvailableSlots(
      professional_id,
      date,
      service_id
    )

    const slot = slots.find((s) => s.start_time === start_time)

    if (!slot) {
      throw new AppError('Horário não disponível para agendamento.', 400)
    }

    if (!slot.available) {
      throw new AppError('Este horário já está ocupado.', 409)
    }

    // Cria o agendamento
    const result = await db.query<Appointment>(
      `INSERT INTO appointments
         (professional_id, client_id, service_id, date, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [professional_id, client_id, service_id, date, start_time, slot.end_time]
    )

    return result.rows[0]
  },

  // ─── Cancelar pelo cliente ────────────────────────────────────────────────

  async cancelByClient(appointment_id: string, client_id: string): Promise<void> {
    const result = await db.query<Appointment>(
      `SELECT * FROM appointments WHERE id = $1 AND client_id = $2`,
      [appointment_id, client_id]
    )

    const appointment = result.rows[0]
    if (!appointment) {
      throw new AppError('Agendamento não encontrado.', 404)
    }

    if (appointment.status !== 'scheduled') {
      throw new AppError('Apenas agendamentos ativos podem ser cancelados.', 400)
    }

    await db.query(
      `UPDATE appointments
          SET status       = 'cancelled',
              cancelled_by = 'client',
              cancelled_at = NOW(),
              updated_at   = NOW()
        WHERE id = $1`,
      [appointment_id]
    )

    // TODO: notificar o profissional via WhatsApp
  },

  // ─── Cancelar pelo profissional ───────────────────────────────────────────

  async cancelByProfessional(
    appointment_id: string,
    professional_id: string
  ): Promise<void> {
    const result = await db.query<Appointment>(
      `SELECT * FROM appointments WHERE id = $1 AND professional_id = $2`,
      [appointment_id, professional_id]
    )

    const appointment = result.rows[0]
    if (!appointment) {
      throw new AppError('Agendamento não encontrado.', 404)
    }

    if (appointment.status !== 'scheduled') {
      throw new AppError('Apenas agendamentos ativos podem ser cancelados.', 400)
    }

    await db.query(
      `UPDATE appointments
          SET status       = 'cancelled',
              cancelled_by = 'professional',
              cancelled_at = NOW(),
              updated_at   = NOW()
        WHERE id = $1`,
      [appointment_id]
    )

    // TODO: notificar o cliente via WhatsApp
  },

  // ─── Reagendar pelo cliente ───────────────────────────────────────────────

  async rescheduleByClient(
    appointment_id: string,
    client_id: string,
    input: RescheduleInput
  ): Promise<Appointment> {
    const result = await db.query<Appointment>(
      `SELECT * FROM appointments WHERE id = $1 AND client_id = $2`,
      [appointment_id, client_id]
    )

    const appointment = result.rows[0]
    if (!appointment) {
      throw new AppError('Agendamento não encontrado.', 404)
    }

    if (appointment.status !== 'scheduled') {
      throw new AppError('Apenas agendamentos ativos podem ser reagendados.', 400)
    }

    // Verifica limite de 2 reagendamentos
    if (appointment.reschedule_count >= 2) {
      throw new AppError(
        'Limite de 2 reagendamentos atingido. Cancele e faça um novo agendamento.',
        400
      )
    }

    const { date, start_time } = input

    // Verifica disponibilidade do novo slot
    const slots = await availabilityService.getAvailableSlots(
      appointment.professional_id,
      date,
      appointment.service_id
    )

    const slot = slots.find((s) => s.start_time === start_time)

    if (!slot) {
      throw new AppError('Horário não disponível para reagendamento.', 400)
    }

    if (!slot.available) {
      throw new AppError('Este horário já está ocupado.', 409)
    }

    const updated = await db.query<Appointment>(
      `UPDATE appointments
          SET date             = $1,
              start_time       = $2,
              end_time         = $3,
              reschedule_count = reschedule_count + 1,
              updated_at       = NOW()
        WHERE id = $4
        RETURNING *`,
      [date, start_time, slot.end_time, appointment_id]
    )

    // TODO: notificar o profissional via WhatsApp
    return updated.rows[0]
  },

  // ─── Reagendar pelo profissional ──────────────────────────────────────────

  async rescheduleByProfessional(
    appointment_id: string,
    professional_id: string,
    input: RescheduleInput
  ): Promise<Appointment> {
    const result = await db.query<Appointment>(
      `SELECT * FROM appointments WHERE id = $1 AND professional_id = $2`,
      [appointment_id, professional_id]
    )

    const appointment = result.rows[0]
    if (!appointment) {
      throw new AppError('Agendamento não encontrado.', 404)
    }

    if (appointment.status !== 'scheduled') {
      throw new AppError('Apenas agendamentos ativos podem ser reagendados.', 400)
    }

    const { date, start_time } = input

    // Verifica disponibilidade (profissional pode reagendar em qualquer slot livre)
    const slots = await availabilityService.getAvailableSlots(
      professional_id,
      date,
      appointment.service_id
    )

    const slot = slots.find((s) => s.start_time === start_time)

    if (!slot || !slot.available) {
      throw new AppError('Este horário não está disponível.', 409)
    }

    const updated = await db.query<Appointment>(
      `UPDATE appointments
          SET date       = $1,
              start_time = $2,
              end_time   = $3,
              updated_at = NOW()
        WHERE id = $4
        RETURNING *`,
      [date, start_time, slot.end_time, appointment_id]
    )

    // TODO: notificar o cliente via WhatsApp
    return updated.rows[0]
  },

}
