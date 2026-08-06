# Bastion CLI

<div align="center">

**The last password tool you'll ever install.** Local-first, zero-trust, terminal-native.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](package.json)
[![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/CalebEJ-3510/bastion/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Security](https://img.shields.io/badge/security-audited-red.svg)](#security-architecture)

</div>

---

> **Stop trusting the cloud with your secrets.**
>
> Bastion is a local-first, terminal-native password security auditor and encrypted vault. No servers. No cloud sync. No third-party access. No telemetry. Your passwords never leave the device.

---

## 🎬 See It In Action

### Interactive TUI Mode
```bash
$ bastion
```
```
  ██████╗   █████╗  ███████╗ ████████╗ ██╗  ██████╗  ███╗   ██╗
  ██╔══██╗ ██╔══██╗ ██╔════╝ ╚══██╔══╝ ██║ ██╔═══██╗ ████╗  ██║
  ██████╔╝ ███████║ ███████╗    ██║    ██║ ██║   ██║ ██╔██╗ ██║
  ██╔══██╗ ██╔══██║ ╚════██║    ██║    ██║ ██║   ██║ ██║╚██╗██║
  ██████╔╝ ██║  ██║ ███████║    ██║    ██║ ╚██████╔╝ ██║ ╚████║
  ╚═════╝  ╚═════╝ ╚══════╝    ╚═╝    ╚═╝  ╚═════╝  ╚═╝  ╚═══╝

✓ Running locally. 100% offline. No data leaves this device.

╭────────────────── BASTION TERMINAL v1.0.0 ──────────────────╮
│                                                             │
│   ▸ [1] Check Password Strength                             │
│     [2] Stronghold (Vault)                                  │
│     [3] Exit                                                │
│                                                             │
│   [↑/↓] Select  •  [1-3] Quick Select  •  [Ctrl+C] Exit     │
╰─────────────────────────────────────────────────────────────╯

✓ Running locally. 100% offline. No data leaves this device.
```

### Piped Report Mode (Perfect for CI/CD)
```bash
$ echo "MyP@ssw0rd123!" | bastion --skip-breach
```
```
  ██████╗   █████╗  ███████╗ ████████╗ ██╗  ██████╗  ███╗   ██╗
  ██╔══██╗ ██╔══██╗ ██╔════╝ ╚══██╔══╝ ██║ ██╔═══██╗ ████╗  ██║
  ██████╔╝ ███████║ ███████╗    ██║    ██║ ██║   ██║ ██╔██╗ ██║
  ██═══██╗ ██╔══██║ ╚════██║    ██║    ██║ ██║   ██║ ██║╚██╗██║
  ██████╔╝ ██║  ██║ ███████║    ██║    ██║ ╚██████╔╝ ██║ ╚████║
  ╚═════╝  ╚═════╝ ╚══════╝    ╚═╝    ╚═╝  ╚═════╝  ╚═╝  ╚═══╝

═════════════════════════════════════════════════════════════
  No critical issues found
═════════════════════════════════════════════════════════════

─── Strength Score ───
  Strong (7/10)
  [████████████████████░░░░░░░░]

─── Security Dashboard ───
  Password Length:  15 chars (NIST-compliant)
  Entropy:          52.3 bits
  Estimated Guesses: 5,234,123
  Crack Time:        2 hours
  NIST Compliance:   ✓ Compliant

─── Breach Check (HIBP) ───
  ⚠ Offline: Breach check skipped (No network)

─── Recommendations ───
  ✓ This password resists common attacks and is not found in known breaches.
  ✓ High entropy (52.3 bits). This contributes significantly to password strength.

═════════════════════════════════════════════════════════════
  No password data was stored or transmitted.
  K-anonymity: Only SHA-1 prefix sent to HIBP API.
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js ≥ 18** (LTS recommended)
- **npm** (bundled with Node)

### Install from Source (Recommended)
```bash
# 1. Clone the repository
git clone https://github.com/CalebEJ-3510/bastion.git
cd bastion

# 2. Install dependencies
npm install

# 3. Build the CLI (produces dist/cli.js)
npm run build

# 4. Install globally (creates `bastion` command)
npm link
```

### Verify Installation
```bash
bastion --version
# → bastion-cli v1.0.0

bastion --help
# Shows full usage guide
```

---

## 🎯 Usage Guide

### Mode 1: Interactive TUI (Full Experience)
```bash
# Launch the interactive terminal UI
bastion
```
**Navigate with:** `↑/↓` arrows, `1-3` quick-select, `Tab` (toggle visibility), `Enter`, `Ctrl+C`

### Mode 2: Piped Report (Automation-Friendly)
```bash
# Analyze a password, output colorized report to stdout
echo "your-password" | bastion

# Skip breach check for fully offline operation
echo "your-password" | bastion --skip-breach

# Use in scripts (exit code 0 = pass, 1 = fail)
if echo "$PASSWORD" | bastion --skip-breach | grep -q "CRITICAL"; then
  echo "❌ Password rejected"
  exit 1
fi
```

### Mode 3: Stronghold Vault (Encrypted Storage)
```bash
# 1. Enter the vault
bastion
# → Select [2] Stronghold (Vault)

# 2. Set up master passcode (first run) or authenticate
#    (min 8 chars, masked input, Tab to peek)

# 3. Add entries
#    Press [A] → Service → Username (optional) → Password

# 4. View/manage entries
#    [↑/↓] navigate, [Enter] view, [E] edit, [D] delete, [Tab] show password

# 5. Export all (plaintext backup)
#    Press [X] → saves to ~/Documents/bastion_vault_export.txt
#    Shows "Keys Saved Successfully" for 4 seconds, returns to main menu
```

### Mode 4: Secure Uninstall
```bash
# Interactive: confirms, exports option, wipes vault, clears memory
bastion uninstall

# Or via npm (triggers same flow)
npm uninstall -g bastion-cli
```

---

## 📖 Deep Dive: Understanding Your Report

### Strength Score (1–10 Scale)
| Score | Label | When to Use |
|-------|-------|-------------|
| **1** | Critically Weak | ❌ Never |
| **2** | Very Weak | ❌ Never |
| **3** | Weak | ❌ Never |
| **4** | Fair | ⚠️ Low-value throwaway accounts only |
| **5** | Fair / Moderate | ⚠️ Low-risk accounts |
| **6** | Moderate | ✅ General use |
| **7** | Strong | ✅ Recommended minimum |
| **8** | Very Strong | ✅ High-value accounts |
| **9** | Extremely Strong | ✅ Admin/root/service accounts |
| **10** | Stronghold Grade | 🏆 Crypto keys, master passwords |

### Security Dashboard Explained
| Metric | What It Means | Good Target |
|--------|---------------|-------------|
| **Length** | Character count | ≥ 15 (NIST) |
| **Entropy** | Bits of randomness | ≥ 50 bits |
| **Crack Time** | Offline attack estimate | > 1 year |
| **NIST Compliance** | SP 800-63B checklist | ✓ Compliant |
| **Breach Status** | HIBP database check | Safe |

### Pattern Detection (Auto-Flags Weak Habits)
| Pattern | Severity | Example | Why It Matters |
|---------|----------|---------|----------------|
| Keyboard Walk | 🔴 Critical | `qwerty`, `asdfgh` | Predictable finger paths |
| Sequential | 🔴 Critical | `abcd`, `1234`, `4321` | Alphabet/numeric sequences |
| Repetition | 🟡 Weak | `aaa`, `passpass` | Reduces entropy drastically |
| Leetspeak | 🟡 Weak | `p@ssw0rd`, `s3cur3` | Dictionary attacks expect these |

---

## 🔐 Security Architecture

### Vault Encryption (AES-256-GCM + PBKDF2)
| Property | Specification |
|----------|---------------|
| **Algorithm** | AES-256-GCM (authenticated encryption) |
| **Key Derivation** | PBKDF2-HMAC-SHA256 |
| **Iterations** | 200,000 (OWASP 2024 minimum) |
| **Salt** | 16 bytes, cryptographically random, per vault |
| **IV/Nonce** | 12 bytes, random per encryption |
| **Auth Tag** | 16 bytes (GCM integrity) |
| **File Format** | JSON envelope: `{ salt, iv, tag, data }` (hex-encoded) |

### Storage Locations (Platform-Native, Hidden)
| OS | Vault Path | Permissions |
|----|------------|-------------|
| **Windows** | `%LOCALAPPDATA%\Bastion\vault.enc` | ACL-protected |
| **macOS** | `~/Library/Application Support/Bastion/vault.enc` | 0700 / 0600 |
| **Linux** | `~/.local/share/bastion/vault.enc` | 0700 / 0600 |

### Export File Security
- Written with **0600 permissions** (owner read/write only)
- Directory created with **0700 permissions**
- Contains plaintext — **store securely, delete after use**

### Threat Model & Mitigations
| Threat | Mitigation |
|--------|------------|
| Shell history capture | Raw TTY mode, no echo, no history |
| Terminal scrollback | ANSI clear (`\x1b[3J`) on exit & transitions |
| Log file leakage | Zero logging in codebase |
| Full hash to HIBP | k-anonymity: only 5-char SHA-1 prefix |
| Memory dump post-exit | `process.on('exit')` zeroes all tracked buffers |
| Shoulder surfing | Bullet-masked input, Tab to peek (never default) |
| Swap/disk persistence | Vault key never written to disk; only encrypted envelope |
| Timing attacks | Constant-time comparison via GCM auth tag |

---

## ✅ NIST SP 800-63B Rev. 4 Compliance

| Requirement | Bastion Implementation |
|-------------|------------------------|
| **Min length: 8 chars** | Hard rejection — throws if `< 8` |
| **Max length: 64+ chars** | Supported (tested to 128+) |
| **Recommended: 15+ chars** | Dashboard warning if `< 15` |
| **No composition rules** | Not enforced (NIST discourages) |
| **Blocklist screening** | HIBP k-anonymity breach check |
| **No truncation** | Full password used for entropy |
| **Unicode support** | Full UTF-8 in analysis & vault |
| **Rate limiting (online)** | N/A — fully offline by default |

---

## ⌨️ Complete Keyboard Reference

### Global
| Key | Action |
|-----|--------|
| `Ctrl+C` | Exit / cancel current operation |
| `Escape` | Back / cancel |

### Main Menu
| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate options |
| `1` / `2` / `3` | Quick-select |
| `Enter` | Confirm selection |

### Audit Input
| Key | Action |
|-----|--------|
| `Tab` | Toggle password visibility |
| `Enter` | Submit for analysis |
| `Backspace` | Delete character |
| `Ctrl+U` | Clear line |
| `Ctrl+W` | Delete word |

### Stronghold List
| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate entries |
| `Enter` | View entry details |
| `A` | Add new entry |
| `X` | Export all to Documents |
| `B` / `Escape` | Back to main menu |

### Entry View
| Key | Action |
|-----|--------|
| `Tab` | Show/hide password |
| `E` | Edit entry (service, username, password) |
| `D` | Delete entry (with `Y` confirmation) |
| `B` / `Escape` | Back to list |

### Vault Entry Form (3 Steps)
| Key | Action |
|-----|--------|
| `Tab` | Toggle visibility (Step 3: password) |
| `Enter` | Next step / submit |
| `Escape` | Cancel, return to list |

### Uninstall Flow
| Key | Action |
|-----|--------|
| `↑` / `↓` / `1-3` | Navigate options |
| `Enter` | Confirm selection |
| `Y` | Confirm deletion (when prompted) |

---

## 🛠️ CI/CD Integration Examples

### GitHub Actions
```yaml
# .github/workflows/password-policy.yml
name: Password Policy Check
on: [push, pull_request]
jobs:
  check-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g bastion-cli  # or install from your registry
      - name: Scan for hardcoded passwords
        run: |
          # Example: grep for password patterns and pipe to bastion
          grep -r "password\s*=" --include="*.js" --include="*.ts" . \
            | sed 's/.*= *["\']\?\([^"\']*\)["\']\?.*/\1/' \
            | sort -u \
            | while read pwd; do
                echo "Testing: $pwd"
                echo "$pwd" | bastion --skip-breach | grep -q "CRITICAL" && exit 1
              done
```

### GitLab CI
```yaml
# .gitlab-ci.yml
password_audit:
  stage: security
  image: node:20
  script:
    - npm install -g bastion-cli
    - echo "$DEPLOY_PASSWORD" | bastion --skip-breach || exit 1
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

### Pre-commit Hook (Husky)
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "echo \"$STAGED_PASSWORD\" | bastion --skip-breach | grep -q CRITICAL && exit 1 || true"
    }
  }
}
```

---

## 📦 Installation Methods

| Method | Command | Best For |
|--------|---------|----------|
| **Source (dev)** | `git clone → npm i → npm run build → npm link` | Contributors, latest features |
| **npm (future)** | `npm install -g bastion-cli` | End users (when published) |
| **npx (one-off)** | `npx bastion-cli` | Quick audit without install |

> **Note:** The `bastion-cli` npm package name is currently held by a different SSH tool. Install from source until we secure the name.

---

## 🔧 Configuration

Bastion is **zero-config by design**. All behavior is controlled via CLI flags:

| Flag | Description |
|------|-------------|
| `--skip-breach` | Disable HIBP check (fully offline) |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |
| `uninstall` | Interactive uninstall flow |

No config files, no environment variables, no dotfiles. Run `bastion --help` for the full list.

---

## 🐛 Troubleshooting

### "Command not found: bastion"
```bash
# Ensure npm global bin is in PATH
export PATH="$(npm bin -g):$PATH"
# Or reinstall
npm link
```

### "Error: Uninstall requires an interactive terminal (TTY)"
```bash
# Run directly in terminal, not via script/pipe
bastion uninstall
# NOT: echo "y" | bastion uninstall
```

### "Error: No entries to export"
```bash
# Add entries first via Stronghold → [A] Add Entry
# Then press [X] to export
```

### "Error: Password must be at least 8 characters"
```bash
# NIST SP 800-63B requires minimum 8 characters
# Use a longer password or passphrase
```

### Colors not showing / garbled output
```bash
# Force color output
export FORCE_COLOR=1
bastion
# Or check TERM
echo $TERM  # Should be xterm-256color or similar
```

### Vault corruption / can't decrypt
```bash
# Wrong master passcode — try again
# If truly corrupted: bastion uninstall → export → re-create
# No backdoor exists; this is by design
```

---

## ❓ FAQ

**Q: Is my vault compatible across OSes?**
A: Yes. The vault file format is identical. Copy `vault.enc` to the new OS's vault path.

**Q: Can I sync my vault via Dropbox/Git/rsync?**
A: Yes — the encrypted file is safe to sync. But remember: **whoever has the file + your master passcode has your passwords.**

**Q: What if I forget my master passcode?**
A: **There is no recovery.** The encryption key is derived solely from your passcode. No backdoor, no hint, no reset. This is a feature.

**Q: Does Bastion phone home?**
A: **Never.** Only optional HIBP breach check sends a 5-char SHA-1 prefix. Use `--skip-breach` for 100% offline.

**Q: Can I use Bastion in a Docker container?**
A: Yes. `docker run -it --rm -v bastion-data:/root/.local/share/bastion node:20 npx bastion-cli`

**Q: How do I backup my vault?**
A: Two ways:
1. **Encrypted:** Copy `vault.enc` + remember master passcode
2. **Plaintext:** In Stronghold, press `[X]` → exports to `~/Documents/bastion_vault_export.txt` (⚠️ store securely!)

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        bastion CLI                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   Entry     │  │   Analyzer   │  │      Vault         │  │
│  │   Point     │──│  (zxcvbn +   │──│  (AES-256-GCM +    │  │
│  │  (cli.tsx)  │  │   patterns)  │  │   PBKDF2)          │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│         │                │                   │              │
│         ▼                ▼                   ▼              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │   Ink/React │  │   HIBP k-    │  │   Platform-native  │  │
│  │   TUI       │  │   anonymity  │  │   secure storage   │  │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Module Map
| File | Responsibility |
|------|----------------|
| `src/cli.tsx` | Entry point, state machine, all UI components |
| `src/analyzer.ts` | Password analysis, zxcvbn, patterns, breach check |
| `src/vault.ts` | Encryption, vault CRUD, session management, export |
| `src/utils.ts` | Secure input, memory wiping, screen clearing |

---

## 🤝 Contributing

### Development Setup
```bash
git clone https://github.com/CalebEJ-3510/bastion.git
cd bastion
npm install

# Run in dev mode (TypeScript via tsx, hot reload)
npm run dev

# Type-check only (fast)
npm run lint

# Build for production
npm run build
```

### Code Standards
- **TypeScript strict mode** — `npm run lint` must pass
- **ESM only** — use `.js` extensions in imports
- **Ink 7 + React 19** — functional components, hooks
- **Security first** — all sensitive data via `trackSensitive()` / `wipeSensitiveMemory()`

### PR Checklist
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Manual test: `echo "test" | node dist/cli.js --skip-breach`
- [ ] Manual test: `node dist/cli.js` (interactive TUI)
- [ ] No secrets in diff
- [ ] Updated relevant docs

---

## 📄 License

MIT License — see [LICENSE](LICENSE).

```
MIT License

Copyright (c) 2024 Bastion Security Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgments

- **[zxcvbn](https://github.com/dropbox/zxcvbn)** — Dropbox's password strength estimator
- **[@zxcvbn-ts/core](https://www.npmjs.com/package/@zxcvbn-ts/core)** — TypeScript port
- **[HIBP Pwned Passwords](https://haveibeenpwned.com/Passwords)** — Troy Hunt's breach database
- **[Ink](https://github.com/vadimdemedes/ink)** — React for CLIs
- **[NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html)** — Digital identity guidelines

---

<div align="center">

**Built with 🔒 for security-conscious developers**

**Local. Offline. Zero trust. Your data, your machine, your rules.**

[⬆ Back to Top](#bastion-cli)

</div>
