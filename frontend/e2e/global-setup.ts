import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKEND_PORT, BACKEND_URL, DATA_DIR } from '../playwright.config'

const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(DIRNAME, '../..')
const BACKEND_DIR = path.join(ROOT, 'backend')
// `PATRIMOINE_E2E_PYTHON` (CI, `.github/workflows/ci.yml`) : le runner installe les
// dépendances directement sur le Python du système (`pip install -r
// requirements-dev.txt`, comme le job `backend` existant), sans venv à localiser —
// repli sur le venv local Windows du poste de développement sinon.
const PYTHON = process.env.PATRIMOINE_E2E_PYTHON || path.join(BACKEND_DIR, 'venv', 'Scripts', 'python.exe')
const DB_PATH = path.join(DATA_DIR, 'e2e.db')
export const SEED_OUTPUT_PATH = path.join(DATA_DIR, 'seed-output.json')
const BACKEND_LOG_PATH = path.join(DATA_DIR, 'backend.log')

// Clé Fernet valide (`Fernet.generate_key()`) mais purement jetable : sert
// uniquement à faire fonctionner les fonctionnalités qui exigent
// `PATRIMOINE_SECRET_KEY` (SSO, sauvegarde chiffrée) sur la base E2E jetable — jamais
// un secret réel, jamais réutilisée ailleurs.
const CLE_CHIFFREMENT_E2E = 'OfybzhNjyez8CvQDuhU2wWq8GCVRHvtqNEhKiqnhy7E='

async function attendrePret(url: string, timeoutMs: number): Promise<void> {
  const debut = Date.now()
  while (Date.now() - debut < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // pas encore prêt — on continue de sonder
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Backend E2E indisponible après ${timeoutMs}ms (${url})`)
}

/** Démarre le backend E2E (base SQLite jetable, isolée de la vraie base de
 * l'utilisateur) puis le seed via `backend/scripts/seed_e2e.py` (lui-même appuyé
 * sur le vrai backend HTTP — cf. sa docstring). Renvoie une fonction de teardown
 * (mécanisme Playwright officiel : évite un fichier `global-teardown.ts` séparé et
 * la persistance d'un PID sur disque pour s'y référer, `proc` reste capturé dans la
 * fermeture). */
export default async function globalSetup(): Promise<() => Promise<void>> {
  rmSync(DATA_DIR, { recursive: true, force: true })
  mkdirSync(DATA_DIR, { recursive: true })

  const logFd = openSync(BACKEND_LOG_PATH, 'a')
  const proc: ChildProcess = spawn(
    PYTHON,
    ['-m', 'uvicorn', 'app.main:app', '--port', String(BACKEND_PORT), '--app-dir', '.'],
    {
      cwd: BACKEND_DIR,
      env: {
        ...process.env,
        PATRIMOINE_DB: DB_PATH,
        PATRIMOINE_SECRET_KEY: CLE_CHIFFREMENT_E2E,
        PATRIMOINE_TESTING: '1',
      },
      stdio: ['ignore', logFd, logFd],
    },
  )

  try {
    await attendrePret(`${BACKEND_URL}/docs`, 30_000)
  } catch (err) {
    proc.kill()
    throw new Error(`${(err as Error).message} — voir ${BACKEND_LOG_PATH}`)
  }

  const seed = spawnSync(
    PYTHON,
    ['scripts/seed_e2e.py', '--base-url', BACKEND_URL, '--db', DB_PATH, '--out', SEED_OUTPUT_PATH],
    { cwd: BACKEND_DIR, encoding: 'utf-8' },
  )
  if (seed.status !== 0) {
    proc.kill()
    throw new Error(`Échec du seed E2E (backend/scripts/seed_e2e.py) :\n${seed.stdout}\n${seed.stderr}`)
  }
  if (!existsSync(SEED_OUTPUT_PATH)) {
    proc.kill()
    throw new Error(`Le seed E2E s'est terminé sans écrire ${SEED_OUTPUT_PATH}`)
  }

  return async () => {
    proc.kill()
  }
}
