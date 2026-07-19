// ─── Enums (espelham os enums do PostgreSQL) ──────────────────────────────────

export type ServiceStatus = 'active' | 'inactive'

export type AppointmentStatus = 'scheduled' | 'cancelled' | 'expired'

export type CancelledByType = 'client' | 'professional' | 'system'

export type NotificationRecipientType = 'client' | 'professional'

export type NotificationType =
  | 'booking_confirmed'
  | 'booking_cancelled_by_client'
  | 'booking_cancelled_by_professional'
  | 'booking_expired'
  | 'reminder'

export type NotificationChannel = 'whatsapp'

export type NotificationStatus = 'pending' | 'sent' | 'failed'

// ─── Entidades ────────────────────────────────────────────────────────────────

export interface Professional {
  id: string
  name: string
  email: string
  password_hash: string
  created_at: Date
  updated_at: Date
}

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  password_hash: string
  birth_date: Date | null
  created_at: Date
  updated_at: Date
}

export interface Service {
  id: string
  professional_id: string
  name: string
  duration_minutes: number
  price: number
  status: ServiceStatus
  created_at: Date
  updated_at: Date
}

export interface ProfessionalSchedule {
  id: string
  professional_id: string
  day_of_week: number  // 0 = domingo, 1 = segunda, ..., 6 = sábado
  start_time: string   // formato HH:MM
  end_time: string     // formato HH:MM
  created_at: Date
  updated_at: Date
}

export interface ProfessionalClosedDay {
  id: string
  professional_id: string
  date: Date
  reason: string | null
  created_at: Date
}

export interface BlockedSlot {
  id: string
  professional_id: string
  date: Date
  start_time: string
  end_time: string
  reason: string | null
  created_at: Date
}

export interface Appointment {
  id: string
  professional_id: string
  client_id: string
  service_id: string
  date: Date
  start_time: string
  end_time: string
  status: AppointmentStatus
  reschedule_count: number
  cancelled_by: CancelledByType | null
  cancelled_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface BannedClient {
  id: string
  professional_id: string
  client_id: string
  is_active: boolean
  banned_at: Date
  unbanned_at: Date | null
  created_at: Date
}

export interface Notification {
  id: string
  appointment_id: string | null
  recipient_type: NotificationRecipientType
  recipient_id: string
  type: NotificationType
  channel: NotificationChannel
  message: string
  status: NotificationStatus
  scheduled_at: Date
  sent_at: Date | null
  created_at: Date
}

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string           // id do usuário
  role: 'client' | 'professional'
  iat?: number
  exp?: number
}

// ─── Express Request estendido ────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}
