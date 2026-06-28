# Cantor8 / Canton Low-Level Lab Proof

Date: 2026-06-28

This repository documents completion of the Canton DevNet low-level lab using the C8 DevNet validator APIs.

## Completion Checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| Create Party | Done | External parties created through topology generate/submit. |
| Set up PreApproval | Done | `TransferPreapproval` contracts active for all listed parties. |
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
| `steve` | `steve::1220ac7ea7075ab76536b5aa7fa518b4bae2edeae8f32471c3ca32a58fe88db86dd6` | 25 | `1220f51504f24cc5f7239d54a69afe24b5e4e86714c4dcee8d1766dd42e26825a981` | `1220c44eac65c59bad32e9e045fcb7969d451c2eb908a415e69c3bf80d6e2080870d` |
| `lark` | `lark::1220a14ba6bbbbcd807c19868b11bb2c9c3561415832f71626a96ee098dbfe05ba11` | 25 | `12209e995fc5921e317f0bd40b3a401f68536f1413029b894744d7bb3a833fd7f5b8` | `12202c11dc2aa3867a44d9f5891d9cc1947c1ff423a7464f5bc5dd138e0380447bb2` |
| `rin` | `rin::1220a6baa450df74d103954a3e1a9016c482d41c52a17fae13272ed4caefa29eaa18` | 25 | `122001312c42e8ccbbaa3699c53a94933be6e386c52289d2e143e46e49673ce0a449` | `12207c6703cc2df8bbac0ed23261bf58fba6f8ed43875c78bdffaa28afd26de86b52` |
| `codex-lab-20260628` | `codex-lab-20260628::122053576ac11d8130ca8529e297197fc2e9ba2abd9bb008f5afb6d1010e8b9b3493` | 50 | `1220a8bb607e0bcf124c33eb3d7578a119cc32830bce73ac41e16929e0c0945c06d2` | `12200a3b0c13bce80110f684080cfc618a1c53f4de75da12747542baa718c5a3fb51` |

## Notes

- Balances are DevNet CC test coins, not mainnet assets.
- Private key files are local only and ignored by git through `.gitignore`.
- The implementation uses the low-level Admin/Ledger APIs rather than wallet UI flows.
