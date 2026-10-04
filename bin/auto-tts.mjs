#!/usr/bin/env node
/*
 * auto-tts command line entry point.
 *
 * `auto-tts web` is the one command a user needs: it prepares a private Python
 * environment on first run, installs the backend dependencies into it, then
 * serves the API and the bundled frontend from a single port.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = resolve(HERE, '..')
const BACKEND_DIR = join(PACKAGE_ROOT, 'backend')
const FRONTEND_DIST = join(PACKAGE_ROOT, 'frontend', 'dist')
const REQUIREMENTS = join(BACKEND_DIR, 'requirements.txt')

const STATE_HOME = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
const STATE_DIR = join(STATE_HOME, 'auto-tts')
const VENV_DIR = join(STATE_DIR, 'venv')
const VENV_PYTHON = join(VENV_DIR, 'bin', 'python')
const DATA_DIR = join(STATE_DIR, 'data')

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 8000

function usage() {
  process.stdout.write(`auto-tts — unlimited text to speech

Usage
  auto-tts web [options]     start the web UI and open it in your browser
  auto-tts --help            show this message
  auto-tts --version         show the version

Options for "web"
  --port <number>            port to listen on (default ${DEFAULT_PORT})
  --host <address>           address to bind (default ${DEFAULT_HOST})
  --no-open                  do not open a browser window
  --reset                    rebuild the Python environment before starting
`)
}

function fail(message) {
  process.stderr.write(`auto-tts: ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = {
    command: 'web',
    host: process.env.AUTO_TTS_HOST || DEFAULT_HOST,
    port: Number(process.env.AUTO_TTS_PORT || DEFAULT_PORT),
    open: true,
    reset: false,
  }

  const rest = [...argv]
  if (rest.length > 0 && !rest[0].startsWith('-')) {
    options.command = rest.shift()
  }

  while (rest.length > 0) {
    const arg = rest.shift()
    switch (arg) {
      case '--port':
        options.port = Number(rest.shift())
        break
      case '--host':
        options.host = rest.shift()
        break
      case '--no-open':
        options.open = false
        break
      case '--reset':
        options.reset = true
        break
      case '-h':
      case '--help':
        options.command = 'help'
        break
      case '-v':
      case '--version':
        options.command = 'version'
        break
      default:
        fail(`unknown option "${arg}" (try "auto-tts --help")`)
    }
  }

  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    fail(`invalid port "${options.port}"`)
  }
  return options
}

/** Find a usable Python 3 interpreter, newest naming first. */
function findPython() {
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
    })
    if (probe.status === 0 && probe.stdout.trim() === '3') {
      return candidate
    }
  }
  fail('Python 3 is required but was not found on PATH. Install it, then run this command again.')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  return result.status === 0
}

/**
 * The dependency set is considered current when the recorded hash of
 * requirements.txt matches and every package still imports.
 */
function pythonEnvIsReady() {
  if (!existsSync(VENV_PYTHON)) return false

  const stampPath = join(STATE_DIR, 'requirements.sha256')
  const expected = createHash('sha256').update(readFileSync(REQUIREMENTS)).digest('hex')
  if (!existsSync(stampPath) || readFileSync(stampPath, 'utf8').trim() !== expected) return false

  const probe = spawnSync(
    VENV_PYTHON,
    ['-c', 'import edge_tts, fastapi, uvicorn'],
    { stdio: 'ignore' },
  )
  return probe.status === 0
}

function createPythonEnv() {
  mkdirSync(STATE_DIR, { recursive: true })
  process.stdout.write('==> Setting up the Python environment (first run only)\n')

  if (!run(findPython(), ['-m', 'venv', VENV_DIR])) {
    fail(
      'could not create a Python virtualenv. On Debian or Ubuntu install python3-venv, then retry.',
    )
  }
}

function installPythonDeps() {
  process.stdout.write('==> Installing Python dependencies\n')
  run(VENV_PYTHON, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip'])
  if (!run(VENV_PYTHON, ['-m', 'pip', 'install', '--quiet', '-r', REQUIREMENTS])) {
    fail('could not install the Python dependencies (check your network connection).')
  }
  const digest = createHash('sha256').update(readFileSync(REQUIREMENTS)).digest('hex')
  writeFileSync(join(STATE_DIR, 'requirements.sha256'), `${digest}\n`)
}

function isPortFree(host, port) {
  const script = [
    'import socket, sys',
    'sock = socket.socket()',
    'sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)',
    'try:',
    '    sock.bind((sys.argv[1], int(sys.argv[2])))',
    'except OSError:',
    '    sys.exit(1)',
    'finally:',
    '    sock.close()',
  ].join('\n')
  return spawnSync(VENV_PYTHON, ['-c', script, host, String(port)]).status === 0
}

/** Candidate opener commands for the current platform, most preferred first. */
function browserCandidates(url) {
  if (process.platform === 'darwin') {
    return [['open', [url]]]
  }
  if (process.platform === 'win32') {
    return [['cmd', ['/c', 'start', '', url]]]
  }
  // Linux. Under WSL xdg-open usually is not installed, so prefer the helpers
  // that bridge to the Windows host.
  const candidates = []
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    candidates.push(['wslview', [url]], ['cmd.exe', ['/c', 'start', '', url]])
  }
  candidates.push(['xdg-open', [url]], ['gio', ['open', url]], ['sensible-browser', [url]])
  return candidates
}

/** Resolve true when the command actually started, false when it is missing. */
function tryOpen(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore', detached: true })
    child.once('error', () => resolve(false))
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
}

async function openBrowser(url) {
  for (const [command, args] of browserCandidates(url)) {
    if (await tryOpen(command, args)) return true
  }
  return false
}

/** Wait until something accepts TCP connections on the given address. */
function waitForServer(host, port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) resolve(false)
        else setTimeout(attempt, 120)
      })
    }
    attempt()
  })
}

async function startWeb(options) {
  if (!existsSync(join(FRONTEND_DIST, 'index.html'))) {
    fail('the bundled frontend is missing. Reinstall the package, or run npm run build in the repo.')
  }

  if (options.reset && existsSync(VENV_DIR)) {
    process.stdout.write('==> Resetting the Python environment\n')
    run('rm', ['-rf', VENV_DIR])
  }

  if (!existsSync(VENV_PYTHON)) createPythonEnv()
  if (!pythonEnvIsReady()) installPythonDeps()

  if (!isPortFree(options.host, options.port)) {
    process.stderr.write(
      `auto-tts: port ${options.port} is already in use.\n` +
      `  If auto-tts is already running, open http://${options.host}:${options.port}\n` +
      `  Otherwise stop the process holding it, or pass --port <number>.\n`,
    )
    process.exit(1)
  }

  const url = `http://${options.host}:${options.port}`

  // The package directory is treated as read-only, so both the generated audio
  // and the frontend location are handed to the server explicitly. Warnings
  // still surface, but uvicorn's startup banner and access log stay hidden so
  // the only thing a user normally sees is the address below.
  const server = spawn(
    VENV_PYTHON,
    [
      '-m',
      'uvicorn',
      'app.main:app',
      '--app-dir',
      BACKEND_DIR,
      '--host',
      options.host,
      '--port',
      String(options.port),
      '--log-level',
      'warning',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        AUTO_TTS_DATA_DIR: DATA_DIR,
        AUTO_TTS_FRONTEND_DIST: FRONTEND_DIST,
      },
    },
  )

  const shutdown = (signal) => {
    server.kill(signal)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  server.on('exit', (code) => process.exit(code ?? 0))

  // Open the page only once the port actually answers, so the browser never
  // races the server and lands on a connection error.
  if (options.open && (await waitForServer(options.host, options.port))) {
    if (!(await openBrowser(url))) {
      process.stderr.write(`auto-tts: could not open a browser — visit ${url}\n`)
    }
  }

  process.stdout.write(`${url}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  switch (options.command) {
    case 'web':
    case 'serve':
    case 'start':
      await startWeb(options)
      break
    case 'help':
      usage()
      break
    case 'version': {
      const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'))
      process.stdout.write(`${manifest.version}\n`)
      break
    }
    default:
      usage()
      fail(`unknown command "${options.command}"`)
  }
}

main().catch((error) => fail(error.message))