import { Router } from 'express'
import { TrainingController } from '../controllers/TrainingController'
import { authenticate, authorize } from '../middlewares/auth'
import { UserRole } from '@prisma/client'

const router = Router()
const controller = new TrainingController()

router.use(authenticate)

router.get('/', (req, res) => controller.list(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))

router.post(
  '/',
  authorize(UserRole.ADMIN, UserRole.COACH),
  (req, res) => controller.create(req, res),
)

router.patch(
  '/:id',
  authorize(UserRole.ADMIN, UserRole.COACH),
  (req, res) => controller.update(req, res),
)

router.delete(
  '/:id',
  authorize(UserRole.ADMIN),
  (req, res) => controller.delete(req, res),
)

export { router as trainingRouter }
