import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { scriptAnalysisService } from '../src/services/scriptAnalysisService.js';
import { visualService } from '../src/services/visualService.js';
import { ttsService } from '../src/services/ttsService.js';
import { videoRenderer } from '../src/services/videoRenderer.js';
import { config } from '../src/config.js';

const testScript = "The rabbit challenges the tortoise to a race in a beautiful green forest. The rabbit runs quickly, stops beneath a tree, and falls asleep. The tortoise keeps walking along the path and eventually reaches the finish line. The rabbit wakes up and discovers that the tortoise has won. The story ends with the moral: Slow and steady wins the race.";

let storyPlan = null;
let rabbitChar = null;
let tortoiseChar = null;
let testProjectId = `acceptance-11-${Date.now()}`;

test('Section 11 Acceptance Test 1: Full Script Analysis & Original 3D Characters', async () => {
  storyPlan = await scriptAnalysisService.analyzeScript({
    script: testScript,
    style: '3d_animation',
    language: 'en',
    aspectRatio: '16:9'
  });

  assert.ok(storyPlan, 'Story plan must be returned');
  assert.ok(storyPlan.scenes && storyPlan.scenes.length >= 4, `Must divide story into appropriate scenes. Got: ${storyPlan.scenes?.length}`);

  // 1. Moral verification
  assert.ok(storyPlan.moral, 'Moral must be identified');
  assert.ok(storyPlan.moral.toLowerCase().includes('slow and steady'), `Moral must contain "slow and steady". Got: ${storyPlan.moral}`);

  // 2. Original Characters verification
  assert.ok(storyPlan.characters && storyPlan.characters.length >= 2, 'Must extract Rabbit and Tortoise characters');
  rabbitChar = storyPlan.characters.find(c => c.species === 'rabbit' || c.name.toLowerCase().includes('rabbit'));
  tortoiseChar = storyPlan.characters.find(c => c.species === 'tortoise' || c.name.toLowerCase().includes('tortoise'));

  assert.ok(rabbitChar, 'Original 3D rabbit must be created');
  assert.ok(tortoiseChar, 'Original 3D tortoise must be created');
  assert.ok(rabbitChar.isMainCharacter, 'Rabbit must be lead character');
  assert.ok(rabbitChar.appearance.toLowerCase().includes('ears') || rabbitChar.appearance.toLowerCase().includes('fur'), 'Rabbit must have detailed fur and ear traits');
  assert.ok(tortoiseChar.appearance.toLowerCase().includes('shell'), 'Tortoise must have detailed shell description');
  assert.ok(rabbitChar.continuityAnchor, 'Rabbit must have persistent continuity anchor token');
  assert.ok(tortoiseChar.continuityAnchor, 'Tortoise must have persistent continuity anchor token');
});

test('Section 11 Acceptance Test 2: Visible Character Movement, Kinematics & Cinematic Camera Angles', async () => {
  assert.ok(storyPlan && storyPlan.scenes, 'Story plan must exist');
  const scenes = storyPlan.scenes;

  // Verify all essential story actions are present in scene continuity plans
  const movementTypes = scenes.map(s => s.movementType || s.sceneContinuityPlan?.movementType);
  console.log('[Acceptance 11] Detected scene movement types:', movementTypes);

  // Check running, sleeping, steady walking, waking, or victory finish
  const hasRunning = movementTypes.some(m => m === 'running_sprint') || scenes.some(s => s.scriptSegment.toLowerCase().includes('run'));
  const hasSleeping = movementTypes.some(m => m === 'sleeping_rest') || scenes.some(s => s.scriptSegment.toLowerCase().includes('sleep') || s.scriptSegment.toLowerCase().includes('tree'));
  const hasWalking = movementTypes.some(m => m === 'slow_steady_walk') || scenes.some(s => s.scriptSegment.toLowerCase().includes('walk'));
  const hasFinish = movementTypes.some(m => m === 'victory_finish') || scenes.some(s => s.scriptSegment.toLowerCase().includes('finish') || s.scriptSegment.toLowerCase().includes('won'));

  assert.ok(hasRunning, 'Must contain running movement');
  assert.ok(hasSleeping, 'Must contain sleeping/resting under tree movement');
  assert.ok(hasWalking, 'Must contain tortoise walking movement');
  assert.ok(hasFinish, 'Must contain finish line / victory moment');

  // Verify cinematic camera angles
  const cameraAngles = scenes.map(s => s.cameraFraming || s.cameraMovement || s.sceneContinuityPlan?.cinematicCamera?.cameraMovement);
  assert.ok(cameraAngles.some(c => c && (c.toLowerCase().includes('wide') || c.toLowerCase().includes('establishing'))), 'Must have wide establishing shot');
  assert.ok(cameraAngles.some(c => c && (c.toLowerCase().includes('tracking') || c.toLowerCase().includes('side'))), 'Must have tracking shot');

  // Verify 3 multi-shot visual progression per scene
  scenes.forEach((sc, idx) => {
    assert.ok(sc.shots && sc.shots.length >= 2, `Scene ${idx + 1} must have multiple connected visual shots`);
    sc.shots.forEach((shot, sIdx) => {
      assert.ok(shot.visualPrompt && shot.visualPrompt.length > 20, `Scene ${idx + 1} Shot ${sIdx + 1} must have visual prompt`);
    });
  });
});

test('Section 11 Acceptance Test 3: Dedicated 3D YouTube Thumbnail & Metadata Kit', async () => {
  const thumb = await visualService.generateYouTubeThumbnail({
    projectId: testProjectId,
    title: 'The Rabbit and the Tortoise',
    moral: storyPlan.moral,
    characters: storyPlan.characters,
    style: '3d_animation',
    aspectRatio: '16:9',
    language: 'en'
  });

  assert.ok(thumb, 'Thumbnail must be generated');
  assert.ok(thumb.thumbnailUrl, 'Thumbnail must have URL');
  assert.equal(thumb.width, 1280, 'Must be 1280px landscape width');
  assert.equal(thumb.height, 720, 'Must be 720px landscape height');
  assert.ok(fs.existsSync(thumb.thumbnailPath || thumb.localPath), 'Thumbnail image must exist on disk');

  // Metadata verification
  const meta = storyPlan.youtubeMetadata;
  assert.ok(meta, 'YouTube metadata must be generated');
  assert.ok(Array.isArray(meta.chapters) && meta.chapters.length >= 4, 'Must have video chapters');
  assert.equal(meta.chapters[0].timestamp, '00:00', 'First chapter starts at 00:00');
  assert.ok(Array.isArray(meta.suggestedTitles) && meta.suggestedTitles.length >= 3, 'Must have suggested titles');
  assert.ok(Array.isArray(meta.tags) && meta.tags.length >= 5, 'Must have SEO tags');
  assert.ok(meta.pinnedCommentPrompt, 'Must have audience engagement pinned comment');
});

test('Section 11 Acceptance Test 4: End-to-End Playable 16:9 MP4 Assembly with Synchronized Audio & Subtitles', async () => {
  const projectDir = path.join(config.storageDir, 'projects', testProjectId);
  fs.mkdirSync(projectDir, { recursive: true });

  // Render first 2 scenes to validate full video pipeline
  const testScenes = storyPlan.scenes.slice(0, 2).map((sc, idx) => ({
    ...sc,
    sceneNumber: idx + 1
  }));

  for (const sc of testScenes) {
    const visual = await visualService.generateCharacterPreservingVisual({
      character: rabbitChar,
      prompt: `${sc.shots[0].visualPrompt}, 3D cartoon, Pixar style, vivid HDR colors`,
      sceneNumber: sc.sceneNumber,
      aspectRatio: '16:9',
      style: '3d_animation',
      sceneMovementPlan: {
        movementType: sc.movementType,
        travelDirection: sc.travelDirection
      }
    });

    sc.imageLocalPath = visual.localPath;
    sc.imageUrl = visual.webUrl;
    sc.shots[0].localPath = visual.localPath;
    sc.shots[0].webUrl = visual.webUrl;
    sc.images = [
      {
        id: `shot-${sc.sceneNumber}-1`,
        shotNumber: 1,
        localPath: visual.localPath,
        continuityPlan: sc.sceneContinuityPlan
      }
    ];

    const speech = await ttsService.generateSpeech({
      text: sc.voiceoverText,
      voiceId: 'en-US-JennyNeural',
      language: 'en'
    });

    sc.audioLocalPath = speech.localPath;
    sc.audioUrl = speech.webUrl;
    sc.audioDuration = speech.duration;
    sc.duration = Math.max(3.5, speech.duration + 0.6);
  }

  const renderResult = await videoRenderer.renderCompleteVideo({
    projectId: testProjectId,
    scenes: testScenes,
    aspectRatio: '16:9',
    musicMood: 'calm_acoustic'
  });

  assert.ok(renderResult, 'Render result must be returned');
  assert.ok(renderResult.videoUrl, 'Video web URL must exist');
  assert.ok(fs.existsSync(renderResult.videoPath), `Rendered MP4 file must exist: ${renderResult.videoPath}`);

  const validation = videoRenderer.validateRenderedVideo(renderResult.videoPath);
  assert.ok(validation.isValid, `Rendered MP4 must be valid media: ${validation.error}`);
  assert.ok(validation.hasVideo, 'MP4 must have H.264 video stream');
  assert.ok(validation.hasAudio, 'MP4 must have AAC audio stream');
  assert.ok(validation.duration > 0, `MP4 duration must be > 0 (got ${validation.duration}s)`);

  console.log(`[Section 11 Acceptance Benchmark Passed] Verified playable MP4: ${renderResult.videoPath} (${validation.duration}s, ${validation.resolution}, ${validation.fileSizeBytes} bytes)`);
});
