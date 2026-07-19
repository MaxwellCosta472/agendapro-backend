import { db } from '../../config/database'
import { addMinutes, compareTimes, fitsInSchedule, isWithinBookingWindow } from '../../shared/utils/dateUtils'

interface AvailableSlot {
  start_time: string
  end_time: string
  available: boolean
}

export const availabilityService = {

  async getAvailableSlots(
    professional_id: string,
    date: string,
    service_id: string
  ): Promise<AvailableSlot[]> {

    const dateObj = new Date(date + 'T00:00:00')

    // 1. Valida janela de 15 dias
    if (!isWithinBookingWindow(dateObj)) {
      return []
    }

    // 2. Verifica se o dia está fechado
    const closedDay = await db.query(
      `SELECT id FROM professional_closed_days
       WHERE professional_id = $1 AND date = $2`,
      [professional_id, date]
    )
    if (closedDay.rowCount && closedDay.rowCount > 0) {
      return []
    }

    // 3. Busca o dia da semana (0=domingo, 1=segunda...)
    const dayOfWeek = dateObj.getDay()

    // 4. Busca os períodos de trabalho do profissional naquele dia
    const schedulesResult = await db.query(
      `SELECT start_time, end_time FROM professional_schedules
       WHERE professional_id = $1 AND day_of_week = $2
       ORDER BY start_time ASC`,
      [professional_id, dayOfWeek]
    )
    if (!schedulesResult.rowCount || schedulesResult.rowCount === 0) {
      return [] // Dia sem atendimento
    }

    // 5. Busca a duração do serviço
    const serviceResult = await db.query(
      `SELECT duration_minutes FROM services
       WHERE id = $1 AND professional_id = $2 AND status = 'active'`,
      [service_id, professional_id]
    )
    if (!serviceResult.rowCount || serviceResult.rowCount === 0) {
      return []
    }
    const duration: number = serviceResult.rows[0].duration_minutes

    // 6. Busca agendamentos existentes no dia
    const appointmentsResult = await db.query(
      `SELECT start_time, end_time FROM appointments
       WHERE professional_id = $1
         AND date = $2
         AND status = 'scheduled'`,
      [professional_id, date]
    )
    const busyAppointments = appointmentsResult.rows.map((r: any) => ({
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
    }))

    // 7. Busca bloqueios avulsos no dia
    const blockedResult = await db.query(
      `SELECT start_time, end_time FROM blocked_slots
       WHERE professional_id = $1 AND date = $2`,
      [professional_id, date]
    )
    const blockedSlots = blockedResult.rows.map((r: any) => ({
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
    }))

    // 8. Gera os slots disponíveis (intervalos de 30 minutos)
    const slots: AvailableSlot[] = []

    for (const period of schedulesResult.rows) {
      const periodStart = period.start_time.slice(0, 5)
      const periodEnd = period.end_time.slice(0, 5)

      let current = periodStart

      while (compareTimes(current, periodEnd) < 0) {
        const slotEnd = addMinutes(current, duration)

        // Verifica se o serviço cabe no período
        if (!fitsInSchedule(current, duration, periodEnd)) {
          break
        }

        // Verifica sobreposição com agendamentos existentes
        const overlapsAppointment = busyAppointments.some(
          (a) => compareTimes(current, a.end) < 0 && compareTimes(slotEnd, a.start) > 0
        )

        // Verifica sobreposição com bloqueios avulsos
        const overlapsBlocked = blockedSlots.some(
          (b) => compareTimes(current, b.end) < 0 && compareTimes(slotEnd, b.start) > 0
        )

        slots.push({
          start_time: current,
          end_time: slotEnd,
          available: !overlapsAppointment && !overlapsBlocked,
        })

        // Avança 30 minutos
        current = addMinutes(current, 30)
      }
    }

    return slots
  },

}
