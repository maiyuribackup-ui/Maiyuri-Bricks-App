/**
 * Call Recording Processor Worker
 *
 * Polls for pending call recordings and processes them through the pipeline:
 * 1. Download WAV from Telegram
 * 2. Convert WAV to MP3 using ffmpeg
 * 3. Upload MP3 to Google Drive
 * 4. Transcribe audio using Gemini
 * 5. Run AI analysis on transcript
 * 6. Send insights to Telegram
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { processRecording } from './processor.js';
import { log, logError } from './logger.js';

// Environment validation
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TELEGRAM_BOT_TOKEN',
  'GOOGLE_AI_API_KEY',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Configuration
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000', 10);
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '3', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Track active processing
let activeCount = 0;
let isShuttingDown = false;

/**
 * Main polling loop
 */
async function pollAndProcess(): Promise<void> {
  if (isShuttingDown) {
    log('Shutting down, skipping poll');
    return;
  }

  try {
    // Calculate how many we can process
    const availableSlots = MAX_CONCURRENT - activeCount;

    if (availableSlots <= 0) {
      log(`All ${MAX_CONCURRENT} slots in use, waiting...`);
      return;
    }

    // Fetch pending recordings (exclude those awaiting phone number input)
    const { data: recordings, error } = await supabase
      .from('call_recordings')
      .select('*')
      .in('processing_status', ['pending', 'failed'])
      .neq('phone_number', 'PENDING')
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(availableSlots);

    if (error) {
      logError('Failed to fetch recordings', error);
      return;
    }

    if (!recordings || recordings.length === 0) {
      log('No pending recordings');
      return;
    }

    log(`Found ${recordings.length} recordings to process`);

    // Process each recording concurrently
    for (const recording of recordings) {
      activeCount++;

      // Process in background, don't await
      processRecording(supabase, recording)
        .catch((err) => logError(`Processing failed for ${recording.id}`, err))
        .finally(() => {
          activeCount--;
        });
    }
  } catch (error) {
    logError('Poll error', error);
  }
}

/**
 * Health check endpoint
 */
async function startHealthServer(): Promise<void> {
  const http = await import('http');
  const PORT = parseInt(process.env.PORT || '8080', 10);

  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'healthy',
          activeJobs: activeCount,
          maxConcurrent: MAX_CONCURRENT,
          uptime: process.uptime(),
        })
      );
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(PORT, () => {
    log(`Health server listening on port ${PORT}`);
  });
}

/**
 * Graceful shutdown
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    log(`Received ${signal}, shutting down gracefully...`);
    isShuttingDown = true;

    // Wait for active jobs to complete (max 30 seconds)
    const maxWait = 30000;
    const startTime = Date.now();

    while (activeCount > 0 && Date.now() - startTime < maxWait) {
      log(`Waiting for ${activeCount} active jobs to complete...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (activeCount > 0) {
      log(`Timeout waiting for jobs, exiting with ${activeCount} active`);
    } else {
      log('All jobs completed, exiting cleanly');
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  log('========================================');
  log('Call Recording Processor Worker');
  log('========================================');
  log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  log(`Max concurrent: ${MAX_CONCURRENT}`);
  log(`Max retries: ${MAX_RETRIES}`);

  // Setup
  setupGracefulShutdown();
  await startHealthServer();

  // Initial poll
  await pollAndProcess();

  // Start polling loop
  setInterval(pollAndProcess, POLL_INTERVAL_MS);

  log('Worker started successfully');
}

// Start the worker
main().catch((error) => {
  logError('Fatal error', error);
  process.exit(1);
});
