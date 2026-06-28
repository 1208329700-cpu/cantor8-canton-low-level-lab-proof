# Cantor8 / Canton Low-Level Lab Proof

Date: 2026-06-28

This repository documents completion of the Canton DevNet low-level lab using the C8 DevNet validator APIs.

## Completion Checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| Create Party | Done | External party created through topology generate/submit. |
| Set up PreApproval | Done | `TransferPreapproval` contract active for the party. |
| Receive DevNet CC | Done | DevNet faucet/tap transactions minted CC. |
| Check ACS | Done | ACS snapshots show Token Standard `Holding` balances. |
| Optional transfer | Not run | Requires selected sender, receiver, and amount. |

## Main Party

```text
cylus::1220d132f3521c48c4f39bb74e1ee3dc562f95355ab994f6369ba1fb52875a408d50
```

## Public Evidence

| Party | PartyId | Balance | PreApproval Update | Faucet/Tap Update |
| --- | --- | ---: | --- | --- |
| `cylus` | `cylus::1220d132f3521c48c4f39bb74e1ee3dc562f95355ab994f6369ba1fb52875a408d50` | 25 | `122031604b5e2065a325b4e507d67c3857fa4bacdcec9d02a17d73db90580499d79a` | `12206a23431e0c5406aa33c374a1d3d9dddba6b98359ac66e8f90f9366d299bd0bac` |

## Notes

- Balances are DevNet CC test coins, not mainnet assets.
- Private key files are local only and ignored by git through `.gitignore`.
- The implementation uses the low-level Admin/Ledger APIs rather than wallet UI flows.
