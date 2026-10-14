I'll start by looking at how the Flight Log is opened today, since the new command has to share it with `fly file` and the two must not step on each other when several Sessions send at once. The relevant code is the `withFlightLog` helper, which opens the database, runs one function and closes it again, so each command holds the database only for as long as it needs to. That keeps the window for contention small, and SQLite's busy timeout covers the rest.

The helper looks like this, and it is the only place that opens the database:

```ts
async function withFlightLog<T>(deps: Deps, fn: (log: FlightLog) => Promise<T>): Promise<T> {
  const log = FlightLog.open(dataDir(deps.env));
  try {
    return await fn(log);
  } finally {
    log.close();
  }
}
```

Because it always closes the log, even when the function throws, a failed upload can't leave the database locked for the next process. That matters for retries, which will often run straight after a failure, perhaps from a different Session that has been waiting on the same lock for a few seconds.

So the plan for the new command is simple. It reads the transcript, picks the Reply, works out the Session Title and then hands everything to the same sending path that `fly file` uses. The Flight Log gains nothing new except the Session fields, which were already in the schema from the previous ticket, so no migration is needed. I'll write the first failing test now, starting with the most common case: a Session whose last Reply is long enough to send on its own, and whose host has already given it a title that we can use without asking the user for one. After that I'll cover the case where the user has to supply a title themselves, and then the error paths, one test at a time, so that each new behaviour is driven by a test that failed first.