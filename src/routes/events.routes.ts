import { Router } from 'express'
import { EventController } from '../controllers/EventController'
import { authenticate, authorize } from '../middlewares/auth'
import { aiLimiter } from '../middlewares/rateLimiter'
import { OrgRole } from '@prisma/client'

const router = Router()
const controller = new EventController()

router.use(authenticate)

router.get('/', (req, res) => controller.list(req, res))
router.post('/ai-parse', aiLimiter, (req, res) => controller.parseWithAi(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.post('/', (req, res) => controller.create(req, res))
router.patch('/:id', (req, res) => controller.update(req, res))

router.delete(
  '/:id',
  authorize(OrgRole.OWNER, OrgRole.ADMIN),
  (req, res) => controller.delete(req, res),
)

export { router as eventRouter }
