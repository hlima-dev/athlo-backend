// Carregado antes de qualquer teste (via vitest.config.ts setupFiles).
// src/config/env.ts valida process.env no import e derruba o processo se
// faltar algo — os testes não têm um banco real, então só precisam de
// valores plausíveis (nunca usados de verdade) para passar na validação.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/athlo_test'
process.env.JWT_SECRET = 'test_jwt_secret_de_pelo_menos_32_caracteres'
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_de_pelo_menos_32_caracteres'
process.env.RESEND_API_KEY = 'test_resend_key'
process.env.EMAIL_FROM = 'test@athlo.app'
process.env.APP_URL = 'http://localhost:5173'
