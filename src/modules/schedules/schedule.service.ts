import { db } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { ProfessionalSchedule, ProfessionalClosedDay, BlockedSlot } from '../../types'

interface UpsertScheduleInput {
  day_of_week: number
  start_time: string
  end_time: string
}

interface BlockSlotInput {
  date: string
  start_time: string
  end_time: string
  reason?: string
}

export const scheduleService = {

  // ─── Agenda semanal recorrente ────────────────────────────────────────────

  async listSchedules(professional_id: string): Promise<ProfessionalSchedule[]> {
    const result = await db.query<ProfessionalSchedule>(
      `SELECT * FROM professional_schedules
       WHERE professional_id = $1
       ORDER BY day_of_week ASC, start_time ASC`,
      [professional_id]
    )
    return result.rows
  },

  // Substitui todos os horários de um dia da semana
  async upsertDaySchedule(
    professional_id: string,
    day_of_week: number,
    periods: { start_time: string; end_time: string }[]
  ): Promise<ProfessionalSchedule[]> {

    // Valida os períodos
    for (const period of periods) {
      if (period.start_time >= period.end_time) {
        throw new AppError('Horário de início deve ser antes do horário de fim.', 400)
      }
    }

    // Verifica sobreposição entre períodos do mesmo dia
    for (let i = 0; i < periods.length; i++) {
      for (let j = i + 1; j < periods.length; j++) {
        if (
          periods[i].start_time < periods[j].end_time &&
          periods[i].end_time > periods[j].start_time
        ) {
          throw new AppError('Os períodos do dia não podem se sobrepor.', 400)
        }
      }
    }

    const client = await db.connect()
    try {
      await client.query('BEGIN')

      // Remove os horários existentes do dia
      await client.query(
        `DELETE FROM professional_schedules
         WHERE professional_id = $1 AND day_of_week = $2`,
        [professional_id, day_of_week]
      )

      // Insere os novos períodos
      const inserted: ProfessionalSchedule[] = []
      for (const period of periods) {
        const result = await client.query<ProfessionalSchedule>(
          `INSERT INTO professional_schedules (professional_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [professional_id, day_of_week, period.start_time, period.end_time]
        )
        inserted.push(result.rows[0])
      }

      await client.query('COMMIT')
      return inserted
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  // Remove todos os horários de um dia (fecha o dia na agenda recorrente)
  async clearDaySchedule(professional_id: string, day_of_week: number): Promise<void> {
    await db.query(
      `DELETE FROM professional_schedules
       WHERE professional_id = $1 AND day_of_week = $2`,
      [professional_id, day_of_week]
    )
  },

  // ─── Dias fechados (datas específicas) ───────────────────────────────────

  async listClosedDays(professional_id: string): Promise<ProfessionalClosedDay[]> {
    const result = await db.query<ProfessionalClosedDay>(
      `SELECT * FROM professional_closed_days
       WHERE professional_id = $1
         AND date >= CURRENT_DATE
       ORDER BY date ASC`,
      [professional_id]
    )
    return result.rows
  },

  async closeDay(professional_id: string, date: string, reason?: string): Promise<ProfessionalClosedDay> {
    // Verifica se já está fechado
    const exists = await db.query(
      `SELECT id FROM professional_closed_days
       WHERE professional_id = $1 AND date = $2`,
      [professional_id, date]
    )
    if (exists.rowCount && exists.rowCount > 0) {
      throw new AppError('Este dia já está fechado.', 409)
    }

    const result = await db.query<ProfessionalClosedDay>(
      `INSERT INTO professional_closed_days (professional_id, date, reason)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [professional_id, date, reason ?? null]
    )
    return result.rows[0]
  },

  async openDay(professional_id: string, date: string): Promise<void> {
    const result = await db.query(
      `DELETE FROM professional_closed_days
       WHERE professional_id = $1 AND date = $2`,
      [professional_id, date]
    )
    if (!result.rowCount || result.rowCount === 0) {
      throw new AppError('Dia fechado não encontrado.', 404)
    }
  },

  // ─── Bloqueios avulsos de horário ─────────────────────────────────────────

  async listBlockedSlots(professional_id: string, date?: string): Promise<BlockedSlot[]> {
    if (date) {
      const result = await db.query<BlockedSlot>(
        `SELECT * FROM blocked_slots
         WHERE professional_id = $1 AND date = $2
         ORDER BY start_time ASC`,
        [professional_id, date]
      )
      return result.rows
    }

    const result = await db.query<BlockedSlot>(
      `SELECT * FROM blocked_slots
       WHERE professional_id = $1
         AND date >= CURRENT_DATE
       ORDER BY date ASC, start_time ASC`,
      [professional_id]
    )
    return result.rows
  },

  async blockSlot(professional_id: string, input: BlockSlotInput): Promise<BlockedSlot> {
    const { date, start_time, end_time, reason } = input

    if (start_time >= end_time) {
      throw new AppError('Horário de início deve ser antes do horário de fim.', 400)
    }

    const result = await db.query<BlockedSlot>(
      `INSERT INTO blocked_slots (professional_id, date, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [professional_id, date, start_time, end_time, reason ?? null]
    )
    return result.rows[0]
  },

  async removeBlockedSlot(professional_id: string, id: string): Promise<void> {
    const result = await db.query(
      `DELETE FROM blocked_slots
       WHERE id = $1 AND professional_id = $2`,
      [professional_id, id]
    )
    if (!result.rowCount || result.rowCount === 0) {
      throw new AppError('Bloqueio não encontrado.', 404)
    }
  },

}
