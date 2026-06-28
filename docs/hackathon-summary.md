# Hackathon Summary

## Task Status

| Lab Task | Status | Notes |
| --- | --- | --- |
| Register party on DevNet | Done | Used validator external-party topology generate/submit. |
| Set up PreApproval contract | Done | Created proposal through Ledger API and accepted it with external party signatures. |
| Get Canton Coins | Done | Used DevNet faucet choice `AmuletRules_DevNet_Tap`. |
| Check balance via ACS | Done | Queried `TransferPreapproval` and Token Standard `Holding` interface. |
| Token Standard transfer | Not yet | Needs chosen sender, receiver, and amount. |

## Important Outputs

Main PartyId:

```text
cylus::1220d132f3521c48c4f39bb74e1ee3dc562f95355ab994f6369ba1fb52875a408d50
```

PreApproval is active for the saved party:

- `cylus`

Latest balances:

- `cylus`: 25 DevNet CC

## Local Files

Private key files:

- `cylus-party.json`

These files must stay local.

Result snapshots:

- `*-acs.json`
- `*-proposal.json`
- `*-preapproval.json`
- `*-tap*.json`

These are ignored by git because they are run artifacts.
