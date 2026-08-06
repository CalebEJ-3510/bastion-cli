#!/usr/bin/env node
import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import * as crypto from 'crypto';
import {
  analyzePassword,
  strength10DisplayLabel,
  strength10Color,
  lengthLabel,
  breachStatusLabel,
} from './analyzer.js';
import type { AnalysisReport } from './analyzer.js';
import {
  setupExitCleanup,
  markInteractiveSessionStarted,
  trackSensitive,
  clearScrollback,
  maskPassword,
} from './utils.js';
import {
  loadVault,
  hasSession,
  authenticateVault,
  createAndCacheVault,
  getVaultRecords,
  saveVaultRecords,
  deleteVaultRecord,
  updateVaultRecord,
  deleteVaultFile,
  writeExportFile,
  clearSession,
} from './vault.js';
import type { VaultRecord } from './vault.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const BASTION_LOGO = [
  '\x1b[38;2;207;115;255m',
  '  ██████╗   █████╗  ███████╗ ████████╗ ██╗  ██████╗  ███╗   ██╗',
  '  ██╔══██╗ ██╔══██╗ ██╔════╝ ╚══██╔══╝ ██║ ██╔═══██╗ ████╗  ██║',
  '  ██████╔╝ ███████║ ███████╗    ██║    ██║ ██║   ██║ ██╔██╗ ██║',
  '  ██╔══██╗ ██╔══██║ ╚════██║    ██║    ██║ ██║   ██║ ██║╚██╗██║',
  '  ██████╔╝ ██║  ██║ ███████║    ██║    ██║ ╚██████╔╝ ██║ ╚████║',
  '  ╚═════╝  ╚═╝  ╚═╝ ╚══════╝    ╚═╝    ╚═╝  ╚═════╝  ╚═╝  ╚═══╝',
  '\x1b[0m',
].join('\n');

const DISCLAIMER = 'Running locally. 100% offline. No data leaves this device.';

const BOX_WIDTH = 72;

// ─── App State ─────────────────────────────────────────────────────────────

type AppState =
  | 'welcome'
  | 'mainMenu'
  | 'auditInput'
  | 'analysis'
  | 'report'
  | 'masterPasscodeSetup'
  | 'masterPasscodeAuth'
  | 'serviceSelector'
  | 'strongholdList'
  | 'strongholdView'
  | 'vaultEntryForm'
  | 'vaultSuccess'
  | 'uninstallConfirm'
  | 'uninstallExport'
  | 'noVault'
  | 'exportSuccess'
  | 'error';

// ─── ANSI / Helper Functions ─────────────────────────────────────────────

function colorize(text: string, color: string): string {
  return `\x1b[38;2;${hexToRgb(color)}m${text}\x1b[0m`;
}

function hexToRgb(hex: string): string {
  const namedColors: Record<string, string> = {
    red: '255,107,107',
    green: '81,207,115',
    yellow: '255,212,59',
    blue: '33,150,243',
    gray: '134,142,150',
    cyan: '33,212,212',
  };
  if (hex in namedColors) return namedColors[hex];
  const h = hex.replace('#', '');
  if (h.length === 3) {
    return `${parseInt(h[0], 16) * 17},${parseInt(h[1], 16) * 17},${parseInt(h[2], 16) * 17}`;
  }
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function randomUUID(): string {
  return crypto.randomUUID();
}

// ─── Reused Components ─────────────────────────────────────────────────────

const ScanProgress: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + Math.random() * 8 + 2;
      });
    }, 120);
    return () => clearInterval(interval);
  }, []);

  const filled = Math.round(progress / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, 20 - filled));

  return (
    <Box flexDirection="column" alignItems="center" marginY={1}>
      <Text color="#51cf73">{bar}</Text>
      <Text color="#868e96" dimColor>
        {Math.round(progress)}%
      </Text>
    </Box>
  );
};

const WelcomeScreen: React.FC<{
  onComplete: () => void;
  subtitle?: string;
}> = ({ onComplete, subtitle }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4}>
      <Text color="#51cf73" bold>
        {BASTION_LOGO}
      </Text>
      <Box marginTop={1} marginBottom={3}>
        <Text color="#868e96" dimColor>
          {subtitle || 'A Local-First Password Security Auditor & Vault'}
        </Text>
      </Box>
      <Box borderStyle="round" borderColor="#51cf73" padding={1} marginBottom={2}>
        <Text color="#51cf73">✓</Text>
        <Text> </Text>
        <Text color="#868e96" dimColor>{DISCLAIMER}</Text>
      </Box>
      <Box marginTop={2}>
        <Text color="#868e96" dimColor>
          Initializing security engine...
        </Text>
      </Box>
    </Box>
  );
};

const ErrorScreen: React.FC<{ error: string; onRetry: () => void }> = ({
  error,
  onRetry,
}) => {
  useInput((input) => {
    if (input === 'c' || input === 'q') {
      onRetry();
    }
  });

  useEffect(() => {
    const timer = setTimeout(onRetry, 5000);
    return () => clearTimeout(timer);
  }, [onRetry]);

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={6}>
      <Text color="#ff6b6b" bold>
        ⚠ Error
      </Text>
      <Box marginTop={2} borderStyle="round" borderColor="#ff6b6b" padding={2} width={BOX_WIDTH}>
        <Text color="#ff6b6b">{error}</Text>
      </Box>
      <Box marginTop={2}>
        <Text color="#868e96" dimColor>
          Press q/c or wait 5s to retry...
        </Text>
      </Box>
    </Box>
  );
};

// ─── PasswordEntry: Reusable masked input with Tab toggle ──────────────────

const PASSWORD_FOOTER = '[Tab] Show/Hide Password  •  [Enter] Submit  •  [Ctrl+C] Exit';

interface PasswordEntryProps {
  onSubmit: (value: string) => void;
  onCancel: () => void;
  label: string;
  placeholder?: string;
  initialValue?: string;
  minLength?: number;
  mask?: boolean;
  allowEmpty?: boolean;
}

const PasswordEntry: React.FC<PasswordEntryProps> = ({
  onSubmit,
  onCancel,
  label,
  placeholder = '',
  initialValue = '',
  minLength = 8,
  mask = true,
  allowEmpty = false,
}) => {
  const [value, setValue] = useState(initialValue);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(initialValue);
    setVisible(false);
    setError(null);
  }, [initialValue]);

  const onErrorClear = useCallback(() => {
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    (val: string) => {
      if (!allowEmpty && (!val || val.length === 0)) {
        setError('This field cannot be empty.');
        return;
      }
      if (!allowEmpty && val.length < minLength) {
        setError(
          minLength === 8
            ? 'Password must be at least 8 characters (NIST SP 800-63B minimum).'
            : `Must be at least ${minLength} characters.`,
        );
        return;
      }
      trackSensitive('enteredPassword', val);
      onErrorClear();
      onSubmit(val);
    },
    [onSubmit, minLength, onErrorClear, allowEmpty],
  );

  useInput((input, key) => {
    if (mask && key.tab) {
      setVisible((v) => !v);
      setError(null);
    }
    if (key.escape || (key.ctrl && input === 'c')) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4} width={BOX_WIDTH}>
      <Box marginBottom={1} width="100%">
        <Text color={visible ? '#ffd43b' : '#51cf73'} bold>
          {label}
        </Text>
      </Box>
      {error && (
        <Box marginBottom={1} width="100%">
          <Text color="#ff6b6b">⚠ {error}</Text>
        </Box>
      )}
      <Box
        borderStyle="round"
        borderColor={visible ? '#ffd43b' : error ? '#ff6b6b' : '#51cf73'}
        padding={1}
        marginBottom={2}
        width="100%"
      >
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          mask={visible || !mask ? undefined : '•'}
          placeholder={placeholder}
          showCursor={false}
        />
      </Box>
      <Text color="#868e96" dimColor>
        {mask ? PASSWORD_FOOTER : '[Enter] Submit  •  [Ctrl+C] Exit'}
      </Text>
    </Box>
  );
};

// ─── StrengthMeter: 1–10 bar, 30 chars ──────────────────────────────────────

const StrengthMeter: React.FC<{ report: AnalysisReport }> = ({ report }) => {
  const strength = report.strength10;
  const color = strength10Color(strength);
  const label = strength10DisplayLabel(strength);
  const filled = Math.round((strength / 10) * 30);
  const bar = '█'.repeat(filled) + '░'.repeat(30 - filled);

  const lenClr =
    report.passwordLength >= 15
      ? '#51cf73'
      : report.passwordLength >= 8
        ? '#ffd43b'
        : '#ff6b6b';
  const lenLbl = lengthLabel(report.passwordLength);
  const entClr =
    report.entropyBits >= 60
      ? '#51cf73'
      : report.entropyBits >= 40
        ? '#ffd43b'
        : '#ff6b6b';
  const breachClr =
    report.breachedCount === null
      ? '#ffd43b'
      : report.breachedCount > 0
        ? '#ff6b6b'
        : '#51cf73';
  const breachLbl = breachStatusLabel(report);

  return (
    <Box borderStyle="round" borderColor={color} padding={1} marginTop={3} width={BOX_WIDTH}>
      <Box flexDirection="column" width="100%">
        <Text bold>Strength Score</Text>
        <Box marginTop={1} alignItems="center" width="100%">
          <Text>
            <Text color={color}>[{bar}]</Text>
            <Text color={color} bold>
              {' '}
              {strength}/10 — {label}
            </Text>
          </Text>
        </Box>
        <Box marginTop={1} width="100%">
          <Text color={lenClr}>Length: {report.passwordLength} chars ({lenLbl})</Text>
          <Text color="#868e96" dimColor>
            {'  │  '}
          </Text>
          <Text color={entClr}>Entropy: ~{Math.round(report.entropyBits)} bits</Text>
          <Text color="#868e96" dimColor>
            {'  │  '}
          </Text>
          <Text color={breachClr}>Breach: {breachLbl}</Text>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Main Menu ─────────────────────────────────────────────────────────────

const MainMenu: React.FC<{
  onSelect: (option: 0 | 1 | 2) => void;
  onCancel: () => void;
}> = ({ onSelect, onCancel }) => {
  const [selected, setSelected] = useState(0);
  const options = [
    { label: 'Check Password Strength', color: '#51cf73' },
    { label: 'Stronghold (Vault)', color: '#22d9d2' },
    { label: 'Exit', color: '#ff6b6b' },
  ];

  useInput((input, key) => {
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(options.length - 1, s + 1));
    if (key.return) onSelect(selected as 0 | 1 | 2);
    if (key.escape || (key.ctrl && input === 'c')) onCancel();
    if (input === '1') {
      setSelected(0);
      onSelect(0);
    }
    if (input === '2') {
      setSelected(1);
      onSelect(1);
    }
    if (input === '3') {
      setSelected(2);
      onSelect(2);
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4}>
      <Text color="#51cf73" bold>
        {BASTION_LOGO}
      </Text>
      <Box marginTop={1} marginBottom={3}>
        <Text color="#868e96" dimColor>
          A Local-First Password Security Auditor &amp; Vault
        </Text>
      </Box>

      <Box borderStyle="round" borderColor="#51cf73" padding={2} width={BOX_WIDTH}>
        <Box flexDirection="column" width="100%">
          <Box justifyContent="space-between" width="100%">
            <Text bold color="#51cf73">
              BASTION TERMINAL
            </Text>
            <Text color="#868e96" dimColor>
              v1.0.0
            </Text>
          </Box>

          <Box marginTop={1} borderStyle="single" borderColor="#252630" width="100%" />

          {options.map((opt, i) => {
            const isSelected = i === selected;
            return (
              <Box key={i} marginTop={1} width="100%">
                <Text>
                  <Text color={isSelected ? '#ffd43b' : '#868e96'}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={isSelected ? '#ffd43b' : '#e9ece6'} bold={isSelected}>
                    [{i + 1}] {opt.label}
                  </Text>
                </Text>
              </Box>
            );
          })}

          <Box marginTop={1} borderStyle="single" borderColor="#252630" width="100%" />

          <Box marginTop={2} width="100%">
            <Text color="#868e96" dimColor>
              <Text bold color="#ffd43b">[↑/↓]</Text> Select  •  <Text bold color="#51cf73">[1-3]</Text> Quick Select  •{' '}
              <Text bold color="#ff6b6b">[Ctrl+C]</Text> Exit
            </Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={3}>
        <Text color="#51cf73">✓</Text>
        <Text> </Text>
        <Text color="#868e96" dimColor>
          {DISCLAIMER}
        </Text>
      </Box>
    </Box>
  );
};

// ─── Analysis Screen ───────────────────────────────────────────────────────

const AnalysisScreen: React.FC<{ password: string }> = ({ password }) => {
  const [analysisStep, setAnalysisStep] = useState(0);

  const steps = [
    'Scanning for common patterns...',
    'Analyzing entropy and crack time...',
    'Checking against breach database (HIBP)...',
    'Evaluating NIST SP 800-63B compliance...',
    'Compiling security report...',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setAnalysisStep((s) => Math.min(s + 1, steps.length - 1));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4}>
      <Text color="#51cf73" bold>
        {BASTION_LOGO}
      </Text>
      <Box marginTop={2} marginBottom={2}>
        <Text color="#ffd43b">🔒 Analyzing password security...</Text>
      </Box>
      <ScanProgress />
      <Box marginTop={1} marginBottom={1} width={BOX_WIDTH} alignItems="center">
        <Text color="#868e96" dimColor>
          {steps[analysisStep]}
        </Text>
      </Box>
      <Box marginTop={2} width={BOX_WIDTH} alignItems="center">
        <Text color="#868e96" dimColor>
          Password length: {password.length} characters
        </Text>
      </Box>
    </Box>
  );
};

// ─── Breach Section ─────────────────────────────────────────────────_______

const BreachSection: React.FC<{ breachedCount: number | null }> = ({ breachedCount }) => {
  if (breachedCount === null) {
    return (
      <Box marginTop={2} padding={1} borderStyle="round" borderColor="#6c757d" width={BOX_WIDTH}>
        <Text color="#ffd43b">⚠ Offline: Breach check skipped.</Text>
        <Text> </Text>
        <Text color="#868e96" dimColor>(No network connection)</Text>
      </Box>
    );
  }
  if (breachedCount > 0) {
    return (
      <Box marginTop={2} padding={1} borderStyle="double" borderColor="#c92a2a" width={BOX_WIDTH}>
        <Box flexDirection="column">
          <Text color="#ff6b6b" bold>
            ⚠ CRITICAL: This password appeared in {breachedCount.toLocaleString()} known breaches.
          </Text>
          <Box marginTop={1}>
            <Text color="#ff6b6b">Do not use this password.</Text>
          </Box>
        </Box>
      </Box>
    );
  }
  return (
    <Box marginTop={2} padding={1} borderStyle="round" borderColor="#51cf73" width={BOX_WIDTH}>
      <Text color="#51cf73">✓ Not found in any known data breaches.</Text>
    </Box>
  );
};

// ─── Post-Audit Actions ────────────────────────────────────────────────────

const PostAuditActions: React.FC<{
  onStore: () => void;
  onReturn: () => void;
}> = ({ onStore, onReturn }) => {
  const [selected, setSelected] = useState(0);
  const options = ['Store Password in Stronghold', 'Return to Main Menu'];

  useInput((input, key) => {
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(options.length - 1, s + 1));
    if (key.return) {
      if (selected === 0) onStore();
      else onReturn();
    }
    if (input === '1') onStore();
    if (input === '2') onReturn();
  });

  return (
    <Box borderStyle="single" borderColor="#252630" padding={2} marginTop={3} width={BOX_WIDTH}>
      <Box flexDirection="column" width="100%">
        <Text bold color="#e9ece6">
          ─── Post-Audit Actions ───
        </Text>
        {options.map((opt, i) => {
          const isSelected = i === selected;
          return (
            <Box key={i} marginTop={1} width="100%">
              <Text>
                <Text color={isSelected ? '#ffd43b' : '#868e96'}>
                  {isSelected ? '▸ ' : '  '}
                </Text>
                <Text color={isSelected ? '#ffd43b' : '#e9ece6'} bold={isSelected}>
                  [{i + 1}] {opt}
                </Text>
              </Text>
            </Box>
          );
        })}
        <Box marginTop={2} width="100%">
              <Text color="#868e96" dimColor>
                [↑/↓] Select  •  [1-2] Quick Select  •  [Ctrl+C] Exit
              </Text>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Report Screen ─────────────────────────────────────────────────────────

const ReportScreen: React.FC<{
  report: AnalysisReport;
  onPostAction: (action: 'store' | 'return') => void;
}> = ({ report, onPostAction }) => {
  const hasCritical =
    report.breached || report.patterns.some((p) => p.severity === 'critical');
  const hasWarning = report.patterns.some(
    (p) => p.severity === 'weak' || p.severity === 'critical',
  );

  const borderColor = hasCritical
    ? '#c92a2a'
    : hasWarning
      ? '#ffd43b'
      : '#51cf73';

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={2} paddingX={2}>
      <Text color="#51cf73" bold>
        {BASTION_LOGO}
      </Text>

      {hasCritical ? (
        <Box
          borderStyle="double"
          borderColor="#c92a2a"
          padding={1}
          marginTop={2}
          width={BOX_WIDTH}
        >
          <Box flexDirection="column" alignItems="center">
            <Text color="#ff6b6b" bold>
              ⚠ CRITICAL VULNERABILITY DETECTED
            </Text>
            <Text color="#c92a2a">
              This password poses severe security risks.
            </Text>
          </Box>
        </Box>
      ) : (
        <Box
          borderStyle="double"
          borderColor={borderColor}
          padding={1}
          marginTop={2}
          width={BOX_WIDTH}
        >
          <Text color={borderColor}>
            {hasWarning ? '⚠ Warnings detected' : '✓ No critical issues found'}
          </Text>
        </Box>
      )}

      <StrengthMeter report={report} />

      <Box marginTop={3} width={BOX_WIDTH}>
        <Box borderStyle="single" borderColor="#252630" padding={2} width="100%">
          <Box flexDirection="column" width="100%">
            <Text bold color="#e9ece6">
              ─── Security Dashboard ───
            </Text>

            <Box marginTop={1} justifyContent="space-between" width="100%">
              <Text color="#868e96">Password Length:</Text>
              <Text
                color={
                  report.passwordLength >= 15
                    ? '#51cf73'
                    : report.passwordLength >= 8
                      ? '#ffd43b'
                      : '#ff6b6b'
                }
              >
                {report.passwordLength} chars
                {report.passwordLength >= 15
                  ? ' (NIST-compliant)'
                  : report.passwordLength >= 8
                    ? ' (minimum met)'
                    : ' (below minimum)'}
              </Text>
            </Box>

            <Box justifyContent="space-between" width="100%">
              <Text color="#868e96">Entropy:</Text>
              <Text
                color={
                  report.entropyBits >= 60
                    ? '#51cf73'
                    : report.entropyBits >= 40
                      ? '#ffd43b'
                      : '#ff6b6b'
                }
              >
                {report.entropyBits.toFixed(1)} bits
              </Text>
            </Box>

            <Box justifyContent="space-between" width="100%">
              <Text color="#868e96">Estimated Guesses:</Text>
              <Text color="#e9ece6">{report.guesses.toLocaleString()}</Text>
            </Box>

            <Box justifyContent="space-between" width="100%">
              <Text color="#868e96">Crack Time (offline):</Text>
              <Text
                color={report.entropyBits >= 60 ? '#51cf73' : '#ffd43b'}
              >
                {report.crackTimeDisplay}
              </Text>
            </Box>

            <Box justifyContent="space-between" width="100%">
              <Text color="#868e96">NIST Compliance:</Text>
              <Text color={report.nistCompliant ? '#51cf73' : '#ff6b6b'}>
                {report.nistCompliant ? '✓ Compliant' : '✗ Non-compliant'}
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box marginTop={3} width={BOX_WIDTH}>
        <BreachSection breachedCount={report.breachedCount} />
      </Box>

      {report.patterns.length > 0 && (
        <Box marginTop={2} width={BOX_WIDTH}>
          <Box
            borderStyle="round"
            borderColor="#ffd43b"
            padding={2}
            width="100%"
          >
            <Box flexDirection="column" width="100%">
              <Text bold color="#ffd43b">
                Detected Patterns ({report.patterns.length})
              </Text>
              {report.patterns.map((p, i) => (
                <Box key={i} marginTop={1} flexDirection="column">
                  <Text
                    color={
                      p.severity === 'critical' ? '#ff6b6b' : '#ffd43b'
                    }
                  >
                    • [{p.type.toUpperCase()}] {p.description}
                  </Text>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Box marginTop={3} width={BOX_WIDTH}>
        <Box borderStyle="single" borderColor="#252630" padding={2} width="100%">
          <Box flexDirection="column" width="100%">
            <Text bold color="#e9ece6">
              ─── Recommendations ───
            </Text>
            {report.recommendations.map((rec, i) => (
              <Box key={i} marginTop={1} width="100%">
                <Text
                  color={
                    rec.startsWith('CRITICAL')
                      ? '#ff6b6b'
                      : rec.startsWith('Warning')
                        ? '#ffd43b'
                        : rec.startsWith('Good:') ||
                            rec.includes('resists') ||
                            rec.includes('High entropy')
                          ? '#51cf73'
                          : '#e9ece6'
                  }
                >
                  {rec.startsWith('Good:') ||
                  rec.includes('resists') ||
                  rec.includes('High entropy')
                    ? '✓ ' + rec
                    : '• ' + rec}
                </Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <PostAuditActions onStore={() => onPostAction('store')} onReturn={() => onPostAction('return')} />
    </Box>
  );
};

// ─── Master Passcode Screen (setup or auth) ────────────────────────────────

const MasterPasscodeScreen: React.FC<{
  mode: 'setup' | 'auth';
  onSuccess: () => void;
  onCancel: () => void;
}> = ({ mode, onSuccess, onCancel }) => {
  const [step, setStep] = useState(0);
  const [passcode, setPasscode] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Auth mode: single step
  if (mode === 'auth') {
    return (
      <Box flexDirection="column" alignItems="center" paddingTop={4} width={BOX_WIDTH}>
        <Text color="#51cf73" bold>Verify Master Passcode</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text color="#868e96" dimColor>Enter your vault passcode to authenticate.</Text>
        </Box>
        {err && (
          <Box marginBottom={1} width="100%">
            <Text color="#ff6b6b">⚠ {err}</Text>
          </Box>
        )}
        <PasswordEntry
          key="auth-input"
          label="Enter Master Passcode:"
          placeholder="••••••••"
          onSubmit={(val) => {
            const result = authenticateVault(val);
            if (result.success) {
              onSuccess();
            } else {
              setErr('Incorrect master passcode. Please try again.');
            }
          }}
          onCancel={onCancel}
        />
      </Box>
    );
  }

  // Setup mode
  if (step === 1) {
    return (
      <Box flexDirection="column" alignItems="center" paddingTop={4} width={BOX_WIDTH}>
        <Text color="#51cf73" bold>Confirm Master Passcode</Text>
        {err && (
          <Box marginBottom={1} width="100%">
            <Text color="#ff6b6b">⚠ {err}</Text>
          </Box>
        )}
        <PasswordEntry
          key="setup-confirm"
          label="Confirm Master Passcode:"
          placeholder="Re-enter passcode"
          onSubmit={(val) => {
            if (val !== passcode) {
              setErr('Passcodes do not match. Please try again.');
              setStep(0);
              setPasscode('');
            } else {
              const records = createAndCacheVault(val);
              onSuccess();
            }
          }}
          onCancel={onCancel}
        />
      </Box>
    );
  }

  // Setup step 0
  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4} width={BOX_WIDTH}>
      <Text color="#51cf73" bold>Create Master Passcode</Text>
      <Box marginTop={1} marginBottom={1}>
        <Text color="#868e96" dimColor>Choose a strong passcode (min 8 characters).</Text>
      </Box>
      {err && (
        <Box marginBottom={1} width="100%">
          <Text color="#ff6b6b">⚠ {err}</Text>
        </Box>
      )}
      <PasswordEntry
        key="setup-enter"
        label="Enter Master Passcode:"
        placeholder="Master passcode"
        onSubmit={(val) => {
          setPasscode(val);
          setStep(1);
          setErr(null);
        }}
        onCancel={onCancel}
      />
    </Box>
  );
};

// ─── Service Selector ──────────────────────────────────────────────────────

const ServiceSelector: React.FC<{
  passwordToStore: string;
  onSave: (serviceName: string, username?: string) => void;
  onCancel: () => void;
}> = ({ passwordToStore, onSave, onCancel }) => {
  const [step, setStep] = useState(0);
  const [serviceName, setServiceName] = useState('');
  const [username, setUsername] = useState('');

  if (step === 1) {
    return (
      <Box flexDirection="column" alignItems="center" paddingTop={4} width={BOX_WIDTH}>
        <Text color="#51cf73" bold>Store Password in Stronghold</Text>
        <Box marginTop={1} marginBottom={1}>
          <Text color="#868e96" dimColor>Step 2 of 2: Username</Text>
        </Box>
        <PasswordEntry
          key="username-input"
          label=""
          placeholder="Optional - press Enter to skip"
          initialValue={username}
          minLength={1}
          mask={false}
          allowEmpty={true}
          onSubmit={(val) => {
            trackSensitive('username', val);
            onSave(serviceName, val.trim() || undefined);
          }}
          onCancel={onCancel}
        />
        <Box marginTop={1} marginBottom={2} width="100%" alignItems="center">
          <Text color="#868e96" dimColor>
            Password being stored: {maskPassword(passwordToStore)}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4} width={BOX_WIDTH}>
      <Text color="#51cf73" bold>Store Password in Stronghold</Text>
      <Box marginTop={1} marginBottom={1}>
        <Text color="#868e96" dimColor>Step 1 of 2: Service / Application</Text>
      </Box>
      <PasswordEntry
        key="service-input"
        label=""
        placeholder="e.g. Google, AWS, GitHub"
        initialValue={serviceName}
        minLength={1}
        mask={false}
        onSubmit={(val) => {
          trackSensitive('serviceName', val);
          setServiceName(val.trim());
          setStep(1);
        }}
        onCancel={onCancel}
      />
      <Box marginTop={1} marginBottom={2} width="100%" alignItems="center">
        <Text color="#868e96" dimColor>
          Password being stored: {maskPassword(passwordToStore)}
        </Text>
      </Box>
    </Box>
  );
};

// ─── Stronghold List View ──────────────────────────────────────────────────

const StrongholdListView: React.FC<{
  records: VaultRecord[];
  selectedIndex: number;
  onIndexChange: (index: number) => void;
  onSelect: (record: VaultRecord) => void;
  onAdd: () => void;
  onExport: () => void;
  onBack: () => void;
}> = ({ records, selectedIndex, onIndexChange, onSelect, onAdd, onExport, onBack }) => {
  useInput((input, key) => {
    if (key.upArrow) onIndexChange(Math.max(0, selectedIndex - 1));
    if (key.downArrow) onIndexChange(Math.min(records.length - 1, selectedIndex + 1));
    if (key.return && records.length > 0) {
      onSelect(records[Math.min(selectedIndex, records.length - 1)]);
    }
    if (input === 'a' || input === 'A') onAdd();
    if (input === 'x' || input === 'X') onExport();
    if (input === 'b' || input === 'B' || key.escape || (key.ctrl && input === 'c')) onBack();
  });

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4}>
      <Box borderStyle="round" borderColor="#51cf73" width={BOX_WIDTH} padding={1}>
        <Box flexDirection="column" width="100%">
          <Box justifyContent="space-between" width="100%">
            <Text bold color="#22d9d2">BASTION STRONGHOLD</Text>
            <Text color="#868e96" dimColor>
              [{records.length} Entries]
            </Text>
          </Box>

          <Box marginTop={1} borderStyle="single" borderColor="#252630" width="100%" />

          <Box marginTop={1} width="100%">
            <Text color="#868e96" dimColor>
              {'  #  '.padEnd(6)}
              {'Application / Service'.substring(0, 24).padEnd(24)}
              {'  '}
              {'Username'.padEnd(16)}
              {'  '}
              {'Last Modified'.padStart(16)}
            </Text>
          </Box>

          <Box marginTop={1} borderStyle="single" borderColor="#252630" width="100%" />

          {records.length === 0 ? (
            <Box marginTop={1} width="100%">
              <Text color="#868e96" dimColor>
                No entries found. Press [A] to add a new entry.
              </Text>
            </Box>
          ) : (
            records.map((record, i) => {
              const isSelected = i === selectedIndex;
              const usernameStr = record.username || '—';
              return (
                <Box key={record.id} marginTop={1} width="100%">
                  <Text color={isSelected ? '#ffd43b' : '#e9ece6'}>
                    {isSelected ? '▸ ' : '  '}
                    {`${i + 1}.  ${record.service.substring(0, 24).padEnd(24)}  `}
                  </Text>
                  <Text color={record.username ? (isSelected ? '#ffd43b' : '#e9ece6') : '#868e96'} dimColor={!record.username}>
                    {usernameStr.substring(0, 16).padEnd(16)}
                  </Text>
                  <Text color={isSelected ? '#ffd43b' : '#e9ece6'}>
                    {'  '}
                    {formatDate(record.lastModified).padStart(16)}
                  </Text>
                </Box>
              );
            })
          )}

          <Box marginTop={1} borderStyle="single" borderColor="#252630" width="100%" />

          <Box marginTop={2} width="100%">
            <Text color="#868e96" dimColor>
              [↑/↓] Select Entry  •  [A] Add New  •  [X] Export  •  [Enter] View  •  [B] Back
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Stronghold Entry View ─────────────────────────────────────────────────

const StrongholdEntryView: React.FC<{
  record: VaultRecord;
  onEdit: () => void;
  onDelete: () => void;
  onBack: () => void;
}> = ({ record, onEdit, onDelete, onBack }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useInput((input, key) => {
    if (confirmDelete) {
      if (input === 'y' || input === 'Y') {
        onDelete();
      } else {
        setConfirmDelete(false);
      }
      return;
    }

    if (key.tab) setShowPassword((s) => !s);
    if (input === 'e' || input === 'E') onEdit();
    if (input === 'd' || input === 'D') setConfirmDelete(true);
    if (input === 'b' || input === 'B' || key.escape) onBack();
  });

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4}>
      <Text color="#51cf73" bold>
        {confirmDelete ? '⚠ Confirm Deletion' : `ENTRY: ${record.service}`}
      </Text>

      <Box
        borderStyle="round"
        borderColor={confirmDelete ? '#ff6b6b' : '#51cf73'}
        width={BOX_WIDTH}
        padding={1}
        marginTop={2}
      >
        <Box flexDirection="column" width="100%">
          {confirmDelete ? (
            <Box flexDirection="column" width="100%" alignItems="center">
              <Text color="#ff6b6b" bold>
                Delete entry for '{record.service}'?
              </Text>
              <Box marginTop={2}>
                <Text color="#ff6b6b">
                  This action cannot be undone.
                </Text>
              </Box>
              <Box marginTop={1} width="100%" alignItems="center">
                <Text color="#ff6b6b" dimColor>
                  Press [Y] to confirm, any other key to cancel.
                </Text>
              </Box>
            </Box>
          ) : (
            <>
              <Box marginTop={1} width="100%">
                <Text color="#868e96">Service:</Text>
                <Text> </Text>
                <Text color="#e9ece6">{record.service}</Text>
              </Box>
              <Box marginTop={1} width="100%">
                <Text color="#868e96">Username:</Text>
                <Text> </Text>
                <Text color={record.username ? '#e9ece6' : '#868e96'}>
                  {record.username || '— (not set)'}
                </Text>
              </Box>
              <Box marginTop={1} width="100%">
                <Text color="#868e96">Password:</Text>
                <Text> </Text>
                <Text color={showPassword ? '#ffd43b' : '#e9ece6'}>
                  {showPassword ? record.password : '•'.repeat(record.password.length)}
                </Text>
              </Box>
              <Box marginTop={1} width="100%">
                <Text color="#868e96">Last Modified:</Text>
                <Text> </Text>
                <Text color="#e9ece6">{formatDate(record.lastModified)}</Text>
              </Box>
              <Box marginTop={2} width="100%">
                <Text color="#868e96" dimColor>
                  [Tab] Show/Hide Password  •  [E] Edit (incl. Username)
                </Text>
              </Box>
            </>
          )}
        </Box>
      </Box>

      {!confirmDelete && (
        <Box marginTop={2} width="100%" alignItems="center">
          <Text color="#868e96" dimColor>
            [E] Edit  •  [D] Delete  •  [B] Back to List
          </Text>
        </Box>
      )}
    </Box>
  );
};

// ─── Vault Entry Form (for new entry and edit) ─────────────────────────────

const VaultEntryForm: React.FC<{
  title: string;
  serviceNameInitial?: string;
  usernameInitial?: string;
  passwordInitial?: string;
  onSubmit: (serviceName: string, username: string | undefined, password: string) => void;
  onCancel: () => void;
}> = ({ title, serviceNameInitial = '', usernameInitial = '', passwordInitial = '', onSubmit, onCancel }) => {
  const [step, setStep] = useState(0);
  const [serviceName, setServiceName] = useState(serviceNameInitial);
  const [username, setUsername] = useState(usernameInitial);
  const [password, setPassword] = useState(passwordInitial);

  const handleServiceSubmit = useCallback(
    (val: string) => {
      setServiceName(val);
      setStep(1);
    },
    [],
  );

  const handleUsernameSubmit = useCallback(
    (val: string) => {
      setUsername(val);
      setStep(2);
    },
    [],
  );

  const handlePasswordSubmit = useCallback(
    (val: string) => {
      trackSensitive('vaultPassword', val);
      setPassword(val);
      onSubmit(serviceName, username.trim() || undefined, val);
    },
    [onSubmit, serviceName, username],
  );

  if (step === 2) {
    return (
      <PasswordEntry
        key="password-input"
        label={`${title} — Step 3 of 3: Password`}
        placeholder="Enter the password"
        initialValue={password}
        minLength={8}
        mask={true}
        onSubmit={handlePasswordSubmit}
        onCancel={onCancel}
      />
    );
  }

  if (step === 1) {
    return (
      <PasswordEntry
        key="username-input"
        label={`${title} — Step 2 of 3: Username`}
        placeholder="Optional - press Enter to skip"
        initialValue={username}
        minLength={1}
        mask={false}
        allowEmpty={true}
        onSubmit={handleUsernameSubmit}
        onCancel={onCancel}
      />
    );
  }

  return (
    <PasswordEntry
      key="service-input"
      label={`${title} — Step 1 of 3: Service / Application`}
      placeholder="e.g. Google, AWS, GitHub"
      initialValue={serviceName}
      minLength={1}
      mask={false}
      onSubmit={handleServiceSubmit}
      onCancel={onCancel}
    />
  );
};

// ─── Vault Success Screen ──────────────────────────────────────────────────

const VaultSuccessScreen: React.FC<{
  serviceName: string;
  onContinue: () => void;
}> = ({ serviceName, onContinue }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onContinue();
    }, 1800);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={6}>
      <Box borderStyle="round" borderColor="#51cf73" padding={2} width={BOX_WIDTH}>
        <Box flexDirection="column" alignItems="center">
          <Text color="#51cf73" bold>✓ Password Stored Successfully</Text>
          <Box marginTop={1}>
            <Text color="#868e96">Saved to: </Text>
            <Text color="#e9ece6">{serviceName}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color="#868e96">Timestamp: </Text>
            <Text color="#868e96" dimColor>{formatDate(new Date().toISOString())}</Text>
          </Box>
        </Box>
      </Box>
      <Box marginTop={2}>
        <Text color="#868e96" dimColor>
          Returning to Stronghold...
        </Text>
      </Box>
    </Box>
  );
};

// ─── Export Success Screen ───────────────────────────────────────────────────

const ExportSuccessScreen: React.FC<{
  exportPath: string;
  recordCount: number;
  onContinue: () => void;
}> = ({ exportPath, recordCount, onContinue }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onContinue();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={6}>
      <Box borderStyle="round" borderColor="#51cf73" padding={2} width={BOX_WIDTH}>
        <Box flexDirection="column" alignItems="center">
          <Text color="#51cf73" bold>
            ✓ Keys Saved Successfully
          </Text>
          <Box marginTop={1}>
            <Text color="#868e96">
              {recordCount} {recordCount === 1 ? 'entry' : 'entries'} exported
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="#868e96">Location: </Text>
            <Text color="#e9ece6" wrap="truncate">
              {exportPath}
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="#868e96">Timestamp: </Text>
            <Text color="#868e96" dimColor>
              {formatDate(new Date().toISOString())}
            </Text>
          </Box>
        </Box>
      </Box>
      <Box marginTop={2}>
        <Text color="#868e96" dimColor>
          Returning to Main Menu...
        </Text>
      </Box>
    </Box>
  );
};

// ─── Uninstall Confirm Screen ────────────────────────────────────────────────

const UninstallConfirmScreen: React.FC<{
  recordCount: number;
  onExport: () => void;
  onSkip: () => void;
  onCancel: () => void;
}> = ({ recordCount, onExport, onSkip, onCancel }) => {
  const [selected, setSelected] = useState(0);
  const options = [
    { label: 'Yes - Export passwords & usernames, then uninstall', color: '#ff8c00' },
    { label: 'No - Just uninstall (delete all data)', color: '#ff6b6b' },
    { label: 'Cancel', color: '#51cf73' },
  ];

  useInput((input, key) => {
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(options.length - 1, s + 1));
    if (key.return) {
      if (selected === 0) onExport();
      else if (selected === 1) onSkip();
      else onCancel();
    }
    if (input === '1') {
      setSelected(0);
      onExport();
    }
    if (input === '2') {
      setSelected(1);
      onSkip();
    }
    if (input === '3') {
      setSelected(2);
      onCancel();
    }
    if (key.escape || (key.ctrl && input === 'c')) onCancel();
  });

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={4}>
      <Box borderStyle="round" borderColor="#ff8c00" width={BOX_WIDTH} padding={2}>
        <Box flexDirection="column" alignItems="center">
          <Text color="#ff8c00" bold>
            ⚠ Uninstall Bastion
          </Text>
          <Box marginTop={1}>
            <Text color="#e9ece6">
              Before uninstalling, your encrypted vault data will be permanently
              deleted from this device.
            </Text>
          </Box>
          <Box marginTop={2} width="100%" alignItems="center">
            <Text color="#ffd43b" bold>
              {recordCount} {recordCount === 1 ? 'password' : 'passwords'} stored in
              your vault will be lost.
            </Text>
          </Box>
          <Box marginTop={2} width="100%">
            <Text color="#e9ece6">
              Would you like to export your saved passwords and usernames first?
            </Text>
          </Box>
        </Box>
      </Box>

      <Box marginTop={3} borderStyle="round" borderColor="#51cf73" width={BOX_WIDTH} padding={2}>
        <Box flexDirection="column" width="100%">
          {options.map((opt, i) => {
            const isSelected = i === selected;
            return (
              <Box key={i} marginTop={1} width="100%">
                <Text>
                  <Text color={isSelected ? '#ffd43b' : '#868e96'}>
                    {isSelected ? '▸ ' : '  '}
                  </Text>
                  <Text color={isSelected ? '#ffd43b' : opt.color} bold={isSelected}>
                    [{i + 1}] {opt.label}
                  </Text>
                </Text>
              </Box>
            );
          })}
          <Box marginTop={1} borderStyle="single" borderColor="#252630" width="100%" />
          <Box marginTop={2} width="100%">
            <Text color="#868e96" dimColor>
              [↑/↓] Navigate  •  [1-3] Quick Select  •  [Enter] Select  •  [B/Ctrl+C] Cancel
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Uninstall Complete Screen ───────────────────────────────────────────────

const UninstallCompleteScreen: React.FC<{
  exportPath: string | null;
  onExit: () => void;
}> = ({ exportPath, onExit }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onExit();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onExit]);

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={6}>
      <Box borderStyle="round" borderColor="#51cf73" width={BOX_WIDTH} padding={2}>
        <Box flexDirection="column" alignItems="center">
          <Text color="#51cf73" bold>
            ✓ Bastion Uninstalled
          </Text>
          <Box marginTop={1}>
            <Text color="#e9ece6">
              Your encrypted vault has been permanently removed.
            </Text>
          </Box>
          {exportPath && (
            <>
              <Box marginTop={2} borderStyle="single" borderColor="#252630" width="100%" />
              <Box marginTop={2} width="100%" alignItems="center">
                <Text color="#51cf73">
                  Your data was exported to:
                </Text>
              </Box>
              <Box marginTop={1} width="100%" alignItems="center">
                <Text color="#e9ece6" wrap="truncate">
                  {exportPath}
                </Text>
              </Box>
              <Box marginTop={1} width="100%" alignItems="center">
                <Text color="#868e96" dimColor>
                  ⚠ Store this file in a secure location.
                </Text>
              </Box>
            </>
          )}
        </Box>
      </Box>
      <Box marginTop={3}>
        <Text color="#868e96" dimColor>
          To remove the bastion command globally: npm uninstall -g bastion-cli
        </Text>
      </Box>
    </Box>
  );
};

// ─── No Vault Screen (uninstall with nothing to delete) ─────────────────────

const NoVaultScreen: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onExit();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onExit]);

  return (
    <Box flexDirection="column" alignItems="center" paddingTop={6}>
      <Box borderStyle="round" borderColor="#51cf73" width={BOX_WIDTH} padding={2}>
        <Box flexDirection="column" alignItems="center">
          <Text color="#51cf73" bold>
            ✓ Bastion Uninstalled
          </Text>
          <Box marginTop={1}>
            <Text color="#e9ece6">
              No vault was found on this device. Bastion has already been
              fully removed.
            </Text>
          </Box>
        </Box>
      </Box>
      <Box marginTop={3}>
        <Text color="#868e96" dimColor>
          To remove the bastion command globally: npm uninstall -g bastion-cli
        </Text>
      </Box>
    </Box>
  );
};

// ─── Main App Component ────────────────────────────────────────────────────

interface AppProps {
  pipedPassword: string | null;
  skipBreach: boolean;
  uninstallMode?: boolean;
}

const App: React.FC<AppProps> = ({ pipedPassword, skipBreach, uninstallMode = false }) => {
  const initialScreen = (() => {
    if (uninstallMode) {
      if (hasSession()) {
        return 'uninstallConfirm' as AppState;
      }
      const state = loadVault();
      if (state.exists) {
        return 'masterPasscodeAuth' as AppState;
      }
      return 'noVault' as AppState;
    }
    return 'welcome' as AppState;
  })();

  const [screen, setScreen] = useState<AppState>(initialScreen);
  const [password, setPassword] = useState('');
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Vault state
  const [vaultRecords, setVaultRecords] = useState<VaultRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<VaultRecord | null>(null);
  const [passwordToStore, setPasswordToStoreState] = useState<string | null>(null);
  const [postAuthTarget, setPostAuthTarget] = useState<'service-selector' | 'stronghold-list' | 'uninstall-confirm'>(
    uninstallMode ? 'uninstall-confirm' : 'stronghold-list'
  );
  const [vaultFormTitle, setVaultFormTitle] = useState('');
  const [vaultFormService, setVaultFormService] = useState('');
  const [vaultFormUsername, setVaultFormUsername] = useState('');
  const [vaultFormPassword, setVaultFormPassword] = useState('');
  const [vaultFormMode, setVaultFormMode] = useState<'new' | 'edit'>('new');
  const [successServiceName, setSuccessServiceName] = useState('');

  // Uninstall state
  const [uninstallExportPath, setUninstallExportPath] = useState<string | null>(null);

  // Export success state
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);

  // UI state
  const [selectedIndex, setSelectedIndex] = useState(0);

  // ─── Analysis ───────────────────────────────────────────────────────────

  const runAnalysis = useCallback(
    async (pw: string, isPipedInput: boolean) => {
      setPassword(pw);
      setScreen('analysis');

      setTimeout(async () => {
        try {
          const result = await analyzePassword(pw, skipBreach, isPipedInput);
          setReport(result);
          setScreen('report');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setScreen('error');
        }
      }, 150);
    },
    [skipBreach],
  );

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleWelcomeComplete = useCallback(() => {
    if (pipedPassword !== null) {
      trackSensitive('pipedPassword', pipedPassword);
      runAnalysis(pipedPassword, true);
    } else {
      setScreen('mainMenu');
    }
  }, [pipedPassword, runAnalysis]);

  const handlePasswordSubmit = useCallback(
    (pw: string) => {
      runAnalysis(pw, false);
    },
    [runAnalysis],
  );

  const handleCancel = useCallback(() => {
    setPassword('');
    setReport(null);
    setError(null);
    setScreen('mainMenu');
  }, []);

  const handleExit = useCallback(() => {
    clearScrollback();
    process.exit(0);
  }, []);

  const handleExportSuccessContinue = useCallback(() => {
    setExportSuccessPath(null);
    setScreen('mainMenu');
  }, []);

  // ─── Uninstall Handlers (CLI: bastion uninstall) ───────────────────────────

  const handleUninstallExport = useCallback(() => {
    const records = hasSession() ? getVaultRecords() : [];
    let exportPath: string | null = null;
    if (records.length > 0) {
      exportPath = writeExportFile(records);
    }
    deleteVaultFile();
    clearSession();
    setVaultRecords([]);
    setUninstallExportPath(exportPath);
    setScreen('uninstallExport');
  }, []);

  const handleExport = useCallback(() => {
    const records = hasSession() ? getVaultRecords() : vaultRecords;
    if (records.length === 0) {
      console.error(
        colorize(
          'Error: No entries to export.',
          '#ff6b6b',
        ),
      );
      return;
    }
    const exportPath = writeExportFile(records);
    setExportSuccessPath(exportPath);
    setScreen('exportSuccess');
  }, [vaultRecords]);

  const handleUninstallSkip = useCallback(() => {
    deleteVaultFile();
    clearSession();
    setVaultRecords([]);
    setUninstallExportPath(null);
    setScreen('uninstallExport');
  }, []);

  const handleUninstallCancel = useCallback(() => {
    clearSession();
    setVaultRecords([]);
    setScreen('mainMenu');
  }, []);

  const handleMainMenuSelect = useCallback(
    (option: 0 | 1 | 2) => {
      if (option === 0) {
        setScreen('auditInput');
      } else if (option === 1) {
        setPostAuthTarget('stronghold-list');
        if (hasSession()) {
          const records = getVaultRecords();
          setVaultRecords(records);
          setSelectedIndex(0);
          setScreen('strongholdList');
        } else {
          const state = loadVault();
          if (state.exists) {
            setScreen('masterPasscodeAuth');
          } else {
            setScreen('masterPasscodeSetup');
          }
        }
      } else {
        handleExit();
      }
    },
    [handleExit],
  );

  const handlePostAction = useCallback(
    (action: 'store' | 'return') => {
      if (action === 'return') {
        setPassword('');
        setReport(null);
        setError(null);
        setScreen('mainMenu');
      } else {
        setPasswordToStoreState(password);
        setPostAuthTarget('service-selector');
        if (hasSession()) {
          setScreen('serviceSelector');
        } else {
          const state = loadVault();
          if (state.exists) {
            setScreen('masterPasscodeAuth');
          } else {
            setScreen('masterPasscodeSetup');
          }
        }
      }
    },
    [password],
  );

  const handleAuthSuccess = useCallback(() => {
    let records: VaultRecord[] = [];
    if (hasSession()) {
      records = getVaultRecords();
    }
    setVaultRecords(records);
    setSelectedIndex(0);
    if (postAuthTarget === 'service-selector') {
      setScreen('serviceSelector');
    } else if (postAuthTarget === 'uninstall-confirm') {
      setScreen('uninstallConfirm');
    } else {
      setScreen('strongholdList');
    }
  }, [postAuthTarget]);

  const handleServiceSave = useCallback(
    (serviceName: string, username?: string) => {
      const pw = passwordToStore!;
      const newRecord: VaultRecord = {
        id: randomUUID(),
        service: serviceName,
        username: username,
        password: pw,
        lastModified: new Date().toISOString(),
      };
      const records = getVaultRecords();
      records.push(newRecord);
      saveVaultRecords(records);
      setVaultRecords(records);
      setPasswordToStoreState(null);
      setPassword('');
      setSuccessServiceName(serviceName);
      setScreen('vaultSuccess');
    },
    [passwordToStore],
  );

  const handleAddEntry = useCallback(() => {
    setVaultFormTitle('Add New Entry');
    setVaultFormService('');
    setVaultFormUsername('');
    setVaultFormPassword('');
    setVaultFormMode('new');
    setScreen('vaultEntryForm');
  }, []);

  const handleEditEntry = useCallback(() => {
    if (!selectedRecord) return;
    setVaultFormTitle(`Edit Entry: ${selectedRecord.service}`);
    setVaultFormService(selectedRecord.service);
    setVaultFormUsername(selectedRecord.username ?? '');
    setVaultFormPassword(selectedRecord.password);
    setVaultFormMode('edit');
    setScreen('vaultEntryForm');
  }, [selectedRecord]);

  const handleDeleteEntry = useCallback(() => {
    if (!selectedRecord) return;
    deleteVaultRecord(selectedRecord.id);
    const records = getVaultRecords();
    setVaultRecords(records);
    setSelectedRecord(null);
    if (selectedIndex >= records.length && records.length > 0) {
      setSelectedIndex(records.length - 1);
    }
    setScreen('strongholdList');
  }, [selectedRecord, selectedIndex]);

  const handleVaultFormSubmit = useCallback(
    (serviceName: string, username: string | undefined, pw: string) => {
      if (vaultFormMode === 'edit' && selectedRecord) {
        updateVaultRecord(selectedRecord.id, { service: serviceName, username: username, password: pw });
      } else {
        const newRecord: VaultRecord = {
          id: randomUUID(),
          service: serviceName,
          username: username,
          password: pw,
          lastModified: new Date().toISOString(),
        };
        const records = getVaultRecords();
        records.push(newRecord);
        saveVaultRecords(records);
      }
      const records = getVaultRecords();
      setVaultRecords(records);
      setSuccessServiceName(serviceName);
      setScreen('vaultSuccess');
    },
    [vaultFormMode, selectedRecord],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setScreen('auditInput');
  }, []);

  // ─── Effects ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (screen === 'strongholdList') {
      const records = hasSession() ? getVaultRecords() : [];
      setVaultRecords(records);
      setSelectedIndex(0);
    }
  }, [screen]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const renderState = () => {
    switch (screen) {
      case 'welcome':
        return (
          <WelcomeScreen
            onComplete={handleWelcomeComplete}
            subtitle="A Local-First Password Security Auditor & Vault"
          />
        );

      case 'mainMenu':
        return <MainMenu onSelect={handleMainMenuSelect} onCancel={handleExit} />;

      case 'auditInput':
        return (
          <PasswordEntry
            label="Enter password to audit:"
            placeholder="Type here (input masked)"
            onSubmit={handlePasswordSubmit}
            onCancel={handleCancel}
          />
        );

      case 'analysis':
        return <AnalysisScreen password={password} />;

      case 'report':
        if (!report) return <AnalysisScreen password={password} />;
        return (
          <ReportScreen report={report} onPostAction={handlePostAction} />
        );

      case 'masterPasscodeSetup':
        return (
          <MasterPasscodeScreen mode="setup" onSuccess={handleAuthSuccess} onCancel={handleCancel} />
        );

      case 'masterPasscodeAuth':
        return (
          <MasterPasscodeScreen mode="auth" onSuccess={handleAuthSuccess} onCancel={handleCancel} />
        );

      case 'serviceSelector':
        return (
          <ServiceSelector
            passwordToStore={passwordToStore ?? ''}
            onSave={handleServiceSave}
            onCancel={handleCancel}
          />
        );

      case 'strongholdList':
        return (
          <StrongholdListView
            records={vaultRecords}
            selectedIndex={selectedIndex}
            onIndexChange={setSelectedIndex}
            onSelect={(rec) => {
              setSelectedRecord(rec);
              setScreen('strongholdView');
            }}
             onAdd={handleAddEntry}
             onExport={handleExport}
             onBack={handleCancel}
          />
        );

      case 'strongholdView':
        if (!selectedRecord) return <StrongholdListView records={vaultRecords} selectedIndex={selectedIndex} onIndexChange={setSelectedIndex} onSelect={(r) => { setSelectedRecord(r); setScreen('strongholdView'); }} onAdd={handleAddEntry} onExport={handleExport} onBack={handleCancel} />;
        return (
          <StrongholdEntryView
            record={selectedRecord}
            onEdit={handleEditEntry}
            onDelete={handleDeleteEntry}
            onBack={() => setScreen('strongholdList')}
          />
        );

      case 'vaultEntryForm':
        return (
          <VaultEntryForm
            title={vaultFormTitle}
            serviceNameInitial={vaultFormService}
            usernameInitial={vaultFormUsername}
            passwordInitial={vaultFormPassword}
            onSubmit={handleVaultFormSubmit}
            onCancel={() => setScreen('strongholdList')}
          />
        );

      case 'vaultSuccess':
        return (
          <VaultSuccessScreen
            serviceName={successServiceName}
            onContinue={() =>
              postAuthTarget === 'service-selector'
                ? setScreen('strongholdList')
                : setScreen('mainMenu')
            }
          />
        );

      case 'uninstallConfirm':
        return (
          <UninstallConfirmScreen
            recordCount={vaultRecords.length}
            onExport={handleUninstallExport}
            onSkip={handleUninstallSkip}
            onCancel={handleUninstallCancel}
          />
        );

      case 'uninstallExport':
        return (
          <UninstallCompleteScreen
            exportPath={uninstallExportPath}
            onExit={handleExit}
          />
        );

      case 'noVault':
        return <NoVaultScreen onExit={handleExit} />;

      case 'exportSuccess':
        return (
          <ExportSuccessScreen
            exportPath={exportSuccessPath || ''}
            recordCount={vaultRecords.length}
            onContinue={handleExportSuccessContinue}
          />
        );

      case 'error':
        return (
          <ErrorScreen
            error={error || 'Unknown error'}
            onRetry={handleRetry}
          />
        );

      default:
        return <WelcomeScreen onComplete={handleWelcomeComplete} />;
    }
  };

  return <Box>{renderState()}</Box>;
};

// ─── Non-Interactive Piped Output ──────────────────────────────────────────

function printPipedReport(report: AnalysisReport): void {
  const G = '#51cf73';
  const R = '#ff6b6b';
  const Y = '#ffd43b';
  const D = '#868e96';
  const B = '#e9ece6';

  const label = strength10DisplayLabel(report.strength10);
  const color = strength10Color(report.strength10);

  console.log('');
  process.stdout.write(BASTION_LOGO + '\n');
  console.log('');

  const hasCritical =
    report.breached || report.patterns.some((p) => p.severity === 'critical');
  const hasWarning = report.patterns.some(
    (p) => p.severity === 'weak' || p.severity === 'critical',
  );

  const border = hasCritical ? R : hasWarning ? Y : G;
  const statusText = hasCritical
    ? 'CRITICAL VULNERABILITY DETECTED'
    : hasWarning
      ? 'Warnings detected'
      : 'No critical issues found';

  console.log(colorize('═'.repeat(60), border));
  console.log(colorize('  ' + statusText, border));
  console.log(colorize('═'.repeat(60), border));
  console.log('');

  console.log(colorize('─── Strength Score ───', B));
  console.log(`  ${colorize(label, color)} (${report.strength10}/10)`);

  const barFilled = Math.round((report.strength10 / 10) * 30);
  const bar = '█'.repeat(barFilled) + '░'.repeat(30 - barFilled);
  console.log(`  ${colorize('[' + bar + ']', color)}`);
  console.log('');

  console.log(colorize('─── Security Dashboard ───', B));
  const lenClr =
    report.passwordLength >= 15
      ? G
      : report.passwordLength >= 8
        ? Y
        : R;
  console.log(
    `  Password Length:  ${colorize(
      report.passwordLength + ' chars',
      lenClr,
    )}`,
  );
  const entClr =
    report.entropyBits >= 60
      ? G
      : report.entropyBits >= 40
        ? Y
        : R;
  console.log(
    `  Entropy:          ${colorize(
      report.entropyBits.toFixed(1) + ' bits',
      entClr,
    )}`,
  );
  console.log(
    `  Estimated Guesses: ${colorize(report.guesses.toLocaleString(), B)}`,
  );
  console.log(
    `  Crack Time:        ${colorize(report.crackTimeDisplay, B)}`,
  );
  console.log(
    `  NIST Compliance:   ${colorize(
      report.nistCompliant ? '✓ Compliant' : '✗ Non-compliant',
      report.nistCompliant ? G : R,
    )}`,
  );
  console.log('');

  console.log(colorize('─── Breach Check (HIBP) ───', B));
  if (report.breachedCount === null) {
    console.log(
      `  ${colorize('⚠ Offline: Breach check skipped', Y)} ${colorize('(No network)', D)}`,
    );
  } else if (report.breachedCount > 0) {
    console.log(
      `  ${colorize(
        '⚠ CRITICAL: Found in ' + report.breachedCount.toLocaleString() + ' breaches. DO NOT USE.',
        R,
      )}`,
    );
  } else {
    console.log(`  ${colorize('✓ Not found in any known data breaches', G)}`);
  }
  console.log('');

  if (report.patterns.length > 0) {
    console.log(
      colorize(`─── Detected Patterns (${report.patterns.length}) ───`, Y),
    );
    for (const p of report.patterns) {
      const pColor = p.severity === 'critical' ? R : Y;
      console.log(colorize(`  • [${p.type.toUpperCase()}] ${p.description}`, pColor));
    }
    console.log('');
  }

  console.log(colorize('─── Recommendations ───', B));
  for (const rec of report.recommendations) {
    const recColor =
      rec.startsWith('CRITICAL')
        ? R
        : rec.startsWith('Warning')
          ? Y
          : rec.startsWith('Good:') ||
              rec.includes('resists') ||
              rec.includes('High entropy')
            ? G
            : B;
    const prefix =
      rec.startsWith('Good:') || rec.includes('resists') || rec.includes('High entropy')
        ? '✓ '
        : '• ';
    console.log(colorize(prefix + rec, recColor));
  }
  console.log('');

  console.log(colorize('═════════════════════════════════════════════════════', D));
  console.log(colorize('  No password data was stored or transmitted.', D));
  console.log(
    colorize('  K-anonymity: Only SHA-1 prefix sent to HIBP API.', D),
  );
  console.log('');
}

// ─── Entry Point ───────────────────────────────────────────────────────────

function parseArgs(): {
  help: boolean;
  version: boolean;
  skipBreach: boolean;
  uninstall: boolean;
} {
  const args = process.argv.slice(2);
  return {
    help: args.includes('--help') || args.includes('-h'),
    version: args.includes('--version') || args.includes('-v'),
    skipBreach: args.includes('--skip-breach'),
    uninstall: args.includes('uninstall'),
  };
}

function showHelp(): void {
  console.log(`
Bastion CLI — Local-First Password Security Auditor & Vault

USAGE:
  bastion [OPTIONS]

  Or pipe a password:
  echo "password" | bastion

  Uninstall:
  bastion uninstall

OPTIONS:
  --skip-breach   Skip HIBP breach check (fully offline)
  --help, -h      Show this help message
  --version, -v   Show version

DESCRIPTION:
  Bastion audits password strength using zxcvbn and checks against
  the HIBP Pwned Passwords database using k-anonymity. It also
  includes a fully offline encrypted vault (Stronghold) for storing
  passwords with AES-256-GCM encryption.

  No password data is stored, logged, or transmitted beyond
  the anonymous 5-character SHA-1 prefix used for breach lookup.

  Compliant with NIST SP 800-63B Rev. 4 (2026) and OWASP guidelines.

SECURITY:
  - Zero data retention: nothing is written to disk except the encrypted vault
  - Memory safety: passwords exist only in volatile memory
  - K-anonymity: only SHA-1 prefix (5 chars) is sent to HIBP
  - Vault encryption: AES-256-GCM with PBKDF2 key derivation
  - Vault stored in a hidden, platform-specific directory:
      Windows: %LOCALAPPDATA%\\Bastion\\vault.enc
      macOS:   ~/Library/Application Support/Bastion/vault.enc
      Linux:   ~/.local/share/bastion/vault.enc
  - Each entry supports an optional username field
  - Run 'bastion uninstall' to export your data and remove the vault permanently
`);
  process.exit(0);
}

function showVersion(): void {
  console.log('bastion-cli v1.0.0');
  process.exit(0);
}

function readPipedStdin(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      chunks.push(Buffer.from(chunk));
    });
    process.stdin.on('end', () => {
      const data = Buffer.concat(chunks)
        .toString('utf8')
        .replace(/[\r\n]+$/, '');
      resolve(data.length > 0 ? data : null);
    });
    process.stdin.on('error', () => {
      resolve(null);
    });
  });
}

// Initialize exit cleanup handlers (wipes session key from memory)
setupExitCleanup(clearSession);

const args = parseArgs();

if (args.help) {
  showHelp();
}

if (args.version) {
  showVersion();
}

const isStdinPiped = !process.stdin.isTTY;
const isStdoutTty = process.stdout.isTTY === true;

async function main() {
  const pipedPassword = isStdinPiped ? await readPipedStdin() : null;

  if (args.uninstall) {
    if (process.stdin.isTTY || process.stdout.isTTY === true) {
      markInteractiveSessionStarted();
      render(<App pipedPassword={null} skipBreach={args.skipBreach} uninstallMode={true} />);
    } else {
      console.error(
        colorize(
          'Error: Uninstall requires an interactive terminal (TTY).',
          '#ff6b6b',
        ),
      );
      process.exit(1);
    }
    return;
  }

  if (isStdinPiped) {
    if (isStdoutTty) {
      if (pipedPassword !== null) {
        trackSensitive('pipedPassword', pipedPassword);
      }
      markInteractiveSessionStarted();
      render(<App pipedPassword={pipedPassword} skipBreach={args.skipBreach} />);
    } else {
      if (pipedPassword !== null) {
        trackSensitive('pipedPassword', pipedPassword);

        try {
          const report = await analyzePassword(
            pipedPassword,
            args.skipBreach,
            true,
          );
          printPipedReport(report);
          process.exit(0);
        } catch (err) {
          console.error(
            colorize(
              'Error: ' + (err instanceof Error ? err.message : String(err)),
              '#ff6b6b',
            ),
          );
          process.exit(1);
        }
      } else {
        console.error(
          colorize(
            'Error: No password provided. Use --help for usage.',
            '#ff6b6b',
          ),
        );
        process.exit(1);
      }
    }
  } else if (isStdoutTty) {
    markInteractiveSessionStarted();
    render(<App pipedPassword={null} skipBreach={args.skipBreach} />);
  } else {
    console.error(
      colorize(
        'Error: stdout is not a TTY. Use --help for usage.',
        '#ff6b6b',
      ),
    );
    process.exit(1);
  }
}

main();

