import { geminiService } from '../services/geminiService.js';
import { scriptAnalysisService } from '../services/scriptAnalysisService.js';
import { visualService } from '../services/visualService.js';
import { ttsService } from '../services/ttsService.js';
import { db } from '../database/db.js';

export const improvePrompt = async (req, res) => {
  try {
    const { prompt, style, duration, language, characterId } = req.body;
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: 'Please enter a prompt, story, or idea to improve.' });
    }

    const character = characterId ? db.getCharacterById(characterId) : null;
    const userApiKey = req.headers['x-gemini-key'] || null;

    const result = await geminiService.improvePrompt({
      prompt: prompt.trim(),
      style,
      duration: parseInt(duration || 30, 10),
      language: language || 'en',
      character,
      userApiKey
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const generateScript = async (req, res) => {
  try {
    const { prompt, script, style, duration, language, aspectRatio } = req.body;
    const scriptInput = (script || prompt || '').trim();
    if (!scriptInput) {
      return res.status(400).json({ error: 'Original story script is required.' });
    }

    const userApiKey = req.headers['x-gemini-key'] || null;

    const analysis = await scriptAnalysisService.analyzeScript({
      script: scriptInput,
      style,
      duration: duration ? parseInt(duration, 10) : null,
      language: language || 'en',
      aspectRatio: aspectRatio || '9:16',
      userApiKey
    });

    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const analyzeStoryScript = async (req, res) => {
  return generateScript(req, res);
};

export const regenerateScene = async (req, res) => {
  try {
    const { projectId, sceneNumber, visualPrompt, voiceoverText, voiceId, aspectRatio } = req.body;
    const project = db.getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const sceneIdx = project.scenes.findIndex(s => s.sceneNumber === parseInt(sceneNumber, 10));
    if (sceneIdx < 0) {
      return res.status(404).json({ error: `Scene ${sceneNumber} not found in project` });
    }

    const character = project.characterId ? db.getCharacterById(project.characterId) : null;

    // Regenerate visual if prompt provided
    if (visualPrompt) {
      const visualResult = await visualService.generateSceneImage({
        projectId,
        sceneNumber: parseInt(sceneNumber, 10),
        visualPrompt,
        aspectRatio: aspectRatio || project.aspectRatio || '9:16',
        character
      });
      project.scenes[sceneIdx].visualPrompt = visualPrompt;
      project.scenes[sceneIdx].imageUrl = visualResult.webUrl;
      project.scenes[sceneIdx].imageLocalPath = visualResult.localPath;
    }

    // Regenerate audio if voiceover provided
    if (voiceoverText) {
      const audioResult = await ttsService.generateSceneAudio({
        projectId,
        sceneNumber: parseInt(sceneNumber, 10),
        voiceoverText,
        voiceId: voiceId || project.voiceId
      });
      project.scenes[sceneIdx].voiceoverText = voiceoverText;
      project.scenes[sceneIdx].audioUrl = audioResult.webUrl;
      project.scenes[sceneIdx].audioLocalPath = audioResult.localPath;
      project.scenes[sceneIdx].audioDuration = audioResult.duration;
    }

    db.saveProject(project);

    res.json({
      message: `Scene ${sceneNumber} updated successfully`,
      scene: project.scenes[sceneIdx]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
