import { Router } from 'express'
import { AuthController } from '../controllers/AuthController'
import { authenticate } from '../middlewares/auth'
import { authLimiter, passwordResetLimiter } from '../middlewares/rateLimiter'

const router = Router()
const controller = new AuthController()

router.post('/register', authLimiter, (req, res) => controller.register(req, res))
router.post('/login', authLimiter, (req, res) => controller.login(req, res))
router.post('/select-organization', authLimiter, (req, res) => controller.selectOrganization(req, res))
router.post('/refresh', authLimiter, (req, res) => controller.refresh(req, res))

router.post('/switch-organization', authenticate, (req, res) => controller.switchOrganization(req, res))
router.get('/organizations', authenticate, (req, res) => controller.listOrganizations(req, res))
router.post('/organizations', authenticate, (req, res) => controller.createOrganization(req, res))

router.post('/forgot-password', passwordResetLimiter, (req, res) =>
  controller.forgotPassword(req, res)
)
router.post('/reset-password', passwordResetLimiter, (req, res) =>
  controller.resetPassword(req, res)
)

router.post('/logout', authenticate, (req, res) => controller.logout(req, res))
router.get('/me', authenticate, (req, res) => controller.me(req, res))
router.patch('/me', authenticate, (req, res) => controller.updateProfile(req, res))
router.post('/change-password', authenticate, passwordResetLimiter, (req, res) =>
  controller.changePassword(req, res)
)

router.post('/verify-email', passwordResetLimiter, (req, res) => controller.verifyEmail(req, res))
router.post('/resend-verification', authenticate, passwordResetLimiter, (req, res) =>
  controller.resendVerification(req, res)
)

export { router as authRouter }
