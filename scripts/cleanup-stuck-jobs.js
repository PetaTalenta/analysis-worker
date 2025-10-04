#!/usr/bin/env node

/**
 * Manual Job Cleanup Script
 * 
 * This script can be run manually to clean up stuck jobs
 * Usage: node scripts/cleanup-stuck-jobs.js [options]
 */

require('dotenv').config();
const { cleanupStuckJobs, getJobStatistics } = require('../src/jobs/jobCleanup');
const logger = require('../src/utils/logger');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run') || args.includes('-d'),
  stats: args.includes('--stats') || args.includes('-s'),
  maxProcessingHours: 1,
  maxQueuedHours: 24
};

// Parse custom hours if provided
const processingHoursIndex = args.findIndex(arg => arg === '--max-processing-hours');
if (processingHoursIndex !== -1 && args[processingHoursIndex + 1]) {
  options.maxProcessingHours = parseInt(args[processingHoursIndex + 1]);
}

const queuedHoursIndex = args.findIndex(arg => arg === '--max-queued-hours');
if (queuedHoursIndex !== -1 && args[queuedHoursIndex + 1]) {
  options.maxQueuedHours = parseInt(args[queuedHoursIndex + 1]);
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
Usage: node scripts/cleanup-stuck-jobs.js [options]

Options:
  --dry-run, -d                    Show what would be cleaned without making changes
  --stats, -s                      Show job statistics only
  --max-processing-hours <hours>   Max hours for processing jobs (default: 1)
  --max-queued-hours <hours>       Max hours for queued jobs (default: 24)
  --help, -h                       Show this help message

Examples:
  node scripts/cleanup-stuck-jobs.js --dry-run
  node scripts/cleanup-stuck-jobs.js --stats
  node scripts/cleanup-stuck-jobs.js --max-processing-hours 2 --max-queued-hours 48
  `);
}

/**
 * Main function
 */
async function main() {
  try {
    // Show help if requested
    if (args.includes('--help') || args.includes('-h')) {
      showUsage();
      process.exit(0);
    }

    logger.info('Starting manual job cleanup', options);

    // Show statistics if requested
    if (options.stats) {
      logger.info('Fetching job statistics...');
      const stats = await getJobStatistics();
      
      console.log('\n=== JOB STATISTICS ===');
      console.log('Status Breakdown:');
      stats.statusBreakdown.forEach(stat => {
        console.log(`  ${stat.status}: ${stat.count} jobs (avg age: ${Math.round(stat.avg_age_hours)}h)`);
      });
      
      console.log('\nStuck Jobs:');
      console.log(`  Count: ${stats.stuckJobs.stuck_count}`);
      if (stats.stuckJobs.oldest_stuck) {
        console.log(`  Oldest: ${stats.stuckJobs.oldest_stuck}`);
      }
      if (stats.stuckJobs.latest_update) {
        console.log(`  Latest Update: ${stats.stuckJobs.latest_update}`);
      }
      console.log(`  Timestamp: ${stats.timestamp}\n`);
      
      // If only stats requested, exit here
      if (args.includes('--stats-only')) {
        process.exit(0);
      }
    }

    // Perform cleanup
    const result = await cleanupStuckJobs({
      maxProcessingHours: options.maxProcessingHours,
      maxQueuedHours: options.maxQueuedHours,
      dryRun: options.dryRun
    });

    console.log('\n=== CLEANUP RESULTS ===');
    console.log(`Mode: ${result.dryRun ? 'DRY RUN' : 'ACTUAL CLEANUP'}`);
    console.log(`Total jobs found: ${result.totalFound}`);
    console.log(`Jobs cleaned: ${result.cleanedJobs}`);
    if (result.skippedJobs > 0) {
      console.log(`Jobs skipped: ${result.skippedJobs}`);
    }
    console.log(`Success: ${result.success}\n`);

    if (result.dryRun && result.totalFound > 0) {
      console.log('Run without --dry-run to actually clean up these jobs.');
    }

    logger.info('Manual job cleanup completed', result);
    process.exit(0);

  } catch (error) {
    logger.error('Manual job cleanup failed', {
      error: error.message,
      stack: error.stack
    });
    
    console.error('\nERROR:', error.message);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logger.info('Manual cleanup interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  logger.info('Manual cleanup terminated');
  process.exit(143);
});

// Run the script
main();
