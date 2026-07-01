package com.rack.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class IsoWeekTest {
    @Test fun midYear() {
        assertEquals("2026-W26", IsoWeek.of(LocalDate.of(2026, 6, 25)))
    }

    @Test fun yearBoundaryBelongsToNextYear() {
        // Semana comercial (dom-sáb): la Semana 1 de 2026 arranca el 2025-12-28 (dom).
        assertEquals("2026-W01", IsoWeek.of(LocalDate.of(2025, 12, 28)))
        assertEquals("2026-W01", IsoWeek.of(LocalDate.of(2025, 12, 29)))
    }

    @Test fun janFirstBelongsToNewCommercialYear() {
        // Semana comercial: la semana que contiene el 1/1/2027 es la Semana 1 de 2027.
        assertEquals("2027-W01", IsoWeek.of(LocalDate.of(2027, 1, 1)))
    }
}
