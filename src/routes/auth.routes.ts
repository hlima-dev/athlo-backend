import { Router } from 'express'
import { AuthController } from '../controllers/AuthController'
import { authenticate } from '../middlewares/auth'
import { authLimiter, passwordResetLimiter } from '../middlewares/rateLimiter'

const router = Router()
const controller = new AuthController()

router.post('/register', authLimiter, (req, res) => controller.register(req, res))
router.post('/login', authLimiter, (req, res) => controller.login(req, res))
router.post('/refresh', authLimiter, (req, res) => controller.refresh(req, res))

router.post('/forgot-password', passwordResetLimiter, (req, res) =>
  controller.forgotPassword(req, res)
)
router.post('/reset-password', passwordResetLimiter, (req, res) =>
  controller.resetPassword(req, res)
)

router.post('/logout', authenticate, (req, res) => controller.logout(req, res))
router.get('/me', authenticate, (req, res) => controller.me(req, res))

export { router as authRouter }
