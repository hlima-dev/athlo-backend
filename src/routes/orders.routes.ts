import { Router } from 'express'
import { OrderController } from '../controllers/OrderController'
import { authenticate } from '../middlewares/auth'
import { requireActiveSubscription } from '../middlewares/requireActiveSubscription'

const router = Router()
const controller = new OrderController()

router.use(authenticate)

router.get('/', (req, res) => controller.list(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.get('/:id/pdf', (req, res) => controller.generatePdf(req, res))
router.post('/', requireActiveSubscription, (req, res) => controller.create(req, res))
router.patch('/:id', requireActiveSubscription, (req, res) => controller.update(req, res))
router.patch('/:id/status', requireActiveSubscription, (req, res) => controller.updateStatus(req, res))
router.delete('/:id', requireActiveSubscription, (req, res) => controller.delete(req, res))

export { router as orderRouter }
