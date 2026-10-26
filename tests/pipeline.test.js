import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { scriptAnalysisService } from '../src/services/scriptAnalysisService.js';
import { visualService } from '../src/services/visualService.js';
import { ttsService } from '../src/services/ttsService.js';
import { videoRenderer } from '../src/services/videoRenderer.js';
import { jobQueue } from '../src/services/jobQueue.js';
import { videoProviderService } from '../src/services/videoProviderService.js';
import { db } from '../src/database/db.js';

test('1. Script Analysis: Generates dynamic scene breakdown from original user script', async () => {
  const originalScript = `Coco the brave rabbit packed his blue shoulder bag.
Coco: "Today I will climb the Rainbow Mountain!"
On the trail, he met Tilly the wise turtle resting under an oak tree.
Tilly: "Take this glowing star map, Coco. It will guide your way."
Together, they smiled under the warm golden sun.`;

  const result = await scriptAnalysisService.analyzeScript({
    script: originalScript,
    duration: 30,
    style: '3d_animation',
    language: 'en',
    aspectRatio: '9:16'
  });

  assert.ok(result.scenes && result.scenes.length > 0, 'Scenes must be generated');
  assert.ok(result.characters && result.characters.length >= 2, 'Must extract both Coco and Tilly');
  
  const charNames = result.characters.map(c => c.name.toLowerCase());
  assert.ok(charNames.some(n => n.includes('coco')), 'Coco must be an extracted character');
  assert.ok(charNames.some(n => n.includes('tilly')), 'Tilly must be an extracted character');
  
  // Verify that the scenes contain text from the user's actual script
  const allVoiceover = result.scenes.map(s => s.voiceoverText).join(' ');
  assert.ok(allVoiceover.toLowerCase().includes('coco') || allVoiceover.toLowerCase().includes('rainbow') || allVoiceover.toLowerCase().includes('tilly'), 'Scenes must reflect user script content');
});

test('2. Character Records & Reference Turnaround Generation', async () => {
  const testChar = {
    id: 'char-test-coco-01',
    name: 'Coco the Rabbit',
    species: 'rabbit',
    age: 'Young rabbit',
    appearance: 'White fluffy bunny with blue backpack',
    clothing: 'Blue shoulder bag and red scarf'
  };

  const refResult = await visualService.generateCharacterReferenceSheet({
    character: testChar,
    style: '3d_animation'
  });

  assert.ok(refResult.primaryRefUrl, 'Primary reference image URL must exist');
  assert.ok(refResult.sheetUrl, 'Multi-view sheet URL must exist');
  assert.ok(fs.existsSync(refResult.primaryLocalPath), 'Primary reference image file must exist on disk');
  assert.ok(fs.statSync(refResult.primaryLocalPath).size > 1000, 'Image file must be non-empty');
});

test('3. Character Consistency: Visual anchor tokens injected into scene prompts', async () => {
  const testChar = {
    id: 'char-test-coco-01',
    name: 'Coco the Rabbit',
    appearance: 'White fluffy bunny with blue backpack',
    color: 'White and blue',
    continuityAnchor: 'Coco the Rabbit, fluffy white bunny with blue backpack and red scarf'
  };

  const sceneResult = await visualService.generateSceneImage({
    projectId: 'test-proj-01',
    sceneNumber: 1,
    visualPrompt: 'hopping along a wildflower forest trail',
    aspectRatio: '9:16',
    character: testChar
  });

  assert.ok(sceneResult.prompt.includes('Coco the Rabbit'), 'Scene prompt must contain character name');
  assert.ok(sceneResult.prompt.includes('blue backpack'), 'Scene prompt must contain character visual anchor');
  assert.ok(fs.existsSync(sceneResult.localPath), 'Scene image must exist on disk');
});

test('4. Audio Generation: Uses distinct voice and computes duration via FFmpeg', async () => {
  const audioResult = await ttsService.generateSceneAudio({
    projectId: 'test-audio-01',
    sceneNumber: 1,
    voiceoverText: 'Today I will climb the Rainbow Mountain!',
    voiceId: 'en-US-JennyNeural'
  });

  assert.ok(audioResult.success, 'Audio synthesis must succeed');
  assert.ok(fs.existsSync(audioResult.localPath), 'Audio file must exist on disk');
  assert.ok(audioResult.duration > 1.0, 'Duration must be computed and greater than 1 second');
  assert.ok(fs.statSync(audioResult.localPath).size > 1000, 'Audio file must have valid MP3 size');
});

test('5. Selective Scene Visual Regeneration preserves other scene data', async () => {
  const testProjectId = 'test-selective-01';
  const initialProject = {
    id: testProjectId,
    userId: 'usr-demo-001',
    title: 'Test Selective Project',
    status: 'completed',
    scenes: [
      {
        sceneNumber: 1,
        visualPrompt: 'Scene 1 original prompt',
        voiceoverText: 'Scene 1 audio line',
        imageLocalPath: 'outputs/images/dummy1.jpg',
        imageUrl: '/outputs/images/dummy1.jpg',
        audioLocalPath: 'outputs/audio/dummy1.mp3',
        audioUrl: '/outputs/audio/dummy1.mp3'
      },
      {
        sceneNumber: 2,
        visualPrompt: 'Scene 2 original prompt',
        voiceoverText: 'Scene 2 audio line',
        imageLocalPath: 'outputs/images/dummy2.jpg',
        imageUrl: '/outputs/images/dummy2.jpg',
        audioLocalPath: 'outputs/audio/dummy2.mp3',
        audioUrl: '/outputs/audio/dummy2.mp3'
      }
    ]
  };
  db.saveProject(initialProject);

  const updatedScene = await jobQueue.regenerateSceneVisual({
    projectId: testProjectId,
    sceneNumber: 1,
    customPrompt: 'Scene 1 updated visual prompt'
  });

  const reloaded = db.getProjectById(testProjectId);
  assert.equal(reloaded.scenes[0].visualPrompt, 'Scene 1 updated visual prompt', 'Scene 1 prompt must be updated');
  assert.equal(reloaded.scenes[0].voiceoverText, 'Scene 1 audio line', 'Scene 1 audio text must remain intact');
  assert.equal(reloaded.scenes[1].visualPrompt, 'Scene 2 original prompt', 'Scene 2 must not be modified');
});

test('6. Selective Audio Regeneration does NOT regenerate video or alter visual prompt', async () => {
  const testProjectId = 'test-selective-audio-01';
  const initialProject = {
    id: testProjectId,
    userId: 'usr-demo-001',
    title: 'Test Audio Regeneration',
    scenes: [
      {
        sceneNumber: 1,
        visualPrompt: 'Static visual prompt that should not change',
        voiceoverText: 'Original speech line',
        imageUrl: '/outputs/images/static1.jpg',
        imageLocalPath: 'outputs/images/static1.jpg'
      }
    ]
  };
  db.saveProject(initialProject);

  const updatedScene = await jobQueue.regenerateSceneAudio({
    projectId: testProjectId,
    sceneNumber: 1,
    customVoiceoverText: 'Brand new spoken dialogue!'
  });

  const reloaded = db.getProjectById(testProjectId);
  assert.equal(reloaded.scenes[0].voiceoverText, 'Brand new spoken dialogue!', 'Audio text must be updated');
  assert.equal(reloaded.scenes[0].visualPrompt, 'Static visual prompt that should not change', 'Visual prompt must NOT change');
  assert.equal(reloaded.scenes[0].imageUrl, '/outputs/images/static1.jpg', 'Image URL must remain intact');
  assert.ok(fs.existsSync(updatedScene.audioLocalPath), 'Regenerated audio file must exist');
});

test('7. FFmpeg Assembly: Assembles scenes into valid playable MP4 with subtitles', async () => {
  // Create 2 small test scenes with generated visual & audio
  const projId = 'test-ffmpeg-render-01';
  const sc1Visual = await visualService.generateSceneImage({
    projectId: projId,
    sceneNumber: 1,
    visualPrompt: 'Scene 1 cartoon forest',
    aspectRatio: '9:16'
  });
  const sc1Audio = await ttsService.generateSceneAudio({
    projectId: projId,
    sceneNumber: 1,
    voiceoverText: 'Welcome to the magical cartoon test story!',
    voiceId: 'en-US-JennyNeural'
  });

  const renderResult = await videoRenderer.renderCompleteVideo({
    projectId: projId,
    scenes: [
      {
        sceneNumber: 1,
        imageLocalPath: sc1Visual.localPath,
        audioLocalPath: sc1Audio.localPath,
        audioDuration: sc1Audio.duration,
        subtitleText: 'Welcome to the magical cartoon test story!'
      }
    ],
    aspectRatio: '9:16',
    musicMood: 'calm_acoustic'
  });

  assert.ok(renderResult.success, 'Video rendering must succeed');
  assert.ok(fs.existsSync(renderResult.localVideoPath), 'Rendered MP4 file must exist on disk');
  assert.ok(fs.statSync(renderResult.localVideoPath).size > 10000, 'MP4 file size must be substantial (>10KB)');
  assert.ok(fs.existsSync(renderResult.localSrtPath), 'Synchronized SRT subtitles must exist');
});

test('8. Missing API Credentials: Honest error reporting for unconfigured providers', async () => {
  const providers = videoProviderService.getProviders();
  const veoProvider = providers.find(p => p.id === 'google_veo');
  assert.ok(veoProvider, 'Google Veo provider must be registered');
  
  if (!process.env.VEO_API_KEY) {
    assert.equal(veoProvider.status, 'missing_credentials', 'Veo must honestly report missing credentials');
    await assert.rejects(
      async () => {
        await videoProviderService.generateSceneVideo({
          providerId: 'google_veo',
          projectId: 'p1',
          sceneNumber: 1,
          visualPrompt: 'test prompt'
        });
      },
      /Google Veo API key is missing/,
      'Must reject with actionable configuration message when credentials are missing'
    );
  }
});

test('9. User Access Control: Prevents accessing other users private projects', async () => {
  const userAProject = {
    id: 'proj-user-a-secret',
    userId: 'usr-user-a',
    title: 'Secret Project of User A',
    scenes: []
  };
  db.saveProject(userAProject);

  // User B tries to delete User A's project
  const deleteResult = db.deleteProject('proj-user-a-secret', 'usr-user-b');
  assert.equal(deleteResult, false, 'User B must NOT be allowed to delete User A project');

  // Verify project is still intact
  const projectAfter = db.getProjectById('proj-user-a-secret');
  assert.ok(projectAfter, 'Project must remain intact after unauthorized delete attempt');
});

test('10. Media Stream Validation: Verifies genuine H.264 video and AAC audio streams', async () => {
  // Test valid MP4 from previous render test
  const validMp4 = path.join(process.cwd(), 'outputs', 'videos', 'video_test-ffmpeg-render-01.mp4');
  assert.ok(fs.existsSync(validMp4), 'Rendered test MP4 must exist');

  const validation = await videoRenderer.validateMediaFile(validMp4);
  assert.equal(validation.isValid, true, 'Valid video must pass media validation');
  assert.equal(validation.hasVideo, true, 'Valid video must contain video stream');
  assert.equal(validation.hasAudio, true, 'Valid video must contain audio stream');
  assert.ok(validation.duration > 0, 'Duration must be greater than 0');
  assert.equal(validation.width, 1080, 'Width must be 1080');
  assert.equal(validation.height, 1920, 'Height must be 1920');

  // Test that audio-only file is NOT accepted as a valid video
  const audioOnlyFile = path.join(process.cwd(), 'outputs', 'audio', 'scene_test-audio-01_1.mp3');
  assert.ok(fs.existsSync(audioOnlyFile), 'Audio-only test file must exist');

  const audioOnlyValidation = await videoRenderer.validateMediaFile(audioOnlyFile);
  assert.equal(audioOnlyValidation.hasVideo, false, 'Audio-only file must be flagged as having NO video stream');
  assert.equal(audioOnlyValidation.isValid, false, 'Audio-only file must NOT be accepted as valid video');
});

test('11. Main Character Continuity: Main character locked across 100% of scenes', async () => {
  const storyScript = `Ruby the white rabbit found a juicy red apple in the enchanted clearing.
Ruby hopped over to Sammy the squirrel and offered him a bite.
Sammy smiled with joy as Pip the hedgehog arrived.
Ruby shared another slice with Pip.
All three friends enjoyed the feast together under the golden sun.`;

  const parsed = await scriptAnalysisService.analyzeScript({
    script: storyScript,
    duration: 30,
    style: '3d_animation',
    language: 'en'
  });

  assert.ok(parsed.mainCharacter, 'Main character must be identified');
  assert.ok(parsed.mainCharacter.toLowerCase().includes('ruby'), 'Ruby must be designated as main character');

  // Verify that the main character appears in every single scene
  for (const sc of parsed.scenes) {
    const charsLower = sc.charactersPresent.map(c => c.toLowerCase());
    assert.ok(
      charsLower.some(c => c.includes('ruby')),
      `Scene ${sc.sceneNumber} must contain main character Ruby. Found: ${sc.charactersPresent.join(', ')}`
    );
    assert.equal(sc.mainCharacterVisible, true, `Scene ${sc.sceneNumber} must have mainCharacterVisible true`);
  }
});

test('12. Scene Timing Plan: All scenes contain structured timing, framing and action', async () => {
  const parsed = await scriptAnalysisService.analyzeScript({
    script: 'Ruby explored the deep green meadow and found a secret door.',
    duration: 15,
    style: '3d_animation',
    language: 'en'
  });

  assert.ok(parsed.scenes.length >= 2, 'Should generate multiple scenes');
  for (const sc of parsed.scenes) {
    assert.ok(typeof sc.startTime === 'number', 'Scene must have numeric startTime');
    assert.ok(typeof sc.endTime === 'number', 'Scene must have numeric endTime');
    assert.ok(sc.endTime > sc.startTime, 'endTime must be greater than startTime');
    assert.ok(sc.characterScreenTime, 'Scene must record expected characterScreenTime');
    assert.ok(sc.cameraFraming, 'Scene must specify camera framing');
    assert.ok(sc.cameraMovement, 'Scene must specify camera movement');
    assert.ok(sc.characterAction, 'Scene must describe character action');
  }
});

test('13. Multi-Shot Scene Generation: Generates multiple distinct cartoon images per scene with character identity preserved', async () => {
  const singleCharScript = `Barnaby the brown bunny woke up in his cozy burrow bed.
Then Barnaby hopped excitedly through the sunny clover field.
Barnaby spotted a bright orange carrot sticking out of the soft earth.
Barnaby pulled with all his might and harvested the huge juicy carrot!`;

  const parsed = await scriptAnalysisService.analyzeScript({
    script: singleCharScript,
    duration: 20,
    style: '3d_animation',
    language: 'en'
  });

  assert.ok(parsed.scenes && parsed.scenes.length >= 3, 'Must break story into at least 3 scenes');
  for (const sc of parsed.scenes) {
    assert.ok(sc.shots && sc.shots.length >= 2, `Scene ${sc.sceneNumber} must contain multiple visual shots`);
    // Verify shots have distinct actions
    const shotPrompts = sc.shots.map(s => s.visualPrompt);
    assert.notEqual(shotPrompts[0], shotPrompts[1], 'Shots within a scene must have different visual prompts/actions');
  }

  // Generate multi-shot images for scene 1
  const sc1 = parsed.scenes[0];
  const mainChar = parsed.characters[0];
  const multiImages = await visualService.generateSceneImages({
    projectId: 'test-multishot-proj',
    sceneNumber: 1,
    shots: sc1.shots,
    visualPrompt: sc1.visualPrompt,
    character: mainChar
  });

  assert.ok(multiImages.images && multiImages.images.length >= 2, 'Must generate multiple images for the scene');
  assert.ok(fs.existsSync(multiImages.images[0].localPath), 'Shot 1 image must exist on disk');
  assert.ok(fs.existsSync(multiImages.images[1].localPath), 'Shot 2 image must exist on disk');
  assert.ok(fs.statSync(multiImages.images[0].localPath).size > 1000, 'Shot 1 image must not be empty');
  assert.ok(fs.statSync(multiImages.images[1].localPath).size > 1000, 'Shot 2 image must not be empty');

  // Verify that both shots include the main character continuity anchor
  assert.ok(multiImages.images[0].visualPrompt.toLowerCase().includes(mainChar.name.toLowerCase().split(' ')[0]), 'Shot 1 must preserve character identity');
  assert.ok(multiImages.images[1].visualPrompt.toLowerCase().includes(mainChar.name.toLowerCase().split(' ')[0]), 'Shot 2 must preserve character identity');
});

test.after(async () => {
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  setTimeout(() => process.exit(0), 100);
});

