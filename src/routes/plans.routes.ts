import { Router } from 'express'
import { PlanController } from '../controllers/PlanController'
import { SubscriptionController } from '../controllers/SubscriptionController'
import { authenticate, authorize } from '../middlewares/auth'
import { OrgRole } from '@prisma/client'

const router = Router()
const planController = new PlanController()
const subscriptionController = new SubscriptionController()

// Pública — usada na landing page / tela de preços
router.get('/', (req, res) => planController.list(req, res))

router.get('/subscription', authenticate, (req, res) => subscriptionController.current(req, res))

router.post(
  '/subscription/change',
  authenticate,
  authorize(OrgRole.OWNER, OrgRole.ADMIN),
  (req, res) => subscriptionController.changePlan(req, res),
)

router.post(
  '/subscription/cancel',
  authenticate,
  authorize(OrgRole.OWNER),
  (req, res) => subscriptionController.cancel(req, res),
)

router.post(
  '/subscription/checkout',
  authenticate,
  authorize(OrgRole.OWNER, OrgRole.ADMIN),
  (req, res) => subscriptionController.checkout(req, res),
)

router.post(
  '/subscription/portal',
  authenticate,
  authorize(OrgRole.OWNER, OrgRole.ADMIN),
  (req, res) => subscriptionController.portal(req, res),
)

export { router as planRouter }
