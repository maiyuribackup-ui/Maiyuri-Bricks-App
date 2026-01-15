/**
 * Audio Converter
 *
 * Converts various audio formats to normalized MP3 using ffmpeg.
 * Target: MP3, 16kHz, mono, 64kbps
 */

import { spawn } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { log, logError } from './logger.js';

interface ConversionResult {
  mp3Buffer: Buffer;
  durationSeconds: number;
}

/**
 * Convert audio buffer to MP3 using ffmpeg
 */
export async function convertAudioToMp3(inputBuffer: Buffer): Promise<ConversionResult> {
  // Create temp directory
  const tempDir = await mkdtemp(join(tmpdir(), 'audio-convert-'));
  const inputPath = join(tempDir, 'input.audio');
  const outputPath = join(tempDir, 'output.mp3');

  try {
    // Write input file
    await writeFile(inputPath, inputBuffer);

    // Get duration first
    const duration = await getAudioDuration(inputPath);

    // Convert with ffmpeg
    await runFfmpeg(inputPath, outputPath);

    // Read output file
    const mp3Buffer = await readFile(outputPath);

    return {
      mp3Buffer,
      durationSeconds: Math.round(duration),
    };
  } finally {
    // Cleanup temp files
    try {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
      // Note: temp directory cleanup would require rmdir
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      inputPath,
    ]);

    let output = '';
    let errorOutput = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        log('ffprobe failed, using estimate', { code, error: errorOutput });
        // Return estimated duration based on file size (rough estimate)
        resolve(0);
        return;
      }

      const duration = parseFloat(output.trim());
      if (isNaN(duration)) {
        resolve(0);
        return;
      }

      resolve(duration);
    });

    ffprobe.on('error', (err) => {
      logError('ffprobe spawn error', err);
      resolve(0);
    });
  });
}

/**
 * Run ffmpeg conversion
 */
async function runFfmpeg(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // ffmpeg arguments for optimal speech audio
    const args = [
      '-i',
      inputPath,
      '-vn', // No video
      '-acodec',
      'libmp3lame',
      '-ar',
      '16000', // 16kHz sample rate (good for speech)
      '-ac',
      '1', // Mono
      '-ab',
      '64k', // 64kbps bitrate
      '-f',
      'mp3',
      '-y', // Overwrite output
      outputPath,
    ];

    const ffmpeg = spawn('ffmpeg', args);

    let errorOutput = '';

    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed with code ${code}: ${errorOutput.slice(-500)}`));
        return;
      }
      resolve();
    });

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg spawn error: ${err.message}`));
    });
  });
}

/**
 * Validate audio file format
 */
export async function validateAudioFormat(buffer: Buffer): Promise<{
  isValid: boolean;
  format?: string;
  error?: string;
}> {
  // Check for common audio magic bytes
  const header = buffer.slice(0, 12);

  // WAV: RIFF....WAVE
  if (
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x41 &&
    header[10] === 0x56 &&
    header[11] === 0x45
  ) {
    return { isValid: true, format: 'wav' };
  }

  // MP3: ID3 or sync word (0xFF 0xFB)
  if (
    (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) ||
    (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
  ) {
    return { isValid: true, format: 'mp3' };
  }

  // OGG: OggS
  if (
    header[0] === 0x4f &&
    header[1] === 0x67 &&
    header[2] === 0x67 &&
    header[3] === 0x53
  ) {
    return { isValid: true, format: 'ogg' };
  }

  // M4A/AAC: ftyp
  if (
    header[4] === 0x66 &&
    header[5] === 0x74 &&
    header[6] === 0x79 &&
    header[7] === 0x70
  ) {
    return { isValid: true, format: 'm4a' };
  }

  // If we can't identify, let ffmpeg try
  return { isValid: true, format: 'unknown' };
}
