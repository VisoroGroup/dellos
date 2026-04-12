/**
 * Working days utility functions for email reminder calculations
 * Follows Romanian business calendar (Mon-Fri)
 * All dates use Europe/Bucharest timezone explicitly.
 */

const APP_TIMEZONE = 'Europe/Bucharest';

/**
 * Get today's date string (YYYY-MM-DD) in the app timezone.
 * Safe to call on UTC servers (Railway).
 */
export function todayLocal(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date());
}

/**
 * Get the day-of-week (0=Sun, 6=Sat) for a Date in the app timezone.
 */
export function getDayOfWeek(date: Date): number {
    const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, weekday: 'short' }).format(date);
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[dayStr] ?? date.getDay();
}

/**
 * Format a Date to YYYY-MM-DD in the app timezone.
 */
export function toLocalDateStr(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
}

/**
 * Check if a date is a working day (Monday-Friday) in the app timezone.
 */
export function isWorkingDay(date: Date): boolean {
    const day = getDayOfWeek(date);
    return day >= 1 && day <= 5; // Mon=1, Fri=5
}

/**
 * Get the next working day from a given date
 */
export function getNextWorkingDay(date: Date): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    while (!isWorkingDay(next)) {
        next.setDate(next.getDate() + 1);
    }
    return next;
}

/**
 * Subtract N working days from a date
 * E.g., subtractWorkingDays(Thursday, 4) = previous Friday
 */
export function subtractWorkingDays(date: Date, days: number): Date {
    const result = new Date(date);
    let remaining = days;
    while (remaining > 0) {
        result.setDate(result.getDate() - 1);
        if (isWorkingDay(result)) {
            remaining--;
        }
    }
    return result;
}

/**
 * Get difference in calendar days between two dates
 */
export function daysDiff(a: Date, b: Date): number {
    const msPerDay = 86400000;
    // Compare dates in the app timezone to avoid midnight UTC drift
    const strA = toLocalDateStr(a);
    const strB = toLocalDateStr(b);
    const utcA = new Date(strA + 'T00:00:00Z').getTime();
    const utcB = new Date(strB + 'T00:00:00Z').getTime();
    return Math.floor((utcB - utcA) / msPerDay);
}

/**
 * Check if today matches any reminder phase for a given deadline
 *
 * Phase 1 (>7 days): Monday weekly reminder
 * Phase 2 (≤7 days): 4, 2, 1 working days before deadline
 * Phase 3 (overdue): daily working day reminder
 */
export function shouldSendReminder(today: Date, dueDate: Date): { send: boolean; phase: string } {
    const diff = daysDiff(today, dueDate);

    // Phase 3: Overdue
    if (diff < 0) {
        if (isWorkingDay(today)) {
            return { send: true, phase: 'overdue' };
        }
        return { send: false, phase: 'overdue' };
    }

    // Phase 2: Last 7 days
    if (diff <= 7) {
        // Check if today is 4, 2, or 1 working days before deadline
        const fourBefore = subtractWorkingDays(dueDate, 4);
        const twoBefore = subtractWorkingDays(dueDate, 2);
        const oneBefore = subtractWorkingDays(dueDate, 1);

        const todayStr = toLocalDateStr(today);
        const dueDateStr = toLocalDateStr(dueDate);

        if (todayStr === toLocalDateStr(fourBefore)) {
            return { send: true, phase: '4_days_before' };
        }
        if (todayStr === toLocalDateStr(twoBefore)) {
            return { send: true, phase: '2_days_before' };
        }
        if (todayStr === toLocalDateStr(oneBefore)) {
            return { send: true, phase: '1_day_before' };
        }
        if (todayStr === dueDateStr) {
            return { send: true, phase: 'due_today' };
        }

        return { send: false, phase: 'last_7_days' };
    }

    // Phase 1: More than 7 days — Monday weekly reminder
    if (getDayOfWeek(today) === 1) { // Monday
        return { send: true, phase: 'weekly' };
    }

    return { send: false, phase: 'more_than_7_days' };
}

/**
 * Format date for display in Romanian style (timezone-aware)
 */
export function formatDateRo(date: Date | string): string {
    const d = new Date(date);
    const months = [
        'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
        'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'
    ];
    // Use timezone-aware formatting
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d).split('-');
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
}

