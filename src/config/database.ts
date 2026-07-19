import { Pool } from 'pg'
import { env } from './env'

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

db.on('error', (err) => {
  console.error('Erro inesperado no pool do banco de dados:', err)
})

export async function checkDatabaseConnection(): Promise<void> {
  const client = await db.connect()
  try {
    await client.query('SELECT 1')
    console.log('Banco de dados conectado com sucesso.')
  } finally {
    client.release()
  }
}
