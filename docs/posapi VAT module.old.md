POSAPI 3.0 API integration guide and recommendations for connecting to your ERP system
Overview of POSAPI 3.0

Separation from client systems – REST based – POSAPI 3.0 is a stand‑alone REST service; unlike the older PosAPI 2.0 which was shipped as a client library embedded in merchants’ POS software, version 3.0 runs as an independent service. This design eliminates dependency on the client system and allows easier upgrades and maintenance. The service communicates using REST WebService protocols
developer.itc.gov.mn
.

Single instance can serve multiple merchants – One POSAPI 3.0 instance can handle invoices for multiple businesses (multiple tax IDs). Whereas POSAPI 2.0 allowed only a single citizen/company per installation, version 3.0 solves this by enabling one POSAPI to register receipts on behalf of several companies or branches
developer.itc.gov.mn
.

Configuration through a file – After installation the service must be configured via the posapi.ini file. Different configurations may also be stored in P101.poi and P102.poi for specific operating environments
developer.itc.gov.mn
. The configuration file defines authentication details, endpoints, local database settings and network ports.

Activation required – The installed POSAPI service is not active by default. To activate it, the system integrator must log into the local configuration UI (default URL http://localhost:7080/web/
 unless customised) using their “System Integrator” credentials. During activation the user selects one operator (if they have rights to multiple operators) and enters basic information; after confirmation the service becomes active and generates a unique serial number
developer.itc.gov.mn
.

Key configuration settings

The posapi.ini file contains critical parameters. Important fields include
developer.itc.gov.mn
:

Setting Purpose
authUrl / authRealm URL and realm for the OAuth/Keycloak authentication server. They point to auth.itc.gov.mn (see network requirements below).
authClientId & authClientSecret Client ID and secret used to authenticate with the auth server when retrieving tokens.
ebarimtUrl Base URL of the POSAPI service (e.g., https://api.ebarimt.mn
). All API requests are sent here.
db Database driver. Supported values are QMYSQL (MySQL/MariaDB), QPSQL (PostgreSQL), QODBC (ODBC for Microsoft SQL Server) and QSQLITE
developer.itc.gov.mn
. SQLite is suitable for small data volumes but for higher transaction volumes a client/server database like MySQL or PostgreSQL is recommended
developer.itc.gov.mn
.
dbHost, dbPort, dbUser, dbPass, dbName, dbOptions Connection settings for the chosen database. When using SQLite these fields can remain blank because the service automatically creates a local file.
workDir Directory used by POSAPI to store temporary data (including FREEZE directory for unsent receipts). The directory must have read‑write permissions and should not be deleted. It defaults to the home directory of the user running the service
developer.itc.gov.mn
.
webServiceHost, webServicePort IP and port where the local POSAPI service listens for configuration UI and internal services. Default port is 7080; adjust as needed and ensure it is reachable from the ERP system
developer.itc.gov.mn
.

Tip: POSAPI automatically creates required database tables at startup. Ensure the configured database user has permission to create tables and indexes
developer.itc.gov.mn
.

Network and infrastructure requirements

POSAPI should run on a server that meets the following guidelines
developer.itc.gov.mn
:

Storage – keep at least 1 GB of free disk space to store logs and unsent receipts.

Network speed – at least 80 Mbps bandwidth is recommended for stable connectivity.

Public IP – the server should have a static public IP address. If connecting through an international link, ensure that the network can reach the Mongolian tax authority’s servers.

Whitelisting is required to access the government services. Allow outbound connections to these domains and IP addresses
developer.itc.gov.mn
:

Domain IP addresses
api.ebarimt.mn (POSAPI) 103.17.108.216, 103.17.108.217
auth.itc.gov.mn (authentication server) 103.87.69.75, 103.87.69.76
Activating POSAPI and obtaining an operator licence

Install and configure the service on your ERP server. Modify posapi.ini with appropriate auth credentials, database settings and port.

Start the service. By default it listens on port 7080. Open a browser at http://localhost:7080/web/
 (or the configured port). You will see a page indicating that POSAPI configuration is required
developer.itc.gov.mn
.

Log in with “System Integrator” credentials. Only users who have been granted system‑integrator rights by the tax authority can activate the service. During activation select the operator for whom you are integrating (if you have several operators)
developer.itc.gov.mn
.

Complete the configuration (e.g., enter branch information, choose database). For pharmacies, make sure to select the “Эмийн сан” (Pharmacy) checkbox. This is required due to a 2021 law mandating detailed tracking of medicines. When sending receipts for pharmaceuticals you must include the product lot number in the data field of the JSON payload ("data":{"lotNo":"<pharmacy product lot number>"})
developer.itc.gov.mn
developer.itc.gov.mn
.

Save. The UI shows a unique serial number; this indicates that POSAPI is now active. Only after activation will the API endpoints respond to requests.

Using the POSAPI 3.0 endpoints in your ERP system
Authentication

Retrieve an access token – Your ERP will need to obtain a Bearer token from the authentication server (auth.itc.gov.mn). Send a POST request to the token endpoint (standard Keycloak OAuth2) using the authClientId and authClientSecret configured in posapi.ini. The token is valid for a short period and must be refreshed.

Include the token – For every API call to api.ebarimt.mn, include the header Authorization: Bearer <token>.

Saving a receipt (POST /rest/receipt)

Use this endpoint to create a new sales receipt. The request body is a JSON object containing overall transaction data and an array of receipt items. Important fields:

branchNo: Branch number from the operator registration.

posNo: POS (device) number.

merchantTin: Merchant’s tax ID.

customerTin for B2B invoices or consumerNo (civil ID/telephone) for B2C receipts.

totalAmount, totalVAT, totalCityTax: gross totals including taxes.

type: B2C, B2C or B2B_SALE depending on whether the buyer requires a VAT invoice.

taxType: classification of VAT applicability (VAT_ABLE, VAT_FREE, VAT_ZERO, NO_VAT etc.).

receipts: array of objects summarizing the items grouped by tax type. Each entry contains items with fields such as name, barCode, barCodeType (e.g., GS1), classificationCode (product/service code), taxProductCode, measureUnit, qty, price, vatTaxType (1 or 2), cityTax and totalAmount.

Optional data field can include additional information; e.g., for pharmacies include "lotNo".

The API returns a JSON response containing the DDTD (lottery number) and QR code data. Store these values in your ERP, as they are needed for printing the receipt and for audits
developer.itc.gov.mn
.

Reversing or refunding a receipt (DELETE /rest/receipt)

To cancel a transaction you previously sent, call this endpoint and supply the billId of the original receipt along with inactiveId (reason for cancellation). The API returns confirmation. Note that cancellations must be processed within the same day; beyond that you may need to issue a new corrective receipt.

Checking unsent or pending transactions (GET /rest/getInformation)

Use this endpoint to fetch lists of receipts that have not yet been successfully transmitted. Your ERP should periodically call this API and automatically resend unsent receipts; additionally provide a manual option for users to resend receipts if a network outage occurred
developer.itc.gov.mn
.

Other useful endpoints

GET /rest/getBankAccountInfo – Retrieve the bank accounts registered to the operator; used to populate bank account fields on receipts.

GET /rest/getDistrictCode – Provides codes for districts required in the request payload.

GET /rest/vat_tax_type – Returns the available tax types (VAT_FREE, VAT_ZERO, etc.).

GET /rest/getBranchInfo – Returns branch and merchant information; use this to validate branchNo and posNo.

Implementation recommendations

Map ERP fields to POSAPI fields – Ensure your ERP stores all necessary data: merchant TIN, branch number, POS number, customer TIN or consumer ID, product classification codes, tax types and unit measures. Your ERP’s tax calculation must compute VAT (10 %) and city tax correctly; totalAmount must include all taxes
developer.itc.gov.mn
.

Automatic and manual submission – Design your ERP to automatically transmit receipts to POSAPI in near real‑time. Provide a manual interface to review and resend unsent receipts using getInformation when network connectivity is restored
developer.itc.gov.mn
.

Print receipt content – The printed receipt must match the data sent via POSAPI. It should include the lottery number, QR code, merchant name, TIN, branch, POS number, date/time, total amount, VAT, city tax and itemised list. For B2B invoices, include buyer’s TIN and registration number; for B2C receipts include the consumer’s civil ID or phone number. For NHAT (excise tax) receipts, print the NHAT amount and product details
developer.itc.gov.mn
.

Use classification codes – All items must be encoded using the government’s unified product/service classification code (GS1 barcodes, ISBN for books, etc.). The classification code is sent as classificationCode and the tax type as taxProductCode in the JSON payload
developer.itc.gov.mn
. Fetch the codes from the provided “Бүтээгдэхүүн үйлчилгэний нэгдсэн ангиллын код” registry.

Security and data protection – The ERP should handle OAuth tokens securely and rotate them before expiry. Protect the authClientSecret and ensure network connections to api.ebarimt.mn and auth.itc.gov.mn use HTTPS.

Pharmacy requirements – If your ERP sells medicines or medical devices, enable the “Эмийн сан” option during activation and include the lot number of each product in the data field when sending receipts
developer.itc.gov.mn
.

Integrating POSAPI with the dynamic transaction module

Many ERP implementations no longer have a dedicated “POS transactions” module. Instead, all financial transactions—including sales receipts—are defined through a dynamic transaction module. Each transaction form is described in a configuration file (transactionForms.json) that specifies the table, related tables and layout fields. To control when the POSAPI service should be invoked, extend the relevant form definitions in transactionForms.json with two properties:

posApiEnabled (boolean): set to true to indicate that saving this transaction should trigger a call to the POSAPI /rest/receipt endpoint. Set to false (or omit the property) if the form does not produce an e‑receipt.

posApiType (string, optional): specify which type of receipt to emit (B2C, B2C or B2B_SALE). If omitted, the default type from your environment settings is used.

posApiMapping (object): defines how POSAPI fields map to columns in the form’s table. Each key corresponds to a POSAPI field (such as totalAmount, totalVAT, totalCityTax, customerTin or consumerNo), and the value is the name of the column in your table from which to retrieve the data. For example:

{
"totalAmount": "total_price",
"totalVAT": "vat_amount",
"totalCityTax": "city_tax",
"customerTin": "customer_tin",
"consumerNo": "consumer_id"
}

This mapping allows your integration code to extract values without hard‑coding field names.

For example, a sales income form definition might look like this:

{
"sales_income_form": {
"posApiEnabled": true,
"posApiType": "B2C",
"posApiMapping": {
"totalAmount": "total_price",
"totalVAT": "vat_amount",
"totalCityTax": "city_tax",
"customerTin": "customer_tin",
"consumerNo": "consumer_id"
}
}
}

When a user posts a transaction using this form, the ERP reads the dynamic configuration. If posApiEnabled is true, the system builds a POSAPI payload from the saved record (as described above), obtains an OAuth token and calls /rest/receipt. The returned lottery number and QR data should be stored back into the transaction record so that the printed receipt matches the data sent to the tax authority.

POS transactions themselves use the same dynamic transaction definitions. They derive their behaviour—fields, validation rules and now POSAPI integration—from the transactionForms.json configuration. This unified approach eliminates the need for a separate “POS transaction configuration” file and ensures that future transaction types can leverage the POSAPI integration simply by toggling posApiEnabled in their form definition.

Note: POSAPI settings should only be defined in transactionForms.json. Do not use the legacy posTransactionConfig.json (or any POS‑transaction‑specific configuration) for POSAPI integration. That file is reserved solely for configuring data synchronisation between tables.

Conclusion and next steps

POSAPI 3.0 provides a modern REST‑based interface for issuing electronic receipts in Mongolia. To integrate it into your ERP system:

Install and configure the service, adjusting the posapi.ini file for authentication, database and network settings
developer.itc.gov.mn
.

Ensure server readiness – allocate sufficient storage and network bandwidth and whitelist the required IP addresses
developer.itc.gov.mn
developer.itc.gov.mn
.

Activate POSAPI through the local configuration UI using your integrator credentials
developer.itc.gov.mn
. Record the serial number issued upon activation.

Implement API calls in your ERP: authenticate using OAuth, send receipts via POST /rest/receipt, handle reversals and pending transactions, and fetch reference data via the provided GET endpoints. Respect data and printing requirements, including classification codes and additional fields for special industries such as pharmacies.

By following these steps, your ERP system will be able to seamlessly issue electronic receipts through POSAPI 3.0 and remain compliant with the Mongolian e‑Invoice regulations.

UI integration and forms for POSAPI functions

This section describes how to expose POSAPI operations to end‑users through your ERP’s user interface. Every API call listed above should have a corresponding button or form in the Enabled POSAPI submission tab (or equivalent POS transaction screen). After each API call returns, display the returned data in a modal window so the user can confirm the result and print the receipt or acknowledgement. Below are guidelines for each function.

Saving a receipt (POST /rest/receipt)

Provide a dynamic transaction form with fields for branchNo, posNo, merchantTin, customerTin (for B2B) or consumerNo (for B2C), totalAmount, totalVAT, totalCityTax, taxType and an itemised list of goods/services. If the form uses transactionForms.json, set posApiEnabled to true and configure posApiMapping so the application knows which column maps to each POSAPI field.

After the user completes the form and clicks Save receipt, the system should build the JSON payload and call the /rest/receipt endpoint. When the response is returned, open a modal window that displays the DDTD (lottery) number, QR code and other returned fields like status, message and receiptNumbers. Provide a Print button inside the modal to print the receipt. The printed document must match exactly the data sent to POSAPI.

Cancelling or reversing a receipt (DELETE /rest/receipt)

In the transaction record list or detail view, add a Cancel receipt button that opens a modal form. The form should request the billId of the original receipt and a cancellation reason. Validate that the date of the original transaction is within the allowed cancellation period.

When submitted, call the delete endpoint. Display the returned status and message in the modal. If successful, update the transaction record to reflect the cancellation and provide an option to print a cancellation notice.

Manually sending unsent data (GET /rest/sendData and GET /rest/getInformation)

Although receipts are automatically transmitted on save, you must also provide a Send unsent receipts button in the POS transaction tab. When clicked, call GET /rest/sendData to transmit any queued receipts. Show a modal summarising how many records were sent and whether any errors occurred.

Use GET /rest/getInformation to list receipts that have not yet been acknowledged by the tax authority. In the modal, display each unsent receipt with its ID, date and amount and allow the user to re‑send individual receipts if necessary.

Viewing POS and merchant information (GET /rest/info)

Add a POS status button that fetches the operator and merchant configuration using GET /rest/info. Display the returned fields—operatorName, operatorTIN, posId, posNo, lastSentDate, leftLotteries, the appInfo object and the list of merchants—in a modal. This information helps users monitor lottery number availability and network health.

Bank account lookup (GET /rest/bankAccounts?tin=) and other reference data

To assist with payment forms, call the bank accounts endpoint when a merchant TIN is selected. Populate a drop‑down list with the returned accounts (account number, account name and bank name). This ensures payments are credited to the correct account.

Similarly, provide drop‑downs for district codes, tax types, VAT categories, units of measure and other reference data. Fetch these lists via their respective GET /rest endpoints when the form is initialised.

Registering a merchant (POST /rest/registerMerchant)

System integrators should be able to register new merchants directly from the ERP. Create a Register merchant form (modal) with fields for tin, districtCode, regNo, address, vatPayer, posId, posNo and appInfo. Include a field to select the merchant’s branch. On submission, call the registration endpoint and show the response status in the modal.

Third‑party integrations (/third‑party/posapi/send and /third‑party/posapi/payment)

If your ERP integrates with loyalty programs or payment gateways, implement additional forms that wrap receipts in a third‑party payload. Provide options for SEND_ONLY, SEND_AND_RECEIVE and PAYMENT modes, and display any returned modifiedReceipt data in the response modal. Only use these endpoints if your business workflow requires third‑party processing.

Compliance with POSAPI user‑system requirements

The tax authority imposes strict requirements on systems that submit electronic receipts. When designing your forms and business logic, ensure the following rules are met:

Record buyer information – For B2B transactions, require the buyer’s TIN and name; do not print a lottery number on B2B receipts
developer.itc.gov.mn
. For B2C receipts, record the consumer’s ID or phone number.

Calculate taxes correctly – Your ERP must calculate VAT and NHAT (withheld income tax) and allow zero‑rated or tax‑exempt transactions
developer.itc.gov.mn
. Ensure the totalAmount you send includes all applicable taxes
developer.itc.gov.mn
.

Automatic and manual submission – Implement scheduled tasks to send receipts at least once per day and provide the manual “Send unsent receipts” button described above
developer.itc.gov.mn
.

Alerts – Use the leftLotteries field from GET /rest/info to warn users when lottery numbers are low or when the submission period has expired; block further receipts until the issue is resolved
developer.itc.gov.mn
.

Print every receipt – A physical or PDF receipt must be printed for each sale
developer.itc.gov.mn
. The printed content must match the JSON payload exactly and include the required fields: seller name, TIN, DDTD number, date/time, total amount, VAT amount, lottery number (for B2C), and a QR code
developer.itc.gov.mn
.

Product coding – Require users to enter the GS1/ISBN/unified classification code for each item. Provide a lookup tool or auto‑complete to help users select valid codes
developer.itc.gov.mn
.

Editing and refunding receipts – Allow users to edit, cancel, refund and re‑issue receipts. Provide forms to correct item lines, apply VAT exemptions or zero VAT, and reissue receipts for a previous month if allowed
developer.itc.gov.mn
.

NHAT receipts and B2B invoices – Include specific forms for NHAT receipts, capturing the withheld tax amount and printing it separately
developer.itc.gov.mn
. For B2B invoices, print the buyer’s TIN and name and omit the lottery number
developer.itc.gov.mn
.

Integration with other systems – If applicable, integrate with the NHAT system for voluntary contributions, bank terminals, and inventory software as required by the tax authority
developer.itc.gov.mn
.

By adding these UI components and ensuring compliance with the regulatory requirements, your ERP system will provide a complete POSAPI integration that is user‑friendly and legally compliant.

POSAPI endpoints and data structures

Detailed request and response schemas are summarised below. Use these examples to build JSON payloads and parse responses in your ERP. Where numeric values appear, replace them with your transaction’s numbers.

POST /rest/receipt – save receipt

Request body

{
  "posId": "POS12345",
  "dateTime": "2025-03-01T12:34:56",
  "districtCode": "001",
  "totalAmount": 10000.0,
  "totalVAT": 1000.0,
  "lottery": true,
  "cashAmount": 5000.0,
  "nonCashAmount": 5000.0,
  "amountWithoutVAT": 9000.0,
  "taxType": "VAT_ABLE",
  "vatList": [
    { "taxProductCode": "1", "amount": 9000.0, "vat": 1000.0 }
  ],
  "receipts": [
    {
      "id": "00012345",
      "vatpayer": false,
      "lottery": true,
      "taxType": "VAT_ABLE",
      "amount": 9000.0,
      "vat": 1000.0,
      "barcode": "9898989898",
      "items": [
        {
          "code": "1234567890123",
          "name": "Product A",
          "unitPrice": 1000.0,
          "quantity": 9,
          "totalPrice": 9000.0,
          "vat": 1000.0
        }
      ]
    }
  ],
  "payments": [
    { "paymentMethod": "CASH", "amount": 5000.0 },
    { "paymentMethod": "CARD", "amount": 5000.0 }
  ]
}


Response body

{
  "id": "abcd-efgh-1234",
  "posId": "POS12345",
  "status": "CREATED",
  "message": "OK",
  "dateTime": "2025-03-01T12:35:01",
  "districtCode": "001",
  "totalAmount": 10000.0,
  "totalVAT": 1000.0,
  "lottery": true,
  "cashAmount": 5000.0,
  "nonCashAmount": 5000.0,
  "amountWithoutVAT": 9000.0,
  "taxType": "VAT_ABLE",
  "receipts": [
    {
      "receiptNumber": "00012345",
      "ddtd": "123456789012",
      "qrData": "data_for_qr_code"
    }
  ],
  "payments": [
    { "paymentMethod": "CASH", "amount": 5000.0 },
    { "paymentMethod": "CARD", "amount": 5000.0 }
  ]
}

DELETE /rest/receipt – cancel or refund

Request body

{
  "id": "00012345",
  "date": "2025-03-01"
}


Response body

{
  "status": "SUCCESS",
  "message": "Receipt cancelled"
}

GET /rest/sendData – send queued data

Call this endpoint with no body. It returns 200 OK on success.

GET /rest/info – POS and merchant status

Response body

{
  "operatorName": "My Operator",
  "operatorTIN": "123456789",
  "posId": "POS12345",
  "posNo": "01",
  "lastSentDate": "2025-03-01T12:30:00",
  "leftLotteries": 100,
  "appInfo": { "version": "3.0.1", "buildDate": "2025-02-20" },
  "merchants": [
    {
      "tin": "123456789",
      "name": "Company XYZ",
      "address": "Street 1, District 1",
      "vatPayer": true,
      "registeredAt": "2024-09-01",
      "lat": 47.9,
      "lng": 106.9,
      "companyName": "Company XYZ LLC"
    }
  ]
}

GET /rest/bankAccounts?tin={tin} – bank accounts

Response body

[
  {
    "id": 1,
    "tin": "123456789",
    "bankAccountNo": "123456789012",
    "bankAccountName": "Default account",
    "bankId": "21",
    "bankName": "ХААН Банк"
  }
]

POST /rest/registerMerchant – register merchant

Request body

{
  "tin": "123456789",
  "districtCode": "001",
  "regNo": "АБ123456",
  "address": "Street 2, District 1",
  "vatPayer": true,
  "posId": "POS12345",
  "posNo": "01",
  "appInfo": { "clientName": "ERP System", "version": "1.0.0" }
}


Response body

{
  "status": "SUCCESS",
  "message": "Merchant registered"
}

GET /rest/getDistrictCode – district codes

Returns a list of district codes and their names:

[
  { "code": "001", "name": "Сүхбаатар дүүрэг" },
  { "code": "002", "name": "Баянгол дүүрэг" }
]

GET /rest/vat_tax_type – tax types

Returns an array of VAT codes used in the POSAPI:

[
  { "code": "VAT_ABLE", "name": "10% VAT" },
  { "code": "VAT_ZERO", "name": "0% VAT" },
  { "code": "VAT_FREE", "name": "Exempt from VAT" }
]


Use these structures as a reference when implementing the API calls in your ERP. All returned information (IDs, lottery numbers, QR codes, messages, etc.) should be displayed in the modal windows described in the previous section.

In summary, this revision preserves the core explanation of POSAPI 3.0 installation and configuration, then elaborates on the dynamic transaction module integration and adds a comprehensive section on UI integration. Each function—saving receipts, canceling receipts, sending queued data, retrieving POS/merchant status, fetching bank accounts, registering merchants, and looking up reference data—has a corresponding button or form in the “Enabled POSAPI submission” tab. Returned data such as lottery numbers, QR codes, status messages, and bank accounts are displayed in modal windows to give users immediate feedback and printing options
developer.itc.gov.mn
.

The new “POSAPI endpoints and data structures” section lists all the key endpoints, showing example JSON request and response payloads for POST, GET, and DELETE operations. This helps developers understand exactly which fields to send and what to expect back, ensuring all functions are available in the ERP system. The compliance checklist reminds integrators to handle buyer information correctly, calculate taxes, support automatic and manual submission, print every receipt, handle product coding, and integrate NHAT-related features
developer.itc.gov.mn
. With these updates, the ERP’s POSAPI module will be functionally complete and aligned with Mongolian e-receipt regulations.
