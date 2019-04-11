# Fees

## Fees distribution

Suppose we have 1 channel with 2 publishers `Publisher One` and `Publisher Two` and creator of the channel `Creator`
with the minimum cost per Impression being `1 DAI`.
The channel deposit is `10 000 DAI` made by `Creator` and he is __not__ participating as a Publisher.
`Publisher One` currently has `100 DAI` and `Publisher Two` - `200 DAI`.
On the channel we have 2 validators `Leader One` and `Follower One` and both of their fees is `50 DAI`.

Let's say we have 5 impressions on `Publisher One` and each impression pays out `10 DAI`.
In this case `Publisher One` has received `50 DAI`, but there is a fee that needs to be paid to the validators,
for validating the transaction. The cost of which we should evenly distribute as follows:

| What do we calculate | Pseudo calculation | Calculation | Total amount |
|----------------------|--------------------|-------------|--------------|
| Deposit |  |  | `10 000 DAI` |
| `Leader One` validator fee |  |  | `50 DAI` |
| `Leader One` balance |  |  | `50 DAI` |
| `Follower One` validator fee |  |  | `50 DAI` |
| `Follower One` balance |  |  | `50 DAI` |
| `Publisher One` balance |  |  | `100 DAI` |
| `Publisher Two` balance |  |  | `200 DAI` |
| `Publisher One` impressions to account for | # impressions * impression price | `5 impressions` * `10 DAI` | `50 DAI` |
| `Publisher One` balance after impressions | `Publisher One` balance + `Publisher One` impressions to account for | `100 DAI` + `50 DAI` | `150 DAI` |
| Total distribution | `Publisher One` balance after impressions + `Publisher Two` balance | `150 DAI` + `200 DAI` | `300 DAI` |
| Total validator fee | `Leader validator` fee + `Follower validator` fee | 2 x `50 DAI` | `100 DAI` |
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

At the end we have the following balances:

| Channel participant         | Amount    |
|-----------------------------|:---------:|
| `Publisher One`             | `148 DAI` |
| `Publisher Two`             | `198 DAI` |
| `Leader One` validator      | `1 DAI`   |
| `Follower One` validator    | `1 DAI`   |

\* Since we are using [bn.js](https://github.com/indutny/bn.js) it floors all the calculations and we need to adjust
for this error in the distribution of the fee