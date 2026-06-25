package com.rack.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HoneywellScannerProviderTest {
    private val keys = HoneywellScannerProvider.DATA_KEYS

    @Test fun usesStandardDataExtra() {
        val extras = mapOf("data" to "  MK1-0001  ")
        assertEquals("MK1-0001", HoneywellScannerProvider.extractBarcode(keys) { extras[it] })
    }

    @Test fun fallsBackToAlternateKey() {
        val extras = mapOf("barcode_string" to "EAN-12345")
        assertEquals("EAN-12345", HoneywellScannerProvider.extractBarcode(keys) { extras[it] })
    }

    @Test fun blankOrMissingReturnsNull() {
        assertNull(HoneywellScannerProvider.extractBarcode(keys) { null })
        assertNull(HoneywellScannerProvider.extractBarcode(keys) { if (it == "data") "   " else null })
    }
}
