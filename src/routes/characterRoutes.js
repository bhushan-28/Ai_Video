import { Router } from 'express';
import { 
  getCharacters, 
  getCharacterById, 
  createCharacter, 
  updateCharacter, 
  deleteCharacter,
  regenerateCharacterRef 
} from '../controllers/characterController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, getCharacters);
router.get('/:id', requireAuth, getCharacterById);
router.post('/', requireAuth, createCharacter);
router.post('/:id/regenerate-ref', requireAuth, regenerateCharacterRef);
router.put('/:id', requireAuth, updateCharacter);
router.delete('/:id', requireAuth, deleteCharacter);

export default router;
