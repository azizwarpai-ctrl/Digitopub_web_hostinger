#!/usr/bin/env -S bun run
/**
 * OJS Data Sync Cron Script
 * 
 * Synchronizes data from the OJS database to the main application database.
 * This script should be run periodically via cron to keep data up-to-date.
 * 
 * Usage:
 *   bun run scripts/ojs-sync-cron.ts
 * 
 * Cron Schedule Examples (for crontab):
 *   Every 6 hours: 0 *\/6 * * *
 *   Every day at midnight: 0 0 * * *
 *   Every Monday at 2 AM: 0 2 * * 1
 * 
 * @module scripts/ojs-sync-cron
 */


import { prisma } from '../src/lib/db/config';
import { fetchFromDatabase } from '../src/features/ojs/server/ojs-service';
import { closeOjsPool, ojsHealthCheck } from '../src/features/ojs/server/ojs-client';
import { computeOjsJournalsFingerprint, syncOjsJournals } from '../src/features/ojs/server/sync-ojs-journals';
import { refreshOjsJournalSnapshots } from '../src/features/ojs/server/ojs-journal-snapshots';
import { withSyncRun } from '../src/features/ojs/server/sync-runs';

/**
 * Main sync function
 */
async function main(): Promise<number> {
  const startTime = Date.now();
  let exitCode = 0;

  console.log('🚀 Starting OJS data synchronization...');
  console.log(`⏰ ${new Date().toISOString()}\n`);

  if (process.env.OJS_SYNC_ENABLED === 'false') {
    console.log('⏭️  OJS_SYNC_ENABLED=false — skipping sync.');
    return 0;
  }

  try {
    // 1. Test OJS connection
    const healthy = await ojsHealthCheck();
    if (!healthy.ok) {
      throw new Error(`Failed to connect to OJS database: ${healthy.error ?? (healthy.configured ? "unknown error" : "not configured")}`);
    }
    console.log('✅ Connected to OJS database');

    const result = await withSyncRun('ojs_journals_sync', 'cron', async () => {
      // 2. Fetch the FULL journal set (incl. disabled) so disabled journals
      //    get marked inactive and vanished journals get soft-deleted.
      console.log('📚 Fetching journals from OJS...');
      const fingerprint = await computeOjsJournalsFingerprint();
      const ojsJournals = await fetchFromDatabase(true);
      console.log(`   Found ${ojsJournals.length} journals`);

      // 3. Sync to internal database
      console.log('🔄 Synchronizing data...');
      const syncResult = await syncOjsJournals(ojsJournals, { deactivateMissing: true, fingerprint });

      // 4. Refresh per-journal aggregate snapshots (watermark-gated)
      console.log('📸 Refreshing journal snapshots...');
      const snapshotResult = await refreshOjsJournalSnapshots();
      console.log(snapshotResult.skipped
        ? '   Snapshots unchanged since last watermark — skipped'
        : `   ${snapshotResult.refreshed} snapshot(s) refreshed`);

      return {
        status: syncResult.errors > 0 ? ('partial' as const) : ('success' as const),
        stats: { ...syncResult, snapshots: snapshotResult },
        result: { ...syncResult, snapshots: snapshotResult },
      };
    });

    // 5. Update sync timestamp (best effort)
    try {
      await prisma.$executeRaw`
        INSERT INTO system_settings (setting_key, setting_value, description)
        VALUES ('ojs_last_sync', JSON_QUOTE(${new Date().toISOString()}), 'Last successful OJS sync timestamp')
        ON DUPLICATE KEY UPDATE
          setting_value = VALUES(setting_value),
          updated_at = CURRENT_TIMESTAMP
      `;
    } catch (tsError) {
      console.warn('Could not update sync timestamp:', tsError);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n✅ Synchronization completed successfully!');
    console.log('───────────────────────────────────────');
    console.log(`📚 Journals: ${result.synced} synced, ${result.errors} errors, ${result.deactivated.length} deactivated`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log('───────────────────────────────────────\n');


    exitCode = result.errors > 0 ? 2 : 0;
  } catch (error) {
    console.error('\n❌ Synchronization failed:', error);
    exitCode = 1;
  } finally {
    try {
      await closeOjsPool();
    } catch (err) {
      console.error('Failed to close OJS connection pool:', err);
    }
    
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Failed to disconnect Prisma:', err);
    }
  }
  
  return exitCode;
}

// Run if executed directly
if (import.meta.main) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error('Unhandled error in main:', err);
      process.exitCode = 1;
    });
}

