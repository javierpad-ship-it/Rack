package com.rack.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        ProductEntity::class,
        FixtureEntity::class,
        ScanSessionEntity::class,
        ScanLineEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class RackDatabase : RoomDatabase() {
    abstract fun dao(): RackDao

    companion object {
        @Volatile private var instance: RackDatabase? = null

        // v1 -> v2: columna `kind` (audit/restock) en scan_sessions, para
        // distinguir Rack One - Inventario de Rack One - Repo.
        private val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "ALTER TABLE scan_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'audit'",
                )
            }
        }

        fun get(context: Context): RackDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    RackDatabase::class.java,
                    "rack.db",
                ).addMigrations(MIGRATION_1_2).build().also { instance = it }
            }
    }
}
