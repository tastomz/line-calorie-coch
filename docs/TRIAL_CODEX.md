# แพ็คเกจ Trial → AI ผ่าน ChatGPT sign-in (Codex)

Trial = PRO ที่ได้จากโค้ดโปรโม (Subscription `PRO` + `TRIALING`) — สิทธิ์และโควตาเหมือน PRO ทุกอย่าง
ต่างกันแค่ AI: เรียกผ่าน **Codex CLI** (`codex exec`) ด้วยบัญชี ChatGPT ของเจ้าของ แทน `OPENAI_API_KEY`
(ท่าเดียวกับ "เทพเย่" ใน simply-brands)

## ทำงานยังไง
- `AiGatewayService.routeFor()` → ผู้ใช้ Trial ได้ route `codex`, คนอื่น `api`
- `createOpenAiClient()` (แทน `new OpenAI`) ดู route แล้วส่ง `chat.completions.create` ไป Codex
  - โมเดล FAST (แยกประเภทข้อความ, เช็คชนิดรูป) ยังใช้ API เสมอ เพื่อให้ตอบไว
  - Codex ล้ม / timeout / คิวรอเกิน 5 วิ / พักหลังล้ม 3 ครั้งติด (5 นาที) → ใช้ API key แทนอัตโนมัติ
- รันทีละงาน (serialize) เพราะ Codex อาจหมุน refresh token; token ใหม่ถูกเข้ารหัสเก็บกลับ DB ทุกครั้ง
- auth.json เก็บใน `AiCredential` แบบ AES-256-GCM, กุญแจอยู่ใน env `CODEX_VAULT_KEY` เท่านั้น
- child process ได้ env น้อยที่สุด (ไม่มี DATABASE_URL / API keys), sandbox read-only, ephemeral

## ตั้งค่า
1. Railway variable `CODEX_VAULT_KEY` (32 bytes hex) — ถ้าเปลี่ยนกุญแจ ต้องวาง auth.json ใหม่
2. บนเครื่องตัวเอง: `npm i -g @openai/codex && codex login` (Sign in with ChatGPT) → `cat ~/.codex/auth.json`
3. /admin → การ์ด "AI ของแพ็คเกจ Trial" → วาง auth.json → บันทึก → ทดสอบ

ตัวเลือก: `CODEX_TRIAL_ENABLED=false` (ปิด), `CODEX_TIMEOUT_SECONDS` (25), `CODEX_MAX_PENDING` (2), `CODEX_BIN`

## ความเสี่ยง
- เงื่อนไขของ OpenAI: subscription ChatGPT มีไว้ใช้ส่วนตัว การเอาไปให้ผู้ใช้หลายคนใช้อาจผิดเงื่อนไข/โดนจำกัด
- ถ้า Railway โดนเจาะอีก (ได้ทั้ง env + DB) token ChatGPT หลุดได้ → เข้า ChatGPT → Settings → Security → Log out of all devices แล้ว `codex login` ใหม่
