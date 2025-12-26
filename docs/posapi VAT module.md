POSAPI 3.0 Integration – Expanded Documentation

This document describes how to integrate Mongolia’s e‑receipt POSAPI 3.0 into our ERP system. It expands on the previous POSAPI module by incorporating all of the additional endpoints listed in the tax authority’s “Хэрэглэгчийн систем нийлүүлэгчдийн системд тавигдах шаардлага” documentation, and introduces a dynamic endpoint registry to simplify future additions. It also outlines how the UI should behave when invoking these endpoints and displaying results.

Core POSAPI endpoints (recap)

The core POSAPI functions already documented remain unchanged. They include:

Endpoint	Method	Purpose
POST /rest/receipt	Send a batch of B2C/B2B receipts to the tax server. Returns lottery numbers and QR codes.	
DELETE /rest/receipt	Cancel a previously issued receipt using its DDTD and timestamp.	
GET /rest/sendData	Manually trigger the sending of queued (offline) data.	
GET /rest/info	Retrieve POS configuration and remaining lottery numbers.	
GET /rest/bankAccounts	Look up registered bank accounts by merchant TIN.	
POST /rest/registerMerchant	Register a merchant under an operator’s POS.	
GET /rest/districtCodes, GET /rest/taxTypes, GET /rest/vatCodes, etc.	Retrieve reference data such as district codes, tax types and VAT codes.	

Our existing ERP integration already covers the first two endpoints via the dynamicPosApi service and the “POS sales transaction” form. The remaining functions need to be surfaced in the UI.

Additional endpoints from the government specification

The government’s requirements document lists many more POSAPI endpoints beyond the basic receipt operations. These endpoints fall into several categories:

Citizen/consumer lookups – Endpoints such as GET /api/easy-register/api/info/consumer/{identity} return a citizen’s registration number, login name, given name and family name when supplied with a register or login number
developer.itc.gov.mn
.

Electronic payment receipts – A set of POST endpoints for sending electronic payment receipts and sales summaries, and corresponding GET endpoints to verify them. They accept large JSON payloads with lists of items, payment details and extra data (e.g., NHAT and excise‑tax information) and return status objects or printable documents.

Fixed‑tax declarations – POST and GET functions for declaring and retrieving fixed‑tax payer information. These typically include taxpayer TIN, activity codes, and fixed tax amounts.

Foreign entity registration – Endpoints to register and query foreign legal entities who receive VAT invoices.

Excise tax stamp management – Functions to submit, verify and cancel excise stamp transactions, including uploading stamp QR codes and retrieving the status of submitted stamp lists.

Reference and status queries – Additional lookups not covered by the core set, such as retrieving product classification codes, telephone receipt verifications, and branch/terminal information.

Altogether there are roughly thirty such endpoints. Each has its own request and response schema; many use nested arrays and objects similar in complexity to the receipt payload shown in our log example
developer.itc.gov.mn
. When implementing these, refer to the official Stoplight documentation for field‑level details and examples.

Dynamic endpoint registry

To manage this growing list of operations without littering the codebase with bespoke functions, we will adopt a dynamic endpoint registry. The registry is a JSON file (e.g., config/posApiEndpoints.json) containing an array of endpoint definitions. Each definition should include:

id – Unique identifier used internally (e.g., saveReceipt, lookupCitizen).

name – Human‑readable label displayed in the UI.

method – HTTP method (GET, POST or DELETE).

path – POSAPI path with optional {pathParams}.

parameters – Array of path or query parameters, with fields:

name – Parameter name in the API.

in – Location (path or query).

field – ERP form field or user input name providing the value.

required – Boolean indicating if the parameter is mandatory.

requestBody – An object with schema and optional description. The schema is a JSON example or schema representing the request body; users will be able to paste it directly or fetch it from the documentation via a URL.

responseBody – Similar structure for the expected response body.

fieldDescriptions – Dictionary of field names to descriptions used for tooltips in the UI. These can be manually entered or scraped from the Stoplight docs.

testable – Whether this endpoint can be called against a test server.

testServerUrl – Default base URL for the test environment (if applicable).

Example entry:

{
  "id": "saveReceipt",
  "name": "Save B2C/B2B Receipt",
  "method": "POST",
  "path": "/rest/receipt",
  "parameters": [],
  "requestBody": {
    "schema": { /* large JSON payload */ },
    "description": "Batch of receipts with payments and items"
  },
  "responseBody": {
    "schema": { /* returns lottery number, QR code, etc. */ },
    "description": "Receipt submission response"
  },
  "fieldDescriptions": {
    "totalAmount": "Total invoice amount including tax",
    "taxType": "VAT_ABLE, VAT_FREE, VAT_ZERO or NO_VAT",
    /* ... */
  },
  "testable": true,
  "testServerUrl": "https://posapi-test.tax.gov.mn"
}


The registry allows administrators to add or modify endpoints without changing application code. The backend will load this file and, given an endpointId, will know how to construct the request and parse the response.

Dynamic UI behaviour

The UI must support two user roles:

Administrators – Manage the endpoint registry via an admin page. They can create, edit or delete endpoint definitions. When editing, they can paste request/response JSON samples or provide a URL; the system fetches the page, scrapes the JSON and descriptions, and stores them in the registry.

Transaction users – Use configured endpoints in the context of a transaction form. Each form in transactionForms.json will specify a posApiCalls array referencing one or more endpointIds. When the user triggers a call (e.g., pressing a button or submitting the form), the system:

Reads the endpoint definition.

Collects values from the transaction record and input controls based on the parameters and requestBody mappings.

Constructs the request and sends it via the generic POSAPI service.

Displays the response in a modal window, using fieldDescriptions to show tooltips.

Persists any returned values (e.g., lottery number, QR code) back into the transaction record.

For testable endpoints, the UI should provide a Test button. When clicked, it prompts the user to confirm they wish to use the test server and then sends the request to the testServerUrl instead of production.

Reference for further integration

This document focuses on architecture and does not list all ~30 endpoints individually. For detailed request and response schemas, please consult the official POSAPI documentation at https://developer.itc.gov.mn/docs/ebarimt-api/. As you add each endpoint to the registry, capture the JSON examples and field descriptions from the docs. The dynamic registry and UI described here will allow our ERP to support the full breadth of POSAPI 3.0 features without rewriting code for each new service.

To help Codex implement the changes in manageable chunks, use the following series of prompts. Each step builds on the documentation above:

Create the endpoint registry file
Prompt: “Add a new JSON file config/posApiEndpoints.json. It should export an array of objects, each with id, name, method, path, parameters, requestBody, responseBody, fieldDescriptions, testable, and testServerUrl as described in the updated POSAPI module doc. Start by defining an entry for saveReceipt that matches the example in the doc.”

Implement a registry loader
Prompt: “Create api-server/services/posApiRegistry.js with functions loadEndpoints() and getEndpointById(id). These functions read config/posApiEndpoints.json (with caching) and return all entries or a single entry. Write a simple unit test to verify correct lookup.”

Generic POSAPI invocation service
Prompt: “Write api-server/services/genericPosApi.js. Export invokeEndpoint(endpointId, data, options). Fetch the endpoint definition via getEndpointById(), build the URL with path and query parameters, construct the request body from data according to requestBody.schema, call the POSAPI using the existing OAuth token logic, and return the JSON response. Handle missing required fields and HTTP errors gracefully.”

Admin UI to manage endpoints
Prompt: “Add an admin page PosApiAdmin.jsx that lists endpoints returned by loadEndpoints(). Allow users to view/edit each entry (including pasting JSON request/response bodies or fetching them from a URL), create new endpoints, and delete existing ones. Saving should update the posApiEndpoints.json file via a backend route. Use fieldDescriptions to display tooltips in the editor.”

Integrate dynamic POSAPI calls into forms
Prompt: “Update transactionForms.json to include a posApiCalls array for any form that should trigger POSAPI operations. Each call references an endpoint ID and specifies a trigger (onSubmit or button) and a modal title. Extend the form components to detect these calls, gather current form data, send it to a new route /api/posapi/invoke/:endpointId, and display the response fields in a modal with tooltips based on fieldDescriptions.”

Add test mode support
Prompt: “For endpoints marked testable: true, add a ‘Test’ button to the modal form. When clicked, confirm with the user that they want to call the test server (testServerUrl) instead of production, then invoke the endpoint against the test server. Show the result in the modal labeled as a test response.”
