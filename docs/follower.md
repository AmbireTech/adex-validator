# Follower

## Follower Rules

### `function getHealthPromilles()`

When `NewState` is proposed to the `Follower`, the `Follower` checks the health of the state by taking the revenues that the `Follower` and `Leader` both agreed on, and ensures their sum is within `97%` (assuming `970` promilles) threshold of the `Follower` accounting.

```
sum(min(ours[k], approved[k]) for k in intersection(keys(ours), keys(approved)))
```

- Health promilles < cfg.HEALTH_UNSIGNABLE_PROMILLES (production: 770, development: 750)
    The proposed state will be rejected with `RejectState` with reason `TooLowHealth`

- Health promilles < cfg.HEALTH_THRESHOLD_PROMILLES (production: 970, development: 950)
    The proposed state will be approved with `ApproveState`, however `isHealthy` will be `false`.
