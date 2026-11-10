import { Router } from 'express'
import { AuditLogController } from '../controllers/AuditLogController'
import { authenticate, authorize } from '../middlewares/auth'
import { OrgRole } from '@prisma/client'

const router = Router()
const controller = new AuditLogController()

router.use(authenticate)

// Visível pro próprio tenant (OWNER/ADMIN da empresa) — diferente do
// ErrorLog, que é só pra equipe ATHLO via requirePlatformAdmin.
router.get('/', authorize(OrgRole.OWNER, OrgRole.ADMIN), (req, res) => controller.list(req, res))

export { router as auditLogRouter }
