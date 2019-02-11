# Validator Messages

Can be obtained from sentry route `'/channel/:id/validator-messages'`, returns `{"validatorMessages":[...]}` where the array contains message objects.

## Message properties

**`type`** - String that diplsay the type of the message, either `NewState`, `ApproveState` or `Heartbeat`

---

**`stateRoot`** - 64 bit string produced by the latest state tree

- *In messages of type: `NewState`, `ApproveState`, `Heartbeat`*

---

**`balances`** - Object with all validators and their balances `{{"validator": "amount"}, ...}`

- *In messages of type: `NewState`*

---

**`lastEvAggr`** - Timestamp of the last event aggregation. ISOString format ex. `"2019-02-06T15:36:54.791Z"`

- *In messages of type: `NewState`, `ApproveState`*

---

**`timestamp`** - Timestamp of the heartbeat message.

- *In messages of type: `Heartbeat`*

---

**`signature`** - Signature message

- *In messages of type: `NewState`, `ApproveState`, `Heartbeat`*

---

**`isHealthy`** - **ONLY** in messages of type `ApproveState`. Boolean, either `true` or `false`

- *In messages of type: `ApproveState`*
