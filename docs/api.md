# API

## Channel

#### Get a list of all channels

- URL

/channel/list

- METHOD

`GET`

- URL Params

`skip=[integer]`

`limit=[integer]`

- Response

    * Success
    ```javascript
        {
            channels: [
                {
                    id: 'awesomeTestChannel',
                    depositAsset: 'DAI',
                    depositAmount: '1000',
                    creator: 'awesomeCreator',
                    // UNIX timestamp for 2100-01-01
                    validUntil: 4102444800,
                    spec: {
                        minPerImpression: '1',
                        validators: [
                            { id: 'awesomeLeader', url: 'http://localhost:8005', fee: '100' },
                            { id: 'awesomeFollower', url: 'http://localhost:8006', fee: '100' },
                        ]
                    }
                }
            ]
        }
    ```


#### Get channel status

Get channel status, and the validator sig(s); should each node maintain all sigs? also, remaining funds in the channel and remaining funds that are not claimed on chain (useful past validUntil); AND the health, perceived by each validator

- URL

/channel/:id/status

- METHOD

`GET`

- Response

    * Success

    ```javascript
        {
            id: 'awesomeTestChannel',
            depositAsset: 'DAI',
            depositAmount: '1000',
            creator: 'awesomeCreator',
            // UNIX timestamp for 2100-01-01
            validUntil: 4102444800,
            spec: {
                minPerImpression: '1',
                validators: [
                    { id: 'awesomeLeader', url: 'http://localhost:8005', fee: '100' },
                    { id: 'awesomeFollower', url: 'http://localhost:8006', fee: '100' },
                ]
            }
        }
    ```

#### Close channel

Event to close a channel. Only a channel creator is allowed to close a channel

- URL

/channel/:id/events/close

- HEADERS

    `authorization [ eg. Bearer xxx]`

    `content-type [application/json]`

- METHOD

`POST`

- Response

    * Success

        ```js
        {
            success: true
        }
        ```

    * Error
        * Code: 401
            Message: Unauthorized
        * Code: 400
            Message: Error occurred

---

## Validator Messages

#### Get chanel validator messages

- URL

/:id/validator-messages/:uid?/:type

- METHOD

`GET`

- URL Params

`uid=[string] (optional)`
`type=[string] (optional)`

- Query

`limit=[integer] (e.g. ?limit=10)`

- Response

    * Success

    ```javascript
    {
        validatorMessages: [
            {

            }
        ]
    }
    ```

    * Error

        * Code: 401
        Message: Unauthorized

#### Submit channel validator messages

- URL

/:id/validator-messages

- METHOD

`POST`

- HEADERS
    `authorization [ eg. 'Bearer xxx']`
    `content-type [application/json]`

- Data Params

`type=[string] [Required in ('NewState', 'ApproveState', 'Heartbeat', 'Accounting', 'RejectState')]`

`signature=[string]  [Required in ('NewState', 'ApproveState', 'Heartbeat')]`

`stateRoot=[string]  [Required in ('NewState', 'ApproveState', 'Heartbeat')]`

`isHealthy=[boolean] [Required in ('ApproveState)]`

`reason=[string] [Required in ('RejectState')]`

`balancesBeforeFees=[object] [Required in ('Accounting')]`

`balances=[object] [Required in ('Accounting')]`

`timestamp=[ISODate] [Required in ('Heartbeat')]`

`lastEvAggr=[ISODate] [Required in ('Accounting')]`


- Response

    * Success 

        ```javascript
        {
            success: true
        }
        ```

    * Error

        * Code: 401
            Message: Unauthorized
        * Code: 400
        Message:Error occurred

#### Validator Last Approved Messages

Get chanel validator last approved `NewState` and `ApproveState` messages

- URL

/:id/validator-messages/:uid?/:type?

- METHOD

`GET`

- URL Params

`uid=[string] (optional)`
`type=[string] (optional)`

- Response

    * Success

        ```javascript
        {
            lastApproved: {
                'newState': {},
                'approveState': {}
            }
        }
        ```

    * Error

        * Code: 401
        Message: Unauthorized

---

## Events

#### Event Aggregates
Get event aggregates received by a validator

- URL

/channel/events-aggregates

- METHOD

`GET`

- URL Params

`uid=[string] (optional)`
`type=[string] (optional)`

- Response

    * Success

    ```javascript
        {
            channel: {}
            events: {}
        }
    ```

    * Error 

        * Code: 401
        Message: Unauthorized

#### POST Events

Submit channel events to a validator sentry

- URL

/channel/:id/events

- METHOD

`POST`

- HEADERS
    `authorization [ eg. 'Bearer xxx']`
    `content-type [application/json]`

- Data Params

`events=[array] [Required] 
    Example: [
        {
            'type': 'IMPRESSION',
            'publisher': 'test'
        }
    ]
`

- Response

    * Success
        ```js
        {
            success: true 
        }
        ```

    * Error
        * Code: 401
        Message: Unauthorized