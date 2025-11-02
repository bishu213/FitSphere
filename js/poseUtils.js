/**
 * poseUtils.js
 * Utility functions for pose angle calculations and drawing
 */

const PoseUtils = (() => {
  function getAngle(a, b, c) {
    // a, b, c are {x,y}
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
    const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
    if (magAB === 0 || magCB === 0) return null;
    let cos = dot / (magAB * magCB);
    cos = Math.max(-1, Math.min(1, cos));
    const angle = Math.acos(cos) * (180 / Math.PI);
    return angle;
  }

  function getKeypointScaled(kp, canvas, video) {
    return {
      x: kp.x * canvas.width / video.videoWidth,
      y: kp.y * canvas.height / video.videoHeight,
      score: kp.score ?? 0
    };
  }

  function drawSkeleton(ctx, keypoints, canvas, video, options = {}) {
    const colorOk = options.goodColor || "#00f0a3";
    const colorBad = options.badColor || "#ff4d6d";
    const lineWidth = options.lineWidth || 4;

    // convenience - draw lines between some pairs
    const pairs = [
      [5,7],[7,9], // left arm
      [6,8],[8,10], // right arm
      [11,13],[13,15], // left leg
      [12,14],[14,16], // right leg
      [5,6], [11,12], [5,11], [6,12] // torso connections
    ];

    ctx.lineWidth = lineWidth;
    for (let i=0;i<pairs.length;i++){
      const a = keypoints[pairs[i][0]];
      const b = keypoints[pairs[i][1]];
      if (!a || !b || a.score < 0.3 || b.score < 0.3) continue;
      const pa = getKeypointScaled(a, canvas, video);
      const pb = getKeypointScaled(b, canvas, video);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = colorOk;
      ctx.stroke();
    }

    // draw circles
    for (let i=0;i<keypoints.length;i++){
      const kp = keypoints[i];
      if (!kp || kp.score < 0.3) continue;
      const p = getKeypointScaled(kp, canvas, video);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
      ctx.fillStyle = colorOk;
      ctx.fill();
    }
  }

  // Quick exercise detector using angle heuristics
  // Returns "pushup", "squat", "jumpingjack", or null
  function detectExercise(keypoints, canvas, video) {
    // use shoulder-elbow-wrist angles, hip-knee-ankle etc.
    const kp = (i) => keypoints[i] ?? {x:0,y:0,score:0};
    // scale coordinates to canvas coordinates
    function scaled(i){
      const raw = keypoints[i];
      if (!raw) return {x:0,y:0,score:0};
      return getKeypointScaled(raw, canvas, video);
    }

    const leftShoulder = scaled(5), leftElbow = scaled(7), leftWrist = scaled(9);
    const rightShoulder = scaled(6), rightElbow = scaled(8), rightWrist = scaled(10);
    const leftHip = scaled(11), rightHip = scaled(12), leftKnee = scaled(13), rightKnee = scaled(14);
    const leftAnkle = scaled(15), rightAnkle = scaled(16);

    if (leftElbow.score > 0.4 && rightElbow.score > 0.4 &&
        leftShoulder.score > 0.4 && rightShoulder.score > 0.4) {
      const angleL = getAngle(leftShoulder, leftElbow, leftWrist);
      const angleR = getAngle(rightShoulder, rightElbow, rightWrist);
      const avgArm = (angleL + angleR) / 2;
      // push-up: arms bent/straight cycle and body horizontal (hip coords similar y to shoulders)
      const shoulderY = (leftShoulder.y + rightShoulder.y)/2;
      const hipY = (leftHip.y + rightHip.y)/2;
      const bodyFlat = Math.abs(shoulderY - hipY) < 120; // heuristic depends on camera
      if (avgArm > 150 && bodyFlat) return "pushup";
      if (avgArm < 120 && bodyFlat) return "pushup";
    }

    // squat detection: knees bend -> knee angle decreases (< 100)
    if (leftKnee.score > 0.4 && rightKnee.score > 0.4 && leftHip.score > 0.4 && rightHip.score > 0.4){
      const leftKneeAngle = getAngle(leftHip, leftKnee, leftAnkle);
      const rightKneeAngle = getAngle(rightHip, rightKnee, rightAnkle);
      const avgKnee = (leftKneeAngle + rightKneeAngle)/2;
      // standing ~ 170-180, squat < 120
      if (avgKnee < 140) return "squat";
    }

    // fallback null
    return null;
  }

  return {
    getAngle,
    getKeypointScaled,
    drawSkeleton,
    detectExercise
  };
})();
