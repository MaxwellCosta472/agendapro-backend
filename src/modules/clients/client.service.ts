import { db } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { Client, BannedClient } from '../../types'

export const clientService = {

  // Lista todos os clientes que já agendaram com o profissional
  async listAll(professional_id: string): Promise<any[]> {
    const result = await db.query(
      `SELECT DISTINCT
              c.id,
              c.name,
              c.email,
              c.phone,
              c.birth_date,
              c.created_at,
              COALESCE(b.is_active, false) AS is_banned
         FROM clients c
         JOIN appointments a ON a.client_id = c.id
         LEFT JOIN banned_clients b
                ON b.client_id = c.id
               AND b.professional_id = $1
        WHERE a.professional_id = $1
        ORDER BY c.name ASC`,
      [professional_id]
    )
    return result.rows
  },

  // Busca dados completos de um cliente específico
  async findById(client_id: string, professional_id: string): Promise<any> {
    const result = await db.query(
      `SELECT c.id,
              c.name,
              c.email,
              c.phone,
              c.birth_date,
              c.created_at,
              COALESCE(b.is_active, false) AS is_banned,
              (SELECT COUNT(*) FROM appointments
                WHERE client_id = c.id
                  AND professional_id = $2) AS total_appointments,
              (SELECT COUNT(*) FROM appointments
                WHERE client_id = c.id
                  AND professional_id = $2
                  AND status = 'scheduled') AS active_appointments
         FROM clients c
         LEFT JOIN banned_clients b
                ON b.client_id = c.id
               AND b.professional_id = $2
        WHERE c.id = $1`,
      [client_id, professional_id]
    )

    if (!result.rowCount || result.rowCount === 0) {
      throw new AppError('Cliente não encontrado.', 404)
    }

    return result.rows[0]
  },

  // Banir cliente
  async ban(professional_id: string, client_id: string): Promise<BannedClient> {
    // Verifica se o cliente existe
    const clientExists = await db.query(
      'SELECT id FROM clients WHERE id = $1',
      [client_id]
    )
    if (!clientExists.rowCount || clientExists.rowCount === 0) {
      throw new AppError('Cliente não encontrado.', 404)
    }

    // Verifica se já está banido
    const existing = await db.query(
      `SELECT id, is_active FROM banned_clients
       WHERE professional_id = $1 AND client_id = $2`,
      [professional_id, client_id]
    )

    if (existing.rowCount && existing.rowCount > 0) {
      if (existing.rows[0].is_active) {
        throw new AppError('Cliente já está banido.', 409)
      }

      // Reativa o ban se havia sido desfeito antes
      const result = await db.query<BannedClient>(
        `UPDATE banned_clients
            SET is_active   = true,
                banned_at   = NOW(),
                unbanned_at = NULL
          WHERE professional_id = $1 AND client_id = $2
          RETURNING *`,
        [professional_id, client_id]
      )
      return result.rows[0]
    }

    // Cria novo ban
    const result = await db.query<BannedClient>(
      `INSERT INTO banned_clients (professional_id, client_id)
       VALUES ($1, $2)
       RETURNING *`,
      [professional_id, client_id]
    )

    // Cancela agendamentos ativos do cliente com este profissional
    await db.query(
      `UPDATE appointments
          SET status       = 'cancelled',
              cancelled_by = 'professional',
              cancelled_at = NOW(),
              updated_at   = NOW()
        WHERE professional_id = $1
          AND client_id       = $2
          AND status          = 'scheduled'`,
      [professional_id, client_id]
    )

    return result.rows[0]
  },

  // Desbanir cliente
  async unban(professional_id: string, client_id: string): Promise<void> {
    const result = await db.query(
      `UPDATE banned_clients
          SET is_active   = false,
              unbanned_at = NOW()
        WHERE professional_id = $1
          AND client_id       = $2
          AND is_active       = true`,
      [professional_id, client_id]
    )

    if (!result.rowCount || result.rowCount === 0) {
      throw new AppError('Nenhum ban ativo encontrado para este cliente.', 404)
    }
  },

  // Perfil do próprio cliente (para edição de dados)
  async getProfile(client_id: string): Promise<Client> {
    const result = await db.query<Client>(
      `SELECT id, name, email, phone, birth_date, created_at
       FROM clients WHERE id = $1`,
      [client_id]
    )
    if (!result.rowCount || result.rowCount === 0) {
      throw new AppError('Cliente não encontrado.', 404)
    }
    return result.rows[0]
  },

  // Cliente edita seu próprio perfil (só nome e data de nascimento)
  async updateProfile(
    client_id: string,
    data: { name?: string; birth_date?: string }
  ): Promise<Client> {
    const result = await db.query<Client>(
      `UPDATE clients
          SET name       = COALESCE($1, name),
              birth_date = COALESCE($2, birth_date),
              updated_at = NOW()
        WHERE id = $3
        RETURNING id, name, email, phone, birth_date, created_at`,
      [data.name ?? null, data.birth_date ?? null, client_id]
    )
    return result.rows[0]
  },

}
