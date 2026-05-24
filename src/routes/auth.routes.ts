import { Router } from 'express'
import { AuthController } from '../controllers/AuthController'
import { authenticate } from '../middlewares/auth'

const router = Router()
const controller = new AuthController()

// Públicas
router.post('/register', (req, res) => controller.register(req, res))
router.post('/login', (req, res) => controller.login(req, res))
router.post('/refresh', (req, res) => controller.refresh(req, res))

// Protegidas
router.post('/logout', authenticate, (req, res) => controller.logout(req, res))
router.get('/me', authenticate, (req, res) => controller.me(req, res))

export { router as authRouter }
