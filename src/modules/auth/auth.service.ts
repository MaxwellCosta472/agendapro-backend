import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '../../config/database'
import { env } from '../../config/env'
import { AppError } from '../../shared/errors/AppError'
import { Client, Professional, JwtPayload } from '../../types'

// ─── Tipos de entrada ─────────────────────────────────────────────────────────

interface RegisterClientInput {
  name: string
  email: string
  phone: string
  password: string
  birth_date?: string
}

interface LoginInput {
  email: string
  password: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as string,
  })
}

function formatClient(client: Client) {
  return {
    id: client.id,
    name: client.name,
    email: client.email,
    phone: client.phone,
    birth_date: client.birth_date,
    created_at: client.created_at,
  }
}

// ─── Serviço ──────────────────────────────────────────────────────────────────

export const authService = {

  async registerClient(input: RegisterClientInput) {
    const { name, email, phone, password, birth_date } = input

    // Verifica se email já existe
    const emailExists = await db.query(
      'SELECT id FROM clients WHERE email = $1',
      [email]
    )
    if (emailExists.rowCount && emailExists.rowCount > 0) {
      throw new AppError('Este e-mail já está cadastrado.', 409)
    }

    // Verifica se telefone já existe
    const phoneExists = await db.query(
      'SELECT id FROM clients WHERE phone = $1',
      [phone]
    )
    if (phoneExists.rowCount && phoneExists.rowCount > 0) {
      throw new AppError('Este telefone já está cadastrado.', 409)
    }

    // Cria hash da senha
    const password_hash = await bcrypt.hash(password, 10)

    // Insere o cliente
    const result = await db.query<Client>(
      `INSERT INTO clients (name, email, phone, password_hash, birth_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, email, phone, password_hash, birth_date ?? null]
    )

    const client = result.rows[0]

    const token = generateToken({ sub: client.id, role: 'client' })

    return {
      token,
      user: { ...formatClient(client), role: 'client' },
    }
  },

  async loginClient(input: LoginInput) {
    const { email, password } = input

    // Busca o cliente pelo email
    const result = await db.query<Client>(
      'SELECT * FROM clients WHERE email = $1',
      [email]
    )

    const client = result.rows[0]

    if (!client) {
      throw new AppError('E-mail ou senha incorretos.', 401)
    }

    // Verifica a senha
    const passwordMatch = await bcrypt.compare(password, client.password_hash)
    if (!passwordMatch) {
      throw new AppError('E-mail ou senha incorretos.', 401)
    }

    const token = generateToken({ sub: client.id, role: 'client' })

    return {
      token,
      user: { ...formatClient(client), role: 'client' },
    }
  },

  async loginProfessional(input: LoginInput) {
    const { email, password } = input

    // Busca o profissional pelo email
    const result = await db.query<Professional>(
      'SELECT * FROM professionals WHERE email = $1',
      [email]
    )

    const professional = result.rows[0]

    if (!professional) {
      throw new AppError('E-mail ou senha incorretos.', 401)
    }

    // Verifica a senha
    const passwordMatch = await bcrypt.compare(password, professional.password_hash)
    if (!passwordMatch) {
      throw new AppError('E-mail ou senha incorretos.', 401)
    }

    const token = generateToken({ sub: professional.id, role: 'professional' })

    return {
      token,
      user: {
        id: professional.id,
        name: professional.name,
        email: professional.email,
        role: 'professional',
      },
    }
  },

}
