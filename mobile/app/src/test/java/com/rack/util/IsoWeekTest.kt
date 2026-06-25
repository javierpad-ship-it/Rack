package com.rack.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

class IsoWeekTest {
    @Test fun midYear() {
        assertEquals("2026-W26", IsoWeek.of(LocalDate.of(2026, 6, 25)))
    }

    @Test fun yearBoundaryBelongsToNextYear() {
        // 2025-12-29 (lunes) -> semana 1 ISO de 2026
        assertEquals("2026-W01", IsoWeek.of(LocalDate.of(2025, 12, 29)))
    }

    @Test fun janFirstCanBelongToPrevYear() {
        // 2027-01-01 (viernes) -> semana 53 ISO de 2026
        assertEquals("2026-W53", IsoWeek.of(LocalDate.of(2027, 1, 1)))
    }
}
