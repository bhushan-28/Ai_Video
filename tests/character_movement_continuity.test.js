import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { scriptAnalysisService } from '../src/services/scriptAnalysisService.js';
import { visualService } from '../src/services/visualService.js';
import { videoProviderService } from '../src/services/videoProviderService.js';
import { videoRenderer } from '../src/services/videoRenderer.js';
import { config } from '../src/config.js';

test('1. Pillar 1: 3D Character Generation & 4-Panel Turnaround Reference', async () => {
  const character = {
    id: 'test-ruby-turnaround',
    name: 'Ruby the Rabbit',
    species: 'rabbit',
    appearance: 'Cute white rabbit with pink inner ears, blue scarf, and red adventurer backpack holding a shiny red apple',
    clothing: 'Sky-blue woolen scarf and miniature red backpack',
    seed: 777123
  };

  const refResult = await visualService.generateCharacterReferenceSheet({
    character,
    style: '3d_animation'
  });

  assert.ok(refResult.primaryRefUrl, 'Should return primary reference URL');
  assert.ok(refResult.sheetUrl, 'Should return model turnaround sheet URL');
  assert.ok(refResult.views, 'Should return turnaround views array');
  assert.ok(refResult.views.length >= 4, 'Should include at least 4 turnaround perspectives');

  const viewNames = refResult.views.map(v => v.view);
  assert.ok(viewNames.includes('front'), 'Must include front portrait view');
  assert.ok(viewNames.includes('three_quarter'), 'Must include 3/4 perspective view');
  assert.ok(viewNames.includes('side'), 'Must include side profile view');
  assert.ok(viewNames.includes('action'), 'Must include active movement stride view');
  assert.ok(viewNames.includes('sheet'), 'Must include turnaround sheet');

  // Verify files exist on disk
  assert.ok(fs.existsSync(refResult.primaryLocalPath), 'Primary portrait file must exist on disk');
  assert.ok(fs.existsSync(refResult.sheetLocalPath), 'Sheet turnaround file must exist on disk');
  assert.ok(fs.statSync(refResult.primaryLocalPath).size > 5000, 'Primary image file must be a non-empty image');
});

test('2. Pillar 2 & 3: Master Journey Scenario - Ruby walks path, crosses bridge, reaches lake', async () => {
  const storyScript = 'Ruby the Rabbit leaves her home, walks along a forest path, crosses a small wooden bridge, and reaches a beautiful lake.';

  const analysis = await scriptAnalysisService.analyzeScript({
    script: storyScript,
    style: '3d_animation',
    language: 'en',
    aspectRatio: '9:16'
  });

  assert.ok(analysis.scenes && analysis.scenes.length >= 2, 'Should divide the journey into sequential scenes');

  // Verify persistent carried objects
  const allCarriedObjects = new Set();
  analysis.scenes.forEach(sc => {
    assert.ok(sc.sceneContinuityPlan, `Scene ${sc.sceneNumber} must contain a sceneContinuityPlan`);
    assert.ok(sc.sceneContinuityPlan.startLocation, `Scene ${sc.sceneNumber} must define startLocation`);
    assert.ok(sc.sceneContinuityPlan.endLocation, `Scene ${sc.sceneNumber} must define endLocation`);
    assert.ok(sc.sceneContinuityPlan.travelDirection, `Scene ${sc.sceneNumber} must specify screen travelDirection`);
    assert.ok(sc.sceneContinuityPlan.movementType, `Scene ${sc.sceneNumber} must specify movementType`);
    assert.ok(sc.sceneContinuityPlan.characterMovement, `Scene ${sc.sceneNumber} must detail physical character movement`);

    if (sc.sceneContinuityPlan.carriedObjects) {
      sc.sceneContinuityPlan.carriedObjects.forEach(obj => allCarriedObjects.add(obj));
    }
  });

  // Verify persistent prop presence (backpack)
  assert.ok(
    Array.from(allCarriedObjects).some(prop => prop.toLowerCase().includes('backpack')),
    'Ruby must persistently carry her backpack across the journey'
  );

  // Check bridge crossing and lake destination detection
  const bridgeScene = analysis.scenes.find(sc => 
    sc.sceneContinuityPlan.movementType === 'crossing_bridge' || 
    sc.sceneContinuityPlan.endLocation.toLowerCase().includes('bridge') ||
    sc.scriptSegment.toLowerCase().includes('bridge')
  );
  assert.ok(bridgeScene, 'Must identify bridge crossing locomotion scene');

  const lakeScene = analysis.scenes.find(sc => 
    sc.sceneContinuityPlan.movementType === 'arrival_stop' ||
    sc.sceneContinuityPlan.endLocation.toLowerCase().includes('lake') ||
    sc.scriptSegment.toLowerCase().includes('lake')
  );
  assert.ok(lakeScene, 'Must identify arrival at lake destination scene');

  // Verify connected visual shots per scene
  analysis.scenes.forEach(sc => {
    assert.ok(sc.shots && sc.shots.length >= 2, `Scene ${sc.sceneNumber} must have at least 2 distinct visual shots for movement progression`);
    const shotActions = sc.shots.map(s => s.action.toLowerCase()).join(' ');
    assert.ok(shotActions.length > 20, 'Shots must specify visual actions');
  });
});

test('3. Pillar 4: Video Providers Registry & Capabilities', () => {
  const providers = videoProviderService.getProviders();
  assert.ok(Array.isArray(providers), 'Must return array of video providers');

  const providerIds = providers.map(p => p.id);
  assert.ok(providerIds.includes('local_motion_engine'), 'Must include local_motion_engine');
  assert.ok(providerIds.includes('pollinations_motion'), 'Must include pollinations_motion');
  assert.ok(providerIds.includes('google_veo'), 'Must include google_veo');
  assert.ok(providerIds.includes('runway_gen3'), 'Must include runway_gen3');
  assert.ok(providerIds.includes('luma_dream_machine'), 'Must include luma_dream_machine');

  const local = providers.find(p => p.id === 'local_motion_engine');
  assert.strictEqual(local.isConfigured, true, 'local_motion_engine must be configured out of the box');
  assert.ok(local.supportedFeatures.includes('kinematic_locomotion'), 'Must support kinematic locomotion');
});

test('4. Pillar 4 & 5: Kinematic 3D Character Motion Engine MP4 Video Rendering & Validation', async () => {
  const testTempDir = path.join(config.storageDir, 'temp', `test_kinematic_${Date.now()}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  const testSceneMp4 = path.join(testTempDir, 'test_kinematic_scene.mp4');

  // Setup test visual image
  const testImgPath = path.join(testTempDir, 'test_character_stride.jpg');
  const primaryRef = path.join(config.storageDir, 'images', 'char_test-ruby-turnaround_ref.jpg');
  if (fs.existsSync(primaryRef)) {
    fs.copyFileSync(primaryRef, testImgPath);
  } else {
    // Generate fallback test raster
    videoRenderer.ensureValidRasterImage(null, testTempDir, 1, 1, 720, 1280);
  }

  const multiShots = [
    {
      shotNumber: 1,
      action: 'Ruby starts walking along forest path',
      cameraAngle: 'Wide tracking shot',
      localPath: testImgPath,
      continuityPlan: {
        movementType: 'walking_stride',
        travelDirection: 'left_to_right',
        startLocation: "Ruby's Home",
        endLocation: 'Forest Path'
      }
    },
    {
      shotNumber: 2,
      action: 'Ruby crosses small wooden bridge with rhythmic footfalls',
      cameraAngle: 'Side tracking low-angle shot',
      localPath: testImgPath,
      continuityPlan: {
        movementType: 'crossing_bridge',
        travelDirection: 'left_to_right',
        startLocation: 'Forest Path Edge',
        endLocation: 'Rustic Wooden Bridge'
      }
    },
    {
      shotNumber: 3,
      action: 'Ruby reaches shimmering lake and looks around happily',
      cameraAngle: 'Medium close-up arrival',
      localPath: testImgPath,
      continuityPlan: {
        movementType: 'arrival_stop',
        travelDirection: 'toward_camera',
        startLocation: 'Wooden Bridge',
        endLocation: 'Shimmering Crystal Lake'
      }
    }
  ];

  await videoRenderer.renderSingleScene({
    sceneNum: 1,
    imagePath: testImgPath,
    images: multiShots,
    audioPath: null, // Generates clean synchronized audio track
    duration: 3.5,
    width: 720,
    height: 1280,
    subtitleText: 'Ruby crosses the wooden bridge to reach the beautiful lake!',
    outputPath: testSceneMp4,
    tempDir: testTempDir,
    continuityPlan: multiShots[0].continuityPlan
  });

  assert.ok(fs.existsSync(testSceneMp4), 'Rendered scene MP4 file must exist');

  // Validate media file streams via FFprobe / FFmpeg
  const validation = videoRenderer.validateMediaFile(testSceneMp4);
  assert.strictEqual(validation.isValid, true, `Validation failed: ${validation.error}`);
  assert.strictEqual(validation.hasVideo, true, 'MP4 must contain an active video stream');
  assert.strictEqual(validation.hasAudio, true, 'MP4 must contain an active audio stream');
  assert.ok(validation.duration >= 3.0, `Video duration must match expected duration (~${validation.duration}s)`);
  assert.strictEqual(validation.videoCodec, 'h264', 'Video codec must be H.264');

  // Clean up test directory
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch (_) {}
});
