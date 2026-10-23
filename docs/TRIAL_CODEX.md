# แพ็คเกจ Trial → AI ผ่าน ChatGPT sign-in (Codex)

Trial = PRO ที่ได้จากโค้ดโปรโม (Subscription `PRO` + `TRIALING`) — สิทธิ์และโควตาเหมือน PRO ทุกอย่าง
ต่างกันแค่ AI: เรียกผ่าน **Codex CLI** (`codex exec`) ด้วยบัญชี ChatGPT ของเจ้าของ แทน `OPENAI_API_KEY`
(ท่าเดียวกับ "เทพเย่" ใน simply-brands)

## ทำงานยังไง
- `AiGatewayService.routeFor()` → ผู้ใช้ Trial ได้ route `codex`, คนอื่น `api`
- `createOpenAiClient()` (แทน `new OpenAI`) ดู route แล้วส่ง **ทุก** `chat.completions.create` ของ Trial ไป Codex
  (รวมตัวแยกประเภทข้อความและเช็คชนิดรูป) — **ไม่มี fallback ไป API**; ถ้า Codex ล้ม ใช้ fallback ของแต่ละฟีเจอร์
  (เช่น classify → กฎสำรอง, เช็คชนิดรูป → ถือเป็นอาหาร, วิเคราะห์ → ขอให้ส่งใหม่)
- เวลา Codex ต่อครั้ง: fast 13 วิ · ข้อความ 25 วิ · รูป 36 วิ (`CODEX_FAST_TIMEOUT_SECONDS`, `CODEX_TIMEOUT_SECONDS`, `CODEX_IMAGE_TIMEOUT_SECONDS`)
  งบต่อข้อความ LINE ขยายเป็น 58 วิ (เกิน 1 นาทีจะส่งด้วย push แทน reply)
- ล้ม 3 ครั้งติด → พัก 2 นาที (Trial ใช้ AI ไม่ได้ช่วงนั้น); รอคิวเกิน 12 วิ → ยกเลิก
- รันทีละงาน (serialize) เพราะ Codex อาจหมุน refresh token; token ใหม่ถูกเข้ารหัสเก็บกลับ DB ทุกครั้ง
- auth.json เก็บใน `AiCredential` แบบ AES-256-GCM, กุญแจอยู่ใน env `CODEX_VAULT_KEY` เท่านั้น
- child process ได้ env น้อยที่สุด (ไม่มี DATABASE_URL / API keys), sandbox read-only, ephemeral

## Free / Pro
- ใช้ `OPENAI_API_KEY` ทั้งหมด และ **GPT-6 ขึ้นไปเท่านั้น**: `AI_MODEL_SMART`, `AI_MODEL_FAST`, `FOOD_VISION_MODEL`
  ที่ตั้งเป็นรุ่นเก่า (gpt-4o, gpt-5 …) จะถูกเมิน แล้วใช้ค่าเริ่มต้น gpt-6.1-sol / gpt-6-luna

## ตั้งค่า
1. Railway variable `CODEX_VAULT_KEY` (32 bytes hex) — ถ้าเปลี่ยนกุญแจ ต้องวาง auth.json ใหม่
2. บนเครื่องตัวเอง: `npm i -g @openai/codex && codex login` (Sign in with ChatGPT) → `cat ~/.codex/auth.json`
3. /admin → การ์ด "AI ของแพ็คเกจ Trial" → วาง auth.json → บันทึก → ทดสอบ

ตัวเลือก: `CODEX_TRIAL_ENABLED=false` (ปิด → Trial กลับไปใช้ API), `CODEX_BIN`

## ความเสี่ยง
- เงื่อนไขของ OpenAI: subscription ChatGPT มีไว้ใช้ส่วนตัว การเอาไปให้ผู้ใช้หลายคนใช้อาจผิดเงื่อนไข/โดนจำกัด
- ถ้า Railway โดนเจาะอีก (ได้ทั้ง env + DB) token ChatGPT หลุดได้ → เข้า ChatGPT → Settings → Security → Log out of all devices แล้ว `codex login` ใหม่
