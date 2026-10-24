# An optional gift at checkout: questions for the accountant

**To:** WPR's accountant · **From:** the WPR newsroom · **Date:** Oct. 23, 2026
**Status:** Proposal only. Nothing is built; all wording is DRAFT. Mockup: `mockup.html` in this folder.

## What's proposed

Readers vote in WPR's pet contest by buying **vote packs** ($5 to $250). Buyers get votes in return, so a pack is a purchase, labeled "not tax-deductible" and never called a donation. A published share of pack sales after refunds (30% in the mockup) goes to the partner shelter, Moments Foster Care, also a nonprofit. WPR's own link for tax-deductible gifts already appears separately, after checkout.

The idea is an **optional gift** added on top of a pack at checkout: $5, $10, $25 or another amount, with "No thanks" as the default. The gift buys no votes and is listed on its own line, so only the gift is presented as deductible. Over $75, the receipt would state the value of the votes. The gift could go to WPR or to Moments; that is not decided.

Example: Fan pack, 25 votes, $20 (not tax-deductible) + gift $10 = one card payment of $30.

## Draft receipt language

> **Vote pack:** 25 votes for Biscuit, $20.00. You received votes, so this is a purchase, not a donation. It is not tax-deductible.
> **Gift to [Wausau Pilot & Review]:** $10.00. Tax-deductible to the extent allowed by law. It bought no votes.

**Payment of $75 or less:** "[WPR is a 501(c)(3) nonprofit, EIN 00-0000000.] We received your gift of $10.00 on [date]. Your $20.00 vote pack was a separate purchase. No goods or services were provided in exchange for your gift."

**Payment over $75** ($50 pack + $50 gift): "Your payment of $100.00 on [date] included a gift of $50.00 and a vote pack of 75 votes. The amount of your payment that is deductible for federal income tax purposes is limited to the amount you paid over the value of the goods or services WPR provided. Our good-faith estimate of that value is $50.00, the vote pack's price."

If Moments receives the gift, the text says WPR received it on Moments' behalf. Each receipt keeps a spot for any state-required disclosure.

## Questions for you

1. **Which organization receives the gift?** If Moments, can WPR collect it through its own Stripe account and pass it on, or should Moments receive it directly (for example, by Stripe Connect)? Who issues the acknowledgment? Does the Moments MOU need a gift clause?
2. **How does the gift interact with the shelter's share?** The rules pay a share of "vote pack sales after refunds." Should gifts be kept out of "sales"? Counted, Moments gets 30% of a gift meant for WPR, or WPR keeps 70% of one meant for Moments. WPR pays card fees today; who bears the fee on the gift?
3. **What disclosure is needed at $75 or less, and over it?** Is a list-price pack plus a separately listed gift, paid together, one "quid pro quo contribution," or a purchase plus a gift? Is the pack price a fair value for the votes, even in Double Vote windows, when it buys twice as many? If Moments gets the gift but WPR sold the votes, does the disclosure apply? Gifts of $250 or more commonly need a written acknowledgment. Does the emailed receipt serve, and must it name the donor? Checkout asks only for an email.
4. **How should the two parts be recorded in Stripe and the books?** One charge with the split noted, or two charges (two fees, two statement lines)? How is Stripe's fee divided? A pack is commonly booked as exchange revenue and a gift as a contribution. Does that fit? Is a gift for Moments a liability until paid over?
5. **Is anything required at the state level?** Do WPR's and Moments' Wisconsin charitable registrations (Department of Financial Institutions) cover a gift requested inside a paid contest? Does asking on Moments' behalf need an agreement, a filing or a set disclosure? Does listing the pack separately affect anything else, such as sales tax?
6. **What happens to the gift when a pack is refunded or disputed?** Late payments and every pack bought for a disqualified pet are refunded. Should the gift go back too (the mockup assumes so)? How is a partial refund split? What is owed if a payment is disputed after the acknowledgment went out?
7. **How long must gift records be kept?** The rules promise to erase buyer emails a year after the contest. If donor records must be kept longer, they belong in the recipient's donor system, not the contest database.

## What engineering would change if approved

- **The payment.** `create-checkout` would take an optional gift amount, with limits checked on the server; packs stay priced only from `vote_packs`. The PaymentIntent would be pack plus gift, with `pack_cents`, `gift_cents` and `gift_recipient` in metadata, or the gift would get its own PaymentIntent if Q4 says two charges. A gift to Moments may need Stripe Connect.
- **Votes and gift records.** Gifts would go in a new `gifts` table, never in `votes.amount_cents`, so vote counts, multipliers, results and awards cannot see them. The table gets explicit grants, an `access_test.sql` entry and no anon access.
- **The webhook.** `payment_intent.succeeded` would credit the votes and record the gift in one transaction. Refunds and disputes would follow Q6 (`record_partial_refund` now caps at the vote's amount).
- **Receipts.** Stripe's automatic receipt shows one line and one total, so the itemized receipt would be WPR's own email, with Stripe's turned off.
- **`contest_stats`** (the public "raised" figures) would stay packs only; any gifts total would get its own line. The thank-you screen's new "Your pack sends $X" line (in progress) must also use the pack price.
- **The payout statement.** `payout_statement` and `shelter_payouts` add up `votes.amount_cents`, so a separate table keeps gifts out of the pool. Wrap-up would add gifts by recipient, net of refunds, and any payment owed to Moments.
- **Copy.** The checkout note, rules, Shelters page and thank-you screen would mention the gift and keep "vote pack" for the purchase.

*For the newsroom:* if Moments receives gifts through WPR, WPR's duty to disclose the relationship when it covers Moments matters more.
