import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { env } from './config/env'
import { checkDatabaseConnection } from './config/database'
import { errorHandler } from './shared/middlewares/errorHandler'
import { startExpireAppointmentsJob } from './jobs/expireAppointments'

import { authRoutes } from './modules/auth/auth.routes'
import { serviceRoutes } from './modules/services/service.routes'
import { scheduleRoutes } from './modules/schedules/schedule.routes'
import { appointmentRoutes } from './modules/appointments/appointment.routes'
import { clientRoutes } from './modules/clients/client.routes'

const app = express()

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}))

app.use(express.json())

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { status: 'error', message: 'Muitas requisicoes. Tente novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
}))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/services', serviceRoutes)
app.use('/api/schedules', scheduleRoutes)
app.use('/api/appointments', appointmentRoutes)
app.use('/api/clients', clientRoutes)

app.use(errorHandler)

async function bootstrap(): Promise<void> {
  await checkDatabaseConnection()
  startExpireAppointmentsJob()
  app.listen(Number(env.PORT), () => {
    console.log(`Servidor rodando na porta ${env.PORT} [${env.NODE_ENV}]`)
  })
}

bootstrap().catch((err) => {
  console.error('Falha ao iniciar o servidor:', err)
  process.exit(1)
})
