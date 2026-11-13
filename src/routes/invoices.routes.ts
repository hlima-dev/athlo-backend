import { Router, text } from 'express'
import { InvoiceController } from '../controllers/InvoiceController'
import { authenticate } from '../middlewares/auth'
import { requireActiveSubscription } from '../middlewares/requireActiveSubscription'
import { requireModulePermission } from '../middlewares/requireModulePermission'
import { quickParseLimiter } from '../middlewares/rateLimiter'
import { OrgModule } from '@prisma/client'

const router = Router()
const controller = new InvoiceController()

router.use(authenticate)
router.use(requireModulePermission(OrgModule.INVOICES))

router.get('/', (req, res) => controller.list(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.get('/:id/pdf', (req, res) => controller.generatePdf(req, res))
router.get('/:id/xml', (req, res) => controller.downloadXml(req, res))
router.post(
  '/import-xml',
  quickParseLimiter,
  text({ type: () => true, limit: '3mb' }),
  (req, res) => controller.importXml(req, res),
)
router.post('/', requireActiveSubscription, (req, res) => controller.create(req, res))
router.patch('/:id', requireActiveSubscription, (req, res) => controller.update(req, res))
router.patch('/:id/pay', requireActiveSubscription, (req, res) => controller.markPaid(req, res))
router.delete('/:id', requireActiveSubscription, (req, res) => controller.delete(req, res))

export { router as invoiceRouter }
