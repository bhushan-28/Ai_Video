import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { scriptAnalysisService } from '../src/services/scriptAnalysisService.js';
import { visualService } from '../src/services/visualService.js';
import { ttsService } from '../src/services/ttsService.js';
import { videoRenderer } from '../src/services/videoRenderer.js';
import { config } from '../src/config.js';

let hindiStoryAnalysis = null;
let rabbitChar = null;
let tortoiseChar = null;
let testProjectId = `yt-ref-test-${Date.now()}`;

test('YouTube Reference Pipeline 1: Hindi Kahaniya Story Understanding & Narrative Expansion', async () => {
  const prompt = 'खरगोश और कछुआ';

  hindiStoryAnalysis = await scriptAnalysisService.analyzeScript({
    script: prompt,
    title: 'खरगोश और कछुआ',
    style: '3d_animation',
    language: 'hi',
    aspectRatio: '16:9'
  });

  assert.ok(hindiStoryAnalysis, 'Analysis result must be returned');
  assert.ok(hindiStoryAnalysis.scenes && hindiStoryAnalysis.scenes.length >= 8, `Must generate at least 8 canonical scenes. Got: ${hindiStoryAnalysis.scenes?.length}`);
  
  // Verify moral
  assert.ok(hindiStoryAnalysis.moral, 'Must contain a moral lesson');
  assert.ok(
    hindiStoryAnalysis.moral.includes('धीमी') || 
    hindiStoryAnalysis.moral.includes('स्थिर') || 
    hindiStoryAnalysis.moral.includes('जीत') || 
    hindiStoryAnalysis.moral.includes('धीरज') || 
    hindiStoryAnalysis.moral.includes('मेहनत') || 
    hindiStoryAnalysis.moral.includes('घमंड') ||
    hindiStoryAnalysis.moral.toLowerCase().includes('slow and steady'),
    `Moral must reflect the classic moral lesson. Got: ${hindiStoryAnalysis.moral}`
  );

  // Verify characters
  assert.ok(hindiStoryAnalysis.characters && hindiStoryAnalysis.characters.length >= 2, 'Must extract at least Rabbit and Tortoise');
  rabbitChar = hindiStoryAnalysis.characters.find(c => 
    c.species === 'rabbit' || c.name.includes('खरगोश') || c.name.toLowerCase().includes('rabbit')
  );
  tortoiseChar = hindiStoryAnalysis.characters.find(c => 
    c.species === 'tortoise' || c.name.includes('कछुआ') || c.name.toLowerCase().includes('tortoise')
  );

  assert.ok(rabbitChar, 'Rabbit character must be extracted with 3D Pixar qualities');
  assert.ok(tortoiseChar, 'Tortoise character must be extracted with 3D Pixar qualities');
  assert.ok(rabbitChar.isMainCharacter, 'Rabbit must be set as lead character');

  // Verify authentic Hindi voices assigned
  const rVoice = rabbitChar.voiceId || rabbitChar.voiceSuggestion;
  const tVoice = tortoiseChar.voiceId || tortoiseChar.voiceSuggestion;
  assert.ok(
    rVoice && (rVoice === 'hi-IN-MadhurNeural' || rVoice.startsWith('hi-')),
    `Rabbit voice must be authentic Hindi. Got: ${rVoice}`
  );
  assert.ok(
    tVoice && (tVoice === 'hi-IN-SwaraNeural' || tVoice.startsWith('hi-')),
    `Tortoise voice must be authentic Hindi. Got: ${tVoice}`
  );

  // Verify locations and narrative progression across scenes
  const scenes = hindiStoryAnalysis.scenes;
  assert.ok(scenes[0].cameraFraming.toLowerCase().includes('wide'), 'Scene 1: Wide establishing shot of the forest');
  assert.ok(scenes[1].movementType === 'running_sprint' || scenes[1].movementType === 'slow_steady_walk', 'Scene 2: Active race movement');
  assert.ok(scenes[3].movementType === 'sleeping_rest', 'Scene 4: Rabbit sleeping under tree');
  assert.ok(scenes[4].movementType === 'slow_steady_walk', 'Scene 5: Tortoise steady continuous walk');
  assert.ok(scenes[7].movementType === 'victory_finish', 'Scene 8: Tortoise victory celebration');
});

test('YouTube Reference Pipeline 2: YouTube Metadata & SEO Kit Generation', async () => {
  assert.ok(hindiStoryAnalysis, 'Story analysis must exist');

  const meta = hindiStoryAnalysis.youtubeMetadata;
  assert.ok(meta, 'youtubeMetadata must be generated and attached to story analysis');

  // 1. Suggested titles
  assert.ok(Array.isArray(meta.suggestedTitles) && meta.suggestedTitles.length >= 3, 'Must offer at least 3 suggested titles');
  assert.ok(
    meta.suggestedTitles.some(t => t.includes('3D') || t.includes('Hindi Kahaniya') || t.includes('Moral Stories')),
    'Titles must follow YouTube kids channel standard'
  );

  // 2. Video chapters with timestamps
  assert.ok(Array.isArray(meta.chapters) && meta.chapters.length >= 8, `Must have chapters for all scenes. Got: ${meta.chapters?.length}`);
  assert.equal(meta.chapters[0].timestamp, '00:00', 'First chapter must start at 00:00');
  meta.chapters.forEach((ch, idx) => {
    assert.match(ch.timestamp, /^\d{2}:\d{2}$/, `Chapter ${idx + 1} timestamp must be MM:SS format. Got: ${ch.timestamp}`);
    assert.ok(ch.title && ch.title.length > 0, `Chapter ${idx + 1} must have a title`);
  });

  // 3. YouTube Description & Tags
  assert.ok(meta.description && meta.description.length > 100, 'Description must be rich and descriptive');
  assert.ok(meta.description.includes('00:00'), 'Description must include chapter timestamps for YouTube UI');
  assert.ok(Array.isArray(meta.tags) && meta.tags.length >= 5, 'Must provide at least 5 SEO tags');
  assert.ok(meta.tags.includes('hindi kahaniya') || meta.tags.includes('moral stories for kids'), 'Must include essential category tags');

  // 4. Pinned comment prompt
  assert.ok(meta.pinnedCommentPrompt && meta.pinnedCommentPrompt.length > 10, 'Must have engaging pinned comment prompt');
});

test('YouTube Reference Pipeline 3: Dedicated 3D YouTube Thumbnail Generation (16:9 Landscape)', async () => {
  const thumbResult = await visualService.generateYouTubeThumbnail({
    projectId: testProjectId,
    title: 'खरगोश और कछुआ',
    moral: hindiStoryAnalysis?.moral || 'धीरज और निरंतर मेहनत हमेशा घमंड को हरा देती है',
    characters: hindiStoryAnalysis?.characters || [],
    style: '3d_animation',
    aspectRatio: '16:9',
    language: 'hi'
  });

  assert.ok(thumbResult, 'Thumbnail result must be returned');
  assert.ok(thumbResult.thumbnailUrl, 'Thumbnail must have a web accessible URL');
  assert.ok(thumbResult.thumbnailPath, 'Thumbnail must have a local file path');
  assert.equal(thumbResult.aspectRatio, '16:9', 'Must be 16:9 landscape format');
  assert.equal(thumbResult.width, 1280, 'Must be 1280px width for standard YouTube');
  assert.equal(thumbResult.height, 720, 'Must be 720px height for standard YouTube');

  // Check file on disk
  assert.ok(fs.existsSync(thumbResult.thumbnailPath), `Thumbnail file must exist on disk: ${thumbResult.thumbnailPath}`);
  const stats = fs.statSync(thumbResult.thumbnailPath);
  assert.ok(stats.size > 10000, `Thumbnail file must be non-empty and reasonably sized. Got: ${stats.size} bytes`);
});

test('YouTube Reference Pipeline 4: Multi-Scene 16:9 Video Rendering with Burnt-in Subtitles & Audio Ducking', async () => {
  // Test assembly on 2 test scenes
  const scenesToRender = hindiStoryAnalysis.scenes.slice(0, 2).map((sc, idx) => ({
    sceneNumber: idx + 1,
    scriptSegment: sc.scriptSegment,
    voiceoverText: sc.voiceoverText,
    subtitleText: sc.subtitleText || sc.voiceoverText,
    voiceId: 'hi-IN-MadhurNeural',
    movementType: sc.movementType || 'walking_stride',
    cameraFraming: sc.cameraFraming || 'Medium Shot',
    cameraMovement: sc.cameraMovement || 'Smooth cinematic tracking',
    travelDirection: sc.travelDirection || 'left_to_right',
    characterAction: sc.characterAction || 'Walking purposefully',
    soundEffect: sc.soundEffect || 'gentle forest ambience',
    shots: [
      {
        shotNumber: 1,
        action: 'Scene establishing shot',
        cameraAngle: 'Wide establishing',
        visualPrompt: sc.visualPrompt || 'Pixar 3D animated forest scene'
      }
    ]
  }));

  // Create project output directory
  const projectDir = path.join(config.storageDir, 'projects', testProjectId);
  fs.mkdirSync(projectDir, { recursive: true });

  // Generate visuals and speech for test scenes
  for (const sc of scenesToRender) {
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
      voiceId: 'hi-IN-MadhurNeural',
      language: 'hi'
    });
    sc.audioLocalPath = speech.localPath;
    sc.audioUrl = speech.webUrl;
    sc.audioDuration = speech.duration;
    sc.duration = Math.max(4.0, speech.duration + 0.8);
  }

  // Render the final 16:9 video
  const renderResult = await videoRenderer.renderVideo({
    projectId: testProjectId,
    scenes: scenesToRender,
    aspectRatio: '16:9',
    musicMood: 'calm_acoustic'
  });

  assert.ok(renderResult, 'Render result must be returned');
  assert.ok(renderResult.videoUrl, 'Video must have web URL');
  assert.ok(fs.existsSync(renderResult.videoPath), `Rendered MP4 file must exist on disk: ${renderResult.videoPath}`);

  const stat = fs.statSync(renderResult.videoPath);
  assert.ok(stat.size > 50000, `Video file must be non-empty (got ${stat.size} bytes)`);
  assert.ok((renderResult.duration || renderResult.totalDuration) > 0, `Video must have positive measured duration`);

  console.log(`[YouTube Reference Test Passed] Rendered 16:9 MP4: ${renderResult.videoPath} (${renderResult.duration || renderResult.totalDuration}s, ${stat.size} bytes)`);
});
