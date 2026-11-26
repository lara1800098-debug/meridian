Classify this public news item for Concentrix MET new-business prospecting.
Allowed signal types: {{types}}
Allowed sectors: {{sectors}}
Return JSON with:
- signal_type (one of the allowed types)
- sector (one of the allowed sectors)
- country (ISO-2)
- org_type: government | semi_government | private | smb | startup
- organisation_en: the main organisation exactly as named in the source, or null
- organisation_ar: its Arabic name only if present in the source, or null
- amount_text: exact amount phrase from the source, or null
- deadline: ISO date if a submission/effective date is stated, or null
- confidence: 0..1 — how clearly the source supports the classification
- evidence: array of up to 3 short exact quotes from the source supporting the classification
