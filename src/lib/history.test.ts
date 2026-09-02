import { expect, test } from 'vitest'
import { commit, initialHistory, redo, undo } from './history'

test('commit, undo, redo', () => {
  let h = initialHistory(1)
  h = commit(h, 2)
  h = commit(h, 3)
  expect(h.present).toBe(3)
  h = undo(h)
  expect(h.present).toBe(2)
  h = redo(h)
  expect(h.present).toBe(3)
  h = undo(undo(undo(h)))
  expect(h.present).toBe(1)
  h = commit(redo(h), 9) // a new commit drops the redo branch
  expect(h.present).toBe(9)
  expect(h.future).toEqual([])
  expect(undo(h).present).toBe(2)
})

test('committing the same object is a no-op', () => {
  const h = initialHistory({ a: 1 })
  expect(commit(h, h.present)).toBe(h)
})
