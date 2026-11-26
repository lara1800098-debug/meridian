Extract structured information from this tender / RFP document for a Go/No-Go decision by Concentrix.
For every field return {"value": string|null, "quote": exact supporting text from the document or null}. If the document does not say, value = null.
Fields: issuer, scope, services, volumes, languages, channels, locations, slas, penalties, contract_length, evaluation_criteria, local_content, data_residency, certifications, clarification_deadline, submission_deadline, submission_format.
Return JSON: {"fields": {<field>: {"value":..., "quote":...}}}
