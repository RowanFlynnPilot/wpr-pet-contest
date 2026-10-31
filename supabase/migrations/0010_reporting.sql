-- Public aggregates that sell votes, and the admin reports that settle up.
--
-- Public views are security definer on purpose, like entry_round_totals: they
-- read `votes`, which anon can never touch, and expose only sums and counts.
-- No view granted to anon may carry a buyer or owner identity. The access
-- tests pin the column list of each.


-- ------------------------------------------------------------------ public --

-- The "raised for shelters" counter. Social proof that also carries the
-- mission: every vote visibly moves it.
create view contest_stats as
  select c.id as contest_id,
         c.year,
         c.beneficiary_split_pct,
         (select count(*) from entries e
          where e.contest_id = c.id and e.status = 'approved')::int as entries,
         coalesce(sum(v.quantity), 0)::int                          as votes,
         coalesce(sum(v.amount_cents), 0)::bigint                   as gross_cents,
         (coalesce(sum(v.amount_cents), 0) * c.beneficiary_split_pct / 100)::bigint as shelter_cents
  from contests c
  left join rounds r on r.contest_id = c.id
  left join votes v  on v.round_id = r.id and v.status = 'succeeded'
  where c.status <> 'draft'
  group by c.id;


-- Anonymous purchase ticker: "25 votes for Biscuit, 2 minutes ago". Pet, size,
-- time. Never who.
create view recent_activity as
  select v.round_id,
         v.entry_id,
         v.quantity         as votes,
         v.bonus_multiplier,
         v.confirmed_at
  from votes v
  where v.status = 'succeeded';


-- Best Dog / Best Cat / Best Other, off round 1 totals, once round 1 resolves.
-- Same tiebreak as seeding: earliest submission.
create view side_awards as
  select distinct on (e.contest_id, e.species)
         e.contest_id,
         e.species,
         e.id       as entry_id,
         e.pet_name,
         coalesce(t.votes, 0) as votes
  from entries e
  join rounds r
    on r.contest_id = e.contest_id and r.seq = 1 and r.status = 'resolved'
  left join entry_round_totals t
    on t.entry_id = e.id and t.round_id = r.id
  where e.status = 'approved'
  order by e.contest_id, e.species, coalesce(t.votes, 0) desc, e.created_at asc;


-- ------------------------------------------------------------------- admin --
-- security_invoker: these resolve through RLS on `votes`, i.e. admins only.

create view round_revenue with (security_invoker = true) as
  select r.contest_id,
         r.id  as round_id,
         r.seq,
         r.status,
         count(v.id)             filter (where v.status = 'succeeded')::int as purchases,
         coalesce(sum(v.quantity)     filter (where v.status = 'succeeded'), 0)::int    as votes,
         coalesce(sum(v.amount_cents) filter (where v.status = 'succeeded'), 0)::bigint as gross_cents,
         count(distinct v.buyer_email) filter (where v.status = 'succeeded')::int       as buyers,
         -- Abandoned checkouts mostly. A high number is a checkout UX problem.
         count(v.id)             filter (where v.status = 'pending')::int as pending,
         count(v.id)             filter (where v.status in ('refunded', 'late', 'disputed'))::int as reversed,
         coalesce(sum(v.amount_cents) filter (where v.status in ('refunded', 'late', 'disputed')), 0)::bigint as reversed_cents
  from rounds r
  left join votes v on v.round_id = r.id
  group by r.id;


-- Which packs sell. The case for adding (or dropping) a tier next year.
create view pack_revenue with (security_invoker = true) as
  select r.contest_id,
         v.pack_slug,
         count(*)::int                 as purchases,
         sum(v.quantity)::int          as votes,
         sum(v.amount_cents)::bigint   as gross_cents
  from votes v
  join rounds r on r.id = v.round_id
  where v.status = 'succeeded'
  group by r.contest_id, v.pack_slug;


-- Money raised behind each pet, across all rounds. Also the list of families
-- worth thanking by name in the wrap-up story (with their permission).
create view entry_revenue with (security_invoker = true) as
  select e.contest_id,
         e.id       as entry_id,
         e.pet_name,
         coalesce(sum(v.amount_cents), 0)::bigint as gross_cents,
         coalesce(sum(v.quantity), 0)::int        as votes
  from entries e
  left join votes v on v.entry_id = e.id and v.status = 'succeeded'
  where e.status = 'approved'
  group by e.id;


-- Opt-ins from both entry and checkout, one row per address. Export to the
-- newsletter platform; never pre-checked, so every row is a real yes.
create view newsletter_signups with (security_invoker = true) as
  select s.contest_id,
         s.email,
         min(s.first_seen)                                  as first_seen,
         string_agg(distinct s.source, ', ' order by s.source) as sources
  from (
    select e.contest_id, e.owner_email as email, e.created_at as first_seen, 'entry' as source
    from entries e
    where e.newsletter_opt_in
    union all
    select r.contest_id, v.buyer_email, v.created_at, 'vote pack'
    from votes v
    join rounds r on r.id = v.round_id
    where v.newsletter_opt_in and v.status = 'succeeded'
  ) s
  group by s.contest_id, s.email;


grant select on contest_stats, recent_activity, side_awards to anon, authenticated, service_role;
grant select on round_revenue, pack_revenue, entry_revenue, newsletter_signups to authenticated, service_role;
