/**
 * Soma minutos a um horário no formato HH:MM e retorna HH:MM.
 * Ex: addMinutes('09:30', 90) → '11:00'
 */
export function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number)
  const total = hours * 60 + mins + minutes
  const h = Math.floor(total / 60).toString().padStart(2, '0')
  const m = (total % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Compara dois horários HH:MM.
 * Retorna negativo se a < b, 0 se iguais, positivo se a > b.
 */
export function compareTimes(a: string, b: string): number {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  return toMinutes(a) - toMinutes(b)
}

/**
 * Retorna true se o horário 'time' está dentro do intervalo [start, end).
 */
export function isTimeInRange(time: string, start: string, end: string): boolean {
  return compareTimes(time, start) >= 0 && compareTimes(time, end) < 0
}

/**
 * Verifica se um agendamento de 'durationMinutes' a partir de 'startTime'
 * termina dentro do horário de trabalho (antes de workEnd).
 */
export function fitsInSchedule(
  startTime: string,
  durationMinutes: number,
  workEnd: string
): boolean {
  const endTime = addMinutes(startTime, durationMinutes)
  return compareTimes(endTime, workEnd) <= 0
}

/**
 * Formata uma data ISO para YYYY-MM-DD.
 */
export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Retorna true se a data está dentro da janela de agendamento (hoje até +15 dias).
 */
export function isWithinBookingWindow(date: Date): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const maxDate = new Date(today)
  maxDate.setDate(maxDate.getDate() + 15)
  return date >= today && date <= maxDate
}
