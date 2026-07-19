import { Request, Response } from 'express'
import { z } from 'zod'
import { scheduleService } from './schedule.service'

const periodSchema = z.object({
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM'),
})

const upsertDaySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  periods: z.array(periodSchema).min(1, 'Informe ao menos um período'),
})

const closeDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido. Use YYYY-MM-DD'),
  reason: z.string().optional(),
})

const blockSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido. Use YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Formato inválido. Use HH:MM'),
  reason: z.string().optional(),
})

export const scheduleController = {

  // GET /api/schedules — lista agenda semanal
  async listSchedules(req: Request, res: Response): Promise<void> {
    const professional_id = req.user!.sub
    const schedules = await scheduleService.listSchedules(professional_id)
    res.json(schedules)
  },

  // PUT /api/schedules/day — configura períodos de um dia da semana
  async upsertDay(req: Request, res: Response): Promise<void> {
    const { day_of_week, periods } = upsertDaySchema.parse(req.body)
    const professional_id = req.user!.sub
    const result = await scheduleService.upsertDaySchedule(professional_id, day_of_week, periods)
    res.json(result)
  },

  // DELETE /api/schedules/day/:day_of_week — remove horários de um dia
  async clearDay(req: Request, res: Response): Promise<void> {
    const day_of_week = parseInt(req.params.day_of_week)
    if (isNaN(day_of_week) || day_of_week < 0 || day_of_week > 6) {
      res.status(400).json({ status: 'error', message: 'Dia da semana inválido.' })
      return
    }
    const professional_id = req.user!.sub
    await scheduleService.clearDaySchedule(professional_id, day_of_week)
    res.status(204).send()
  },

  // GET /api/schedules/closed-days — lista dias fechados
  async listClosedDays(req: Request, res: Response): Promise<void> {
    const professional_id = req.user!.sub
    const days = await scheduleService.listClosedDays(professional_id)
    res.json(days)
  },

  // POST /api/schedules/closed-days — fecha um dia específico
  async closeDay(req: Request, res: Response): Promise<void> {
    const { date, reason } = closeDaySchema.parse(req.body)
    const professional_id = req.user!.sub
    const result = await scheduleService.closeDay(professional_id, date, reason)
    res.status(201).json(result)
  },

  // DELETE /api/schedules/closed-days/:date — abre um dia fechado
  async openDay(req: Request, res: Response): Promise<void> {
    const { date } = req.params
    const professional_id = req.user!.sub
    await scheduleService.openDay(professional_id, date)
    res.status(204).send()
  },

  // GET /api/schedules/blocked-slots — lista bloqueios avulsos
  async listBlockedSlots(req: Request, res: Response): Promise<void> {
    const professional_id = req.user!.sub
    const { date } = req.query
    const slots = await scheduleService.listBlockedSlots(
      professional_id,
      typeof date === 'string' ? date : undefined
    )
    res.json(slots)
  },

  // POST /api/schedules/blocked-slots — bloqueia horário avulso
  async blockSlot(req: Request, res: Response): Promise<void> {
    const data = blockSlotSchema.parse(req.body)
    const professional_id = req.user!.sub
    const result = await scheduleService.blockSlot(professional_id, data)
    res.status(201).json(result)
  },

  // DELETE /api/schedules/blocked-slots/:id — remove bloqueio avulso
  async removeBlockedSlot(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const professional_id = req.user!.sub
    await scheduleService.removeBlockedSlot(professional_id, id)
    res.status(204).send()
  },

}
