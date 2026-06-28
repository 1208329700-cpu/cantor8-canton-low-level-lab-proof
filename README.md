# Canton Low-Level Lab

Small local repo for the Canton DevNet hackathon flow: create an external party through validator topology APIs, set up TransferPreapproval through low-level Ledger API commands, mint DevNet CC with the faucet choice, and inspect balances from ACS.

Proof page: [docs/proof.md](docs/proof.md)

## What Was Completed

Core flow completed:

1. Obtained JWT from the C8 Keycloak IdP.
2. Created an external Canton party via `/v0/admin/external-party/topology/generate` and `/submit`.
3. Created and accepted `ExternalPartySetupProposal` without using `/setup-proposal`.
4. Created a `TransferPreapproval` contract for the party.
5. Minted DevNet CC using `AmuletRules_DevNet_Tap`.
6. Checked balances by querying ACS with the Token Standard `Holding` interface.

Not completed:

- The optional Token Standard transfer between two parties has not been run yet. It needs a chosen sender, receiver, and amount.

## Current Party

Primary party:

```text
cylus::1220d132f3521c48c4f39bb74e1ee3dc562f95355ab994f6369ba1fb52875a408d50
```

Latest checked DevNet CC balances:

| Party | Balance |
| --- | ---: |
| `cylus` | 25 |

These are DevNet test coins, not mainnet assets.

## Setup

Requires Node.js 20+.

Set the client secret before running commands:

```powershell
$env:CANTON_CLIENT_SECRET='replace-with-client-secret'
```

Optional environment variables are shown in `.env.example`.

## Commands

Check API access:

```powershell
node .\canton_lab.mjs version
```

Create a new external party:

```powershell
node .\canton_lab.mjs create-external-party alice .\alice-party.json
```

Set up TransferPreapproval:

```powershell
node .\canton_lab.mjs create-setup-proposal .\alice-party.json .\alice-proposal.json
node .\canton_lab.mjs accept-setup-proposal .\alice-party.json .\alice-proposal.json .\alice-preapproval.json
```

Mint DevNet CC to a party:

```powershell
node .\canton_lab.mjs tap-party .\alice-party.json 25 .\alice-party-tap.json
```

Check ACS for preapproval and holdings:

```powershell
node .\canton_lab.mjs check-acs .\alice-party.json .\alice-acs.json
```

## Security

Files named `*-party.json` contain private keys. They are intentionally ignored by git. Do not send them to anyone.

The public value to share is the full PartyId, for example:

```text
cylus::1220d132f3521c48c4f39bb74e1ee3dc562f95355ab994f6369ba1fb52875a408d50
```
