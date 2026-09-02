// Request descriptions shared by the interest grid and board.

import type { Asked } from './project'

/** Who asked for a pair, in words. */
export function askedBy({ dm, team }: Asked): string {
  return dm && team ? 'both asked' : dm ? 'decision maker asked' : team ? 'team asked' : 'nobody asked'
}
