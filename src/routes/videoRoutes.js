import { Router } from 'express';
import {
  generateVideo,
  getProjectStatus,
  getProjectById,
  getProjects,
  renderCustomProject,
  downloadVideo,
  downloadSubtitles,
  deleteProject,
  regenerateSceneVisual,
  regenerateSceneAudio,
  regenerateSceneShot,
  addSceneShot,
  updateScene,
  deleteScene,
  generateProjectThumbnail,
  getYouTubeMetadata,
  downloadThumbnail,
  exportStoryboardKit,
  importSceneClip
} from '../controllers/videoController.js';
import { requireAuth } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import { config } from '../config.js';

const uploadDir = path.join(config.storageDir, 'temp', 'uploads');
import fs from 'fs';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

const router = Router();

router.post('/generate', requireAuth, generateVideo);
router.get('/', requireAuth, getProjects);
router.get('/:id/status', requireAuth, getProjectStatus);
router.get('/:id', requireAuth, getProjectById);
router.post('/:id/render', requireAuth, renderCustomProject);
router.get('/:id/download', downloadVideo); // Public/authenticated download
router.get('/:id/subtitles', downloadSubtitles);
router.get('/:id/thumbnail/download', downloadThumbnail);
router.delete('/:id', requireAuth, deleteProject);

// YouTube Publishing & 3D Thumbnail Generation
router.post('/:id/thumbnail', requireAuth, generateProjectThumbnail);
router.get('/:id/youtube-metadata', requireAuth, getYouTubeMetadata);

// Storyboard Prompt Kit Export & Clip Import (OpenArt, AI Canvas, Kling)
router.get('/:id/export-storyboard', requireAuth, exportStoryboardKit);
router.post('/:id/scenes/:sceneNumber/import-clip', requireAuth, upload.single('clip'), importSceneClip);

// Selective Scene-level Editing & Multi-Shot Regeneration Routes
router.post('/:id/scenes/:sceneNumber/regenerate-visual', requireAuth, regenerateSceneVisual);
router.post('/:id/scenes/:sceneNumber/regenerate-audio', requireAuth, regenerateSceneAudio);
router.post('/:id/scenes/:sceneNumber/shots/:shotNumber/regenerate', requireAuth, regenerateSceneShot);
router.post('/:id/scenes/:sceneNumber/shots/add', requireAuth, addSceneShot);
router.put('/:id/scenes/:sceneNumber', requireAuth, updateScene);
router.delete('/:id/scenes/:sceneNumber', requireAuth, deleteScene);

export default router;
