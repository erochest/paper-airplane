# Rollout plan

The rollout happens in three stages, and each stage has a clear exit condition so that nobody has to guess whether it is safe to move on.

## Stage one: internal users

We turn the feature on for the team first. Everyone uses it for a full working week, writes down anything that surprises them, and files a ticket for anything that blocks real work. The exit condition is a week with no new blocking tickets. During this stage the old path stays in place, and the switch between the two is a single setting that anyone on the team can flip back without a deploy.

## Stage two: a tenth of accounts

Next we enable it for one account in ten, chosen at random but stable, so the same accounts stay in the group from day to day. We watch three numbers: error rate, the time a send takes from start to landing, and how often people send the same thing twice in a row, which usually means the first attempt looked like it failed. If any of the three moves by more than a fifth from its baseline, we stop and look before going further.

```ts
const inRollout = (accountId: string) => hash(accountId) % 10 === 0;
```

## Stage three: everyone

Finally we enable it for all accounts and leave the old path in the code for one more release, switched off but available. Once that release has been out for two weeks without a rollback, we delete the old path and the setting that chose between them, along with the tests that only existed to cover the switch.

## Risks

The biggest risk is that the second stage hides a problem that only shows up at full volume, such as a rate limit on the upstream service. To catch that early we will run a load test at twice the expected peak before stage three, against a staging copy of the upstream service, and we will keep the person who owns that service informed of the dates so that they can watch their own dashboards while it runs.

## Open questions

Do we need a way for a single account to opt out during stage two? I think not, since the switch is global and fast, but it is worth a quick check with support before we begin.
