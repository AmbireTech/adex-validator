# Fees

## Fees distribution
Given that we have a deposit on the channl of `10 000 DAI` and we have channel participants
with the current balance tree being:

| Channel participant | Amount    |
|---------------------|:---------:|
| `Publisher One`     | `150 DAI` |
| `Publisher Two`     | `200 DAI` |

We need to distribute the fee required for the validators, between the validators and fees accordingly:

| Validator      | Fee      |
|----------------|:--------:|
| `Leader One`   | `50 DAI` |
| `Follower One` | `50 DAI` |

| What do we calculate | Pseudo calculation | Calculation | Total amount |
|----------------------|--------------------|-------------|--------------|
| Deposit to distribute | Total deposit - Total validator fee | `10 000 DAI` - `100 DAI` | `9 900 DAI` |
| `Publisher One` adjusted balance after fee | `Publisher One` balance * Deposit to distribute / Deposit | `150 DAI` * `9 900 DAI` / `10 000 DAI` | `148 DAI` (`148.5 DAI`, but floored *) |
| `Publisher Two` adjusted balance after fee | `Publisher Two` balance * Deposit to distribute / Deposit | `200 DAI` * `9 900 DAI` / `10 000 DAI` | `198 DAI` |
| Total adjusted balance | `Publisher One` adjusted balance after fee + `Publisher Two` adjusted balance after fee | `148 DAI` + `198 DAI` | `346 DAI` |
| Rounding error if Deposit to distribute != Total adjusted balance |  |  | `0 DAI` |
| Rounding error if Deposit to distribute == Total adjusted balance (not in our case) | Deposit to distribute - Total adjusted balance | - | `X DAI` |
| `Leader One` validator fee for work | `Leader One` fee * Total distributed / Deposit amount | `50 DAI` * `300 DAI` / `10 000 DAI` | `1 DAI` (`1.5 DAI`, but floored *) |
| `Leader One` fee with rounding | `Leader One` validator fee for work + Rounding error | `1 DAI` + `0 DAI` (in our case) | `1 DAI` |
| `Leader One` balance after fee | `Leader One` current balance + `Leader One` fee with rounding | `0 DAI` + `1 DAI` | `1 DAI` |
| `Follower One` validator fee for work | `Follower One` fee * Total distributed / Deposit amount | `50 DAI` * `300 DAI` / `10 000 DAI` | `1 DAI` (`1.5 DAI`, but floored *) |
| `Follower One` fee with rounding | `Follower One` validator fee for work + Rounding error | `1 DAI` + `0 DAI` (in our case) | `1 DAI` |
| `Follower One` balance after fee | `Follower One` current balance + `Follower One` fee with rounding | `0 DAI` + `1 DAI` | `1 DAI` |

At the end we have the following balance tree:

| Channel participant | Amount    |
|---------------------|:---------:|
| `Publisher One`     | `148 DAI` |
| `Publisher Two`     | `198 DAI` |
| `Leader One`        | `1 DAI`   |
| `Follower One`      | `1 DAI`   |

\* Since we are using [bn.js](https://github.com/indutny/bn.js) it floors all the calculations and we need to adjust
for this error in the distribution of the fee