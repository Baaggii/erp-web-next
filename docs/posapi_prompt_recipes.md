# POSAPI 3.0 Runnable Prompt Cookbook

This guide complements the main POSAPI 3.0 integration document by providing runnable command prompts for each major setup and operational task. Substitute the placeholder values (surrounded by `< >`) with real values from your deployment before running the commands.

## 1. Validate network reachability

```bash
ping -c 4 api.ebarimt.mn
ping -c 4 auth.itc.gov.mn
```

For environments where ICMP is blocked, confirm DNS and HTTPS connectivity instead:

```bash
curl -I https://api.ebarimt.mn/rest/health
curl -I https://auth.itc.gov.mn
```

## 2. Review or update the `posapi.ini` configuration

```bash
sudo nano /opt/posapi/posapi.ini
```

Key-value prompts while editing:

- `authUrl=https://auth.itc.gov.mn/realms/<realm>`
- `authClientId=<oauth-client-id>`
- `authClientSecret=<oauth-client-secret>`
- `ebarimtUrl=https://api.ebarimt.mn`
- `db=QMYSQL|QPSQL|QODBC|QSQLITE`
- `dbHost=<db-host>`
- `dbPort=<db-port>`
- `dbUser=<db-username>`
- `dbPass=<db-password>`
- `dbName=<db-name>`
- `workDir=/var/lib/posapi`
- `webServiceHost=0.0.0.0`
- `webServicePort=7080`

Save the file and restart the service:

```bash
sudo systemctl restart posapi
sudo systemctl status posapi --no-pager
```

## 3. Activate POSAPI through the local UI

Open a browser prompt pointing to the configuration UI and follow the on-screen instructions:

```text
Navigate to: http://<posapi-host>:7080/web/
Login as: System Integrator
Select operator: <operator name>
Check "Эмийн сан" if integrating a pharmacy
Record the generated serial number after activation
```

## 4. Obtain an OAuth access token

Use the Keycloak token endpoint defined in `posapi.ini`:

```bash
curl -X POST "https://auth.itc.gov.mn/realms/<realm>/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<oauth-client-id>" \
  -d "client_secret=<oauth-client-secret>"
```

The response contains `access_token`, `token_type`, and `expires_in`. Export the token for reuse:

```bash
export POSAPI_TOKEN="$(curl -s -X POST "https://auth.itc.gov.mn/realms/<realm>/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<oauth-client-id>" \
  -d "client_secret=<oauth-client-secret>" | jq -r '.access_token')"
```

## 5. Send a sales receipt (`POST /rest/receipt`)

```bash
curl -X POST "https://api.ebarimt.mn/rest/receipt" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${POSAPI_TOKEN}" \
  -d '{
    "branchNo": "<branch-number>",
    "posNo": "<pos-number>",
    "merchantTin": "<merchant-tin>",
    "customerTin": "<customer-tin>",
    "consumerNo": "<consumer-id-or-phone>",
    "type": "B2C_RECEIPT",
    "taxType": "VAT_ABLE",
    "totalAmount": 110000,
    "totalVAT": 10000,
    "totalCityTax": 1000,
    "receipts": [
      {
        "taxType": "VAT_ABLE",
        "totalAmount": 110000,
        "items": [
          {
            "name": "<item-name>",
            "barCode": "<item-barcode>",
            "barCodeType": "GS1",
            "classificationCode": "<classification-code>",
            "taxProductCode": "<tax-product-code>",
            "measureUnit": "<unit>",
            "qty": 1,
            "price": 110000,
            "vatTaxType": 1,
            "cityTax": 1000,
            "totalAmount": 110000,
            "data": {
              "lotNo": "<lot-number-if-required>"
            }
          }
        ]
      }
    ]
  }'
```

Capture the response fields `billId`, `lottery`, and `qrData` for printing and reconciliation.

## 6. Cancel a receipt (`DELETE /rest/receipt`)

```bash
curl -X DELETE "https://api.ebarimt.mn/rest/receipt" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${POSAPI_TOKEN}" \
  -d '{
    "billId": "<original-bill-id>",
    "inactiveId": "<cancellation-reason-code>",
    "description": "<optional-note>"
  }'
```

Run the cancellation within the same business day when possible.

## 7. Retrieve unsent or pending receipts (`GET /rest/getInformation`)

```bash
curl -X GET "https://api.ebarimt.mn/rest/getInformation?startDate=<YYYY-MM-DD>&endDate=<YYYY-MM-DD>" \
  -H "Authorization: Bearer ${POSAPI_TOKEN}"
```

Process the returned list and resubmit any receipts in `FREEZE` or unsent state.

## 8. Fetch supporting reference data

### 8.1 Branch information (`GET /rest/getBranchInfo`)

```bash
curl -X GET "https://api.ebarimt.mn/rest/getBranchInfo" \
  -H "Authorization: Bearer ${POSAPI_TOKEN}"
```

### 8.2 VAT tax types (`GET /rest/vat_tax_type`)

```bash
curl -X GET "https://api.ebarimt.mn/rest/vat_tax_type" \
  -H "Authorization: Bearer ${POSAPI_TOKEN}"
```

### 8.3 District codes (`GET /rest/getDistrictCode`)

```bash
curl -X GET "https://api.ebarimt.mn/rest/getDistrictCode" \
  -H "Authorization: Bearer ${POSAPI_TOKEN}"
```

### 8.4 Bank accounts (`GET /rest/getBankAccountInfo`)

```bash
curl -X GET "https://api.ebarimt.mn/rest/getBankAccountInfo" \
  -H "Authorization: Bearer ${POSAPI_TOKEN}"
```

## 9. Monitor service health

```bash
sudo journalctl -u posapi -n 200 --no-pager
curl -X GET "http://localhost:7080/rest/health"
```

## 10. Automate token refresh and receipt submission

Add the following cron-friendly prompts to regularly refresh tokens and push receipts:

```bash
# Refresh token every 10 minutes
*/10 * * * * /usr/bin/curl -s -X POST "https://auth.itc.gov.mn/realms/<realm>/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=<oauth-client-id>" \
  -d "client_secret=<oauth-client-secret>" | jq -r '.access_token' > /var/run/posapi.token

# Resend unsent receipts every 15 minutes
*/15 * * * * /usr/bin/curl -s -X GET "https://api.ebarimt.mn/rest/getInformation" \
  -H "Authorization: Bearer $(cat /var/run/posapi.token)" | /usr/local/bin/posapi-resubmitter
```

Replace `/usr/local/bin/posapi-resubmitter` with a script that parses the JSON payload and replays the queued receipts via `POST /rest/receipt`.

## 11. Print receipts with POSAPI response data

Ensure the ERP print template consumes the POSAPI response:

```text
Print fields:
- Merchant name, branch, POS number
- Receipt date/time, billId
- Customer TIN or consumer number
- Item list with VAT and city tax details
- Lottery number: <lottery>
- QR code: render from <qrData>
```

Use the stored `billId` and `qrData` for audit trails and customer reprints.

