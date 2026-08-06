import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { trackSensitive, wipeSensitiveMemory } from './utils.js';

const ITERATIONS = 200000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const ALGORITHM = 'aes-256-gcm';

export interface VaultRecord {
  id: string;
  service: string;
  username?: string;
  password: string;
  lastModified: string;
}

export interface VaultEnvelope {
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export interface VaultState {
  exists: boolean;
  envelope?: VaultEnvelope;
}

// ─── Session Cache ───────────────────────────────────────────────────────
// Volatile in-memory cache for the derived key and salt. Wiped on exit.
let sessionKey: Buffer | null = null;
let sessionSalt: Buffer | null = null;
let sessionPasscode: string | null = null;

// ─── Path ────────────────────────────────────────────────────────────────

export function getBastionConfigDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const platform = process.platform;

  let configDir: string;
  if (platform === 'win32') {
    configDir =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      path.join(homeDir, 'AppData', 'Local');
    configDir = path.join(configDir, 'Bastion');
  } else if (platform === 'darwin') {
    configDir = path.join(homeDir, 'Library', 'Application Support', 'Bastion');
  } else {
    configDir =
      process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share');
    configDir = path.join(configDir, 'bastion');
  }
  return configDir;
}

export function getVaultPath(): string {
  return path.join(getBastionConfigDir(), 'vault.enc');
}

export function getExportPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
  const platform = process.platform;
  let docsDir: string;

  if (platform === 'win32') {
    docsDir =
      process.env.USERPROFILE ||
      path.join(homeDir, 'Users', process.env.USERNAME || '');
    docsDir = path.join(docsDir, 'Documents');
  } else if (platform === 'darwin') {
    docsDir = path.join(homeDir, 'Documents');
  } else {
    docsDir =
      process.env.XDG_DOCUMENTS_DIR || path.join(homeDir, 'Documents');
  }

  return path.join(docsDir, 'bastion_vault_export.txt');
}

// ─── Key Derivation ────────────────────────────────────────────────────

export function deriveKey(passcode: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passcode, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

// ─── Encryption / Decryption ───────────────────────────────────────────

export function encryptVault(records: VaultRecord[], passcode: string): VaultEnvelope {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(passcode, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const json = JSON.stringify(records);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

export function encryptVaultWithKey(
  records: VaultRecord[],
  key: Buffer,
  salt: Buffer,
): VaultEnvelope {
  const iv = crypto.randomBytes(IV_LENGTH);

  const json = JSON.stringify(records);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };
}

export function decryptVault(envelope: VaultEnvelope, passcode: string): VaultRecord[] {
  const salt = Buffer.from(envelope.salt, 'hex');
  const key = deriveKey(passcode, salt);
  return decryptVaultWithKey(envelope, key);
}

export function decryptVaultWithKey(envelope: VaultEnvelope, key: Buffer): VaultRecord[] {
  const iv = Buffer.from(envelope.iv, 'hex');
  const tag = Buffer.from(envelope.tag, 'hex');
  const data = Buffer.from(envelope.data, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// ─── Vault File Operations ─────────────────────────────────────────────

export function loadVault(): VaultState {
  const vaultPath = getVaultPath();
  try {
    if (fs.existsSync(vaultPath)) {
      const content = fs.readFileSync(vaultPath, 'utf8');
      const envelope = JSON.parse(content) as VaultEnvelope;
      return { exists: true, envelope };
    }
  } catch {
    // File read or parse error — treat as non-existent
  }
  return { exists: false };
}

export function saveVault(envelope: VaultEnvelope): void {
  const vaultPath = getVaultPath();
  const dir = path.dirname(vaultPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(vaultPath, JSON.stringify(envelope), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export function deleteVaultFile(): void {
  const vaultPath = getVaultPath();
  try {
    if (fs.existsSync(vaultPath)) {
      fs.unlinkSync(vaultPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Export ────────────────────────────────────────────────────────────────

export function exportVaultRecords(records: VaultRecord[]): string {
  const lines: string[] = [];
  lines.push('BASTION VAULT EXPORT');
  lines.push('=' .repeat(60));
  lines.push(`Exported: ${new Date().toISOString().replace('T', ' ').slice(0, 16)}`);
  lines.push('');
  lines.push(`Total entries: ${records.length}`);
  lines.push('');

  if (records.length === 0) {
    lines.push('No entries found in the vault.');
    return lines.join('\n');
  }

  records.forEach((record, i) => {
    lines.push(`Entry #${i + 1}: ${record.service}`);
    if (record.username) {
      lines.push(`  Username:    ${record.username}`);
    } else {
      lines.push('  Username:    (none)');
    }
    lines.push(`  Password:    ${record.password}`);
    lines.push(`  Last Mod:    ${record.lastModified}`);
    lines.push('');
  });

  lines.push('=' .repeat(60));
  lines.push('This file contains sensitive data. Store it securely.');
  return lines.join('\n');
}

export function writeExportFile(records: VaultRecord[]): string {
  const exportPath = getExportPath();
  const content = exportVaultRecords(records);
  const dir = path.dirname(exportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(exportPath, content, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return exportPath;
}

// ─── Session Cache Interface ───────────────────────────────────────────

export function cacheSessionKey(key: Buffer, salt: Buffer, passcode: string): void {
  sessionKey = key;
  sessionSalt = salt;
  sessionPasscode = passcode;
  trackSensitive('sessionKey', key);
  trackSensitive('sessionSalt', salt);
  trackSensitive('sessionPasscode', passcode);
}

export function getSessionKey(): Buffer | null {
  return sessionKey;
}

export function getSessionSalt(): Buffer | null {
  return sessionSalt;
}

export function hasSession(): boolean {
  return sessionKey !== null;
}

export function clearSession(): void {
  if (sessionKey) {
    sessionKey.fill(0);
    sessionKey = null;
  }
  if (sessionSalt) {
    sessionSalt.fill(0);
    sessionSalt = null;
  }
  sessionPasscode = null;
  wipeSensitiveMemory();
}

// ─── High-Level Vault Helpers ──────────────────────────────────────────

export function createAndCacheVault(passcode: string): VaultRecord[] {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(passcode, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update('', 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope: VaultEnvelope = {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex'),
  };

  saveVault(envelope);
  cacheSessionKey(key, salt, passcode);
  return [];
}

export function authenticateVault(
  passcode: string,
): { success: boolean; records?: VaultRecord[] } {
  const state = loadVault();
  if (!state.exists || !state.envelope) {
    return { success: false };
  }
  try {
    const salt = Buffer.from(state.envelope.salt, 'hex');
    const key = deriveKey(passcode, salt);
    const records = decryptVaultWithKey(state.envelope, key);
    cacheSessionKey(key, salt, passcode);
    return { success: true, records: records as VaultRecord[] };
  } catch {
    return { success: false };
  }
}

export function getVaultRecords(): VaultRecord[] {
  if (!hasSession()) return [];
  const key = getSessionKey()!;
  const state = loadVault();
  if (!state.exists || !state.envelope) return [];
  try {
    return decryptVaultWithKey(state.envelope, key);
  } catch {
    return [];
  }
}

export function saveVaultRecords(records: VaultRecord[]): void {
  if (!hasSession()) throw new Error('No active session');
  const key = getSessionKey()!;
  const salt = getSessionSalt()!;
  const envelope = encryptVaultWithKey(records, key, salt);
  saveVault(envelope);
}

export function deleteVaultRecord(id: string): boolean {
  if (!hasSession()) throw new Error('No active session');
  const records = getVaultRecords();
  const filtered = records.filter((r) => r.id !== id);
  if (filtered.length === records.length) return false;
  saveVaultRecords(filtered);
  return true;
}

export function updateVaultRecord(
  id: string,
  updates: Partial<Omit<VaultRecord, 'id'>>,
): VaultRecord | null {
  if (!hasSession()) throw new Error('No active session');
  const records = getVaultRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated = { ...records[idx], ...updates, lastModified: new Date().toISOString() };
  records[idx] = updated;
  saveVaultRecords(records);
  return updated;
}
