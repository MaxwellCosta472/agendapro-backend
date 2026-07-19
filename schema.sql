-- =============================================================
-- SAAS DE AGENDAMENTO — SCHEMA POSTGRESQL
-- =============================================================
-- Ordem de criação:
--   1. Extensões
--   2. Enums
--   3. Tabelas (respeitando dependências de FK)
--   4. Índices
--   5. Constraints extras
--   6. Triggers de updated_at
-- =============================================================


-- -------------------------------------------------------------
-- 1. EXTENSÕES
-- -------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- para gen_random_uuid()


-- -------------------------------------------------------------
-- 2. ENUMS
-- -------------------------------------------------------------

-- Status do serviço
CREATE TYPE service_status AS ENUM (
  'active',    -- aparece para o cliente
  'inactive'   -- oculto para o cliente, histórico preservado
);

-- Status do agendamento
CREATE TYPE appointment_status AS ENUM (
  'scheduled',  -- ativo, aguardando atendimento
  'cancelled',  -- cancelado por cliente, profissional ou sistema
  'expired'     -- horário passou (1h após end_time), marcado automaticamente
);

-- Quem cancelou o agendamento (define regras de notificação e restrições)
CREATE TYPE cancelled_by_type AS ENUM (
  'client',        -- cliente cancelou por conta própria
  'professional',  -- profissional desmarcou o cliente
  'system'         -- expirado automaticamente pelo sistema
);

-- Destinatário da notificação
CREATE TYPE notification_recipient_type AS ENUM (
  'client',
  'professional'
);

-- Tipo de evento que disparou a notificação
CREATE TYPE notification_type AS ENUM (
  'booking_confirmed',                  -- cliente agendou
  'booking_cancelled_by_client',        -- cliente cancelou → profissional é notificado
  'booking_cancelled_by_professional',  -- profissional desmarcou → cliente é notificado
  'booking_expired',                    -- horário expirou → cliente é notificado
  'reminder'                            -- lembrete antes do horário
);

-- Canal de envio (apenas WhatsApp no MVP)
CREATE TYPE notification_channel AS ENUM (
  'whatsapp'
);

-- Status do envio da notificação
CREATE TYPE notification_status AS ENUM (
  'pending',  -- aguardando envio
  'sent',     -- enviada com sucesso
  'failed'    -- falhou no envio
);


-- -------------------------------------------------------------
-- 3. TABELAS
-- -------------------------------------------------------------

-- ----------------------------
-- 3.1 PROFESSIONALS
-- ----------------------------
-- MVP: um único profissional por instalação.
-- professional_id já existe em todas as tabelas para
-- facilitar a migração futura para multi-profissional.

CREATE TABLE professionals (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_professionals_email UNIQUE (email)
);


-- ----------------------------
-- 3.2 CLIENTS
-- ----------------------------
-- email e phone são únicos e imutáveis após cadastro.
-- Somente name e birth_date podem ser editados pelo cliente.

CREATE TABLE clients (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  birth_date    DATE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_clients_email UNIQUE (email),
  CONSTRAINT uq_clients_phone UNIQUE (phone)
);


-- ----------------------------
-- 3.3 SERVICES
-- ----------------------------
-- Limite de 10 serviços por profissional (validado na camada de aplicação).
-- Serviço inativo: oculto para o cliente, preservado no histórico.
-- Exclusão só permitida se não houver agendamentos ativos vinculados.

CREATE TABLE services (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  UUID           NOT NULL,
  name             VARCHAR(100)   NOT NULL,
  duration_minutes SMALLINT       NOT NULL,
  price            NUMERIC(10, 2) NOT NULL,
  status           service_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_services_professional
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,

  CONSTRAINT chk_services_duration
    CHECK (duration_minutes > 0),

  CONSTRAINT chk_services_price
    CHECK (price >= 0)
);


-- ----------------------------
-- 3.4 PROFESSIONAL_SCHEDULES
-- ----------------------------
-- Agenda recorrente semanal.
-- Cada linha = um bloco de horário em um dia da semana.
-- Múltiplas linhas no mesmo day_of_week = múltiplos períodos.
--   Exemplo: segunda-feira 09:00–12:00 e segunda-feira 14:00–18:00 = 2 linhas.
-- day_of_week: 0 = domingo, 1 = segunda, ..., 6 = sábado

CREATE TABLE professional_schedules (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  UUID      NOT NULL,
  day_of_week      SMALLINT  NOT NULL,
  start_time       TIME      NOT NULL,
  end_time         TIME      NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_schedules_professional
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,

  CONSTRAINT chk_schedule_day_of_week
    CHECK (day_of_week BETWEEN 0 AND 6),

  CONSTRAINT chk_schedule_time_order
    CHECK (start_time < end_time)
);


-- ----------------------------
-- 3.5 PROFESSIONAL_CLOSED_DAYS
-- ----------------------------
-- Datas específicas em que o profissional não atende
-- (feriados, férias, folgas pontuais).
-- Tem precedência sobre professional_schedules.

CREATE TABLE professional_closed_days (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  UUID        NOT NULL,
  date             DATE        NOT NULL,
  reason           VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_closed_days_professional
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,

  CONSTRAINT uq_closed_day
    UNIQUE (professional_id, date)
);


-- ----------------------------
-- 3.6 BLOCKED_SLOTS
-- ----------------------------
-- Bloqueios manuais de horário dentro de um dia específico.
-- Tratados como "fechado" — não aparecem disponíveis para o cliente.
-- Exemplos: almoço, reunião, intervalo avulso.

CREATE TABLE blocked_slots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  UUID        NOT NULL,
  date             DATE        NOT NULL,
  start_time       TIME        NOT NULL,
  end_time         TIME        NOT NULL,
  reason           VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_blocked_slots_professional
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,

  CONSTRAINT chk_blocked_slot_time_order
    CHECK (start_time < end_time)
);


-- ----------------------------
-- 3.7 APPOINTMENTS
-- ----------------------------
-- Tabela central do sistema.
-- end_time é sempre calculado pelo sistema (start_time + service.duration_minutes).
-- reschedule_count: incrementado a cada reagendamento pelo cliente (max 2).
-- cancelled_by: define qual regra de notificação e restrição se aplica.
-- Regra de restrição por cancelled_by = 'professional':
--   o cliente não pode se auto-reagendar no mesmo dia do cancelamento;
--   apenas o profissional pode remarcá-lo manualmente naquele dia.

CREATE TABLE appointments (
  id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   UUID               NOT NULL,
  client_id         UUID               NOT NULL,
  service_id        UUID               NOT NULL,
  date              DATE               NOT NULL,
  start_time        TIME               NOT NULL,
  end_time          TIME               NOT NULL,  -- calculado pelo sistema
  status            appointment_status NOT NULL DEFAULT 'scheduled',
  reschedule_count  SMALLINT           NOT NULL DEFAULT 0,
  cancelled_by      cancelled_by_type,            -- nulo enquanto não cancelado
  cancelled_at      TIMESTAMPTZ,                  -- nulo enquanto não cancelado
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_appointments_professional
    FOREIGN KEY (professional_id) REFERENCES professionals(id),

  CONSTRAINT fk_appointments_client
    FOREIGN KEY (client_id) REFERENCES clients(id),

  CONSTRAINT fk_appointments_service
    FOREIGN KEY (service_id) REFERENCES services(id),

  CONSTRAINT chk_appointment_time_order
    CHECK (start_time < end_time),

  CONSTRAINT chk_reschedule_count
    CHECK (reschedule_count BETWEEN 0 AND 2),

  -- Garante consistência: se cancelado, deve ter cancelled_by e cancelled_at
  CONSTRAINT chk_cancelled_consistency CHECK (
    (status = 'cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR
    (status <> 'cancelled' AND cancelled_by IS NULL    AND cancelled_at IS NULL)
  )
);


-- ----------------------------
-- 3.8 BANNED_CLIENTS
-- ----------------------------
-- Histórico de bans entre profissional e cliente.
-- is_active = true  → cliente banido (não pode acessar a agenda).
-- is_active = false → ban removido (desbanido).
-- UNIQUE em (professional_id, client_id): um único registro por par,
-- atualizado ao banir/desbanir (sem duplicar linhas).

CREATE TABLE banned_clients (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  UUID        NOT NULL,
  client_id        UUID        NOT NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  banned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unbanned_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_banned_professional
    FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,

  CONSTRAINT fk_banned_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,

  CONSTRAINT uq_ban_relationship
    UNIQUE (professional_id, client_id)
);


-- ----------------------------
-- 3.9 NOTIFICATIONS
-- ----------------------------
-- Log de todas as notificações do sistema.
-- recipient_id aponta para clients.id ou professionals.id
-- dependendo do valor de recipient_type.
-- appointment_id é nullable: notificações de expiração
-- podem ser disparadas mesmo após o agendamento expirar.

CREATE TABLE notifications (
  id               UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   UUID,
  recipient_type   notification_recipient_type NOT NULL,
  recipient_id     UUID                        NOT NULL,
  type             notification_type           NOT NULL,
  channel          notification_channel        NOT NULL DEFAULT 'whatsapp',
  message          TEXT                        NOT NULL,
  status           notification_status         NOT NULL DEFAULT 'pending',
  scheduled_at     TIMESTAMPTZ                 NOT NULL,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_notifications_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);


-- -------------------------------------------------------------
-- 4. ÍNDICES
-- -------------------------------------------------------------

-- clients
CREATE INDEX idx_clients_email     ON clients(email);
CREATE INDEX idx_clients_phone     ON clients(phone);

-- services
CREATE INDEX idx_services_professional ON services(professional_id);
CREATE INDEX idx_services_status       ON services(professional_id, status);

-- professional_schedules
CREATE INDEX idx_schedules_professional_day
  ON professional_schedules(professional_id, day_of_week);

-- professional_closed_days
CREATE INDEX idx_closed_days_professional_date
  ON professional_closed_days(professional_id, date);

-- blocked_slots
CREATE INDEX idx_blocked_slots_professional_date
  ON blocked_slots(professional_id, date);

-- appointments
-- Impede double booking: dois agendamentos ativos não podem
-- ter o mesmo profissional + data + horário de início.
CREATE UNIQUE INDEX uq_no_double_booking
  ON appointments(professional_id, date, start_time)
  WHERE status = 'scheduled';

CREATE INDEX idx_appointments_professional_date
  ON appointments(professional_id, date);

CREATE INDEX idx_appointments_client
  ON appointments(client_id);

CREATE INDEX idx_appointments_status
  ON appointments(status);

-- Consulta de restrição: cliente cancelado pelo profissional no mesmo dia
CREATE INDEX idx_appointments_cancel_check
  ON appointments(client_id, date, cancelled_by)
  WHERE cancelled_by = 'professional';

-- banned_clients
CREATE INDEX idx_banned_active
  ON banned_clients(professional_id, client_id)
  WHERE is_active = TRUE;

-- notifications
CREATE INDEX idx_notifications_appointment ON notifications(appointment_id);
CREATE INDEX idx_notifications_recipient   ON notifications(recipient_type, recipient_id);
CREATE INDEX idx_notifications_status      ON notifications(status);

-- Índice para o job que processa notificações pendentes agendadas
CREATE INDEX idx_notifications_pending_scheduled
  ON notifications(scheduled_at)
  WHERE status = 'pending';


-- -------------------------------------------------------------
-- 5. CONSTRAINTS EXTRAS (regras de negócio no banco)
-- -------------------------------------------------------------

-- Limite de 10 serviços ativos por profissional (via trigger)
CREATE OR REPLACE FUNCTION check_service_limit()
RETURNS TRIGGER AS $$
DECLARE
  total INT;
BEGIN
  SELECT COUNT(*) INTO total
    FROM services
   WHERE professional_id = NEW.professional_id;

  IF total >= 10 THEN
    RAISE EXCEPTION
      'Limite de 10 serviços por profissional atingido.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_service_limit
  BEFORE INSERT ON services
  FOR EACH ROW EXECUTE FUNCTION check_service_limit();


-- -------------------------------------------------------------
-- 6. TRIGGER DE updated_at (atualização automática)
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at_professionals
  BEFORE UPDATE ON professionals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_clients
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_services
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_professional_schedules
  BEFORE UPDATE ON professional_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_appointments
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
