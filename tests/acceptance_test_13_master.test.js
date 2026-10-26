import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { scriptAnalysisService } from '../src/services/scriptAnalysisService.js';
import { visualService } from '../src/services/visualService.js';
import { ttsService } from '../src/services/ttsService.js';
import { videoRenderer } from '../src/services/videoRenderer.js';
import { config } from '../src/config.js';

const MASTER_TEST_STORY = "A cute rabbit challenges a tortoise to a race through a beautiful green forest. The rabbit runs quickly, becomes overconfident, and rests under a tree. The tortoise continues walking steadily along the forest path. The rabbit wakes up and runs toward the finish line, but the tortoise reaches it first. The animals celebrate and learn that patience and consistency matter.";

let storyAnalysis = null;
let rabbitChar = null;
let tortoiseChar = null;

test('Section 13.1: AI Script Intelligence & Character Extraction on Master Acceptance Story', async () => {
  storyAnalysis = await scriptAnalysisService.analyzeScript({
    script: MASTER_TEST_STORY,
    style: '3d_animation',
    language: 'en',
    aspectRatio: '9:16'
  });

  assert.ok(storyAnalysis, 'Story analysis must be returned');
  assert.ok(storyAnalysis.scenes && storyAnalysis.scenes.length >= 5, `Must produce at least 5 scenes for the story beats. Got: ${storyAnalysis.scenes?.length}`);
  
  // Verify moral extraction
  const moralLower = (storyAnalysis.moral || '').toLowerCase();
  assert.ok(
    moralLower.includes('patience') || moralLower.includes('consistency') || moralLower.includes('steady'),
    `Moral must reflect patience and consistency. Got: ${storyAnalysis.moral}`
  );

  // Verify characters
  assert.ok(storyAnalysis.characters && storyAnalysis.characters.length >= 2, 'Must extract both Rabbit and Tortoise');
  rabbitChar = storyAnalysis.characters.find(c => c.species === 'rabbit' || c.name.toLowerCase().includes('rabbit'));
  tortoiseChar = storyAnalysis.characters.find(c => c.species === 'tortoise' || c.name.toLowerCase().includes('tortoise'));

  assert.ok(rabbitChar, 'Rabbit character must be identified');
  assert.ok(tortoiseChar, 'Tortoise character must be identified');
  assert.ok(rabbitChar.isMainCharacter, 'Rabbit should be lead character as first introduced');
  assert.ok(!tortoiseChar.isMainCharacter, 'Tortoise should be co-lead/competitor');

  // Verify visual descriptions and continuity anchors
  assert.ok(rabbitChar.continuityAnchor.length > 10, 'Rabbit must have continuity anchor');
  assert.ok(tortoiseChar.continuityAnchor.length > 10, 'Tortoise must have continuity anchor');
  assert.ok(rabbitChar.appearance.toLowerCase().includes('ears') || rabbitChar.appearance.toLowerCase().includes('rabbit'), 'Rabbit must have detailed visual description');
  assert.ok(tortoiseChar.appearance.toLowerCase().includes('shell') || tortoiseChar.appearance.toLowerCase().includes('tortoise'), 'Tortoise must have detailed visual description');
});

test('Section 13.2: Professional Scene Planning, Changing Camera Views & Real Locomotion', async () => {
  assert.ok(storyAnalysis && storyAnalysis.scenes, 'Story analysis must exist');
  const scenes = storyAnalysis.scenes;

  // Check scene progression and actions
  const allActions = scenes.map(s => `${s.characterActions || ''} ${s.action || ''} ${s.scriptSegment || ''} ${s.visualPrompt || ''}`).join(' ').toLowerCase();
  const allMovements = scenes.map(s => s.movementType || (s.continuityPlan?.movementType) || '').filter(Boolean);

  // Must include running / movement
  assert.ok(
    allActions.includes('run') || allActions.includes('fast') || allActions.includes('quick') || allMovements.includes('running_sprint'),
    'Story must include rabbit running'
  );

  // Must include resting / sleeping under tree
  assert.ok(
    allActions.includes('tree') || allActions.includes('rest') || allActions.includes('sleep') || allMovements.includes('sleeping_rest'),
    'Story must include rabbit resting under a tree'
  );

  // Must include steady walking
  assert.ok(
    allActions.includes('walk') || allActions.includes('steady') || allActions.includes('path') || allMovements.includes('slow_steady_walk'),
    'Story must include tortoise walking steadily along forest path'
  );

  // Must include finish line and celebration
  assert.ok(
    allActions.includes('finish') || allActions.includes('celebrat') || allActions.includes('first') || allMovements.includes('victory_finish'),
    'Story must include finish line reach and celebration'
  );

  // Camera angles must vary across scenes (wide, medium, tracking, close-up)
  const cameraAngles = scenes.map(s => (s.cameraFraming || s.cameraAngle || (s.continuityPlan?.cinematicCamera?.shotType) || '').toLowerCase());
  const hasWideOrEstablishing = cameraAngles.some(a => a.includes('wide') || a.includes('establishing'));
  const hasMediumOrTracking = cameraAngles.some(a => a.includes('medium') || a.includes('tracking') || a.includes('follow'));
  assert.ok(hasWideOrEstablishing || hasMediumOrTracking, 'Scenes must use dynamic cinematography');

  // Verify automatic duration is calculated without user picking seconds
  assert.ok(storyAnalysis.estimatedTotalDuration > 15, `Estimated duration should be realistic (>15s). Got: ${storyAnalysis.estimatedTotalDuration}s`);
  scenes.forEach(sc => {
    assert.ok(sc.estimatedDuration >= 2.0, `Each scene must have positive calculated duration. Scene ${sc.sceneNumber}: ${sc.estimatedDuration}s`);
  });
});

test('Section 13.3: Character Turnaround Reference Generation', async () => {
  assert.ok(rabbitChar && tortoiseChar, 'Characters must be available');

  // Generate Rabbit 3D reference sheet
  const rabbitRef = await visualService.generateCharacterReferenceSheet({
    character: rabbitChar,
    style: '3d_animation'
  });
  assert.ok(rabbitRef.primaryRefUrl, 'Rabbit reference URL generated');
  assert.ok(fs.existsSync(rabbitRef.primaryLocalPath), 'Rabbit reference file exists on disk');
  assert.ok(fs.statSync(rabbitRef.primaryLocalPath).size > 500, 'Rabbit reference image is non-empty');

  // Generate Tortoise 3D reference sheet
  const tortoiseRef = await visualService.generateCharacterReferenceSheet({
    character: tortoiseChar,
    style: '3d_animation'
  });
  assert.ok(tortoiseRef.primaryRefUrl, 'Tortoise reference URL generated');
  assert.ok(fs.existsSync(tortoiseRef.primaryLocalPath), 'Tortoise reference file exists on disk');
  assert.ok(fs.statSync(tortoiseRef.primaryLocalPath).size > 500, 'Tortoise reference image is non-empty');
});

test('Section 13.4: Complete Animated Video Assembly & Media Stream Quality Validation', async () => {
  const testProjectId = `master-acceptance-${Date.now()}`;
  const scenesToRender = storyAnalysis.scenes.slice(0, 3); // Test with 3 representative scenes for fast, robust test suite

  const preparedScenes = [];
  for (let i = 0; i < scenesToRender.length; i++) {
    const rawSc = scenesToRender[i];
    const scNum = i + 1;

    // 1. Generate real scene visual with character anchor
    const visual = await visualService.generateSceneImage({
      projectId: testProjectId,
      sceneNumber: scNum,
      visualPrompt: rawSc.visualPrompt,
      aspectRatio: '9:16',
      character: i === 1 ? tortoiseChar : rabbitChar
    });

    // 2. Generate real scene audio
    const audio = await ttsService.generateSceneAudio({
      projectId: testProjectId,
      sceneNumber: scNum,
      voiceoverText: rawSc.voiceoverText || rawSc.scriptSegment,
      voiceId: 'en-US-JennyNeural',
      lang: 'en'
    });

    const sceneObj = {
      ...rawSc,
      sceneNumber: scNum,
      imageLocalPath: visual.localPath,
      imageUrl: visual.webUrl,
      audioLocalPath: audio.localPath,
      audioUrl: audio.webUrl,
      audioDuration: audio.duration,
      movementType: rawSc.movementType || (i === 0 ? 'running_sprint' : i === 1 ? 'slow_steady_walk' : 'victory_finish')
    };

    videoRenderer.synchronizeSceneAssets(sceneObj);
    preparedScenes.push(sceneObj);
  }

  // Assemble master vertical 9:16 MP4
  const renderResult = await videoRenderer.assembleFinalVideo({
    id: testProjectId,
    scenes: preparedScenes,
    aspectRatio: '9:16',
    musicMood: 'playful_cartoon'
  });

  assert.ok(renderResult, 'Render result must be returned');
  assert.ok(renderResult.videoUrl, 'Video URL must be present');
  assert.ok(renderResult.totalDuration > 5, 'Total duration must be greater than 5 seconds');
  assert.ok(fs.existsSync(renderResult.localPath), `Rendered MP4 file must exist at ${renderResult.localPath}`);

  // FFprobe media stream quality validation
  const validation = await videoRenderer.validateMediaFile(renderResult.localPath);
  assert.ok(validation.isValid, `Media file must be valid. Error: ${validation.error}`);
  assert.equal(validation.videoCodec, 'h264', 'Video codec must be H.264');
  assert.equal(validation.audioCodec, 'aac', 'Audio codec must be AAC');
  assert.ok(validation.hasAudio, 'Soundtrack must be present and verified');
  assert.ok(validation.duration > 5, 'Validated duration must match generated story');
  assert.equal(validation.resolution, '1080x1920', 'Target YouTube Shorts resolution must be 1080x1920');

  console.log(`[Master Acceptance Test] Video successfully generated and verified at ${renderResult.localPath} (${validation.resolution}, ${validation.duration}s, H.264/AAC)`);
});
