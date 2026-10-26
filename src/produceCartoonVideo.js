import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database/db.js';
import { ttsService } from './services/ttsService.js';
import { videoRenderer } from './services/videoRenderer.js';
import { visualService } from './services/visualService.js';
import { config } from './config.js';
import { mongoManager } from './database/mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootOutputs = config.storageDir;

async function produceCartoonShort() {
  console.log('====================================================');
  console.log('🎬 STARTING COMPLETE PRODUCTION: The Rabbit Who Shared His Apple');
  console.log('====================================================');

  await mongoManager.connect();

  const projectId = 'proj-ruby-apple-01';

  // 1. Register Consistent Characters
  const rubyChar = {
    id: 'char-ruby-01',
    userId: 'usr-demo-001',
    name: 'Ruby the Rabbit',
    type: 'animal',
    age: 'Little rabbit (age 5)',
    appearance: 'Cute white rabbit with pink inner ears, large expressive warm brown eyes, wearing a cozy blue knitted scarf and a small red backpack, holding a big shiny red apple',
    color: 'Pure white fur, soft pink ears',
    personality: 'Kind, generous, cheerful, loves sharing and helping friends',
    voiceType: 'childlike',
    artStyle: '3d_animation',
    referencePrompt: 'Cute 3D Pixar animated white rabbit named Ruby, pink inner ears, large expressive brown eyes, blue scarf, red backpack, holding a shiny red apple, magical sunlit forest',
    referenceImage: '/outputs/images/ruby_rabbit_ref.jpg'
  };

  const sammyChar = {
    id: 'char-sammy-02',
    userId: 'usr-demo-001',
    name: 'Sammy the Squirrel',
    type: 'animal',
    age: 'Little squirrel (age 5)',
    appearance: 'Friendly little brown squirrel with an oversized fluffy tail, wearing a cheerful bright yellow knitted vest, shiny curious eyes',
    color: 'Warm chestnut brown, cream belly',
    personality: 'Playful, energetic, grateful, honest',
    voiceType: 'energetic',
    artStyle: '3d_animation',
    referencePrompt: 'Friendly little brown squirrel named Sammy with fluffy bushy tail, yellow knitted vest, shiny black eyes, 3D Pixar animated cartoon style',
    referenceImage: '/outputs/images/sammy_squirrel_ref.jpg'
  };

  const pipChar = {
    id: 'char-pip-03',
    userId: 'usr-demo-001',
    name: 'Pip the Hedgehog',
    type: 'animal',
    age: 'Baby hedgehog (age 4)',
    appearance: 'Small adorable hedgehog wearing green denim overalls, soft rounded quills, sweet expressive dark eyes',
    color: 'Warm beige face and paws, chocolate brown quills',
    personality: 'Gentle, shy, sweet, loves friends and flowers',
    voiceType: 'childlike',
    artStyle: '3d_animation',
    referencePrompt: 'Small adorable baby hedgehog named Pip wearing green overalls, soft rounded quills, sweet expressive dark eyes, 3D Pixar animated cartoon style',
    referenceImage: '/outputs/images/pip_hedgehog_ref.jpg'
  };

  [rubyChar, sammyChar, pipChar].forEach(c => db.saveCharacter(c));

  // 2. Define the 10-Scene Storyboard (~70s total)
  const sceneDefinitions = [
    {
      sceneNumber: 1,
      speaker: 'Storyteller / Ruby',
      visualPrompt: 'Ruby the cute white rabbit with blue scarf and red backpack discovers a giant glistening shiny red apple on a low mossy tree branch in a magical sunlit woodland with glowing mushrooms and soft god rays, 3D Pixar animation, 8k render',
      voiceoverText: "Deep in the glowing Whispering Woods, Ruby the little white rabbit found the biggest, shiniest red apple she had ever seen! Mmm, my favorite treat!",
      subtitleText: "Ruby found the shiniest, biggest red apple! 🍎",
      cameraDirection: "Slow push-in tracking shot on Ruby's sparkling brown eyes",
      soundEffect: "magical chime, bird songs",
      duration: 6.8
    },
    {
      sceneNumber: 2,
      speaker: 'Storyteller',
      visualPrompt: 'Ruby the white rabbit sitting on a mossy fallen log, hugging the giant shiny red apple with a happy proud smile, rubbing it clean on her blue scarf, 3D Pixar style, soft warm lighting',
      voiceoverText: "Ruby sat on a mossy log, polished the apple clean on her blue scarf, and opened wide for the very first crunch. But right then...",
      subtitleText: "Ready for that sweet, crunchy bite... 😋",
      cameraDirection: "Close-up on the glistening apple and Ruby's joyful smile",
      soundEffect: "soft rustling leaves",
      duration: 6.5
    },
    {
      sceneNumber: 3,
      speaker: 'Sammy the Squirrel',
      visualPrompt: 'Sammy the little brown squirrel with fluffy tail wearing a yellow knitted vest, looking down from a tree branch with sad puppy eyes, clutching his rumbling tummy, 3D Pixar animation',
      voiceoverText: "A tiny sigh echoed from an oak branch. It was Sammy the squirrel in his yellow vest, his tummy making a loud grumble! 'I searched all morning, but found no acorns,' Sammy whispered.",
      subtitleText: "Sammy's tummy grumbled loudly! 🥺",
      cameraDirection: "Medium shot tilting up to Sammy clutching his tummy",
      soundEffect: "funny tummy grumble sound effect",
      duration: 7.2
    },
    {
      sceneNumber: 4,
      speaker: 'Ruby',
      visualPrompt: 'Ruby the white rabbit smiling warmly, snapping the big red apple cleanly in half and handing the bigger piece to Sammy the squirrel in his yellow vest, 3D Pixar style, heartfelt expressions',
      voiceoverText: "Ruby looked at her delicious apple, then at her hungry friend. She didn't hesitate. Snap! 'Here, Sammy! Let's share!' Ruby cheered with a warm smile.",
      subtitleText: "Snap! 'Here Sammy, let's share!' ❤️",
      cameraDirection: "Heartwarming two-shot of Ruby handing the slice to Sammy",
      soundEffect: "crisp apple snap sound",
      duration: 6.8
    },
    {
      sceneNumber: 5,
      speaker: 'Storyteller',
      visualPrompt: 'Sammy the squirrel happily holding half of the apple, his fluffy tail wagging, while in the background a tiny blue mushroom patch begins to rustle, 3D Pixar style',
      voiceoverText: "Sammy beamed with delight! 'Thank you, Ruby! You're the kindest!' But before they could take a bite, a soft sniffle came from behind the glowing mushrooms.",
      subtitleText: "A soft sniffle behind the glowing mushrooms... 🍄",
      cameraDirection: "Over-the-shoulder shot panning toward the glowing blue mushrooms",
      soundEffect: "gentle sniffling sound",
      duration: 6.5
    },
    {
      sceneNumber: 6,
      speaker: 'Pip the Hedgehog',
      visualPrompt: 'Little Pip the baby hedgehog in green denim overalls, sitting sadly near glowing flowers with a tiny tear on his cheek, 3D Pixar animated cartoon style, ultra cute',
      voiceoverText: "It was little Pip the hedgehog in his green overalls, wiping a tiny tear. 'My berry basket fell in the bubbling river, and I have nothing left to eat,' Pip sobbed.",
      subtitleText: "Pip lost his lunch in the river! 😢",
      cameraDirection: "Low ground-level shot focusing on cute little Pip",
      soundEffect: "river water trickling ambient",
      duration: 7.0
    },
    {
      sceneNumber: 7,
      speaker: 'Ruby & Sammy',
      visualPrompt: 'Ruby the white rabbit and Sammy the squirrel carefully cutting the apple into three equal crunchy slices and offering one to little Pip the hedgehog, 3D Pixar animation',
      voiceoverText: "Ruby and Sammy exchanged a knowing smile. Together, they sliced the apple into three crunchy pieces! 'Don't cry, Pip! There is plenty for all three of us!'",
      subtitleText: "'There is plenty for all three of us!' 🍎✨",
      cameraDirection: "Close-up on small paws holding three shiny apple slices",
      soundEffect: "sparkle chime sound",
      duration: 6.8
    },
    {
      sceneNumber: 8,
      speaker: 'Storyteller',
      visualPrompt: 'Ruby the rabbit, Sammy the squirrel in yellow vest, and Pip the hedgehog in green overalls sitting side by side on a log, crunching apple slices happily with colorful butterflies, 3D Pixar animation',
      voiceoverText: "The three little friends sat together on the sunny log, munching happily. The apple tasted a hundred times sweeter because they were eating it together!",
      subtitleText: "It tasted 100 times sweeter together! 🌟",
      cameraDirection: "Cinematic wide vista with golden sunlight and dancing butterflies",
      soundEffect: "crunch crunch sounds, happy forest birds",
      duration: 7.0
    },
    {
      sceneNumber: 9,
      speaker: 'Storyteller / Ruby',
      visualPrompt: 'Ruby the white rabbit, Sammy the squirrel, and Pip the hedgehog in a joyful group hug with glowing magical hearts floating in the air, 3D Pixar animation',
      voiceoverText: "Pip danced with joy, and Sammy hugged Ruby tight! Ruby learned something magical that day: sharing didn't make her apple smaller—it made happiness grow bigger!",
      subtitleText: "Moral: Sharing makes happiness grow! 💫",
      cameraDirection: "Warm slow-motion zoom on the three friends hugging",
      soundEffect: "triumphant gentle harp swell",
      duration: 7.2
    },
    {
      sceneNumber: 10,
      speaker: 'Storyteller & Ruby',
      visualPrompt: 'Ruby the white rabbit, Sammy the squirrel, and Pip the hedgehog standing together cheerfully waving at the camera with woodland flower bouquets, 3D Pixar animated cartoon style, vibrant colors',
      voiceoverText: "Always remember to share with your friends, little explorers! What treat would you share today? Tell us below, and subscribe for our next magical woodland adventure! Bye-bye!",
      subtitleText: "Subscribe for more magical adventures! 👋🎬",
      cameraDirection: "Ruby, Sammy, and Pip waving cheerfully toward the viewer",
      soundEffect: "cheerful music outro and pop bell",
      duration: 7.5
    }
  ];

  // 3. Generate Audio for all 10 Scenes
  console.log('\n--- STEP 1: Synthesizing Expressive Children Voiceover ---');
  const tempAudioDir = path.join(rootOutputs, 'temp', 'rabbit_audio');
  fs.mkdirSync(tempAudioDir, { recursive: true });

  const voiceId = 'en-US-JennyNeural'; // Warm expressive children's storyteller voice
  const scenesWithAssets = [];

  for (let i = 0; i < sceneDefinitions.length; i++) {
    const sc = sceneDefinitions[i];
    const scNum = i + 1;
    console.log(`Synthesizing Scene ${scNum}/10 voiceover...`);
    
    const audioRes = await ttsService.generateSceneAudio({
      projectId,
      sceneNumber: scNum,
      voiceoverText: sc.voiceoverText,
      voiceId
    });

    // 4. Generate/Assign Scene Visual
    console.log(`Generating Scene ${scNum}/10 3D Pixar visual...`);
    const visualRes = await visualService.generateSceneImage({
      projectId,
      sceneNumber: scNum,
      visualPrompt: sc.visualPrompt,
      aspectRatio: '9:16',
      character: rubyChar
    });

    scenesWithAssets.push({
      ...sc,
      sceneNumber: scNum,
      audioLocalPath: audioRes.localPath,
      audioUrl: audioRes.webUrl,
      audioDuration: audioRes.duration || sc.duration,
      imageLocalPath: visualRes.localPath,
      imageUrl: visualRes.webUrl
    });
  }

  // 5. Render Final 9:16 High-Definition MP4 Video with Ken Burns & Burnt-in Shorts Captions
  console.log('\n--- STEP 2: Rendering Full 70-Second 9:16 MP4 with Ken Burns & Audio Ducking ---');
  const renderResult = await videoRenderer.renderCompleteVideo({
    projectId,
    scenes: scenesWithAssets,
    aspectRatio: '9:16',
    musicMood: 'calm_acoustic',
    onProgress: ({ percent, message }) => {
      console.log(`[${percent}%] ${message}`);
    }
  });

  // 6. Copy to dedicated named output files
  const finalNamedVideoPath = path.join(rootOutputs, 'videos', 'the_rabbit_who_shared_his_apple.mp4');
  fs.copyFileSync(renderResult.localVideoPath, finalNamedVideoPath);

  const finalNamedSrtPath = path.join(rootOutputs, 'subtitles', 'the_rabbit_who_shared_his_apple.srt');
  fs.copyFileSync(renderResult.localSrtPath, finalNamedSrtPath);

  // 7. Save to Database & MongoDB
  const projectDoc = {
    id: projectId,
    userId: 'usr-demo-001',
    title: 'The Rabbit Who Shared His Apple 🍎 | 3D Animated Shorts',
    description: "A heartwarming 3D animated children's cartoon story about Ruby the white rabbit, Sammy the squirrel, and Pip the hedgehog. Moral: Sharing makes happiness grow! #Shorts #KidsCartoon #3DAnimation",
    topic: 'The Rabbit Who Shared His Apple',
    style: '3d_animation',
    duration: renderResult.totalDuration,
    aspectRatio: '9:16',
    language: 'en',
    voiceId,
    musicMood: 'calm_acoustic',
    characterId: 'char-ruby-01',
    scenes: scenesWithAssets,
    isScriptApproved: true,
    status: 'completed',
    progress: 100,
    currentStage: 'Completed',
    videoUrl: `/outputs/videos/the_rabbit_who_shared_his_apple.mp4`,
    subtitleUrl: `/outputs/subtitles/the_rabbit_who_shared_his_apple.srt`,
    srtContent: renderResult.srtContent,
    createdAt: new Date().toISOString()
  };

  db.saveProject(projectDoc);

  console.log('\n====================================================');
  console.log('🎉 PRODUCTION COMPLETED SUCCESSFULLY!');
  console.log(`📁 Final MP4 Video: ${finalNamedVideoPath} (${fs.statSync(finalNamedVideoPath).size} bytes)`);
  console.log(`📄 SRT Subtitles:   ${finalNamedSrtPath}`);
  console.log(`⏱️ Total Duration:  ${renderResult.totalDuration} seconds (10 full scenes)`);
  console.log(`📱 Format:          Vertical 9:16 (1080x1920) YouTube Shorts Ready`);
  console.log('====================================================\n');
}

produceCartoonShort().catch(console.error);
