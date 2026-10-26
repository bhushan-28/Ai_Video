import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database/db.js';
import { jobQueue } from '../services/jobQueue.js';
import { config } from '../config.js';
import { visualService } from '../services/visualService.js';
import { scriptAnalysisService } from '../services/scriptAnalysisService.js';
import { videoRenderer } from '../services/videoRenderer.js';
import { videoProviderService } from '../services/videoProviderService.js';

export const generateVideo = async (req, res) => {
  try {
    const {
      prompt,
      title,
      description,
      style = '3d_animation',
      duration = 0,
      aspectRatio = '9:16',
      language = 'en',
      subtitleLanguage = 'same',
      voiceId,
      musicMood = 'calm_acoustic',
      characterId,
      characters,
      scenes,
      isScriptApproved = false,
      videoProvider = 'local_motion_engine'
    } = req.body;

    if (!prompt && (!scenes || scenes.length === 0)) {
      return res.status(400).json({ error: 'Please provide a topic, prompt, or scenes to generate video.' });
    }

    const projectId = `proj-${uuidv4().slice(0, 8)}`;
    const userApiKey = req.headers['x-gemini-key'] || null;

    const newProject = {
      id: projectId,
      userId: req.user?.id || 'usr-demo-001',
      title: title || `${(prompt || 'AI Video').slice(0, 30)}...`,
      description: description || 'Generated with AI Video Studio & Gemini',
      topic: prompt || '',
      style,
      videoProvider,
      duration: duration ? parseInt(duration, 10) : 0,
      estimatedDuration: 0,
      finalDuration: 0,
      aspectRatio,
      language,
      subtitleLanguage,
      voiceId: (language === 'hi' && (!voiceId || !voiceId.startsWith('hi-')))
        ? 'hi-IN-SwaraNeural'
        : (language === 'mr' && (!voiceId || !voiceId.startsWith('mr-')))
        ? 'mr-IN-AarohiNeural'
        : (voiceId || 'en-US-JennyNeural'),
      musicMood,
      characterId: characterId || null,
      characters: Array.isArray(characters) ? characters : [],
      scenes: Array.isArray(scenes) ? scenes : [],
      isScriptApproved: Boolean(isScriptApproved),
      status: 'queued',
      progress: 0,
      currentStage: 'Queued in background queue...',
      videoUrl: null,
      subtitleUrl: null,
      srtContent: null,
      createdAt: new Date().toISOString()
    };

    db.saveProject(newProject);

    // Launch background generation job
    const job = jobQueue.startGenerationJob({
      projectId,
      prompt: newProject.topic,
      style,
      duration: newProject.duration,
      aspectRatio,
      language,
      subtitleLanguage,
      voiceId: newProject.voiceId,
      musicMood,
      characterId,
      userApiKey,
      videoProvider: newProject.videoProvider
    });

    res.status(202).json({
      message: 'Video generation started in background',
      projectId,
      status: 'queued',
      initialStage: job.stage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const job = jobQueue.getJob(id);

    res.json({
      id: project.id,
      title: project.title,
      status: job ? job.status : project.status,
      progress: job ? job.progress : project.progress,
      currentStage: job ? job.stage : project.currentStage,
      stageIndex: job?.stageIndex || project.stageIndex || (project.status === 'completed' ? 8 : 1),
      stageKey: job?.stageKey || project.stageKey || (project.status === 'completed' ? 'completed' : 'analyzing_script'),
      stageTitle: job?.stageTitle || project.stageTitle || (project.status === 'completed' ? 'Ready to preview and download' : 'Analyzing script'),
      logs: job ? job.logs : (project.logs || []),
      videoUrl: job?.videoUrl || project.videoUrl,
      subtitleUrl: job?.subtitleUrl || project.subtitleUrl,
      estimatedDuration: job?.estimatedDuration || project.estimatedDuration || 0,
      finalDuration: project.finalDuration || (project.status === 'completed' ? project.duration : 0),
      duration: project.duration || job?.estimatedDuration || 0,
      error: job?.error || project.error || null,
      scenesCount: project.scenes ? project.scenes.length : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getProjects = async (req, res) => {
  try {
    const userId = req.user?.id;
    const projects = db.getProjects(userId);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const renderCustomProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { scenes, characters, title, description, musicMood, voiceId, aspectRatio } = req.body;

    const project = db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (characters && Array.isArray(characters) && characters.length > 0) {
      project.characters = characters;
    }
    if (scenes && Array.isArray(scenes)) {
      project.scenes = scenes;
      project.isScriptApproved = true;
    }
    if (title) project.title = title;
    if (description) project.description = description;
    if (musicMood) project.musicMood = musicMood;
    if (voiceId) project.voiceId = voiceId;
    if (aspectRatio) project.aspectRatio = aspectRatio;

    db.saveProject(project);

    // Trigger re-rendering
    const job = jobQueue.startGenerationJob({
      projectId: project.id,
      prompt: project.topic,
      style: project.style,
      duration: project.duration,
      aspectRatio: project.aspectRatio,
      language: project.language,
      voiceId: project.voiceId,
      musicMood: project.musicMood,
      characterId: project.characterId,
      userApiKey: req.headers['x-gemini-key'] || null
    });

    res.json({
      message: 'Render job initiated',
      projectId: project.id,
      status: 'queued'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const downloadVideo = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    if (!project || !project.videoUrl) {
      return res.status(404).json({ error: 'Video file is not available or still rendering' });
    }

    const videoFilename = path.basename(project.videoUrl);
    const videoFilePath = path.join(config.storageDir, 'videos', videoFilename);

    if (!fs.existsSync(videoFilePath)) {
      return res.status(404).json({ error: 'Video file missing on server storage' });
    }

    const downloadName = `${(project.title || 'AI_Shorts_Video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'video/mp4');

    const fileStream = fs.createReadStream(videoFilePath);
    fileStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const downloadSubtitles = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    if (!project || !project.subtitleUrl) {
      return res.status(404).json({ error: 'Subtitles not generated for this video' });
    }

    const srtFilename = path.basename(project.subtitleUrl);
    const srtFilePath = path.join(config.storageDir, 'subtitles', srtFilename);

    if (!fs.existsSync(srtFilePath)) {
      return res.status(404).json({ error: 'SRT file not found' });
    }

    const downloadName = `${(project.title || 'subtitles').replace(/[^a-zA-Z0-9_-]/g, '_')}.srt`;
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', 'text/plain');

    const fileStream = fs.createReadStream(srtFilePath);
    fileStream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Try deleting files
    if (project.videoUrl) {
      const vPath = path.join(config.storageDir, 'videos', path.basename(project.videoUrl));
      if (fs.existsSync(vPath)) fs.unlinkSync(vPath);
    }
    if (project.subtitleUrl) {
      const sPath = path.join(config.storageDir, 'subtitles', path.basename(project.subtitleUrl));
      if (fs.existsSync(sPath)) fs.unlinkSync(sPath);
    }

    db.deleteProject(id, req.user?.id);
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const regenerateSceneVisual = async (req, res) => {
  try {
    const { id, sceneNumber } = req.params;
    const { visualPrompt, aspectRatio } = req.body;

    const updatedScene = await jobQueue.regenerateSceneVisual({
      projectId: id,
      sceneNumber: parseInt(sceneNumber, 10),
      customPrompt: visualPrompt,
      aspectRatio
    });

    res.json({
      message: `Visual regenerated for Scene ${sceneNumber}`,
      scene: updatedScene
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const regenerateSceneAudio = async (req, res) => {
  try {
    const { id, sceneNumber } = req.params;
    const { voiceoverText, voiceId } = req.body;

    const updatedScene = await jobQueue.regenerateSceneAudio({
      projectId: id,
      sceneNumber: parseInt(sceneNumber, 10),
      customVoiceoverText: voiceoverText,
      voiceId
    });

    res.json({
      message: `Audio regenerated for Scene ${sceneNumber}`,
      scene: updatedScene
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateScene = async (req, res) => {
  try {
    const { id, sceneNumber } = req.params;
    const project = db.getProjectById(id);
    if (!project || !project.scenes) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const scNum = parseInt(sceneNumber, 10);
    const sceneIdx = project.scenes.findIndex(s => s.sceneNumber === scNum);
    if (sceneIdx === -1) {
      return res.status(404).json({ error: `Scene ${sceneNumber} not found` });
    }

    const currentScene = project.scenes[sceneIdx];
    project.scenes[sceneIdx] = {
      ...currentScene,
      ...req.body,
      sceneNumber: scNum // preserve scene number
    };

    db.saveProject(project);
    res.json({
      message: `Scene ${sceneNumber} updated successfully`,
      scene: project.scenes[sceneIdx]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteScene = async (req, res) => {
  try {
    const { id, sceneNumber } = req.params;
    const project = db.getProjectById(id);
    if (!project || !project.scenes) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const scNum = parseInt(sceneNumber, 10);
    project.scenes = project.scenes.filter(s => s.sceneNumber !== scNum);
    // Renumber remaining scenes
    project.scenes.forEach((sc, idx) => {
      sc.sceneNumber = idx + 1;
    });

    db.saveProject(project);
    res.json({
      message: `Scene ${sceneNumber} deleted`,
      scenes: project.scenes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const regenerateSceneShot = async (req, res) => {
  try {
    const { id, sceneNumber, shotNumber } = req.params;
    const { visualPrompt } = req.body;

    const result = await jobQueue.regenerateSceneShot({
      projectId: id,
      sceneNumber: parseInt(sceneNumber, 10),
      shotNumber: parseInt(shotNumber, 10),
      customPrompt: visualPrompt
    });

    res.json({
      message: `Shot ${shotNumber} regenerated in Scene ${sceneNumber}`,
      scene: result.scene,
      shot: result.shot
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const addSceneShot = async (req, res) => {
  try {
    const { id, sceneNumber } = req.params;
    const { action, cameraAngle, visualPrompt } = req.body;

    const result = await jobQueue.addSceneShot({
      projectId: id,
      sceneNumber: parseInt(sceneNumber, 10),
      action,
      cameraAngle,
      visualPrompt
    });

    res.json({
      message: `New visual shot added to Scene ${sceneNumber}`,
      scene: result.scene,
      shot: result.shot
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const generateProjectThumbnail = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, style, aspectRatio = '16:9', language } = req.body;

    const project = db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const thumbResult = await visualService.generateYouTubeThumbnail({
      projectId: id,
      title: title || project.title,
      moral: project.moral || 'Slow and steady wins the race!',
      characters: project.characters || [],
      style: style || project.style || '3d_animation',
      aspectRatio: aspectRatio || project.aspectRatio || '16:9',
      language: language || project.language || 'en'
    });

    project.thumbnailUrl = thumbResult.thumbnailUrl;
    project.thumbnailPath = thumbResult.localPath;
    db.saveProject(project);

    res.json({
      message: 'YouTube 3D Thumbnail generated successfully',
      thumbnail: thumbResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getYouTubeMetadata = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    let meta = project.youtubeMetadata;
    if (!meta) {
      meta = scriptAnalysisService.generateYouTubeMetadata({
        title: project.title,
        moral: project.moral,
        scenes: project.scenes || [],
        characters: project.characters || [],
        language: project.language || 'en',
        mainCharacterName: project.mainCharacterName || (project.characters?.[0]?.name)
      });
      project.youtubeMetadata = meta;
      db.saveProject(project);
    }

    res.json(meta);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const downloadThumbnail = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    const thumbFilename = `thumbnail_${id}.jpg`;
    const thumbPath = path.join(config.storageDir, 'images', thumbFilename);

    if (!fs.existsSync(thumbPath)) {
      return res.status(404).json({ error: 'Thumbnail not found on server' });
    }

    const safeTitle = (project?.title || 'YouTube_Thumbnail').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_thumbnail.jpg"`);
    res.setHeader('Content-Type', 'image/jpeg');

    const stream = fs.createReadStream(thumbPath);
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Exports complete production storyboard kit formatted for OpenArt Studio,
 * AI Canvas, and external 3D video generation workflows.
 */
export const exportStoryboardKit = async (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProjectById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const kit = videoProviderService.generateStoryboardExportKit(project);
    res.json(kit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Imports an external animated video clip (e.g. from OpenArt or AI Canvas)
 * directly into a designated storyboard scene, validating the MP4 stream with FFmpeg.
 */
export const importSceneClip = async (req, res) => {
  try {
    const { id, sceneNumber } = req.params;
    const project = db.getProjectById(id);
    if (!project || !project.scenes) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const scNum = parseInt(sceneNumber, 10);
    const scene = project.scenes.find(s => s.sceneNumber === scNum);
    if (!scene) {
      return res.status(404).json({ error: `Scene ${sceneNumber} not found` });
    }

    let clipPath = null;
    const videosDir = path.join(config.storageDir, 'videos');
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

    // Handle multipart file upload or JSON payload with file path
    if (req.file && req.file.path) {
      const destFilename = `scene_${id}_${scNum}_imported_${Date.now()}.mp4`;
      clipPath = path.join(videosDir, destFilename);
      fs.copyFileSync(req.file.path, clipPath);
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    } else if (req.body.clipPath && fs.existsSync(req.body.clipPath)) {
      clipPath = req.body.clipPath;
    } else if (req.body.clipUrl && req.body.clipUrl.startsWith('/outputs/videos/')) {
      clipPath = path.join(config.storageDir, req.body.clipUrl.replace('/outputs/', ''));
    }

    if (!clipPath || !fs.existsSync(clipPath)) {
      return res.status(400).json({ error: 'Please upload a valid MP4 video clip or specify a local video path.' });
    }

    // Validate genuine video stream using FFmpeg
    const validation = videoRenderer.validateMediaFile(clipPath);
    if (!validation.isValid || !validation.hasVideo) {
      return res.status(400).json({
        error: `Imported clip validation failed: ${validation.error || 'No valid video stream found. Static images or audio-only files cannot be accepted as video clips.'}`
      });
    }

    const filename = path.basename(clipPath);
    scene.videoClipPath = clipPath;
    scene.videoLocalPath = clipPath;
    scene.videoUrl = `/outputs/videos/${filename}`;
    scene.isAiGenerated = true;
    scene.importedFrom = req.body.provider || 'openart_workflow';
    scene.actualDuration = validation.duration;
    scene.duration = validation.duration;
    scene.videoValidation = validation;

    db.saveProject(project);

    res.json({
      message: `Scene ${sceneNumber} video clip successfully imported & validated`,
      scene,
      validation
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


