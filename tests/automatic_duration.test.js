import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { 
  scriptAnalysisService, 
  analyzeScript, 
  planScenes, 
  estimateSceneDuration 
} from '../src/services/scriptAnalysisService.js';
import { 
  videoRenderer, 
  synchronizeSceneAssets, 
  assembleFinalVideo, 
  validateRenderedVideo 
} from '../src/services/videoRenderer.js';
import { 
  ttsService, 
  generateSceneAudio 
} from '../src/services/ttsService.js';
import { visualService } from '../src/services/visualService.js';
import { db } from '../src/database/db.js';

test('Acceptance 1: Short Story automatically determines short duration without hardcoding', async () => {
  const shortScript = `A golden bumblebee hovered softly over a purple flower.
It collected sweet morning nectar and buzzed happily toward the hive.`;

  const analysis = await analyzeScript({
    script: shortScript,
    style: '3d_animation',
    language: 'en'
  });

  assert.ok(analysis.scenes.length >= 1, 'Short story must have at least 1 scene');
  assert.ok(analysis.estimatedDuration > 0, 'Estimated duration must be positive');
  // Should NOT be hardcoded 30, 60, or 90
  assert.notEqual(analysis.estimatedDuration, 30, 'Must not default to 30s');
  assert.notEqual(analysis.estimatedDuration, 60, 'Must not default to 60s');
  assert.ok(
    analysis.estimatedDuration >= 7 && analysis.estimatedDuration <= 18, 
    `Short story duration should naturally be between 7s and 18s. Got: ${analysis.estimatedDuration}s`
  );

  // Verify 100% text coverage
  const allText = analysis.scenes.map(s => s.voiceoverText).join(' ');
  assert.ok(allText.includes('bumblebee') || allText.includes('nectar'), 'Entire story must be represented');
});

test('Acceptance 2: Single Character Story preserves character continuity and calculates action timing', async () => {
  const singleCharScript = `Pip the curious squirrel searched everywhere for his buried acorn.
Pip checked under the mossy stone and then behind the tall pine tree.
Finally, Pip dug up his shiny golden acorn and danced for joy!`;

  const analysis = await analyzeScript({
    script: singleCharScript,
    style: 'cartoon',
    language: 'en'
  });

  assert.ok(analysis.characters.length >= 1, 'Must extract Pip the squirrel');
  const mainChar = analysis.characters[0];
  assert.ok(mainChar.name.toLowerCase().includes('pip'), 'Main character must be Pip');

  // Verify Pip is present in 100% of scenes
  for (const sc of analysis.scenes) {
    const presentLower = sc.charactersPresent.map(c => c.toLowerCase());
    assert.ok(
      presentLower.some(c => c.includes('pip')),
      `Scene ${sc.sceneNumber} must include Pip`
    );
    assert.equal(sc.mainCharacterVisible, true, 'Main character must be visible in every scene');
  }

  // Verify calculated duration reflects the 3 actions
  assert.ok(analysis.scenes.length >= 2, 'Should divide the 3 actions into multiple scenes');
  assert.ok(analysis.estimatedDuration >= 11, `Duration should comfortably fit the actions. Got: ${analysis.estimatedDuration}s`);
});

test('Acceptance 3: Multi-Character Story with Dialogue attributes dialogue and calculates dialogue timing', async () => {
  const dialogueScript = `Oliver the wise owl rested on a mossy branch.
Fox: "Oliver, which path leads to the crystal pond?"
Oliver: "Follow the stream where the blue butterflies dance."
Fox: "Thank you, friend!"
Fox dashed through the tall ferns toward the shimmering water.`;

  const analysis = await analyzeScript({
    script: dialogueScript,
    style: '3d_animation',
    language: 'en'
  });

  // Verify multiple characters extracted
  assert.ok(analysis.characters.length >= 2, 'Must extract Oliver and Fox');
  const names = analysis.characters.map(c => c.name.toLowerCase());
  assert.ok(names.some(n => n.includes('oliver') || n.includes('owl')), 'Must identify Oliver the Owl');
  assert.ok(names.some(n => n.includes('fox')), 'Must identify Fox');

  // Verify speaker attribution
  const speakers = analysis.scenes.map(s => s.speakerName).filter(Boolean);
  assert.ok(speakers.some(s => s.toLowerCase().includes('fox')), 'Fox dialogue must be attributed');
  assert.ok(speakers.some(s => s.toLowerCase().includes('oliver') || s.toLowerCase().includes('owl')), 'Oliver dialogue must be attributed');

  // Verify natural timing
  assert.ok(analysis.scenes.length >= 3, 'Dialogue story must have multiple scenes');
  assert.ok(analysis.estimatedDuration >= 15, `Multi-character dialogue should have adequate duration. Got: ${analysis.estimatedDuration}s`);
});

test('Acceptance 4: Story with Long Dialogue dynamically extends scene duration', async () => {
  const longDialogue = `Professor Badger cleared his throat and adjusted his round spectacles.
Professor: "Listen very carefully, young apprentices. The ancient map does not merely show the way through the whispering canyon; it reveals the exact coordinates where the starlight crystal has rested undisturbed for three thousand years, waiting for the one whose heart is pure and true."
The forest animals gasped in wonder.`;

  const analysis = await analyzeScript({
    script: longDialogue,
    style: 'cinematic',
    language: 'en'
  });

  // Locate the long dialogue scene
  const dialogueScene = analysis.scenes.find(s => s.voiceoverText.includes('coordinates') || s.voiceoverText.includes('whispering canyon'));
  assert.ok(dialogueScene, 'Must find scene containing the long dialogue');
  
  // Verify duration for long dialogue was extended based on words/syllables
  assert.ok(
    dialogueScene.estimatedDuration >= 8.0, 
    `Scene with long dialogue must have extended duration (at least 8.0s). Got: ${dialogueScene.estimatedDuration}s`
  );

  // Test estimateSceneDuration directly
  const computedDur = estimateSceneDuration(dialogueScene);
  assert.ok(computedDur >= 8.0, `estimateSceneDuration must calculate appropriate duration. Got: ${computedDur}s`);
});

test('Acceptance 5: Story with Several Physical Actions and Transitions calculates action and transition timing', async () => {
  const actionScript = `Kiko the cheetah cub crouched low in the tall grass.
Suddenly, he sprinted across the rocky ravine with breathtaking speed!
He leaped over a bubbling creek, tumbling into a soft pile of golden leaves.
Kiko stood up, shook off the leaves with a cheerful giggle, and gazed at the sunset.`;

  const analysis = await analyzeScript({
    script: actionScript,
    style: 'cartoon',
    language: 'en'
  });

  assert.ok(analysis.scenes.length >= 3, 'Must create distinct scenes for sprint, leap, and recovery');
  
  // Check action and camera movement descriptions
  for (const sc of analysis.scenes) {
    assert.ok(sc.characterAction, 'Scene must record character physical action');
    assert.ok(sc.cameraMovement || sc.cameraDirection, 'Scene must record camera movement');
    assert.ok(sc.shots && sc.shots.length >= 2, 'Scene must provide multi-shot animation coverage');
  }

  assert.ok(
    analysis.estimatedDuration >= 14, 
    `Action-heavy script must calculate adequate physical time. Got: ${analysis.estimatedDuration}s`
  );
});

test('Acceptance 6: Long Script with Multiple Scenes retains 100% of narrative without truncation', async () => {
  const longScript = `In the heart of the Whispering Woods, a little rabbit named Toby discovered an old bronze key.
He asked Clara the wise hedgehog what the mysterious key unlocked.
Clara told him of the enchanted music box hidden inside the Hollow Oak.
Toby hopped past the singing waterfalls and through the field of luminous blue mushrooms.
Along the path, he encountered a lost badger cub crying near a thick bramble bush.
Toby gently comforted the little cub and guided him safely back to his family burrow.
The badger mother blessed Toby with a flask of sweet berry dew.
Refreshed, Toby finally arrived at the majestic Hollow Oak standing tall against the horizon.
He climbed the spiraling wooden steps inside the ancient trunk.
At the very top, nestled on velvet moss, sat a carved wooden chest.
Toby slipped the bronze key into the lock and turned it with a soft click.
The chest opened to reveal a glowing music box playing a lullaby of peace across the entire forest.`;

  const analysis = await analyzeScript({
    script: longScript,
    style: '3d_animation',
    language: 'en'
  });

  // Verify multiple scenes generated without clamping to 3-4 scenes
  assert.ok(
    analysis.scenes.length >= 6, 
    `Long script with 12 sentences must yield at least 6 scenes. Got: ${analysis.scenes.length}`
  );

  // Verify that key narrative beats from beginning, middle, and end are all present
  const combinedText = analysis.scenes.map(s => s.voiceoverText).join(' ').toLowerCase();
  assert.ok(combinedText.includes('toby') || combinedText.includes('rabbit'), 'Must include beginning beat (Toby the rabbit)');
  assert.ok(combinedText.includes('badger') || combinedText.includes('burrow'), 'Must include middle beat (badger cub)');
  assert.ok(combinedText.includes('music box') || combinedText.includes('chest') || combinedText.includes('lullaby'), 'Must include ending beat (music box)');

  // Verify total duration accommodates the whole story
  assert.ok(
    analysis.estimatedDuration >= 35, 
    `Full long story duration must be calculated automatically from all scenes (>=35s). Got: ${analysis.estimatedDuration}s`
  );
});

test('Acceptance 7: Media Synchronization & Validation produces verified MP4 with accurate duration', async () => {
  const testProjId = 'test-sync-val-01';

  // 1. Generate real scene visual image
  const visual = await visualService.generateSceneImage({
    projectId: testProjId,
    sceneNumber: 1,
    visualPrompt: 'A friendly cartoon rabbit holding a golden key in an enchanted forest',
    aspectRatio: '9:16'
  });

  // 2. Generate real scene audio using generateSceneAudio
  const audio = await generateSceneAudio({
    projectId: testProjId,
    sceneNumber: 1,
    voiceoverText: 'Toby found an ancient bronze key hidden under the glowing mushrooms.',
    voiceId: 'en-US-JennyNeural'
  });

  assert.ok(audio.success, 'Audio generation must succeed');
  assert.ok(audio.duration > 1.5, `Audio duration must be measured. Got: ${audio.duration}s`);

  // 3. Synchronize scene assets: audio duration determines scene duration with safety buffer
  const rawScene = {
    sceneNumber: 1,
    estimatedDuration: 3.5,
    imageLocalPath: visual.localPath,
    imageUrl: visual.webUrl,
    audioLocalPath: audio.localPath,
    audioUrl: audio.webUrl,
    audioDuration: audio.duration,
    voiceoverText: 'Toby found an ancient bronze key hidden under the glowing mushrooms.',
    subtitleText: 'Toby found an ancient bronze key ✨',
    shots: [
      { shotNumber: 1, action: 'Examining key', cameraAngle: 'Wide shot' },
      { shotNumber: 2, action: 'Smiling at key', cameraAngle: 'Close-up' }
    ]
  };

  const synchronizedScene = synchronizeSceneAssets(rawScene);
  assert.ok(
    synchronizedScene.estimatedDuration >= audio.duration,
    `Synchronized scene duration (${synchronizedScene.estimatedDuration}s) must accommodate audio duration (${audio.duration}s)`
  );
  assert.ok(
    synchronizedScene.shots.every(s => s.duration > 0),
    'Each shot must have valid positive duration'
  );

  // 4. Assemble final video
  const projectRecord = {
    id: testProjId,
    userId: 'usr-demo-001',
    title: 'Toby and the Bronze Key',
    aspectRatio: '9:16',
    musicMood: 'calm_acoustic',
    scenes: [synchronizedScene]
  };

  const assembly = await assembleFinalVideo(projectRecord);
  assert.ok(assembly.success, 'Video assembly must succeed');
  assert.ok(fs.existsSync(assembly.localVideoPath), 'Rendered MP4 file must exist on disk');

  // 5. Validate rendered video using validateRenderedVideo (FFprobe inspection)
  const validation = validateRenderedVideo(assembly.localVideoPath);
  assert.equal(validation.isValid, true, 'Rendered video must pass inspection');
  assert.equal(validation.hasVideo, true, 'Must have genuine video stream');
  assert.equal(validation.hasAudio, true, 'Must have genuine audio stream');
  assert.ok(validation.duration > 0, `Measured MP4 duration must be > 0. Got: ${validation.duration}s`);
  assert.equal(validation.width, 1080, 'Must be vertical 1080 width');
  assert.equal(validation.height, 1920, 'Must be vertical 1920 height');

  // Validate difference between estimated and rendered duration is minimal (<1.5s tolerance)
  const diff = Math.abs(validation.duration - synchronizedScene.estimatedDuration);
  assert.ok(
    diff <= 1.5,
    `Final rendered duration (${validation.duration}s) should closely match synchronized duration (${synchronizedScene.estimatedDuration}s), diff: ${diff}s`
  );
});

test.after(async () => {
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
  setTimeout(() => process.exit(0), 100);
});
