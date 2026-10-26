import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { scriptAnalysisService } from '../src/services/scriptAnalysisService.js';
import { visualService } from '../src/services/visualService.js';
import { ttsService } from '../src/services/ttsService.js';
import { videoRenderer } from '../src/services/videoRenderer.js';
import { config } from '../src/config.js';

let storyAnalysis = null;
let rabbitChar = null;
let tortoiseChar = null;

test('Pillar 11.1: Story Input & Narrative Expansion: Expands "The Rabbit and the Tortoise" into 8-scene moral story', async () => {
  const inputPrompt = 'The Rabbit and the Tortoise';

  storyAnalysis = await scriptAnalysisService.analyzeScript({
    script: inputPrompt,
    style: '3d_animation',
    language: 'en',
    aspectRatio: '9:16'
  });

  assert.ok(storyAnalysis, 'Story analysis must be returned');
  assert.ok(storyAnalysis.scenes && storyAnalysis.scenes.length >= 8, `Must produce at least 8 canonical scenes. Got: ${storyAnalysis.scenes?.length}`);
  assert.ok(storyAnalysis.moral.toLowerCase().includes('slow and steady'), `Moral must highlight slow and steady. Got: ${storyAnalysis.moral}`);

  // Verify character extraction
  assert.ok(storyAnalysis.characters && storyAnalysis.characters.length >= 2, 'Must extract both Rabbit and Tortoise characters');
  rabbitChar = storyAnalysis.characters.find(c => c.species === 'rabbit' || c.name.toLowerCase().includes('rabbit'));
  tortoiseChar = storyAnalysis.characters.find(c => c.species === 'tortoise' || c.name.toLowerCase().includes('tortoise'));

  assert.ok(rabbitChar, 'Rabbit character must be extracted with 3D Pixar traits');
  assert.ok(tortoiseChar, 'Tortoise character must be extracted with 3D Pixar traits');
  assert.ok(rabbitChar.isMainCharacter, 'Rabbit must be set as lead protagonist');
  assert.ok(!tortoiseChar.isMainCharacter, 'Tortoise must be set as companion/competitor');

  assert.ok(rabbitChar.clothing.toLowerCase().includes('vest') || rabbitChar.appearance.toLowerCase().includes('ears'), 'Rabbit must have detailed runner clothing/ears');
  assert.ok(tortoiseChar.appearance.toLowerCase().includes('shell'), 'Tortoise must have detailed shell description');
  assert.ok(tortoiseChar.clothing.toLowerCase().includes('neckerchief') || tortoiseChar.continuityAnchor.toLowerCase().includes('shell'), 'Tortoise must have anchor tokens');
});

test('Pillar 11.2: Narrative Scene Pacing & Real Character Movement Verification', async () => {
  assert.ok(storyAnalysis && storyAnalysis.scenes, 'Story analysis must exist');
  const scenes = storyAnalysis.scenes;

  // Scene 1: Challenge at starting line
  const sc1 = scenes[0];
  assert.ok(sc1.scriptSegment.toLowerCase().includes('rabbit') && sc1.scriptSegment.toLowerCase().includes('tortoise'), 'Scene 1: Rabbit and Tortoise face off');
  assert.ok(sc1.cameraFraming.toLowerCase().includes('wide'), 'Scene 1 must use wide establishing shot');

  // Scene 2: Race begins, Rabbit runs and Tortoise walks
  const sc2 = scenes[1];
  assert.ok(sc2.scriptSegment.toLowerCase().includes('race') || sc2.scriptSegment.toLowerCase().includes('runs'), 'Scene 2: Race begins');
  assert.ok(sc2.movementType === 'running_sprint' || sc2.movementType === 'slow_steady_walk' || sc2.characterActions.toLowerCase().includes('run'), 'Scene 2: Active running or walking movement');

  // Scene 3: Tracking shot following rabbit running
  const sc3 = scenes[2];
  assert.ok(sc3.scriptSegment.toLowerCase().includes('running') || sc3.scriptSegment.toLowerCase().includes('tracking'), 'Scene 3: Tracking shot following running rabbit');
  assert.ok(sc3.movementType === 'running_sprint', 'Scene 3 movementType must be running_sprint');

  // Scene 4: Rabbit sleeps under tree
  const sc4 = scenes[3];
  assert.ok(sc4.scriptSegment.toLowerCase().includes('shady') || sc4.scriptSegment.toLowerCase().includes('sleep'), 'Scene 4: Rabbit sleeps under shady tree');
  assert.ok(sc4.movementType === 'sleeping_rest', 'Scene 4 movementType must be sleeping_rest');
  assert.ok(sc4.soundEffect.toLowerCase().includes('breathing') || sc4.soundEffect.toLowerCase().includes('crickets'), 'Scene 4 must have gentle restful sound effect');

  // Scene 5: Tortoise continues walking with steady steps
  const sc5 = scenes[4];
  assert.ok(sc5.scriptSegment.toLowerCase().includes('tortoise') && (sc5.scriptSegment.toLowerCase().includes('walking') || sc5.scriptSegment.toLowerCase().includes('steps')), 'Scene 5: Tortoise walking steadily');
  assert.ok(sc5.movementType === 'slow_steady_walk', 'Scene 5 movementType must be slow_steady_walk');
  assert.ok(sc5.soundEffect.toLowerCase().includes('footsteps') || sc5.soundEffect.toLowerCase().includes('trail'), 'Scene 5 must have footstep sound effects');

  // Scene 6: Tortoise approaches finish line while rabbit is still asleep
  const sc6 = scenes[5];
  assert.ok(sc6.scriptSegment.toLowerCase().includes('finish') || sc6.scriptSegment.toLowerCase().includes('asleep'), 'Scene 6: Tortoise moves closer to finish line');

  // Scene 7: Rabbit wakes up surprised and dashes toward finish line
  const sc7 = scenes[6];
  assert.ok(sc7.scriptSegment.toLowerCase().includes('wake') || sc7.scriptSegment.toLowerCase().includes('surprised'), 'Scene 7: Rabbit wakes up in shock');
  assert.ok(sc7.movementType === 'waking_surprise' || sc7.movementType === 'running_sprint', 'Scene 7: waking_surprise movement');

  // Scene 8: Tortoise crosses finish line first, animals celebrate, moral stated
  const sc8 = scenes[7];
  assert.ok(sc8.scriptSegment.toLowerCase().includes('finish') && sc8.scriptSegment.toLowerCase().includes('cross'), 'Scene 8: Tortoise crosses finish line');
  assert.ok(sc8.movementType === 'victory_finish', 'Scene 8 movementType must be victory_finish');
  assert.ok(sc8.voiceoverText.toLowerCase().includes('slow and steady') || sc8.subtitleText.toLowerCase().includes('slow and steady'), 'Scene 8: Must state moral lesson');
  assert.ok(sc8.soundEffect.toLowerCase().includes('cheer') || sc8.soundEffect.toLowerCase().includes('fanfare') || sc8.soundEffect.toLowerCase().includes('applause'), 'Scene 8: Celebration sound effect');
});

test('Pillar 11.3: Original 3D Character Turnaround References & Physical Assets', async () => {
  assert.ok(rabbitChar && tortoiseChar, 'Characters must be extracted');

  // Generate turnaround reference for Barnaby the Rabbit
  const rabbitRef = await visualService.generateCharacterReferenceSheet({
    character: rabbitChar,
    style: '3d_animation'
  });

  assert.ok(rabbitRef.primaryRefUrl, 'Rabbit must have primary reference URL');
  assert.ok(rabbitRef.turnarounds && rabbitRef.turnarounds.front, 'Rabbit must have front perspective');
  assert.ok(rabbitRef.turnarounds.side, 'Rabbit must have side perspective');
  assert.ok(rabbitRef.turnarounds.three_quarter, 'Rabbit must have 3/4 perspective');
  assert.ok(rabbitRef.turnarounds.action, 'Rabbit must have action perspective');
  assert.ok(fs.existsSync(rabbitRef.primaryLocalPath), 'Rabbit reference file must exist on disk');
  assert.ok(fs.statSync(rabbitRef.primaryLocalPath).size > 1000, 'Rabbit image must be non-empty');

  // Generate turnaround reference for Tobias the Tortoise
  const tortoiseRef = await visualService.generateCharacterReferenceSheet({
    character: tortoiseChar,
    style: '3d_animation'
  });

  assert.ok(tortoiseRef.primaryRefUrl, 'Tortoise must have primary reference URL');
  assert.ok(tortoiseRef.turnarounds && tortoiseRef.turnarounds.front, 'Tortoise must have front perspective');
  assert.ok(fs.existsSync(tortoiseRef.primaryLocalPath), 'Tortoise reference file must exist on disk');
  assert.ok(fs.statSync(tortoiseRef.primaryLocalPath).size > 1000, 'Tortoise image must be non-empty');
});

test('Pillar 11.4: End-to-End Playable MP4 Video Assembly & Media Stream Validation', async () => {
  const testProjectId = `test-rabbit-tortoise-${Date.now()}`;

  // Select representative scenes for full video rendering:
  // 1. Rabbit sprinting through pine forest
  // 2. Rabbit sleeping under tree while tortoise walks
  // 3. Tortoise crosses finish line with moral lesson
  const testScenesRaw = [
    storyAnalysis.scenes[2], // Scene 3: Running sprint
    storyAnalysis.scenes[3], // Scene 4: Sleeping under tree
    storyAnalysis.scenes[7]  // Scene 8: Finish line victory & moral
  ];

  const preparedScenes = [];

  for (let sIdx = 0; sIdx < testScenesRaw.length; sIdx++) {
    const rawSc = testScenesRaw[sIdx];
    const sceneNum = sIdx + 1;

    // 1. Generate real scene visual
    const visual = await visualService.generateSceneImage({
      projectId: testProjectId,
      sceneNumber: sceneNum,
      visualPrompt: rawSc.visualPrompt,
      aspectRatio: '9:16',
      character: rawSc.movementType === 'slow_steady_walk' || rawSc.movementType === 'victory_finish' ? tortoiseChar : rabbitChar
    });

    // 2. Generate real scene narration
    const audio = await ttsService.generateSceneAudio({
      projectId: testProjectId,
      sceneNumber: sceneNum,
      voiceoverText: rawSc.voiceoverText,
      voiceId: 'en-US-JennyNeural'
    });

    assert.ok(audio.success, `Audio generation for scene ${sceneNum} must succeed`);
    assert.ok(fs.existsSync(audio.localPath), `Audio file for scene ${sceneNum} must exist on disk`);

    const synchronizedScene = videoRenderer.synchronizeSceneAssets({
      ...rawSc,
      sceneNumber: sceneNum,
      imageLocalPath: visual.localPath,
      imageUrl: visual.webUrl,
      audioLocalPath: audio.localPath,
      audioUrl: audio.webUrl,
      audioDuration: audio.duration,
      images: [
        {
          id: `shot-${sceneNum}-1`,
          shotNumber: 1,
          localPath: visual.localPath,
          continuityPlan: rawSc.sceneContinuityPlan
        }
      ]
    });

    preparedScenes.push(synchronizedScene);
  }

  // Assemble final video with FFmpeg
  const projectRecord = {
    id: testProjectId,
    userId: 'usr-demo-001',
    title: 'The Rabbit and the Tortoise',
    aspectRatio: '9:16',
    musicMood: 'playful_cartoon',
    scenes: preparedScenes
  };

  const assembly = await videoRenderer.assembleFinalVideo(projectRecord);
  assert.ok(assembly.success, 'Video assembly must succeed');
  assert.ok(fs.existsSync(assembly.videoPath), 'Master MP4 video file must exist on disk');

  // Inspect media stream using FFprobe / FFmpeg
  const validation = videoRenderer.validateRenderedVideo(assembly.videoPath);
  assert.ok(validation.isValid, `Rendered video must be valid. Error: ${validation.error}`);
  assert.ok(validation.hasVideo, 'Rendered video must contain genuine H.264 video stream');
  assert.ok(validation.hasAudio, 'Rendered video must contain genuine AAC audio stream');
  assert.ok(validation.duration > 3.0, `Rendered video duration must be > 3.0s. Got: ${validation.duration}s`);
  assert.ok(validation.width === 1080 && validation.height === 1920, `Resolution must be 1080x1920. Got: ${validation.resolution}`);
  assert.ok(validation.fileSizeBytes > 50000, `Video file size must be substantial (>50KB). Got: ${validation.fileSizeBytes} bytes`);

  console.log(`[Pillar 11 Acceptance Benchmark] Successfully created verified playable MP4: ${assembly.videoPath} (${validation.duration}s, ${validation.resolution}, ${validation.fileSizeBytes} bytes)`);
});
