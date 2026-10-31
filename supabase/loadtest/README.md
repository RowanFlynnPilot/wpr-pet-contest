# The live tally under load

The live tally (`round_tally`, migration 0025) is a cache that triggers on
`votes` and `free_votes` keep. Every open pet and gallery page reads it every
20 seconds; `close_round` never trusts it. These scripts check that it holds
when everything happens at once.

`run.sh` sets up one contest with an open Open Round, 400 pets and a vote pack
(`setup.sql`). Then pgbench runs 24 clients for 60 seconds, each picking at
random:

| Script | Weight | What it does |
| --- | --- | --- |
| `write.sql` | 6 | A checkout, then its webhook (`create_pending_vote`, `confirm_vote`) |
| `refund.sql` | 1 | A refund of a paid pack (`refund_vote`) |
| `free.sql` | 2 | A free vote from a new verified address |
| `read.sql` | 11 | The page poll (`entry_round_totals`) |

`check.sql` then counts what landed and compares the cache with the vote
tables row by row, the same comparison as `contest_health`'s `tally_drift`. A
single drifted row, or any pgbench error (a deadlock included), fails the run.
It also times the poll from the cache against summing the vote tables.

That is hundreds of writes a second, far above a closing night, where a busy
minute might bring a few packs a second.

## Where it runs

- **CI** (`.github/workflows/tally-load.yml`): on any pull request that
  touches a migration or these scripts, against the CI's local stack. No
  secrets. The job summary shows the throughput, the latencies, the counts
  and the drift.
- **Staging**: the same scripts against a throwaway copy of the staging
  database, for numbers on the hosted hardware. They write votes, so never
  point them at production.

  ```
  DB_URL='postgresql://postgres:<password>@db.<staging-ref>.supabase.co:5432/postgres' bash supabase/loadtest/run.sh
  ```

  Afterward, delete the test contest (year 2199) and its rows, or reset the
  copy.
