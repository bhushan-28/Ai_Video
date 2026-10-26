import { Router } from 'express';
import { getVoices, previewVoice, getMusicTracks } from '../controllers/voiceController.js';

const router = Router();

router.get('/', getVoices);
router.post('/preview', previewVoice);
router.get('/music', getMusicTracks);

export default router;
