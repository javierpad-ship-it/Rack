package com.rack.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        ProductEntity::class,
        FixtureEntity::class,
        ScanSessionEntity::class,
        ScanLineEntity::class,
    ],
    version = 1,
    exportSchema = false,
)
abstract class RackDatabase : RoomDatabase() {
    abstract fun dao(): RackDao

    companion object {
        @Volatile private var instance: RackDatabase? = null

        fun get(context: Context): RackDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    RackDatabase::class.java,
                    "rack.db",
                ).build().also { instance = it }
            }
    }
}
