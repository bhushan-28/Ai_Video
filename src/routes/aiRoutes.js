import { Router } from 'express';
import { improvePrompt, generateScript, regenerateScene } from '../controllers/aiController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/improve-prompt', requireAuth, improvePrompt);
router.post('/generate-script', requireAuth, generateScript);
router.post('/analyze-script', requireAuth, generateScript);
router.post('/regenerate-scene', requireAuth, regenerateScene);

export default router;
