import net from 'node:net'

/**
 * Neon resolves to both A and AAAA records, and a network without working IPv6
 * fails those instantly. Node then falls back to the IPv4 addresses but gives
 * each one only 250ms, which is less than the round trip to us-east-2 — so
 * every address loses its race and the connection reports ETIMEDOUT as though
 * the database were down. Two seconds is patient enough for a real connection
 * and still gives up quickly when nothing is listening.
 *
 * Its own module because two different clients need it: postgres.js for the
 * app's tables, and the checkpointer's `pg.Pool` for its own. The setting is
 * process-wide, so whichever imports first covers both — but both import it,
 * because a file that opens a socket should not rely on another one having
 * been loaded.
 */
net.setDefaultAutoSelectFamilyAttemptTimeout?.(2000)
