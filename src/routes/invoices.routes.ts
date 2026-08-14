import { Router } from 'express'
import { InvoiceController } from '../controllers/InvoiceController'
import { authenticate } from '../middlewares/auth'
import { requireActiveSubscription } from '../middlewares/requireActiveSubscription'

const router = Router()
const controller = new InvoiceController()

router.use(authenticate)

router.get('/', (req, res) => controller.list(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.get('/:id/pdf', (req, res) => controller.generatePdf(req, res))
router.post('/', requireActiveSubscription, (req, res) => controller.create(req, res))
router.patch('/:id', requireActiveSubscription, (req, res) => controller.update(req, res))
router.patch('/:id/pay', requireActiveSubscription, (req, res) => controller.markPaid(req, res))
router.delete('/:id', requireActiveSubscription, (req, res) => controller.delete(req, res))

export { router as invoiceRouter }
