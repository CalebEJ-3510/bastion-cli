import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as commonDictionary from '@zxcvbn-ts/language-common';
import * as enDictionary from '@zxcvbn-ts/language-en';
import * as crypto from 'crypto';
import * as https from 'https';

// --- Custom dictionary: context-specific patterns ---
const customDictionary = {
  'bastion-keywords': ['bastion', 'password', 'admin', 'root', 'login', 'secure', 'security', 'pass', 'pwd'],
  'common-compromises': [
    '1234567890', 'password123', 'iloveyou', 'admin123', 'qwerty123',
    'football', 'baseball', 'welcome', 'monkey', 'dragon',
  ],
};

// Map of leet substitution characters to their base letters.
// Only includes characters that are commonly used AS substitutions (not the base char itself).
const LEET_SUBSTITUTIONS: Array<{ sub: string; base: string }> = [
  { sub: '@', base: 'a' },
  { sub: '4', base: 'a' },
  { sub: '3', base: 'e' },
  { sub: '0', base: 'o' },
  { sub: '$', base: 's' },
  { sub: '5', base: 's' },
  { sub: '7', base: 't' },
  { sub: '+', base: 't' },
  { sub: '1', base: 'l' },
  { sub: '!', base: 'i' },
  { sub: '!', base: 'l' },
  { sub: '9', base: 'g' },
  { sub: '6', base: 'g' },
  { sub: '%', base: 'x' },
  { sub: '&', base: 'g' },
  { sub: '(', base: 'c' },
  { sub: '{', base: 'c' },
  { sub: '[', base: 'c' },
  { sub: '<', base: 'c' },
];

// Keyboard walk patterns to detect (minimum 4 chars to reduce false positives)
const KEYBOARD_WALKS: string[] = [
  'qwerty', 'wertyu', 'ertyui', 'rtyuio', 'tyuiop',
  'asdfg', 'sdfgh', 'dfghj', 'fghjk', 'ghjkl',
  'zxcvb', 'xcvbn', 'cvbnm',
  '12345', '23456', '34567', '45678', '56789', '67890',
  'qazws', 'wsxed', 'edcrt', 'rfvs',
  'q1w2e', 'asd12', 'zxc12',
  'qazwsxedc', 'qazwsxedcrfv',
  'poiuytrewq', 'lkjhgfdsa', 'mnbvcxz',
  'asdfghjkl', 'zxcvbnm',
];

// Alpha sequences
const ALPHA_SEQUENCES: string[] = [
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
];

// Numeric keys on a keyboard row
const NUMERIC_SEQUENCES: string[] = [
  '0123456789',
  '123456789',
  '9876543210',
  '987654321',
];

export interface PatternReport {
  type: 'leetspeak' | 'keyboard-walk' | 'repetition' | 'sequential';
  description: string;
  severity: 'weak' | 'critical';
}

export interface AnalysisReport {
  password: string;
  passwordLength: number;
  score: number;
  strength10: number;
  entropyBits: number;
  guesses: number;
  guessesLog10: number;
  crackTimeDisplay: string;
  feedbackWarning: string | null;
  feedbackSuggestions: string[];
  patterns: PatternReport[];
  breachedCount: number | null;
  breached: boolean;
  nistCompliant: boolean;
  recommendations: string[];
  isPiped: boolean;
}

// Build full options for ZxcvbnFactory
function createZxcvbnOptions() {
  return {
    dictionary: {
      ...commonDictionary.dictionary,
      ...enDictionary.dictionary,
      ...customDictionary,
    },
    graphs: commonDictionary.adjacencyGraphs,
    translations: enDictionary.translations,
  };
}

const zxcvbn = new ZxcvbnFactory(createZxcvbnOptions());

// ─── Cryptographic functions ──────────────────────────────────────────────

export function sha1Hash(password: string): string {
  return crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
}

// ─── Breach Detection (k-Anonymity via HIBP API) ──────────────────────────

export function checkBreached(password: string): Promise<number | null> {
  const hash = sha1Hash(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const url = `https://api.pwnedpasswords.com/range/${prefix}`;

  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        res.resume();
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        const lines = data.split('\r\n').filter((l) => l.trim());
        let breachedCount = 0;
        for (const line of lines) {
          const [suffixMatch, countStr] = line.split(':');
          if (suffixMatch === suffix) {
            breachedCount = parseInt(countStr, 10);
            break;
          }
        }
        resolve(breachedCount);
      });
    });

    req.on('error', () => {
      resolve(null);
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

// ─── Pattern Detection ─────────────────────────────────────────────────────

/**
 * Detect leetspeak substitutions in a normalized representation.
 * Only flags substitution characters that appear in a letter-like context
 * (i.e., adjacent to a letter) and are NOT part of a digit sequence.
 * This avoids false positives like '3' in "12345678".
 */
function isLeetContext(password: string, index: number): boolean {
  // Check if character at index is adjacent to a letter
  const prev = index > 0 ? password[index - 1] : '';
  const next = index < password.length - 1 ? password[index + 1] : '';
  const hasLetterNeighbor = /[a-z]/i.test(prev) || /[a-z]/i.test(next);

  // Check if character is part of a digit run (2+ consecutive digits)
  const hasDigitNeighbor = /[\d]/.test(prev) || /[\d]/.test(next);

  // Only flag if there's a letter neighbor and no digit neighbor
  return hasLetterNeighbor && !hasDigitNeighbor;
}

function detectLeetspeak(password: string): PatternReport | null {
  const foundSubs: Array<{ sub: string; base: string }> = [];

  for (const { sub, base } of LEET_SUBSTITUTIONS) {
    let idx = password.indexOf(sub);
    while (idx !== -1) {
      if (isLeetContext(password, idx)) {
        foundSubs.push({ sub, base });
        break;
      }
      idx = password.indexOf(sub, idx + 1);
    }
  }

  if (foundSubs.length > 0) {
    const sub = foundSubs[0];
    return {
      type: 'leetspeak',
      description: `Common substitution detected: '${sub.sub}' used for '${sub.base}'. Substitutions like these are easily cracked — treat them as the base letter.`,
      severity: 'weak',
    };
  }
  return null;
}

function detectKeyboardWalk(password: string): PatternReport | null {
  const lower = password.toLowerCase();
  for (const walk of KEYBOARD_WALKS) {
    if (lower.includes(walk)) {
      return {
        type: 'keyboard-walk',
        description: `Keyboard walk detected: '${walk}'. Avoid sequential keyboard patterns.`,
        severity: 'critical',
      };
    }
  }
  return null;
}

function detectRepetition(password: string): PatternReport | null {
  // Look for 3+ of the same character in a row
  const charRepeatMatch = password.match(/(.)\1{2,}/);
  if (charRepeatMatch) {
    return {
      type: 'repetition',
      description: `Repeated character '${charRepeatMatch[1]}' appearing ${charRepeatMatch[0].length} times consecutively. Repetition significantly reduces entropy.`,
      severity: 'weak',
    };
  }

  // Look for repeated substrings of length 3+ that appear 2+ times
  for (let len = Math.min(Math.floor(password.length / 2), 8); len >= 3; len--) {
    for (let i = 0; i <= password.length - len * 2; i++) {
      const sub = password.slice(i, i + len);
      const rest = password.slice(i + len);
      if (rest.includes(sub)) {
        return {
          type: 'repetition',
          description: `Repeated pattern '${sub}' detected. Avoid repeating substrings.`,
          severity: 'weak',
        };
      }
    }
  }

  return null;
}

function detectSequential(password: string): PatternReport | null {
  const lower = password.toLowerCase();

  // Check alpha sequences (ascending and descending) of length 4+
  for (const seq of ALPHA_SEQUENCES) {
    for (let len = 4; len <= 6; len++) {
      for (let i = 0; i <= seq.length - len; i++) {
        const pattern = seq.slice(i, i + len);
        if (lower.includes(pattern)) {
          return {
            type: 'sequential',
            description: `Sequential pattern '${pattern}' detected. Avoid alphabetical sequences.`,
            severity: 'critical',
          };
        }
        // Descending
        const desc = seq.slice(i, i + len).split('').reverse().join('');
        if (lower.includes(desc)) {
          return {
            type: 'sequential',
            description: `Sequential pattern '${desc}' detected. Avoid alphabetical sequences.`,
            severity: 'critical',
          };
        }
      }
    }
  }

  // Check numeric sequences of length 4+
  for (const seq of NUMERIC_SEQUENCES) {
    for (let len = 4; len <= 6; len++) {
      for (let i = 0; i <= seq.length - len; i++) {
        const pattern = seq.slice(i, i + len);
        if (lower.includes(pattern)) {
          return {
            type: 'sequential',
            description: `Sequential pattern '${pattern}' detected. Avoid numeric sequences.`,
            severity: 'critical',
          };
        }
      }
    }
  }

  return null;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function computePenalty(patterns: PatternReport[]): number {
  let penalty = 0;
  for (const p of patterns) {
    if (p.type === 'keyboard-walk' || p.type === 'sequential') {
      penalty += 2;
    } else if (p.type === 'repetition') {
      penalty += 1.5;
    } else if (p.type === 'leetspeak') {
      penalty += 1;
    }
  }
  return Math.min(penalty, 3);
}

// ─── 1–10 Strength Scaling ───────────────────────────────────────────────────

function computeStrength10(
  penalizedScore: number,
  entropyBits: number,
  length: number,
  patterns: PatternReport[],
): number {
  let base: number;
  switch (penalizedScore) {
    case 0: base = 1; break;
    case 1: base = 2; break;
    case 2: base = 4; break;
    case 3: base = 6; break;
    case 4: base = 8; break;
    default: base = 1;
  }

  // Length bonus
  if (length >= 18) base += 1;
  else if (length >= 14) base += 0.5;

  // Entropy bonus
  if (entropyBits >= 60) base += 1;
  else if (entropyBits >= 50) base += 0.5;

  // Pattern penalties on the 1-10 scale
  let patternPenalty = 0;
  for (const p of patterns) {
    if (p.type === 'keyboard-walk' || p.type === 'sequential') patternPenalty += 2;
    else if (p.type === 'repetition') patternPenalty += 1.5;
    else if (p.type === 'leetspeak') patternPenalty += 1;
  }
  base -= patternPenalty;

  return Math.max(1, Math.min(10, Math.round(base)));
}

export function strength10DisplayLabel(strength: number): string {
  if (strength <= 1) return 'Critically Weak';
  if (strength === 2) return 'Very Weak';
  if (strength === 3) return 'Weak';
  if (strength <= 4) return 'Fair';
  if (strength === 5) return 'Fair / Moderate';
  if (strength === 6) return 'Moderate';
  if (strength === 7) return 'Strong';
  if (strength === 8) return 'Very Strong';
  if (strength === 9) return 'Extremely Strong';
  return 'High Security / Stronghold Grade';
}

export function strength10Color(strength: number): string {
  if (strength <= 3) return '#ff6b6b';
  if (strength <= 6) return '#ffd43b';
  if (strength <= 8) return '#51cf73';
  return '#22d9d2';
}

export function lengthLabel(length: number): string {
  if (length < 8) return 'Too Short';
  if (length < 12) return 'Short';
  if (length < 15) return 'Adequate';
  if (length < 20) return 'Good';
  return 'Excellent';
}

export function breachStatusLabel(report: AnalysisReport): string {
  if (report.breachedCount === null) return 'Offline';
  if (report.breached) return `Breached (${report.breachedCount.toLocaleString()})`;
  return 'Safe';
}

// ─── Recommendations ───────────────────────────────────────────────────────

function generateRecommendations(
  report: Omit<AnalysisReport, 'recommendations'>,
  isPiped: boolean,
): string[] {
  const recs: string[] = [];
  const len = report.passwordLength;

  if (len < 8) {
    recs.push('CRITICAL: Password is shorter than 8 characters. NIST SP 800-63B requires a minimum of 8 characters.');
  }
  if (len >= 8 && len < 15) {
    recs.push(`Warning: Password is ${len} characters. NIST SP 800-63B recommends 15+ characters for single-factor authentication.`);
  }
  if (len >= 15) {
    recs.push('Good: Password meets NIST length recommendation (15+ characters).');
  }

  if (report.breached && report.breachedCount !== null) {
    recs.push(`CRITICAL: This password appeared in ${report.breachedCount.toLocaleString()} known breaches. Do not use it.`);
  }

  if (report.patterns.length > 0) {
    for (const p of report.patterns) {
      recs.push(p.description);
    }
  }

  if (report.score >= 3 && report.patterns.length === 0 && !report.breached) {
    recs.push('This password resists common attacks and is not found in known breaches.');
  }

  if (report.entropyBits < 28) {
    recs.push(`Low entropy (${report.entropyBits.toFixed(1)} bits). Aim for 50+ bits of estimated entropy.`);
  } else if (report.entropyBits < 50) {
    recs.push(`Moderate entropy (${report.entropyBits.toFixed(1)} bits). Consider increasing length to 20+ characters.`);
  } else {
    recs.push(`High entropy (${report.entropyBits.toFixed(1)} bits). This contributes significantly to password strength.`);
  }

  if (!isPiped) {
    recs.push('');
    recs.push('Note: No password data is stored, logged, or transmitted beyond the anonymous 5-character hash prefix used for breach detection.');
  }

  return recs;
}

// ─── Main Analysis ─────────────────────────────────────────────────────────

export async function analyzePassword(
  password: string,
  skipBreachCheck: boolean = false,
  isPiped: boolean = false,
): Promise<AnalysisReport> {
  if (!password || password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters (NIST SP 800-63B minimum).');
  }

  // Run zxcvbn analysis
  const result = zxcvbn.check(password, ['bastion', 'password', 'admin']);

  // Detect custom patterns
  const patterns: PatternReport[] = [];

  const leet = detectLeetspeak(password);
  if (leet) patterns.push(leet);

  const walk = detectKeyboardWalk(password);
  if (walk) patterns.push(walk);

  const repeat = detectRepetition(password);
  if (repeat) patterns.push(repeat);

  const seq = detectSequential(password);
  if (seq) patterns.push(seq);

  // Calculate entropy in bits
  // zxcvbn estimates guesses; entropy = log2(guesses)
  const entropyBits = result.guesses > 0
    ? Math.log2(result.guesses)
    : 0;

  // Apply penalty to score
  const penalty = computePenalty(patterns);
  const penalizedScore = Math.max(0, Math.min(4, Math.round(result.score - penalty)));

  // Breach check (k-anonymity)
  let breachedCount: number | null = null;
  let breached = false;

  if (!skipBreachCheck) {
    try {
      breachedCount = await checkBreached(password);
      if (breachedCount !== null && breachedCount > 0) {
        breached = true;
      }
    } catch {
      breachedCount = null;
    }
  }

  // NIST compliance: length >= 8 (enforced above), no composition rules enforced
  const nistCompliant = password.length >= 8;

  const baseReport: Omit<AnalysisReport, 'recommendations'> = {
    password: isPiped ? '[REDACTED]' : '[SECURELY ENTERED]',
    passwordLength: password.length,
    score: penalizedScore,
    strength10: computeStrength10(penalizedScore, entropyBits, password.length, patterns),
    entropyBits,
    guesses: result.guesses,
    guessesLog10: result.guessesLog10,
    crackTimeDisplay: result.crackTimes.offlineFastHashingXPerSecond.display,
    feedbackWarning: result.feedback.warning,
    feedbackSuggestions: result.feedback.suggestions,
    patterns,
    breachedCount,
    breached,
    nistCompliant,
    isPiped,
  };

  const recommendations = generateRecommendations(baseReport, isPiped);

  return { ...baseReport, recommendations };
}
