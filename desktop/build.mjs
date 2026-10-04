#!/usr/bin/env node
/*
 * Build the auto-tts desktop application.
 *
 * Steps: build the frontend, prepare a private build virtualenv, install the
 * packaging dependencies into it, then freeze the launcher with PyInstaller.
 * The result is a runnable directory under desktop/dist/auto-tts.
 *
 * PyInstaller is not a cross-compiler: run this on the platform you are
 * targeting, or let the desktop GitHub Actions workflow do it per platform.
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const VENV_DIR = join(HERE, '.venv')
const REQUIREMENTS = join(HERE, 'requirements.txt')
const SPEC = join(HERE, 'auto-tts.spec')
const DIST_DIR = join(HERE, 'dist')
const WORK_DIR = join(HERE, 'build')

const IS_WINDOWS = process.platform === 'win32'
const VENV_PYTHON = IS_WINDOWS
  ? join(VENV_DIR, 'Scripts', 'python.exe')
  : join(VENV_DIR, 'bin', 'python')

function fail(message) {
  process.stderr.write(`auto-tts: ${message}\n`)
  process.exit(1)
}

function run(command, args) {
  process.stdout.write(`==> ${command} ${args.join(' ')}\n`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: IS_WINDOWS,
  })
  if (result.status !== 0) {
    fail(`command failed: ${command} ${args.join(' ')}`)
  }
}

/** Find a Python 3 interpreter, newest naming first. */
function findPython() {
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
      shell: IS_WINDOWS,
    })
    if (probe.status === 0 && probe.stdout.trim() === '3') return candidate
  }
  fail('Python 3 is required to build the desktop application.')
}

function main() {
  if (!existsSync(join(ROOT, 'frontend', 'dist', 'index.html'))) {
    // The desktop bundle embeds the built frontend, so it must exist first.
    run('npm', ['--prefix', 'frontend', 'run', 'build'])
  }

  if (!existsSync(VENV_PYTHON)) {
    run(findPython(), ['-m', 'venv', VENV_DIR])
  }

  run(VENV_PYTHON, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'])
  run(VENV_PYTHON, ['-m', 'pip', 'install', '--quiet', '-r', REQUIREMENTS])

  run(VENV_PYTHON, [
    '-m',
    'PyInstaller',
    SPEC,
    '--noconfirm',
    '--distpath',
    DIST_DIR,
    '--workpath',
    WORK_DIR,
  ])

  process.stdout.write(`\nBuilt ${join(DIST_DIR, 'auto-tts')}\n`)
}

main()