import { Router } from 'express'
import { OrganizationController } from '../controllers/OrganizationController'
import { authenticate, authorize } from '../middlewares/auth'
import { OrgRole } from '@prisma/client'

const router = Router()
const controller = new OrganizationController()

router.use(authenticate)

router.get('/me', (req, res) => controller.me(req, res))
router.get('/members', (req, res) => controller.members(req, res))

router.patch(
  '/me',
  authorize(OrgRole.OWNER, OrgRole.ADMIN),
  (req, res) => controller.update(req, res),
)

export { router as organizationRouter }
