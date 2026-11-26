# Meridian — Admin guide

## First day
1. Sign in with the seeded Admin account and set up MFA (scan the QR code).
2. **Admin → Users → Invite user.** Give each person:
   - a **role** (Executive, Sales Director, AE, BDR, Admin);
   - their **countries** (e.g. `AE`) and, optionally, sectors;
   - their **work week** (UAE Mon–Fri / KSA Sun–Thu, which decides when the Monday Brief arrives) and language;
   - a **manager**, so Directors see their team.

   Copy the invite link and send it yourself (Meridian sends no email). Links expire after 7 days.
3. **Admin → Sources.**
   - Review every enabled source.
   - Confirm its terms of use with Legal, then tick **Terms checked**.
   - Add new public RSS feeds or pages. Meridian checks robots.txt on every run and switches off any source that forbids automated reading.
4. **Admin → Offers.** Edit the Offer Catalogue and add **anonymised** case studies as proof points (one per line: `text | link`).
5. **Admin → Rate cards.** Replace the placeholder seat prices with CNX-approved ranges, then untick "placeholder".
6. **Forecast → Targets.** Enter quarterly targets (by country, sector and track, or `ALL`).
7. **Admin → FX rates.** Keep the rates current. All values are stored in their deal currency and converted for display.
8. **Admin → Scoring.**
   - Adjust weights and thresholds if needed. Saving rescores every signal in the background.
   - Confirm the Ramadan, Eid and summer dates for the year.

## Every week
- **Admin → Monitoring.**
  - Check sources that show "error".
  - Check the dead-letter queue, and use **Retry all** after fixing a cause.
- **Admin → AI usage.** Watch spend against the daily budget.

## Every quarter
- **Admin → Calibration.** Once there are 30 or more accepted/dismissed plays, review the proposed weights (with AUC before/after) and approve them only if they make sense.

## Privacy requests (UAE PDPL / KSA PDPL)
- **Admin → Privacy.** Deletes a named person from People and the Access Map. The deletion is audited.
- **Retention.** `npm run retention -- --days 730`.

## AI settings
- With no API key, Meridian runs on rules and templates.
- With a key, choose a model per task, set the daily budget, or switch AI off entirely.
