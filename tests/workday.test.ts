import test from 'node:test'
import assert from 'node:assert/strict'
import { workdayGun } from '../src/readers.ts'

const simdi = new Date('2026-09-04T12:00:00Z')

test('Workday postedOn → ISO date (English)', () => {
  assert.equal(workdayGun('Posted Today', simdi), '2026-09-04')
  assert.equal(workdayGun('Posted Yesterday', simdi), '2026-09-03')
  assert.equal(workdayGun('Posted 3 Days Ago', simdi), '2026-09-01')
  assert.equal(workdayGun('Posted 30+ Days Ago', simdi), undefined)
})

test('Workday postedOn → ISO date (German)', () => {
  assert.equal(workdayGun('Heute ausgeschrieben', simdi), '2026-09-04')
  assert.equal(workdayGun('Gestern ausgeschrieben', simdi), '2026-09-03')
  assert.equal(workdayGun('Vor 12 Tagen ausgeschrieben', simdi), '2026-08-23')
  assert.equal(workdayGun('Vor 30+ Tagen ausgeschrieben', simdi), undefined)
})

test('Workday postedOn: empty or unknown text', () => {
  assert.equal(workdayGun(undefined, simdi), undefined)
  assert.equal(workdayGun('', simdi), undefined)
  assert.equal(workdayGun('Posted', simdi), undefined)
})
