import { Request, Response } from 'express'
import { z } from 'zod'
import { clientService } from './client.service'

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato inválido. Use YYYY-MM-DD').optional(),
})

export const clientController = {

  // GET /api/clients — profissional lista todos os clientes
  async list(req: Request, res: Response): Promise<void> {
    const professional_id = req.user!.sub
    const clients = await clientService.listAll(professional_id)
    res.json(clients)
  },

  // GET /api/clients/:id — profissional vê dados completos de um cliente
  async findById(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const professional_id = req.user!.sub
    const client = await clientService.findById(id, professional_id)
    res.json(client)
  },

  // POST /api/clients/:id/ban — profissional bane cliente
  async ban(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const professional_id = req.user!.sub
    const result = await clientService.ban(professional_id, id)
    res.status(201).json(result)
  },

  // DELETE /api/clients/:id/ban — profissional desbane cliente
  async unban(req: Request, res: Response): Promise<void> {
    const { id } = req.params
    const professional_id = req.user!.sub
    await clientService.unban(professional_id, id)
    res.status(204).send()
  },

  // GET /api/clients/me — cliente vê seu próprio perfil
  async getProfile(req: Request, res: Response): Promise<void> {
    const client_id = req.user!.sub
    const profile = await clientService.getProfile(client_id)
    res.json(profile)
  },

  // PATCH /api/clients/me — cliente edita nome e data de nascimento
  async updateProfile(req: Request, res: Response): Promise<void> {
    const data = updateProfileSchema.parse(req.body)
    const client_id = req.user!.sub
    const updated = await clientService.updateProfile(client_id, data)
    res.json(updated)
  },

}
