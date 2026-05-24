import { Router } from 'express'
import { DonationController } from '../controllers/DonationController'
import { authenticate, authorize } from '../middlewares/auth'
import { UserRole } from '@prisma/client'

const router = Router()
const controller = new DonationController()

// Pública — qualquer pessoa pode fazer doação
router.post('/', (req, res) => controller.create(req, res))

// Protegidas
router.get(
  '/',
  authenticate,
  authorize(UserRole.ADMIN),
  (req, res) => controller.list(req, res),
)

router.get(
  '/summary',
  authenticate,
  authorize(UserRole.ADMIN),
  (req, res) => controller.summary(req, res),
)

router.patch(
  '/:id/confirm',
  authenticate,
  authorize(UserRole.ADMIN),
  (req, res) => controller.confirm(req, res),
)

export { router as donationRouter }
