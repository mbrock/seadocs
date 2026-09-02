// Request descriptions shared by the interest grid and board.

/** Who asked for a pair, in words. */
export function askedBy(dm: boolean, team: boolean): string {
  return dm && team ? 'both asked' : dm ? 'decision maker asked' : team ? 'team asked' : 'nobody asked'
}
