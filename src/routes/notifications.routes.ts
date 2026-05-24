import { Router } from 'express'
import { NotificationController } from '../controllers/NotificationController'
import { authenticate, authorize } from '../middlewares/auth'
import { UserRole } from '@prisma/client'

const router = Router()
const controller = new NotificationController()

router.use(authenticate)

router.get('/me', (req, res) => controller.listMine(req, res))
router.get('/me/unread-count', (req, res) => controller.unreadCount(req, res))
router.patch('/me/read-all', (req, res) => controller.markAllRead(req, res))
router.patch('/:id/read', (req, res) => controller.markRead(req, res))

router.post(
  '/',
  authorize(UserRole.ADMIN),
  (req, res) => controller.create(req, res),
)

export { router as notificationRouter }
