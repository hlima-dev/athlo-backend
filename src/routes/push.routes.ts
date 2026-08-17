import { Router } from 'express'
import { PushController } from '../controllers/PushController'
import { authenticate } from '../middlewares/auth'

const router = Router()
const controller = new PushController()

router.get('/public-key', (req, res) => controller.publicKey(req, res))
router.post('/subscribe', authenticate, (req, res) => controller.subscribe(req, res))
router.post('/unsubscribe', authenticate, (req, res) => controller.unsubscribe(req, res))

export { router as pushRouter }
