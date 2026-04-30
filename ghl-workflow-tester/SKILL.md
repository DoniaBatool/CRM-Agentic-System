---
name: ghl-workflow-tester
description: Automated testing for GoHighLevel workflows via inbound webhooks. Use this skill to simulate contact events (Personal Consultation, Treatment) by automatically fetching contact details and sending custom JSON payloads to GHL webhooks based on event/action mapping.
---

# GHL Workflow Tester

This skill automates the process of testing GoHighLevel (GHL) workflows that are triggered by inbound webhooks. It replaces manual Postman requests by using your custom GHL MCP tools to fetch live contact data and send formatted payloads.

## Workflow

### 1. Contact Lookup
When a test is requested for a specific contact name:
- Use `mcp_ghl-workflows_find_contact` to retrieve the contact's `email`, `phone`, and `name`.
- Parse the `name` into `first_name` and `last_name`.

### 2. Scenario Selection & Inputs
Ask the user for:
- **Event**: (`treatment` or `Personal Consultation`)
- **Action**: (`booked` or `rescheduled`)
- **Appointment DateTime**: (ISO 8601 Format: `YYYY-MM-DDTHH:mm:ss`)

### 3. URL Mapping (Environment Variables)
Select the target URL based on the user's inputs:
- `treatment` + `booked` ➡️ `GHL_WEBHOOK_TREATMENT_BOOKED`
- `treatment` + `rescheduled` ➡️ `GHL_WEBHOOK_TREATMENT_RESCHEDULED`
- `Personal Consultation` + `booked` ➡️ `GHL_WEBHOOK_PC_BOOKED`
- `Personal Consultation` + `rescheduled` ➡️ `GHL_WEBHOOK_PC_RESCHEDULED`

### 4. Payload Construction
Combine the fetched contact details with the user's inputs into the final JSON structure:
```json
{
  "event": "{user_event}",
  "action": "{user_action}",
  "email": "{contact_email}",
  "contact_number": "{contact_phone}",
  "first_name": "{contact_first_name}",
  "last_name": "{contact_last_name}",
  "appointment_datetime": "{user_datetime}",
  "secret": "abc123"
}
```

### 5. Execution
Send the final payload to the mapped webhook URL using `mcp_ghl-workflows_send_inbound_webhook`.
- **Method**: `POST`

## Resources
- **Templates**: Found in `assets/payload-templates.json`.
- **Tools**: Relies on `ghl-workflows` MCP server.
- **Config**: Relies on URLs defined in `.env`.
