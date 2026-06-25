package com.rack.util

import java.time.LocalDate
import java.time.temporal.IsoFields

/**
 * Semana ISO en formato 'IYYY-"W"IW' (ej. 2026-W26).
 * DEBE coincidir con iso_week() (SQL) y web/src/lib/week.ts.
 */
object IsoWeek {
    fun of(date: LocalDate = LocalDate.now()): String {
        val week = date.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
        val year = date.get(IsoFields.WEEK_BASED_YEAR)
        return "%04d-W%02d".format(year, week)
    }
}
