import { Router } from 'express';
import { getSettings, updateSettings, testGeminiKey, testProvider } from '../controllers/settingsController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', getSettings);
router.post('/', requireAuth, updateSettings);
router.post('/test-gemini', requireAuth, testGeminiKey);
router.post('/test-provider', requireAuth, testProvider);

export default router;
