# Production smoke-test checklist

Run against a staging or production-like environment with real LINE + HTTPS.
Do **not** use Quick Tunnel for production smoke.

Mark each item only after observing the expected result.

## Infrastructure

- [ ] 1. `GET /health/live` → `200` `{ "alive": true }`
- [ ] 2. `GET /health/ready` → `200` `{ "ready": true }` with DB up; confirm `503` if DB stopped
- [ ] 3. LINE Developers → Verify webhook `https://<prod-host>/line/webhook` → success

## Core user flows

- [ ] 4. Add Friend → welcome / onboarding prompt
- [ ] 5. Complete onboarding (sex → age → height → weights → activity → goal → confirm)
- [ ] 6. Food text e.g. `ข้าวกะเพราไก่` → estimate card → [บันทึก] creates FoodLog
- [ ] 7. Food image → estimate card (or friendly OpenAI error if mocked down)
- [ ] 8. Quantity adjust e.g. `กินแค่ 3 ชิ้น` → local proportional macros, **no** new OpenAI call
- [ ] 9. Confirmation race: double-tap บันทึก → only one FoodLog
- [ ] 10. `วันนี้` → compact summary + one tip from DB numbers
- [ ] 11. Weight `84.2` → saved; `น้ำหนักล่าสุด` / trend questions from WeightLog
- [ ] 12. `มื้อเย็นกินอะไรดี` → suggestions constrained by remaining macros

## Integrations / failure modes

- [ ] 13. Google Sheets (if enabled): new FoodLog / WeightLog / profile appears; formula cells sanitized
- [ ] 14. OpenAI failure: food analysis friendly error; daily summary still shows DB numbers
- [ ] 15. Duplicate webhook (same `webhookEventId`) → no second mutation
- [ ] 16. Cross-user isolation: User B cannot confirm / see User A pending or FoodLogs

## Cancel / replace

- [ ] Cancel pending → `ยกเลิกการบันทึกแล้วครับ`, pending cleared
- [ ] New food while pending → ask replace vs keep (no silent overwrite)

## Sign-off

| Environment | Tester | Date | Pass? |
| --- | --- | --- | --- |
| | | | |
