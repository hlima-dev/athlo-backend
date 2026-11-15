import { Router } from 'express'
import { InsumoController } from '../controllers/InsumoController'
import { authenticate } from '../middlewares/auth'
import { requireActiveSubscription } from '../middlewares/requireActiveSubscription'
import { requireModulePermission } from '../middlewares/requireModulePermission'
import { OrgModule } from '@prisma/client'

const router = Router()
const controller = new InsumoController()

router.use(authenticate)
router.use(requireModulePermission(OrgModule.INSUMOS))

router.get('/', (req, res) => controller.list(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.post('/', requireActiveSubscription, (req, res) => controller.create(req, res))
router.patch('/:id', requireActiveSubscription, (req, res) => controller.update(req, res))
router.delete('/:id', requireActiveSubscription, (req, res) => controller.delete(req, res))

router.get('/:id/prices', (req, res) => controller.listPrices(req, res))
router.post('/:id/prices', requireActiveSubscription, (req, res) => controller.addPrice(req, res))

export { router as insumoRouter }
