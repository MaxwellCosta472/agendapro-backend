import { Request, Response } from 'express'
import { z } from 'zod'
import { serviceService } from './service.service'

const createServiceSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  duration_minutes: z
    .number({ invalid_type_error: 'Duração deve ser um número' })
    .int()
    .positive('Duração deve ser maior que zero'),
  price: z
    .number({ invalid_type_error: 'Preço deve ser um número' })
    .nonnegative('Preço não pode ser negativo'),
})

const updateServiceSchema = z.object({
  name: z.string().min(2).optional(),
  duration_minutes: z.number().int().positive().optional(),
  price: z.number().nonnegative().optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export const serviceController = {

  // GET /api/services — profissional vê todos os seus serviços
  // GET /api/services?professional_id=xxx — cliente vê só ativos
  async list(req: Request, res: Response): Promise<void> {
    const role = req.user!.role

    if (role === 'professional') {
      const professional_id = req.user!.sub
      const services = await serviceService.listByProfessional(professional_id)
      res.json(services)
      return
    }

    // Cliente precisa passar o professional_id como query param
    const { professional_id } = req.query
    if (!professional_id || typeof professional_id !== 'string') {
      res.status(400).json({ status: 'error', message: 'professional_id é obrigatório.' })
      return
    }

    const services = await serviceService.listActive(professional_id)
    res.json(services)
  },

  // POST /api/services — apenas profissional
  async create(req: Request, res: Response): Promise<void> {
    const data = createServiceSchema.parse(req.body)
    const professional_id = req.user!.sub

    const service = await serviceService.create({ ...data, professional_id })
    res.status(201).json(service)
  },

  // PUT /api/services/:id — apenas profissional
  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const data = updateServiceSchema.parse(req.body)
    const professional_id = req.user!.sub

    const service = await serviceService.update(id, professional_id, data)
    res.json(service)
  },

  // DELETE /api/services/:id — apenas profissional
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const professional_id = req.user!.sub

    await serviceService.remove(id, professional_id)
    res.status(204).send()
  },

}
