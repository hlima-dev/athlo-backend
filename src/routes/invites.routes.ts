import { Router } from 'express'
import { InviteController } from '../controllers/InviteController'
import { authenticate, authorize } from '../middlewares/auth'
import { OrgRole } from '@prisma/client'

const router = Router()
const controller = new InviteController()

router.use(authenticate)
router.use(authorize(OrgRole.OWNER, OrgRole.ADMIN))

router.get('/', (req, res) => controller.list(req, res))
router.post('/', (req, res) => controller.create(req, res))
router.delete('/:id', (req, res) => controller.revoke(req, res))

export { router as inviteRouter }
