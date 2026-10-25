-- A refund of a paid pack, as the webhook makes it. Two clients may pick the
-- same pack; the second refund is a no-op, as in production.
select refund_vote(stripe_payment_intent_id)
from votes
where round_id = '10ad0000-0000-0000-0000-0000000000a1' and status = 'succeeded'
order by random()
limit 1;
