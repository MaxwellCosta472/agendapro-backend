import cron from 'node-cron'
import { db } from '../config/database'

/**
 * Roda a cada 15 minutos.
 * Marca como 'expired' todos os agendamentos com status 'scheduled'
 * cujo horário final passou há mais de 1 hora.
 */
export function startExpireAppointmentsJob(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await db.query(`
        UPDATE appointments
           SET status       = 'expired',
               cancelled_by = 'system',
               cancelled_at = NOW(),
               updated_at   = NOW()
         WHERE status     = 'scheduled'
           AND (date + end_time::interval) < NOW() - INTERVAL '1 hour'
        RETURNING id, client_id
      `)

      if (result.rowCount && result.rowCount > 0) {
        console.log(`[job] ${result.rowCount} agendamento(s) expirado(s).`)
        // TODO: disparar notificações para cada cliente expirado
      }
    } catch (err) {
      console.error('[job] Erro ao expirar agendamentos:', err)
    }
  })

  console.log('[job] Job de expiração de agendamentos iniciado (a cada 15 min).')
}
