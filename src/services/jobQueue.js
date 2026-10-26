import { db } from '../database/db.js';
import { scriptAnalysisService } from './scriptAnalysisService.js';
import { visualService } from './visualService.js';
import { ttsService } from './ttsService.js';
import { videoRenderer } from './videoRenderer.js';
import { videoProviderService } from './videoProviderService.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export const GENERATION_STAGES = [
  { index: 1, key: 'analyzing_script', title: 'Analyzing script', defaultPercent: 12 },
  { index: 2, key: 'creating_character_references', title: 'Creating character references', defaultPercent: 25 },
  { index: 3, key: 'preparing_scene_prompts', title: 'Preparing scene prompts', defaultPercent: 38 },
  { index: 4, key: 'generating_video_clips', title: 'Generating animated video clips', defaultPercent: 55 },
  { index: 5, key: 'generating_voice_sound', title: 'Generating voice and sound', defaultPercent: 70 },
  { index: 6, key: 'synchronizing_scenes_subtitles', title: 'Synchronizing scenes and subtitles', defaultPercent: 80 },
  { index: 7, key: 'rendering_final_mp4', title: 'Rendering the final MP4', defaultPercent: 90 },
  { index: 8, key: 'completed', title: 'Ready to preview and download', defaultPercent: 100 }
];

export const STAGE_CONFIG = {
  analyzing_script: { index: 1, title: 'Analyzing script' },
  creating_character_references: { index: 2, title: 'Creating character references' },
  generating_characters: { index: 2, title: 'Creating character references' },
  preparing_scene_prompts: { index: 3, title: 'Preparing scene prompts' },
  planning_scenes: { index: 3, title: 'Preparing scene prompts' },
  generating_video_clips: { index: 4, title: 'Generating animated video clips' },
  generating_scenes: { index: 4, title: 'Generating animated video clips' },
  generating_voice_sound: { index: 5, title: 'Generating voice and sound' },
  generating_audio: { index: 5, title: 'Generating voice and sound' },
  synchronizing_scenes_subtitles: { index: 6, title: 'Synchronizing scenes and subtitles' },
  rendering_final_mp4: { index: 7, title: 'Rendering the final MP4' },
  assembling_video: { index: 7, title: 'Rendering the final MP4' },
  completed: { index: 8, title: 'Ready to preview and download' }
};

class JobQueue {
  constructor() {
    this.jobs = new Map();
  }

  getJob(projectId) {
    return this.jobs.get(projectId);
  }

  cancelJob(projectId) {
    const job = this.jobs.get(projectId);
    if (job && job.status !== 'completed' && job.status !== 'failed') {
      job.status = 'cancelled';
      job.logs.push(`[${new Date().toLocaleTimeString()}] Generation cancelled by user.`);
      db.updateProjectStatus(projectId, { status: 'cancelled' });
      return true;
    }
    return false;
  }

  /**
   * Enqueues and initiates the full end-to-end video generation pipeline
   */
  startGenerationJob({ projectId, prompt, style, duration, aspectRatio, language, subtitleLanguage = 'same', voiceId, musicMood, characterId, userApiKey, videoProvider = 'local_motion_engine' }) {
    const job = {
      projectId,
      status: 'queued',
      progress: 5,
      stage: 'Queued in background queue...',
      logs: [`[${new Date().toLocaleTimeString()}] Generation job initialized for project ${projectId}`],
      createdAt: new Date().toISOString()
    };

    this.jobs.set(projectId, job);
    db.updateProjectStatus(projectId, {
      status: 'queued',
      progress: 5,
      currentStage: 'Queued in background queue...',
      videoProvider,
      subtitleLanguage
    });

    // Run pipeline asynchronously
    this.processPipeline(projectId, { prompt, style, duration, aspectRatio, language, subtitleLanguage, voiceId, musicMood, characterId, userApiKey, videoProvider })
      .catch(err => {
        console.error(`[JobQueue] Pipeline error for project ${projectId}:`, err);
        const currentJob = this.jobs.get(projectId);
        if (currentJob) {
          currentJob.status = 'failed';
          currentJob.error = err.message;
          currentJob.logs.push(`[${new Date().toLocaleTimeString()}] ERROR: ${err.message}`);
        }
        db.updateProjectStatus(projectId, {
          status: 'failed',
          error: err.message
        });
      });

    return job;
  }

  /**
   * The complete multi-stage cartoon production pipeline
   */
  async processPipeline(projectId, { prompt, style, duration, aspectRatio, language, subtitleLanguage = 'same', voiceId, musicMood, characterId, userApiKey, videoProvider = 'local_motion_engine' }) {
    const job = this.jobs.get(projectId);
    const updateJob = (statusName, progress, message) => {
      if (job) {
        const stageInfo = STAGE_CONFIG[statusName] || { index: 1, title: statusName };
        job.status = statusName;
        job.stageIndex = stageInfo.index;
        job.stageKey = statusName;
        job.stageTitle = stageInfo.title;
        job.stage = message;
        job.progress = progress;
        job.logs.push(`[${new Date().toLocaleTimeString()}] [Stage ${stageInfo.index}/8: ${stageInfo.title}] ${message}`);
        db.updateProjectStatus(projectId, {
          status: statusName,
          progress,
          currentStage: message,
          stageIndex: stageInfo.index,
          stageKey: statusName,
          stageTitle: stageInfo.title
        });
      }
    };

    const project = db.getProjectById(projectId);

    // ========================================================
    // Stage 1: Analyzing script
    // ========================================================
    updateJob('analyzing_script', 12, 'Stage 1/8: Analyzing script, identifying characters, visual descriptions, and scene timing plan...');
    
    let analysisResult = null;
    if (project && project.scenes && project.scenes.length > 0 && project.isScriptApproved) {
      updateJob('analyzing_script', 15, 'Using pre-approved custom storyboard scenes...');

      let approvedChars = (project.characters && project.characters.length > 0) ? project.characters : [];
      if (approvedChars.length === 0) {
        // Fallback: discover characters mentioned in scenes
        const charNamesFromScenes = new Set();
        project.scenes.forEach(sc => {
          if (sc.charactersPresent && Array.isArray(sc.charactersPresent)) {
            sc.charactersPresent.forEach(n => n && charNamesFromScenes.add(n));
          }
          if (sc.speakerName && sc.speakerName !== 'Narrator') {
            charNamesFromScenes.add(sc.speakerName);
          }
        });

        if (charNamesFromScenes.size > 0) {
          approvedChars = Array.from(charNamesFromScenes).map((name, idx) => ({
            name,
            isMainCharacter: idx === 0,
            species: name.toLowerCase().includes('rabbit') ? 'rabbit' : name.toLowerCase().includes('squirrel') ? 'squirrel' : name.toLowerCase().includes('hedgehog') ? 'hedgehog' : 'cartoon character',
            appearance: `Cute 3D animated character named ${name}`,
            continuityAnchor: `${name}, cute expressive 3D Pixar character`
          }));
        } else {
          approvedChars = [{
            name: 'Ruby the Rabbit',
            isMainCharacter: true,
            species: 'rabbit',
            age: 'Young',
            appearance: 'Cute white rabbit with pink inner ears, blue scarf, and red backpack holding a shiny red apple',
            color: 'Snow-white and sky-blue',
            clothing: 'Sky-blue woolen scarf and small red backpack',
            continuityAnchor: 'Ruby the Rabbit, cute white bunny with pink inner ears, sky-blue scarf, red backpack, holding a shiny red apple'
          }];
        }
      }

      analysisResult = {
        title: project.title,
        description: project.description,
        musicMood: project.musicMood || musicMood,
        characters: approvedChars,
        scenes: project.scenes
      };
    } else {
      analysisResult = await scriptAnalysisService.analyzeScript({
        script: prompt,
        style,
        language,
        aspectRatio,
        userApiKey
      });
    }

    if (job.status === 'cancelled') return;

    // Calculate dynamic estimated duration from complete script analysis
    const estimatedTotal = analysisResult.estimatedTotalDuration || analysisResult.estimatedDuration ||
      analysisResult.scenes.reduce((sum, sc) => sum + (sc.estimatedDuration || sc.duration || 4.5), 0);
    const roundedEstimated = Math.round(estimatedTotal * 10) / 10;
    job.estimatedDuration = roundedEstimated;
    job.scenesCount = analysisResult.scenes.length;

    updateJob('analyzing_script', 18, `Stage 1/8: Planned ${analysisResult.scenes.length} scenes. Estimated duration: ~${roundedEstimated}s (calculated from complete script).`);

    // ========================================================
    // Stage 2: Creating character references
    // ========================================================
    updateJob('creating_character_references', 22, 'Stage 2/8: Creating character references and persistent 3D turnaround sheets...');

    const projectCharacters = [];
    let extractedChars = (analysisResult && analysisResult.characters && analysisResult.characters.length > 0) 
      ? analysisResult.characters 
      : [{
          name: 'Ruby the Rabbit',
          isMainCharacter: true,
          species: 'rabbit',
          age: 'Young',
          appearance: 'Cute white rabbit with blue scarf and red backpack',
          color: 'White',
          clothing: 'Blue scarf and red backpack',
          continuityAnchor: 'Ruby the Rabbit, cute white bunny with blue scarf and red backpack'
        }];

    for (let cIdx = 0; cIdx < extractedChars.length; cIdx++) {
      if (job.status === 'cancelled') return;
      const charData = extractedChars[cIdx] || {};
      const charName = charData.name || (cIdx === 0 ? 'Ruby the Rabbit' : `Friend ${cIdx}`);
      const isLead = Boolean(charData.isMainCharacter || cIdx === 0);

      const charId = charData.id || `char-${uuidv4().slice(0, 8)}`;
      const newChar = {
        id: charId,
        projectId,
        userId: project?.userId || 'usr-demo-001',
        name: charName,
        isMainCharacter: isLead,
        species: charData.species || 'cartoon character',
        age: charData.age || 'Young',
        gender: charData.gender || 'neutral',
        appearance: charData.appearance || `Cute 3D animated ${charName}`,
        color: charData.color || '',
        clothing: charData.clothing || '',
        distinctiveFeatures: charData.distinctiveFeatures || '',
        personality: charData.personality || '',
        voiceType: charData.voiceType || 'childlike',
        artStyle: style,
        voiceSuggestion: charData.voiceSuggestion || voiceId,
        continuityAnchor: charData.continuityAnchor || `${charName}, 3D cartoon style`,
        referencePrompt: charData.referencePrompt || `Character reference sheet of ${charName}`,
        referenceImage: charData.referenceImage || null,
        referenceSheet: charData.referenceSheet || null,
        views: charData.views || []
      };

      try {
        console.log(`[JobQueue] Generating multi-view reference sheet for: ${newChar.name} (Main: ${isLead})...`);
        const refResult = await visualService.generateCharacterReferenceSheet({
          character: newChar,
          style
        });

        newChar.referenceImage = refResult.primaryRefUrl;
        newChar.referenceSheet = refResult.sheetUrl;
        newChar.referenceImages = refResult.referenceImages;
        newChar.views = refResult.views;
      } catch (err) {
        console.warn(`[JobQueue] Could not generate character reference sheet for ${newChar.name}:`, err.message);
      }

      db.saveCharacter(newChar);
      projectCharacters.push(newChar);
    }

    // Identify primary protagonist with defensive fallback
    const mainCharacter = projectCharacters.find(c => c && c.isMainCharacter) || projectCharacters[0] || {
      id: 'char-default-lead',
      name: 'Ruby the Rabbit',
      isMainCharacter: true,
      species: 'rabbit',
      appearance: 'Cute white rabbit with blue scarf and red backpack'
    };

    // Save project metadata with characters and automatic estimated duration in DB
    db.updateProjectStatus(projectId, {
      title: analysisResult.title || project.title,
      description: analysisResult.description || project.description,
      musicMood: analysisResult.musicMood || musicMood,
      mainCharacterName: mainCharacter.name,
      characters: projectCharacters,
      scenes: analysisResult.scenes,
      estimatedDuration: roundedEstimated,
      scenesCount: analysisResult.scenes.length,
      videoProvider
    });

    // ========================================================
    // Stage 3: Preparing scene prompts
    // ========================================================
    updateJob('preparing_scene_prompts', 35, `Stage 3/8: Preparing scene prompts, camera angles, and continuity plans for ${analysisResult.scenes.length} scenes...`);

    // ========================================================
    // Stage 4: Generating animated video clips
    // ========================================================
    const scenesWithAssets = [];
    for (let i = 0; i < analysisResult.scenes.length; i++) {
      if (job.status === 'cancelled') return;
      const sc = analysisResult.scenes[i];
      const scNum = i + 1;

      // Ensure main character is locked into every scene
      const sceneChars = projectCharacters.filter(c => 
        (sc.charactersPresent && Array.isArray(sc.charactersPresent) && sc.charactersPresent.includes(c.name)) || 
        c.isMainCharacter
      );
      const primaryChar = sceneChars.find(c => c && c.isMainCharacter) || sceneChars[0] || mainCharacter;
      const primaryCharName = primaryChar?.name || mainCharacter.name || 'Ruby the Rabbit';
      const primaryCharId = primaryChar?.id || mainCharacter.id || `char-${scNum}`;

      updateJob('generating_video_clips', 38 + Math.round((scNum / analysisResult.scenes.length) * 22), `Stage 4/8: Generating animated video clips for Scene ${scNum}/${analysisResult.scenes.length} (${primaryCharName})...`);

      const visualResult = await visualService.generateSceneImages({
        projectId,
        sceneNumber: scNum,
        shots: sc.shots || [],
        visualPrompt: sc.visualPrompt,
        aspectRatio,
        character: primaryChar,
        characters: sceneChars.length > 0 ? sceneChars : [primaryChar]
      });

      let sceneVideoClipPath = null;
      let sceneVideoUrl = null;
      if (videoProvider && videoProvider !== 'local_motion_engine') {
        try {
          updateJob('generating_scenes', 40 + Math.round((scNum / analysisResult.scenes.length) * 20), `Generating AI video animation for Scene ${scNum} via ${videoProvider}...`);
          const videoGenResult = await videoProviderService.generateSceneVideo({
            providerId: videoProvider,
            projectId,
            sceneNumber: scNum,
            visualPrompt: sc.visualPrompt,
            referenceImageUrl: primaryChar?.referenceImage || visualResult.webUrl,
            referenceLocalPath: visualResult.localPath,
            continuityPlan: sc.sceneContinuityPlan || sc.continuityPlan,
            duration: sc.estimatedDuration || sc.duration || 4.0,
            aspectRatio
          });
          if (videoGenResult && videoGenResult.localPath) {
            sceneVideoClipPath = videoGenResult.localPath;
            sceneVideoUrl = videoGenResult.webUrl;
          }
        } catch (vErr) {
          console.warn(`[JobQueue] Video provider ${videoProvider} failed for Scene ${scNum} (${vErr.message}), falling back to Local Kinematic Engine.`);
        }
      }

      scenesWithAssets.push({
        ...sc,
        sceneNumber: scNum,
        characterIds: sceneChars.map(c => c.id),
        primaryCharacterId: primaryCharId,
        primaryCharacterName: primaryCharName,
        mainCharacterVisible: true,
        imageLocalPath: visualResult.localPath,
        imageUrl: visualResult.webUrl,
        images: visualResult.images || [],
        videoClipPath: sceneVideoClipPath,
        videoUrl: sceneVideoUrl
      });
    }

    // ========================================================
    // Stage 5: Generating voice and sound
    // ========================================================
    const targetLang = language || project?.language || 'en';
    updateJob('generating_voice_sound', 62, `Stage 5/8: Generating voice and sound for dialogue & narration in ${targetLang.toUpperCase()}...`);

    for (let i = 0; i < scenesWithAssets.length; i++) {
      if (job.status === 'cancelled') return;
      const sc = scenesWithAssets[i];
      const scNum = i + 1;

      // 1. Determine speaker voice and strictly enforce project language
      let sceneVoiceId = voiceId;
      if (targetLang === 'hi' && (!sceneVoiceId || !sceneVoiceId.startsWith('hi-'))) {
        sceneVoiceId = 'hi-IN-SwaraNeural';
      } else if (targetLang === 'mr' && (!sceneVoiceId || !sceneVoiceId.startsWith('mr-'))) {
        sceneVoiceId = 'mr-IN-AarohiNeural';
      }

      if (sc.speakerName && sc.speakerName !== 'Narrator') {
        const speakingChar = projectCharacters.find(c => c && c.name && sc.speakerName && c.name.toLowerCase() === sc.speakerName.toLowerCase());
        if (speakingChar && speakingChar.voiceSuggestion) {
          if (targetLang === 'hi' && speakingChar.voiceSuggestion.startsWith('hi-')) {
            sceneVoiceId = speakingChar.voiceSuggestion;
          } else if (targetLang === 'mr' && speakingChar.voiceSuggestion.startsWith('mr-')) {
            sceneVoiceId = speakingChar.voiceSuggestion;
          } else if (targetLang === 'en' && speakingChar.voiceSuggestion.startsWith('en-')) {
            sceneVoiceId = speakingChar.voiceSuggestion;
          }
        }
      }

      // 2. Ensure voiceover text is localized to match the selected target language
      if (targetLang === 'hi' && !/[\u0900-\u097F]/.test(sc.voiceoverText)) {
        sc.voiceoverText = await scriptAnalysisService.translateText(sc.voiceoverText, 'hi');
        sc.subtitleText = sc.voiceoverText.slice(0, 60);
      } else if (targetLang === 'mr' && !/[\u0900-\u097F]/.test(sc.voiceoverText)) {
        sc.voiceoverText = await scriptAnalysisService.translateText(sc.voiceoverText, 'mr');
        sc.subtitleText = sc.voiceoverText.slice(0, 60);
      } else if (targetLang === 'en' && /[\u0900-\u097F]/.test(sc.voiceoverText)) {
        sc.voiceoverText = await scriptAnalysisService.translateText(sc.voiceoverText, 'en');
        sc.subtitleText = sc.voiceoverText.slice(0, 60);
      }

      // 3. Localize on-screen subtitles to preferred subtitle language (can differ from spoken voice)
      const targetSubLang = (subtitleLanguage && subtitleLanguage !== 'same') ? subtitleLanguage : targetLang;
      if (targetSubLang === 'hi' && !/[\u0900-\u097F]/.test(sc.subtitleText)) {
        sc.subtitleText = await scriptAnalysisService.translateText(sc.subtitleText || sc.voiceoverText, 'hi');
      } else if (targetSubLang === 'mr' && !/[\u0900-\u097F]/.test(sc.subtitleText)) {
        sc.subtitleText = await scriptAnalysisService.translateText(sc.subtitleText || sc.voiceoverText, 'mr');
      } else if (targetSubLang === 'en' && /[\u0900-\u097F]/.test(sc.subtitleText)) {
        sc.subtitleText = await scriptAnalysisService.translateText(sc.subtitleText || sc.voiceoverText, 'en');
      }

      updateJob('generating_audio', 65 + Math.round((scNum / scenesWithAssets.length) * 15), `Synthesizing audio for Scene ${scNum} in ${targetLang.toUpperCase()} (${sc.speakerName || 'Narrator'}, Voice: ${sceneVoiceId})...`);

      const audioResult = await ttsService.generateSceneAudio({
        projectId,
        sceneNumber: scNum,
        voiceoverText: sc.voiceoverText,
        voiceId: sceneVoiceId,
        lang: targetLang
      });

      sc.audioLocalPath = audioResult.localPath;
      sc.audioUrl = audioResult.webUrl;
      sc.audioDuration = audioResult.duration;
      sc.voiceIdUsed = sceneVoiceId;

      // Automatically synchronize audio and video timing for each scene
      videoRenderer.synchronizeSceneAssets(sc);
    }

    // Update scenes in DB
    db.updateProjectStatus(projectId, {
      scenes: scenesWithAssets
    });

    // ========================================================
    // Stage 6: Synchronizing scenes and subtitles
    // ========================================================
    updateJob('synchronizing_scenes_subtitles', 78, 'Stage 6/8: Synchronizing scenes and subtitles with speech boundaries...');

    // ========================================================
    // Stage 7: Rendering the final MP4
    // ========================================================
    updateJob('rendering_final_mp4', 85, 'Stage 7/8: Rendering the final MP4 with FFmpeg backend (1080x1920 9:16)...');

    const renderResult = await videoRenderer.assembleFinalVideo({
      id: projectId,
      scenes: scenesWithAssets,
      aspectRatio,
      musicMood: analysisResult.musicMood || musicMood
    }, {
      onProgress: ({ percent, message }) => {
        updateJob('rendering_final_mp4', percent, message);
      }
    });

    // ========================================================
    // Stage 8: Ready to preview and download
    // ========================================================
    job.videoUrl = renderResult.videoUrl;
    job.subtitleUrl = renderResult.srtUrl;
    job.srtContent = renderResult.srtContent;
    job.duration = renderResult.totalDuration;
    job.finalDuration = renderResult.totalDuration;
    job.status = 'completed';
    job.progress = 100;
    job.stage = 'Ready to preview and download';
    job.logs.push(`[${new Date().toLocaleTimeString()}] [Stage 8/8: Ready to preview and download] Master video successfully verified via FFprobe (${renderResult.validation?.videoCodec || 'h264'}, ${renderResult.validation?.resolution || renderResult.resolution}, ${renderResult.totalDuration}s)!`);

    db.updateProjectStatus(projectId, {
      status: 'completed',
      progress: 100,
      currentStage: 'Ready to preview and download',
      stageIndex: 8,
      stageKey: 'completed',
      stageTitle: 'Ready to preview and download',
      videoUrl: renderResult.videoUrl,
      subtitleUrl: renderResult.srtUrl,
      srtContent: renderResult.srtContent,
      duration: renderResult.totalDuration,
      finalDuration: renderResult.totalDuration,
      estimatedDuration: roundedEstimated,
      resolution: renderResult.resolution,
      validation: renderResult.validation,
      scenes: scenesWithAssets
    });

    // 3. Automatically generate 3D YouTube Thumbnail for children's channel export
    let thumbnailUrl = null;
    let thumbnailPath = null;
    try {
      const thumbResult = await visualService.generateYouTubeThumbnail({
        projectId,
        title: analysisResult.title || project.title,
        moral: analysisResult.moral || project.moral,
        characters: projectCharacters,
        style,
        aspectRatio: aspectRatio || '16:9',
        language
      });
      if (thumbResult && thumbResult.thumbnailUrl) {
        thumbnailUrl = thumbResult.thumbnailUrl;
        thumbnailPath = thumbResult.localPath;
        job.thumbnailUrl = thumbnailUrl;
        job.logs.push(`[${new Date().toLocaleTimeString()}] 3D YouTube Thumbnail generated (${thumbnailUrl})`);
        db.updateProjectStatus(projectId, {
          thumbnailUrl,
          thumbnailPath,
          youtubeMetadata: analysisResult.youtubeMetadata || null
        });
      }
    } catch (thumbErr) {
      console.warn(`[JobQueue] Non-fatal thumbnail generation warning:`, thumbErr.message);
    }

    const settings = db.getSettings();
    db.updateSettings({
      totalVideosGenerated: (settings.totalVideosGenerated || 0) + 1
    });

    console.log(`[JobQueue] Pipeline completed and verified for project ${projectId}.`);
  }

  /**
   * Regenerates only visual/video for a single scene
   */
  async regenerateSceneVisual({ projectId, sceneNumber, customPrompt = null, aspectRatio = '9:16' }) {
    const project = db.getProjectById(projectId);
    if (!project || !project.scenes) {
      throw new Error('Project not found');
    }

    const scNum = parseInt(sceneNumber, 10);
    const sceneIdx = project.scenes.findIndex(s => s.sceneNumber === scNum);
    if (sceneIdx === -1) {
      throw new Error(`Scene ${sceneNumber} not found in project`);
    }

    const targetScene = project.scenes[sceneIdx];
    const visualPrompt = customPrompt || targetScene.visualPrompt;

    let primaryChar = null;
    if (targetScene.primaryCharacterId) {
      primaryChar = db.getCharacterById(targetScene.primaryCharacterId);
    }
    if (!primaryChar && project.characters && project.characters.length > 0) {
      primaryChar = project.characters[0];
    }

    console.log(`[JobQueue] Regenerating visual for Scene ${sceneNumber} of project ${projectId}...`);
    const visualResult = await visualService.generateSceneImages({
      projectId,
      sceneNumber: targetScene.sceneNumber,
      shots: targetScene.shots || [],
      visualPrompt,
      aspectRatio,
      character: primaryChar
    });

    targetScene.imageLocalPath = visualResult.localPath;
    targetScene.imageUrl = visualResult.webUrl;
    targetScene.images = visualResult.images || [];
    targetScene.visualPrompt = visualPrompt;

    // Also re-render the scene's animated MP4 video clip if audio is available
    if (targetScene.audioLocalPath && fs.existsSync(targetScene.audioLocalPath)) {
      const sceneMp4Path = path.join(config.storageDir, 'videos', `scene_${projectId}_${scNum}.mp4`);
      const targetRes = config.aspectRatios[aspectRatio] || config.aspectRatios['9:16'];
      await videoRenderer.renderSingleScene({
        sceneNum: scNum,
        imagePath: targetScene.imageLocalPath,
        images: targetScene.images,
        audioPath: targetScene.audioLocalPath,
        duration: Math.max(2.5, (targetScene.audioDuration || 4.0) + 0.2),
        width: targetRes.width,
        height: targetRes.height,
        subtitleText: targetScene.subtitleText || targetScene.voiceoverText,
        outputPath: sceneMp4Path,
        tempDir: path.join(config.storageDir, 'temp')
      });
      targetScene.videoLocalPath = sceneMp4Path;
      targetScene.videoUrl = `/outputs/videos/scene_${projectId}_${scNum}.mp4`;
    }

    project.scenes[sceneIdx] = targetScene;
    db.saveProject(project);

    return targetScene;
  }

  /**
   * Regenerates a single shot image within an existing scene
   */
  async regenerateSceneShot({ projectId, sceneNumber, shotNumber, customPrompt = null }) {
    const project = db.getProjectById(projectId);
    if (!project || !project.scenes) throw new Error('Project not found');

    const scNum = parseInt(sceneNumber, 10);
    const shNum = parseInt(shotNumber, 10);
    const sceneIdx = project.scenes.findIndex(s => s.sceneNumber === scNum);
    if (sceneIdx === -1) throw new Error(`Scene ${sceneNumber} not found`);

    const targetScene = project.scenes[sceneIdx];
    const projectCharacters = project.characters || [];
    const primaryChar = projectCharacters.find(c => c && c.isMainCharacter) || projectCharacters[0];

    const shotIdx = (targetScene.images || []).findIndex(img => img.shotNumber === shNum);
    const existingShot = shotIdx !== -1 ? targetScene.images[shotIdx] : null;

    const shotPrompt = customPrompt || existingShot?.visualPrompt || targetScene.visualPrompt;
    const shotAction = existingShot?.action || `Visual action for shot ${shNum}`;
    const cameraAngle = existingShot?.cameraAngle || 'Medium shot';

    console.log(`[JobQueue] Regenerating shot ${shNum} in Scene ${scNum} of project ${projectId}...`);
    const newShot = await visualService.generateSingleShotImage({
      projectId,
      sceneNumber: scNum,
      shotNumber: shNum,
      visualPrompt: shotPrompt,
      action: shotAction,
      cameraAngle,
      aspectRatio: project.aspectRatio || '9:16',
      character: primaryChar
    });

    if (!targetScene.images) targetScene.images = [];
    if (shotIdx !== -1) {
      targetScene.images[shotIdx] = newShot;
    } else {
      targetScene.images.push(newShot);
    }

    // If first shot was regenerated, also update primary scene image
    if (shNum === 1 || targetScene.images.length === 1) {
      targetScene.imageLocalPath = newShot.localPath;
      targetScene.imageUrl = newShot.webUrl;
    }

    // Re-render scene MP4 video with updated shot
    if (targetScene.audioLocalPath && fs.existsSync(targetScene.audioLocalPath)) {
      const sceneMp4Path = path.join(config.storageDir, 'videos', `scene_${projectId}_${scNum}.mp4`);
      const targetRes = config.aspectRatios[project.aspectRatio || '9:16'] || config.aspectRatios['9:16'];
      await videoRenderer.renderSingleScene({
        sceneNum: scNum,
        imagePath: targetScene.imageLocalPath,
        images: targetScene.images,
        audioPath: targetScene.audioLocalPath,
        duration: Math.max(2.5, (targetScene.audioDuration || 4.0) + 0.2),
        width: targetRes.width,
        height: targetRes.height,
        subtitleText: targetScene.subtitleText || targetScene.voiceoverText,
        outputPath: sceneMp4Path,
        tempDir: path.join(config.storageDir, 'temp')
      });
      targetScene.videoLocalPath = sceneMp4Path;
      targetScene.videoUrl = `/outputs/videos/scene_${projectId}_${scNum}.mp4`;
    }

    project.scenes[sceneIdx] = targetScene;
    db.saveProject(project);
    return { scene: targetScene, shot: newShot };
  }

  /**
   * Adds an additional visual shot to a scene
   */
  async addSceneShot({ projectId, sceneNumber, action, cameraAngle = 'Medium shot', visualPrompt = null }) {
    const project = db.getProjectById(projectId);
    if (!project || !project.scenes) throw new Error('Project not found');

    const scNum = parseInt(sceneNumber, 10);
    const sceneIdx = project.scenes.findIndex(s => s.sceneNumber === scNum);
    if (sceneIdx === -1) throw new Error(`Scene ${sceneNumber} not found`);

    const targetScene = project.scenes[sceneIdx];
    if (!targetScene.images) targetScene.images = [];

    const newShotNum = targetScene.images.length + 1;
    const projectCharacters = project.characters || [];
    const primaryChar = projectCharacters.find(c => c && c.isMainCharacter) || projectCharacters[0];

    const prompt = visualPrompt || `${primaryChar?.continuityAnchor || 'Character'}, ${action || 'acting in scene'}, ${cameraAngle}`;

    console.log(`[JobQueue] Adding new shot ${newShotNum} to Scene ${scNum} of project ${projectId}...`);
    const newShot = await visualService.generateSingleShotImage({
      projectId,
      sceneNumber: scNum,
      shotNumber: newShotNum,
      visualPrompt: prompt,
      action: action || `Visual moment ${newShotNum}`,
      cameraAngle: cameraAngle || 'Medium shot',
      aspectRatio: project.aspectRatio || '9:16',
      character: primaryChar
    });

    targetScene.images.push(newShot);

    // Re-render scene MP4 video with expanded shots
    if (targetScene.audioLocalPath && fs.existsSync(targetScene.audioLocalPath)) {
      const sceneMp4Path = path.join(config.storageDir, 'videos', `scene_${projectId}_${scNum}.mp4`);
      const targetRes = config.aspectRatios[project.aspectRatio || '9:16'] || config.aspectRatios['9:16'];
      await videoRenderer.renderSingleScene({
        sceneNum: scNum,
        imagePath: targetScene.imageLocalPath,
        images: targetScene.images,
        audioPath: targetScene.audioLocalPath,
        duration: Math.max(2.5, (targetScene.audioDuration || 4.0) + 0.2),
        width: targetRes.width,
        height: targetRes.height,
        subtitleText: targetScene.subtitleText || targetScene.voiceoverText,
        outputPath: sceneMp4Path,
        tempDir: path.join(config.storageDir, 'temp')
      });
      targetScene.videoLocalPath = sceneMp4Path;
      targetScene.videoUrl = `/outputs/videos/scene_${projectId}_${scNum}.mp4`;
    }

    project.scenes[sceneIdx] = targetScene;
    db.saveProject(project);
    return { scene: targetScene, shot: newShot };
  }

  /**
   * Regenerates only dialogue audio for a single scene
   */
  async regenerateSceneAudio({ projectId, sceneNumber, customVoiceoverText = null, voiceId = null }) {
    const project = db.getProjectById(projectId);
    if (!project || !project.scenes) {
      throw new Error('Project not found');
    }

    const scNum = parseInt(sceneNumber, 10);
    const sceneIdx = project.scenes.findIndex(s => s.sceneNumber === scNum);
    if (sceneIdx === -1) {
      throw new Error(`Scene ${sceneNumber} not found in project`);
    }

    const targetScene = project.scenes[sceneIdx];
    let voiceoverText = customVoiceoverText || targetScene.voiceoverText;
    const effectiveLang = project.language || 'en';

    let effectiveVoiceId = voiceId || targetScene.voiceIdUsed || project.voiceId;
    if (effectiveLang === 'hi' && (!effectiveVoiceId || !effectiveVoiceId.startsWith('hi-'))) {
      effectiveVoiceId = 'hi-IN-SwaraNeural';
    } else if (effectiveLang === 'mr' && (!effectiveVoiceId || !effectiveVoiceId.startsWith('mr-'))) {
      effectiveVoiceId = 'mr-IN-AarohiNeural';
    } else if (!effectiveVoiceId) {
      effectiveVoiceId = 'en-US-JennyNeural';
    }

    // Ensure localized script if project language is Hindi or Marathi
    if ((effectiveLang === 'hi' || effectiveLang === 'mr') && !/[\u0900-\u097F]/.test(voiceoverText || '')) {
      try {
        const translated = await scriptAnalysisService.translateText(voiceoverText, effectiveLang);
        if (translated && translated.trim()) {
          voiceoverText = translated;
        }
      } catch (err) {
        console.warn(`[JobQueue] Translation error for scene ${sceneNumber} during audio regeneration:`, err.message);
      }
    }

    console.log(`[JobQueue] Regenerating audio for Scene ${sceneNumber} of project ${projectId} (${effectiveLang}, Voice: ${effectiveVoiceId})...`);
    const audioResult = await ttsService.generateSceneAudio({
      projectId,
      sceneNumber: targetScene.sceneNumber,
      voiceoverText,
      voiceId: effectiveVoiceId,
      lang: effectiveLang
    });

    targetScene.audioLocalPath = audioResult.localPath;
    targetScene.audioUrl = audioResult.webUrl;
    targetScene.audioDuration = audioResult.duration;
    targetScene.voiceoverText = voiceoverText;
    targetScene.subtitleText = voiceoverText.slice(0, 48) + (voiceoverText.length > 48 ? '...' : '');
    targetScene.voiceIdUsed = effectiveVoiceId;

    // Update scene MP4 video clip with the newly synthesized audio
    if (targetScene.imageLocalPath && fs.existsSync(targetScene.imageLocalPath)) {
      const sceneMp4Path = path.join(config.storageDir, 'videos', `scene_${projectId}_${scNum}.mp4`);
      const targetRes = config.aspectRatios[project.aspectRatio || '9:16'] || config.aspectRatios['9:16'];
      await videoRenderer.renderSingleScene({
        sceneNum: scNum,
        imagePath: targetScene.imageLocalPath,
        audioPath: targetScene.audioLocalPath,
        duration: Math.max(2.5, targetScene.audioDuration + 0.2),
        width: targetRes.width,
        height: targetRes.height,
        subtitleText: targetScene.subtitleText,
        outputPath: sceneMp4Path,
        tempDir: path.join(config.storageDir, 'temp')
      });
      targetScene.videoLocalPath = sceneMp4Path;
      targetScene.videoUrl = `/outputs/videos/scene_${projectId}_${scNum}.mp4`;
    }

    project.scenes[sceneIdx] = targetScene;
    db.saveProject(project);

    return targetScene;
  }
}

export const jobQueue = new JobQueue();
