/**
 * Secure input utilities for Bastion CLI.
 *
 * These utilities ensure:
 * - Passwords are never echoed to the terminal (no scrollback retention)
 * - Terminal screen is cleared on exit to remove sensitive data
 * - Sensitive variables are wiped from memory on process exit
 */

// In-memory storage for sensitive data that needs to be wiped on exit.
// Using an array of objects with mutable buffers is not necessary in JS
// (strings are immutable), but we null the references to help GC.
let sensitiveData: { label: string; value: unknown }[] = [];

// Tracks whether an interactive session actually began. When false (e.g. for
// --help, --version, or piped non-TTY output), we must NOT clear the screen or
// print the "session ended" message on exit.
let interactiveSessionStarted = false;

/**
 * Mark that an interactive session has begun so the exit cleanup knows to
 * clear the screen and print the "session ended" message.
 */
export function markInteractiveSessionStarted(): void {
  interactiveSessionStarted = true;
}

/**
 * Register a sensitive value for cleanup on exit.
 * Call this for any password or hash stored in memory.
 */
export function trackSensitive(label: string, value: unknown): void {
  sensitiveData.push({ label, value });
}

/**
 * Wipe all tracked sensitive variables from memory.
 * Called on process exit.
 */
export function wipeSensitiveMemory(): void {
  for (const item of sensitiveData) {
    item.value = null;
  }
  sensitiveData = [];
}

/**
 * Clear the terminal screen and scrollback buffer.
 * This removes any trace of the password that might have been displayed.
 */
export function clearScreen(): void {
  try {
    if (
      !process.stdout ||
      process.stdout.destroyed ||
      !process.stdout.writable
    ) {
      return;
    }
  } catch {
    return;
  }

  try {
    process.stdout.write('\x1b[H');
    process.stdout.write('\x1b[2J');
    process.stdout.write('\x1b[3J');
    process.stdout.write('\x1b[?1049l');
    process.stdout.write('\x1b[?25h');
  } catch {
    // stdout may be closed or destroyed during exit; silently ignore
  }
}

/**
 * Clear terminal scrollback only (soft clear for transitions).
 */
export function clearScrollback(): void {
  if (!process.stdout || process.stdout.destroyed) {
    return;
  }
  try {
    process.stdout.write('\x1b[3J\x1b[H\x1b[2J');
  } catch {
    // Silently ignore if stdout is closed
  }
}

/**
 * Set up process-wide exit handlers to wipe sensitive data
 * and clear the terminal screen.
 */
export function setupExitCleanup(onCleanup?: () => void): void {
  const cleanup = () => {
    wipeSensitiveMemory();
    if (onCleanup) {
      try {
        onCleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    if (interactiveSessionStarted && process.stdout?.isTTY && !process.stdout?.destroyed) {
      try {
        clearScreen();
        process.stdout.write('Bastion session ended. No data was retained.\n');
      } catch {
        // stdout may be closed or destroyed during exit; silently ignore
      }
    }
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
}

/**
 * Truncate a password for display purposes (shows length but not content).
 */
export function maskPassword(password: string): string {
  if (!password) return '';
  return '•'.repeat(Math.min(password.length, 32)) + (password.length > 32 ? '…' : '');
}
