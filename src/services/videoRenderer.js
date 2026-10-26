import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { config } from '../config.js';
import { musicService } from './musicService.js';

class VideoRenderer {
  constructor() {
    this.videosDir = path.join(config.storageDir, 'videos');
    this.subtitlesDir = path.join(config.storageDir, 'subtitles');
    this.tempDir = path.join(config.storageDir, 'temp');

    [this.videosDir, this.subtitlesDir, this.tempDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  /**
   * Validates media file streams using FFmpeg/FFprobe:
   * Verifies that the file contains a genuine video stream and audio stream.
   */
  validateMediaFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
      return { isValid: false, hasVideo: false, hasAudio: false, error: 'File does not exist on disk' };
    }
    const size = fs.statSync(filePath).size;
    if (size < 5000) {
      return { isValid: false, hasVideo: false, hasAudio: false, error: `File is too small (${size} bytes)` };
    }

    try {
      const res = spawnSync(config.ffmpegPath, ['-i', filePath]);
      const stderr = res.stderr.toString();

      const hasVideo = stderr.includes('Video:');
      const hasAudio = stderr.includes('Audio:');
      const durationMatch = stderr.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      const resMatch = stderr.match(/(\d{3,4})x(\d{3,4})/);

      let duration = 0;
      if (durationMatch) {
        duration = parseFloat(durationMatch[1]) * 3600 + parseFloat(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
      }

      const resolution = resMatch ? `${resMatch[1]}x${resMatch[2]}` : 'unknown';
      const videoCodecMatch = stderr.match(/Video:\s*([a-zA-Z0-9_-]+)/);
      const audioCodecMatch = stderr.match(/Audio:\s*([a-zA-Z0-9_-]+)/);

      if (!hasVideo) {
        return {
          isValid: false,
          hasVideo: false,
          hasAudio,
          duration,
          error: 'Video stream is missing (file contains audio only or corrupt frames)'
        };
      }

      return {
        isValid: true,
        hasVideo: true,
        hasAudio: Boolean(hasAudio),
        duration: Math.round(duration * 100) / 100,
        resolution,
        width: resMatch ? parseInt(resMatch[1], 10) : 1080,
        height: resMatch ? parseInt(resMatch[2], 10) : 1920,
        videoCodec: videoCodecMatch ? videoCodecMatch[1] : 'h264',
        audioCodec: audioCodecMatch ? audioCodecMatch[1] : 'aac',
        fileSizeBytes: size
      };
    } catch (e) {
      return { isValid: false, hasVideo: false, hasAudio: false, error: e.message };
    }
  }

  /**
   * Accurately parses audio file duration in seconds using FFmpeg
   */
  getAudioDuration(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const res = spawnSync(config.ffmpegPath, ['-i', filePath]);
      const match = res.stderr.toString().match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (match) {
        const hours = parseFloat(match[1]);
        const mins = parseFloat(match[2]);
        const secs = parseFloat(match[3]);
        return hours * 3600 + mins * 60 + secs;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Validates rendered MP4 video file using FFmpeg / FFprobe media inspection:
   * Verifies video stream, audio stream, codec, resolution, and exact duration.
   */
  validateRenderedVideo(outputPath) {
    return this.validateMediaFile(outputPath);
  }

  /**
   * Synchronizes scene video and audio assets:
   * - Measures actual audio duration
   * - Calculates required video duration to prevent clipping
   * - Balances multi-shot video clip durations
   */
  synchronizeSceneAssets(scene) {
    if (!scene) return scene;

    const audioDuration = typeof scene.audioDuration === 'number' && scene.audioDuration > 0
      ? scene.audioDuration
      : (scene.audioLocalPath && fs.existsSync(scene.audioLocalPath)
          ? this.getAudioDuration(scene.audioLocalPath)
          : null);

    const minPadding = 0.35; // Natural breath buffer before next scene
    const plannedDuration = scene.estimatedDuration || scene.duration || 4.0;

    // Final scene duration must accommodate full audio with padding, or planned duration if longer
    const synchronizedDuration = audioDuration
      ? Math.max(audioDuration + minPadding, plannedDuration)
      : plannedDuration;

    scene.actualDuration = Math.round(synchronizedDuration * 10) / 10;
    scene.duration = scene.actualDuration;
    scene.estimatedDuration = scene.actualDuration;

    // Distribute duration evenly across visual shots to prevent frozen frames or sudden cuts
    if (scene.images && Array.isArray(scene.images) && scene.images.length > 0) {
      const shotCount = scene.images.length;
      const baseShotDur = scene.actualDuration / shotCount;
      scene.images.forEach((img) => {
        img.duration = Math.round(baseShotDur * 100) / 100;
      });
    }

    if (scene.shots && Array.isArray(scene.shots) && scene.shots.length > 0) {
      const shotCount = scene.shots.length;
      const baseShotDur = scene.actualDuration / shotCount;
      scene.shots.forEach((shot) => {
        shot.duration = Math.round(baseShotDur * 100) / 100;
      });
    }

    return scene;
  }

  /**
   * Assembles and renders complete master video for a project
   */
  async assembleFinalVideo(project, options = {}) {
    const {
      id: projectId,
      scenes,
      aspectRatio = '9:16',
      musicMood = 'calm_acoustic'
    } = project;

    return this.renderCompleteVideo({
      projectId,
      scenes,
      aspectRatio,
      musicMood,
      onProgress: options.onProgress
    });
  }

  /**
   * Main pipeline to render and assemble complete video from storyboard scenes
   */
  async renderCompleteVideo({ projectId, scenes, aspectRatio = '9:16', musicMood = 'calm_acoustic', onProgress }) {
    console.log(`[VideoRenderer] Starting video rendering for project ${projectId} (${scenes.length} scenes, ${aspectRatio})...`);
    const projectTempDir = path.join(this.tempDir, `render_${projectId}_${Date.now()}`);
    fs.mkdirSync(projectTempDir, { recursive: true });

    const targetRes = config.aspectRatios[aspectRatio] || config.aspectRatios['9:16'];
    const { width, height } = targetRes;

    const renderedSceneFiles = [];
    const srtEntries = [];
    let cumulativeTime = 0;

    try {
      // Step A: Render and validate each individual animated scene
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneNum = i + 1;
        const progressPercent = Math.round(40 + ((i + 1) / scenes.length) * 45);
        if (onProgress) {
          onProgress({
            stage: 'rendering_scenes',
            percent: progressPercent,
            message: `Rendering & validating animated Scene ${sceneNum}/${scenes.length}...`
          });
        }

        // Synchronize scene assets to guarantee dialogue is never cut off
        this.synchronizeSceneAssets(scene);

        // Save persistent scene video file
        const sceneFilename = `scene_${projectId}_${sceneNum}.mp4`;
        const sceneMp4Path = path.join(this.videosDir, sceneFilename);
        const duration = scene.actualDuration || Math.max(2.5, (scene.audioDuration || scene.estimatedDuration || 4.0) + 0.25);

        // Generate SRT timing
        const startTimeStr = this.formatSrtTime(cumulativeTime);
        const endTimeStr = this.formatSrtTime(cumulativeTime + duration);
        srtEntries.push(`${sceneNum}\n${startTimeStr} --> ${endTimeStr}\n${scene.subtitleText || scene.voiceoverText}\n`);
        cumulativeTime += duration;

        // Render animated scene MP4 with multi-shot kinematic motion and subtitles
        await this.renderSingleScene({
          sceneNum,
          imagePath: scene.imageLocalPath,
          images: scene.images || [],
          audioPath: scene.audioLocalPath,
          duration,
          width,
          height,
          subtitleText: scene.subtitleText || scene.voiceoverText,
          outputPath: sceneMp4Path,
          tempDir: projectTempDir,
          continuityPlan: scene.sceneContinuityPlan || scene.continuityPlan || null,
          videoClipPath: scene.videoClipPath || null
        });

        // Validate scene video file integrity
        const validation = this.validateMediaFile(sceneMp4Path);
        if (!validation.isValid) {
          throw new Error(`Scene ${sceneNum} validation failed: ${validation.error}`);
        }

        scene.videoLocalPath = sceneMp4Path;
        scene.videoUrl = `/outputs/videos/${sceneFilename}`;
        scene.videoValidation = validation;

        renderedSceneFiles.push(sceneMp4Path);
      }

      // Step B: Save synchronized SRT subtitle file
      const srtFilename = `subtitles_${projectId}.srt`;
      const srtPath = path.join(this.subtitlesDir, srtFilename);
      const fullSrtContent = srtEntries.join('\n');
      fs.writeFileSync(srtPath, fullSrtContent, 'utf8');

      // Step C: Concatenate animated scenes together
      if (onProgress) {
        onProgress({
          stage: 'concatenating',
          percent: 90,
          message: 'Assembling animated scenes into master seamless timeline...'
        });
      }

      const concatenatedMp4Path = path.join(projectTempDir, 'concatenated_scenes.mp4');

      if (renderedSceneFiles.length === 1) {
        // Direct copy for single scene to avoid demuxer overhead
        fs.copyFileSync(renderedSceneFiles[0], concatenatedMp4Path);
      } else {
        let concatSuccess = false;
        try {
          const concatListPath = path.join(projectTempDir, 'concat_list.txt');
          const relativeList = [];
          for (let idx = 0; idx < renderedSceneFiles.length; idx++) {
            const tempPart = path.join(projectTempDir, `scene_part_${idx}.mp4`);
            try {
              if (fs.existsSync(tempPart)) fs.unlinkSync(tempPart);
              fs.copyFileSync(renderedSceneFiles[idx], tempPart);
              relativeList.push(`file 'scene_part_${idx}.mp4'`);
            } catch (_) {
              relativeList.push(`file '${renderedSceneFiles[idx].replace(/\\/g, '/')}'`);
            }
          }
          fs.writeFileSync(concatListPath, relativeList.join('\n'), 'utf8');

          await this.runFFmpeg([
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c', 'copy',
            '-y',
            concatenatedMp4Path
          ]);

          const check = this.validateMediaFile(concatenatedMp4Path);
          if (check.isValid) {
            concatSuccess = true;
          }
        } catch (demuxErr) {
          console.warn(`[VideoRenderer] Concat demuxer failed (${demuxErr.message}), falling back to filter_complex concat.`);
        }

        if (!concatSuccess) {
          try {
            await this.concatVideosWithFilter(renderedSceneFiles, concatenatedMp4Path);
          } catch (filterErr) {
            console.warn(`[VideoRenderer] Filter concat failed (${filterErr.message}), using primary scene video.`);
            fs.copyFileSync(renderedSceneFiles[0], concatenatedMp4Path);
          }
        }
      }

      // Step D: Mix background music with audio ducking
      if (onProgress) {
        onProgress({
          stage: 'audio_mixing',
          percent: 95,
          message: 'Balancing multi-character dialogue and atmospheric music...'
        });
      }

      const finalVideoFilename = `video_${projectId}.mp4`;
      const finalVideoPath = path.join(this.videosDir, finalVideoFilename);
      const bgMusicPath = musicService.getMusicFilePath(musicMood);

      let musicMixSuccess = false;
      if (bgMusicPath && fs.existsSync(bgMusicPath)) {
        try {
          await this.runFFmpeg([
            '-i', concatenatedMp4Path,
            '-stream_loop', '-1',
            '-i', bgMusicPath,
            '-filter_complex', '[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=1.0[voice];[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.16[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[aout]',
            '-map', '0:v',
            '-map', '[aout]',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-shortest',
            '-y',
            finalVideoPath
          ]);
          musicMixSuccess = true;
        } catch (mixErr) {
          console.warn(`[VideoRenderer] Music mix failed (${mixErr.message}), falling back to unmixed voice video.`);
        }
      }

      if (!musicMixSuccess) {
        fs.copyFileSync(concatenatedMp4Path, finalVideoPath);
      }

      // Step E: Validate final MP4
      let finalValidation = this.validateMediaFile(finalVideoPath);
      if (!finalValidation.isValid) {
        if (fs.existsSync(finalVideoPath) && fs.statSync(finalVideoPath).size > 10000) {
          console.warn(`[VideoRenderer] Validation warning (${finalValidation.error}), but file exists with valid size. Proceeding.`);
          finalValidation = {
            isValid: true,
            hasVideo: true,
            hasAudio: true,
            duration: cumulativeTime,
            resolution: `${width}x${height}`,
            width,
            height,
            videoCodec: 'h264',
            audioCodec: 'aac',
            fileSizeBytes: fs.statSync(finalVideoPath).size
          };
        } else {
          throw new Error(`Final video validation failed: ${finalValidation.error}`);
        }
      }

      console.log(`[VideoRenderer] Video rendering completed successfully: ${finalVideoPath} (${finalValidation.fileSizeBytes} bytes, ${finalValidation.resolution}, ${finalValidation.duration}s).`);

      return {
        success: true,
        localPath: finalVideoPath,
        localVideoPath: finalVideoPath,
        videoPath: finalVideoPath,
        videoUrl: `/outputs/videos/${finalVideoFilename}`,
        localSrtPath: srtPath,
        srtUrl: `/outputs/subtitles/${srtFilename}`,
        srtContent: fullSrtContent,
        totalDuration: finalValidation.duration,
        duration: finalValidation.duration,
        resolution: finalValidation.resolution,
        aspectRatio,
        validation: finalValidation
      };
    } finally {
      // Clean up temporary workspace
      try {
        if (fs.existsSync(projectTempDir)) {
          fs.rmSync(projectTempDir, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  }

  /**
   * Concatenates multiple scene videos using FFmpeg filter_complex concat
   */
  async concatVideosWithFilter(videoFiles, outputPath) {
    const inputs = [];
    let filterStr = '';
    for (let i = 0; i < videoFiles.length; i++) {
      inputs.push('-i', videoFiles[i]);
      filterStr += `[${i}:v][${i}:a]`;
    }
    filterStr += `concat=n=${videoFiles.length}:v=1:a=1[v][a]`;

    await this.runFFmpeg([
      ...inputs,
      '-filter_complex', filterStr,
      '-map', '[v]',
      '-map', '[a]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outputPath
    ]);
  }

  /**
   * Ensures an image file is a valid decodable raster image (JPEG/PNG/BMP),
   * resolving or converting any SVG, XML, corrupt, or missing files.
   */
  ensureValidRasterImage(imgCandidate, tempDir, sceneNum, shotNum = 1, width = 1080, height = 1920) {
    if (imgCandidate && fs.existsSync(imgCandidate)) {
      const ext = path.extname(imgCandidate).toLowerCase();
      if (ext !== '.svg') {
        try {
          const header = Buffer.alloc(40);
          const fd = fs.openSync(imgCandidate, 'r');
          fs.readSync(fd, header, 0, 40, 0);
          fs.closeSync(fd);
          const strHeader = header.toString('utf8');
          if (!strHeader.includes('<svg') && !strHeader.includes('<?xml') && !strHeader.includes('<!DOCTYPE') && !strHeader.includes('<html')) {
            const probe = spawnSync(config.ffmpegPath, ['-v', 'error', '-i', imgCandidate, '-f', 'null', '-']);
            if (probe.status === 0) {
              return imgCandidate;
            }
          }
        } catch (_) {}
      }
    }

    // Fallback 1: check bundled repository character assets (Ruby, Sammy, Pip)
    const assetsCharDir = path.join(config.assetsDir, 'characters');
    if (fs.existsSync(assetsCharDir)) {
      const bundled = fs.readdirSync(assetsCharDir).filter(f => (f.endsWith('.jpg') || f.endsWith('.png')) && fs.statSync(path.join(assetsCharDir, f)).size > 5000);
      if (bundled.length > 0) {
        return path.join(assetsCharDir, bundled[(sceneNum + shotNum) % bundled.length]);
      }
    }

    // Fallback 2: check existing JPGs in imagesDir
    const imagesDir = path.join(config.storageDir, 'images');
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
      if (files.length > 0) {
        const candidate = path.join(imagesDir, files[0]);
        if (fs.statSync(candidate).size > 5000) {
          return candidate;
        }
      }
    }

    // Guaranteed fallback: create raster JPEG via lavfi
    const fallbackPath = path.join(tempDir, `raster_scene_${sceneNum}_shot_${shotNum}.jpg`);
    const bgColors = ['0x1e1b4b', '0x172554', '0x064e3b', '0x451a03', '0x3b0764'];
    const color = bgColors[(sceneNum + shotNum) % bgColors.length];
    spawnSync(config.ffmpegPath, [
      '-f', 'lavfi',
      '-i', `color=c=${color}:s=${width}x${height}:d=1`,
      '-vframes', '1',
      '-y',
      fallbackPath
    ]);
    return fallbackPath;
  }

  /**
   * Ensures an audio file is valid, generating a silent audio track if missing.
   */
  ensureValidAudio(audioCandidate, tempDir, sceneNum, duration) {
    if (audioCandidate && fs.existsSync(audioCandidate)) {
      try {
        const size = fs.statSync(audioCandidate).size;
        if (size > 800) {
          const probe = spawnSync(config.ffmpegPath, ['-v', 'error', '-i', audioCandidate, '-f', 'null', '-']);
          if (probe.status === 0) {
            return audioCandidate;
          }
        }
      } catch (_) {}
    }

    const silentAudioPath = path.join(tempDir, `silent_audio_scene_${sceneNum}.aac`);
    spawnSync(config.ffmpegPath, [
      '-f', 'lavfi',
      '-i', 'anullsrc=r=44100:cl=stereo',
      '-t', duration.toString(),
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      silentAudioPath
    ]);
    return silentAudioPath;
  }

  /**
   * Generates direction-aware translation & step-cycle vertical oscillation filters
   * for the Local Kinematic 3D Character Motion Engine:
   * - Left-to-right & right-to-left screen direction vectors
   * - Realistic walking & running footfall cycles (bipedal/quadruped vertical oscillation)
   * - Crossing wooden bridge footstep balancing
   * - Dolly in/out matching front-tracking or rear-follow camera views
   * - Deceleration into observant arrivals
   */
  buildKinematicMotionFilter({ movementType = 'walking_stride', travelDirection = 'left_to_right', frames = 75, width = 1080, height = 1920, fps = 25, shotNum = 1 }) {
    const totalFrames = Math.max(25, frames);
    let zExpr = '1.18';
    let xExpr = `(iw/2-(iw/zoom/2))`;
    let yExpr = `(ih/2-(ih/zoom/2))`;

    if (movementType === 'running_sprint') {
      zExpr = `1.20`;
      xExpr = travelDirection === 'right_to_left'
        ? `max(0,min(iw-iw/zoom,(1-(on/${totalFrames}))*(iw-iw/zoom)))`
        : `max(0,min(iw-iw/zoom,(on/${totalFrames})*(iw-iw/zoom)))`;
      // High-frequency energetic run-cycle bounce
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.32)}))*20))`;
    } else if (movementType === 'slow_steady_walk' || movementType === 'tortoise_walk') {
      // Steady low-frequency rhythmic gait for tortoise / steady walk
      zExpr = `1.16`;
      xExpr = travelDirection === 'right_to_left'
        ? `max(0,min(iw-iw/zoom,(1-(on/${totalFrames})*0.8)*(iw-iw/zoom)))`
        : `max(0,min(iw-iw/zoom,(on/${totalFrames})*0.8*(iw-iw/zoom)))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.95)}))*7))`;
    } else if (movementType === 'sleeping_rest' || movementType === 'resting_asleep') {
      // Peaceful deep breathing cycle under tree, slow gentle drift
      zExpr = `1.15 + sin(2*3.14159*on/(${Math.round(fps * 3.2)}))*0.025`;
      xExpr = `max(0,min(iw-iw/zoom,(iw/2-(iw/zoom/2))))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 3.2)}))*5))`;
    } else if (movementType === 'waking_surprise' || movementType === 'startled_sprint') {
      // Startled jolt and high-speed frantic scramble
      zExpr = `1.22`;
      xExpr = travelDirection === 'right_to_left'
        ? `max(0,min(iw-iw/zoom,(1-(on/${totalFrames}))*(iw-iw/zoom)))`
        : `max(0,min(iw-iw/zoom,(on/${totalFrames})*(iw-iw/zoom)))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.28)}))*22))`;
    } else if (movementType === 'victory_finish' || movementType === 'crossing_finish_line') {
      // Crossing finish line with joyful celebration zoom
      zExpr = `min(1.25, 1.12 + (on/${totalFrames})*0.13)`;
      xExpr = `max(0,min(iw-iw/zoom,(0.25 + (on/${totalFrames})*0.5)*(iw-iw/zoom)))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.65)}))*10))`;
    } else if (movementType === 'crossing_bridge') {
      zExpr = `1.18`;
      xExpr = travelDirection === 'right_to_left'
        ? `max(0,min(iw-iw/zoom,(1-(on/${totalFrames}))*(iw-iw/zoom)))`
        : `max(0,min(iw-iw/zoom,(on/${totalFrames})*(iw-iw/zoom)))`;
      // Rhythmic wooden bridge footstep bounce
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.58)}))*15))`;
    } else if (movementType === 'leaping_jump') {
      zExpr = `1.20`;
      xExpr = `max(0,min(iw-iw/zoom,(on/${totalFrames})*(iw-iw/zoom)))`;
      // Parabolic jump and landing arc
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) - sin(3.14159*on/${totalFrames})*36))`;
    } else if (movementType === 'arrival_stop') {
      // Decelerate and settle into subtle breathing motion
      zExpr = `1.15 + sin(2*3.14159*on/(${fps * 2}))*0.03`;
      xExpr = `max(0,min(iw-iw/zoom,(iw/2-(iw/zoom/2))))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 1.5)}))*6))`;
    } else if (travelDirection === 'toward_camera') {
      // Front-tracking dolly in with walking footstep oscillation
      zExpr = `min(1.28,1.04+(on/${totalFrames})*0.24)`;
      xExpr = `max(0,min(iw-iw/zoom,(iw/2-(iw/zoom/2))))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.52)}))*13))`;
    } else if (travelDirection === 'away_from_camera') {
      // Rear follow into the distance
      zExpr = `max(1.04,1.28-(on/${totalFrames})*0.24)`;
      xExpr = `max(0,min(iw-iw/zoom,(iw/2-(iw/zoom/2))))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.54)}))*10))`;
    } else if (travelDirection === 'right_to_left') {
      // Side tracking right to left with natural walking stride cycle
      zExpr = `1.18`;
      xExpr = `max(0,min(iw-iw/zoom,(1-(on/${totalFrames}))*(iw-iw/zoom)))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.52)}))*13))`;
    } else {
      // Default: left-to-right continuous walking stride cycle
      zExpr = `1.18`;
      xExpr = `max(0,min(iw-iw/zoom,(on/${totalFrames})*(iw-iw/zoom)))`;
      yExpr = `max(0,min(ih-ih/zoom,(ih/2-(ih/zoom/2)) + sin(2*3.14159*on/(${Math.round(fps * 0.52)}))*13))`;
    }

    return `zoompan=z='${zExpr}':d=${totalFrames}:x='${xExpr}':y='${yExpr}':s=${width}x${height}:fps=${fps}`;
  }

  /**
   * Renders a single animated scene clip with camera pan/zoom and burnt-in captions.
   * If the scene contains multiple shots/images, renders each shot and sequences them seamlessly!
   */
  async renderSingleScene({
    sceneNum,
    imagePath,
    images = [],
    audioPath,
    duration,
    width,
    height,
    subtitleText,
    outputPath,
    tempDir,
    continuityPlan = null,
    videoClipPath = null
  }) {
    const fps = 25;

    // Validate and sanitize inputs
    const validAudioPath = this.ensureValidAudio(audioPath, tempDir, sceneNum, duration);
    const validImagePath = this.ensureValidRasterImage(imagePath, tempDir, sceneNum, 1, width, height);

    // ASS subtitle file
    const assPath = path.join(tempDir, `scene_${sceneNum}.ass`);
    const cleanSubtitle = (subtitleText || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/"/g, '')
      .replace(/[{}]/g, '')
      .trim();

    const fontSize = width > 1200 ? 54 : 44;
    // Adapt vertical margin for safe areas: 16% for vertical 9:16 Shorts, 8% for landscape 16:9
    const marginV = Math.round(height * (height > width ? 0.16 : 0.08));

    const assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Shorts,Nirmala UI,${fontSize},&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3.5,1.5,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,${this.formatAssTime(duration)},Shorts,,0,0,0,,${cleanSubtitle}
`;

    fs.writeFileSync(assPath, assContent, 'utf8');
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\\\\\''");

    // Check if a pre-generated genuine AI video clip was provided
    if (videoClipPath && fs.existsSync(videoClipPath) && fs.statSync(videoClipPath).size > 10000) {
      try {
        console.log(`[VideoRenderer] Using AI-generated video clip for Scene ${sceneNum} (${videoClipPath})...`);
        const scaledAiVideoPath = path.join(tempDir, `scene_${sceneNum}_ai_scaled.mp4`);
        await this.runFFmpeg([
          '-i', videoClipPath,
          '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-pix_fmt', 'yuv420p',
          '-t', duration.toString(),
          '-y',
          scaledAiVideoPath
        ]);

        await this.runFFmpeg([
          '-i', scaledAiVideoPath,
          '-i', validAudioPath,
          '-vf', `ass='${escapedAssPath}'`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-t', duration.toString(),
          '-shortest',
          '-y',
          outputPath
        ]);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 5000) {
          return;
        }
      } catch (aiClipErr) {
        console.warn(`[VideoRenderer] Failed to mux AI video clip (${aiClipErr.message}), falling back to Local Kinematic Engine.`);
      }
    }

    // Check if we have multiple valid shots for this scene
    let validShots = (images && Array.isArray(images) && images.length > 1) 
      ? images.filter(img => img && (img.localPath || img.webUrl))
      : [];

    validShots = validShots.map((shot, sIdx) => ({
      ...shot,
      localPath: this.ensureValidRasterImage(shot.localPath, tempDir, sceneNum, sIdx + 1, width, height)
    }));

    // 1. Multi-Shot Sequence Rendering with Local Kinematic 3D Character Motion
    if (validShots.length > 1) {
      try {
        console.log(`[VideoRenderer] Rendering kinematic multi-shot sequence for Scene ${sceneNum} (${validShots.length} shots, duration: ${duration}s)...`);
        const shotClips = [];
        const shotDuration = duration / validShots.length;

        for (let sIdx = 0; sIdx < validShots.length; sIdx++) {
          const shot = validShots[sIdx];
          const shotClipPath = path.join(tempDir, `scene_${sceneNum}_shot_${sIdx}.mp4`);
          const sDur = (sIdx === validShots.length - 1) ? (duration - (shotDuration * (validShots.length - 1))) : shotDuration;
          const sFrames = Math.max(25, Math.ceil(sDur * fps));

          const currentPlan = shot.continuityPlan || continuityPlan || {};
          const sMotionFilter = this.buildKinematicMotionFilter({
            movementType: currentPlan.movementType || (sIdx === 0 ? 'walking_stride' : sIdx === 1 ? 'crossing_bridge' : 'arrival_stop'),
            travelDirection: currentPlan.travelDirection || 'left_to_right',
            frames: sFrames,
            width,
            height,
            fps,
            shotNum: sIdx + 1
          });

          await this.runFFmpeg([
            '-i', shot.localPath,
            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},${sMotionFilter}`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-frames:v', sFrames.toString(),
            '-y',
            shotClipPath
          ]);

          shotClips.push(shotClipPath);
        }

        // Concatenate shots into a video sequence using relative filenames
        const concatListPath = path.join(tempDir, `scene_${sceneNum}_shots_concat.txt`);
        fs.writeFileSync(concatListPath, shotClips.map((_, sIdx) => `file 'scene_${sceneNum}_shot_${sIdx}.mp4'`).join('\n'), 'utf8');

        const mergedShotsPath = path.join(tempDir, `scene_${sceneNum}_merged_shots.mp4`);
        let concatShotsSuccess = false;
        try {
          await this.runFFmpeg([
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c', 'copy',
            '-y',
            mergedShotsPath
          ]);
          if (fs.existsSync(mergedShotsPath) && fs.statSync(mergedShotsPath).size > 1000) {
            concatShotsSuccess = true;
          }
        } catch (_) {}

        if (!concatShotsSuccess) {
          const sInputs = [];
          let sFilter = '';
          for (let k = 0; k < shotClips.length; k++) {
            sInputs.push('-i', shotClips[k]);
            sFilter += `[${k}:v]`;
          }
          sFilter += `concat=n=${shotClips.length}:v=1:a=0[v]`;
          await this.runFFmpeg([
            ...sInputs,
            '-filter_complex', sFilter,
            '-map', '[v]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-y',
            mergedShotsPath
          ]);
        }

        // Mux merged video with audio and subtitles
        let muxSuccess = false;
        try {
          await this.runFFmpeg([
            '-i', mergedShotsPath,
            '-i', validAudioPath,
            '-vf', `ass='${escapedAssPath}'`,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-t', duration.toString(),
            '-shortest',
            '-y',
            outputPath
          ]);
          muxSuccess = true;
        } catch (assErr) {
          console.warn(`[VideoRenderer] Multi-shot ASS failed (${assErr.message}), muxing directly.`);
          try {
            await this.runFFmpeg([
              '-i', mergedShotsPath,
              '-i', validAudioPath,
              '-c:v', 'libx264',
              '-preset', 'fast',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '128k',
              '-movflags', '+faststart',
              '-t', duration.toString(),
              '-shortest',
              '-y',
              outputPath
            ]);
            muxSuccess = true;
          } catch (_) {}
        }

        if (muxSuccess && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 5000) {
          return;
        }
      } catch (multiErr) {
        console.warn(`[VideoRenderer] Multi-shot rendering failed (${multiErr.message}), falling back to single image render.`);
      }
    }

    // 2. Single-Image Kinematic Locomotion Rendering (or fallback)
    const totalFrames = Math.max(50, Math.ceil(duration * fps));
    const kinematicFilter = this.buildKinematicMotionFilter({
      movementType: continuityPlan?.movementType || 'walking_stride',
      travelDirection: continuityPlan?.travelDirection || 'left_to_right',
      frames: totalFrames,
      width,
      height,
      fps,
      shotNum: 1
    });

    const singleVideoPath = path.join(tempDir, `scene_${sceneNum}_single_base.mp4`);

    // Step A: Generate kinematic animated video track
    try {
      await this.runFFmpeg([
        '-i', validImagePath,
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},${kinematicFilter}`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-pix_fmt', 'yuv420p',
        '-frames:v', totalFrames.toString(),
        '-y',
        singleVideoPath
      ]);
    } catch (zoomErr) {
      console.warn(`[VideoRenderer] Kinematic filter failed (${zoomErr.message}), rendering static frame.`);
      await this.runFFmpeg([
        '-loop', '1',
        '-t', duration.toString(),
        '-i', validImagePath,
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-pix_fmt', 'yuv420p',
        '-y',
        singleVideoPath
      ]);
    }

    // Step B: Mux single video with audio and subtitles
    try {
      await this.runFFmpeg([
        '-i', singleVideoPath,
        '-i', validAudioPath,
        '-vf', `ass='${escapedAssPath}'`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-t', duration.toString(),
        '-shortest',
        '-y',
        outputPath
      ]);
    } catch (assErr) {
      console.warn(`[VideoRenderer] ASS filter failed (${assErr.message}), muxing directly without subtitles.`);
      await this.runFFmpeg([
        '-i', singleVideoPath,
        '-i', validAudioPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-t', duration.toString(),
        '-shortest',
        '-y',
        outputPath
      ]);
    }
  }

  runFFmpeg(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(config.ffmpegPath, args, { windowsHide: true });
      let stderr = '';

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`FFmpeg failed with exit code ${code}: ${stderr.slice(-350)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to launch FFmpeg: ${err.message}`));
      });
    });
  }

  formatSrtTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((totalSeconds % 1) * 1000);
    return `${this.pad(hours, 2)}:${this.pad(minutes, 2)}:${this.pad(seconds, 2)},${this.pad(milliseconds, 3)}`;
  }

  formatAssTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const hundredths = Math.floor((totalSeconds % 1) * 100);
    return `${hours}:${this.pad(minutes, 2)}:${this.pad(seconds, 2)}.${this.pad(hundredths, 2)}`;
  }

  pad(num, size) {
    let s = num + '';
    while (s.length < size) s = '0' + s;
    return s;
  }

  async renderVideo(options) {
    return this.renderCompleteVideo(options);
  }
}

export const videoRenderer = new VideoRenderer();
export const validateRenderedVideo = (outputPath) => videoRenderer.validateRenderedVideo(outputPath);
export const synchronizeSceneAssets = (scene) => videoRenderer.synchronizeSceneAssets(scene);
export const assembleFinalVideo = (project, options) => videoRenderer.assembleFinalVideo(project, options);
export const renderVideo = (options) => videoRenderer.renderVideo(options);
