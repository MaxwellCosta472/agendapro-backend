import { db } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { Service, ServiceStatus } from '../../types'

interface CreateServiceInput {
  professional_id: string
  name: string
  duration_minutes: number
  price: number
}

interface UpdateServiceInput {
  name?: string
  duration_minutes?: number
  price?: number
  status?: ServiceStatus
}

export const serviceService = {

  // Lista todos os serviços do profissional (ativos e inativos)
  async listByProfessional(professional_id: string): Promise<Service[]> {
    const result = await db.query<Service>(
      `SELECT * FROM services
       WHERE professional_id = $1
       ORDER BY created_at ASC`,
      [professional_id]
    )
    return result.rows
  },

  // Lista apenas serviços ativos (visível para o cliente)
  async listActive(professional_id: string): Promise<Service[]> {
    const result = await db.query<Service>(
      `SELECT * FROM services
       WHERE professional_id = $1
         AND status = 'active'
       ORDER BY created_at ASC`,
      [professional_id]
    )
    return result.rows
  },

  async create(input: CreateServiceInput): Promise<Service> {
    const { professional_id, name, duration_minutes, price } = input

    // Verifica limite de 10 serviços
    const count = await db.query(
      `SELECT COUNT(*) FROM services WHERE professional_id = $1`,
      [professional_id]
    )
    if (parseInt(count.rows[0].count) >= 10) {
      throw new AppError('Limite de 10 serviços atingido.', 400)
    }

    const result = await db.query<Service>(
      `INSERT INTO services (professional_id, name, duration_minutes, price)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [professional_id, name, duration_minutes, price]
    )
    return result.rows[0]
  },

  async update(id: string, professional_id: string, input: UpdateServiceInput): Promise<Service> {
    // Verifica se o serviço pertence ao profissional
    const exists = await db.query(
      `SELECT id FROM services WHERE id = $1 AND professional_id = $2`,
      [id, professional_id]
    )
    if (!exists.rowCount || exists.rowCount === 0) {
      throw new AppError('Serviço não encontrado.', 404)
    }

    const { name, duration_minutes, price, status } = input

    const result = await db.query<Service>(
      `UPDATE services
          SET name             = COALESCE($1, name),
              duration_minutes = COALESCE($2, duration_minutes),
              price            = COALESCE($3, price),
              status           = COALESCE($4, status),
              updated_at       = NOW()
        WHERE id = $5 AND professional_id = $6
        RETURNING *`,
      [name, duration_minutes, price, status, id, professional_id]
    )
    return result.rows[0]
  },

  async remove(id: string, professional_id: string): Promise<void> {
    // Verifica se o serviço pertence ao profissional
    const exists = await db.query(
      `SELECT id FROM services WHERE id = $1 AND professional_id = $2`,
      [id, professional_id]
    )
    if (!exists.rowCount || exists.rowCount === 0) {
      throw new AppError('Serviço não encontrado.', 404)
    }

    // Verifica se há agendamentos ativos com esse serviço
    const activeAppointments = await db.query(
      `SELECT id FROM appointments
       WHERE service_id = $1 AND status = 'scheduled'`,
      [id]
    )
    if (activeAppointments.rowCount && activeAppointments.rowCount > 0) {
      throw new AppError(
        'Não é possível excluir um serviço com agendamentos ativos. Cancele os agendamentos primeiro.',
        400
      )
    }

    await db.query(
      `DELETE FROM services WHERE id = $1 AND professional_id = $2`,
      [id, professional_id]
    )
  },

}
