package com.rack.util

import java.time.LocalDate

/**
 * Semana COMERCIAL (domingo→sábado) en formato 'YYYY-Www' (ej. 2026-W01).
 * Regla por defecto: la Semana 1 arranca el domingo de la semana que contiene
 * el 1/1. DEBE coincidir con comm_week() (SQL) y web/src/lib/week.ts.
 *
 * Nota: al sincronizar, el servidor reescribe la semana con el calendario
 * comercial configurable (week_calendar); este cálculo local se usa para la UI
 * y la detección de conteo previo offline.
 */
object IsoWeek {
    // Domingo (dow=7 en ISO -> lo tratamos como 0) en que empieza la Semana 1 del año.
    private fun week1Start(year: Int): LocalDate {
        val jan1 = LocalDate.of(year, 1, 1)
        // getDayOfWeek: MONDAY=1 .. SUNDAY=7. Domingo como 0.
        val dow = jan1.dayOfWeek.value % 7
        return jan1.minusDays(dow.toLong())
    }

    fun of(date: LocalDate = LocalDate.now()): String {
        val y = date.year
        var year = y
        var start = week1Start(y)
        for (cand in intArrayOf(y + 1, y - 1)) {
            val cs = week1Start(cand)
            if (!cs.isAfter(date) && cs.isAfter(start)) {
                start = cs
                year = cand
            }
        }
        if (week1Start(y).isAfter(date)) {
            year = y - 1
            start = week1Start(y - 1)
        }
        val days = java.time.temporal.ChronoUnit.DAYS.between(start, date)
        val no = (days / 7).toInt() + 1
        return "%04d-W%02d".format(year, no)
    }
}
