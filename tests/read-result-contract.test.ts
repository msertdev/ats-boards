import assert from 'node:assert/strict'
import test from 'node:test'
import { readJobBoard } from '../src/index.ts'

const originalFetch = globalThis.fetch

async function withFetch(
  replacement: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  globalThis.fetch = replacement
  try {
    await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

test('404 means an absent board, not a transport failure', async () => {
  await withFetch(
    async () => new Response('missing', { status: 404 }),
    async () => {
      assert.deepEqual(await readJobBoard('greenhouse', 'missing'), {
        ok: true,
        postings: [],
      })
    },
  )
})

test('429 is exposed as a rate-limit result', async () => {
  await withFetch(
    async () => new Response('slow down', { status: 429 }),
    async () => {
      const result = await readJobBoard('greenhouse', 'limited')
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.reason, 'rate_limit')
    },
  )
})

test('an unexpected provider payload is exposed as a format result', async () => {
  await withFetch(
    async () => Response.json([]),
    async () => {
      const result = await readJobBoard('greenhouse', 'changed')
      assert.equal(result.ok, false)
      if (!result.ok) assert.equal(result.reason, 'format')
    },
  )
})

test('network failures are exposed as access results', async () => {
  await withFetch(
    async () => {
      throw new TypeError('network unavailable')
    },
    async () => {
      const result = await readJobBoard('greenhouse', 'offline')
      assert.deepEqual(result, {
        ok: false,
        reason: 'access',
        message: 'network unavailable',
      })
    },
  )
})
