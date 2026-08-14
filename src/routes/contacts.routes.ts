import { Router } from 'express'
import { ContactController } from '../controllers/ContactController'
import { authenticate } from '../middlewares/auth'
import { requireActiveSubscription } from '../middlewares/requireActiveSubscription'

const router = Router()
const controller = new ContactController()

router.use(authenticate)

router.get('/', (req, res) => controller.list(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.post('/', requireActiveSubscription, (req, res) => controller.create(req, res))
router.patch('/:id', requireActiveSubscription, (req, res) => controller.update(req, res))
router.delete('/:id', requireActiveSubscription, (req, res) => controller.delete(req, res))

export { router as contactRouter }
