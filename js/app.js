/**
 * app.js
 * Main application logic: camera setup, detector, counting, form checks
 */

const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const counterBox = document.getElementById("counterBox");
const feedbackBox = document.getElementById("feedback");
const repStat = document.getElementById("repStat");
const timeStat = document.getElementById("timeStat");
const accuracyStat = document.getElementById("accuracyStat");
const lastSessionDiv = document.getElementById("lastSession");
const exerciseNameEl = document.getElementById("exerciseName").querySelector("span");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const endBtn = document.getElementById("endBtn");
const voiceToggle = document.getElementById("voiceToggle");
const modeHint = document.getElementById("modeHint");

let detector = null;
let running = false;
let exercise = null;
let repCount = 0;
let isDown = false; // for pushup cycle
let squatDown = false; // for squat cycle
let startTime = null;
let goodFormFrames = 0;
let totalFrames = 0;
let frameInterval = null;
let useVoice = true;
let caloriesBurned = 0;


// initialize UI with last session
function renderLastSession() {
    const s = Storage.lastSession();
    if (!s) {
        lastSessionDiv.innerText = "No session yet";
        return;
    }
    lastSessionDiv.innerText = `Exercise: ${s.exercise} • Reps: ${s.reps} • Time: ${s.duration}s • Accuracy: ${Math.round(s.accuracy * 100)}%`;
}
renderLastSession();

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
    video.srcObject = stream;
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            resolve();
        };
    });
}

async function loadDetector() {
    // MoveNet single-pose lightning
    detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING });
    console.log("Detector ready");
}

function updateHUD() {
    counterBox.innerText = repCount;
    repStat.innerText = repCount;
    const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    timeStat.innerText = `${mm}:${ss}`;
    const accuracy = totalFrames ? (goodFormFrames / totalFrames) : 1;
    accuracyStat.innerText = `${Math.round(accuracy * 100)}%`;
    // ✅ Calculate calories dynamically
    const caloriesEl = document.getElementById("caloriesStat");
    if (caloriesEl) caloriesEl.innerText = `${caloriesBurned.toFixed(1)} kcal`;

}

// form check heuristics for pushup and squat
function evaluateForm(keypoints) {
    // returns { ok: boolean, message: string }
    if (!keypoints || keypoints.length === 0) return { ok: false, message: "No person detected" };
    // require shoulders and hips
    const ks = (i) => keypoints[i] ?? { x: 0, y: 0, score: 0 };
    const leftShoulder = PoseUtils.getKeypointScaled(ks(5), canvas, video);
    const rightShoulder = PoseUtils.getKeypointScaled(ks(6), canvas, video);
    const leftHip = PoseUtils.getKeypointScaled(ks(11), canvas, video);
    const rightHip = PoseUtils.getKeypointScaled(ks(12), canvas, video);

    // measure torso angle (shoulder - hip - knee)
    const leftKnee = PoseUtils.getKeypointScaled(ks(13), canvas, video);
    const rightKnee = PoseUtils.getKeypointScaled(ks(14), canvas, video);

    // For push-up: check straight torso (shoulder & hip roughly aligned horizontally), and elbows during movement
    if (exercise === "pushup") {
        const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const hipY = (leftHip.y + rightHip.y) / 2;
        const torsoDiff = Math.abs(shoulderY - hipY);
        // evaluate elbow angles too
        const leftElbow = PoseUtils.getKeypointScaled(ks(7), canvas, video);
        const leftWrist = PoseUtils.getKeypointScaled(ks(9), canvas, video);
        const rightElbow = PoseUtils.getKeypointScaled(ks(8), canvas, video);
        const rightWrist = PoseUtils.getKeypointScaled(ks(10), canvas, video);

        const leftElbowAngle = PoseUtils.getAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = PoseUtils.getAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbow = (leftElbowAngle + rightElbowAngle) / 2;

        // heuristics
        if (torsoDiff > 140) return { ok: false, message: "Tuck your hips down — keep a straight line." };
        if (avgElbow < 40) return { ok: false, message: "Elbows too bent at bottom — push lower or keep wrists stable." };
        if (avgElbow > 170) return { ok: false, message: "Arms fully straight — ensure full range and controlled tempo." };
        return { ok: true, message: "Good form — keep going!" };
    }

    if (exercise === "squat") {
        const leftKneeAngle = PoseUtils.getAngle(leftHip, leftKnee, leftAnkleFromKps(13));
        const rightKneeAngle = PoseUtils.getAngle(rightHip, rightKnee, leftAnkleFromKps(15));
        // fallback simple check using hip-knee vertical relationship
        const hipY = (leftHip.y + rightHip.y) / 2;
        const kneeY = (leftKnee.y + rightKnee.y) / 2;
        const depth = kneeY - hipY; // bigger -> deeper squat
        if (depth < 40) return { ok: false, message: "Not low enough — try deeper squat." };
        return { ok: true, message: "Good squat form!" };
    }

    // default: neutral
    return { ok: true, message: "Form detected" };
}

// helper to avoid missing points
function leftAnkleFromKps(index) {
    const p = PoseUtils.getKeypointScaled((index === 15 ? {} : {}), canvas, video);
    // not used in current heuristic; kept for potential extension
    return p;
}

function drawResults(pose) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!pose || !pose.keypoints) return;
    // draw skeleton
    PoseUtils.drawSkeleton(ctx, pose.keypoints, canvas, video, { goodColor: "#00f0a3", badColor: "#ff4d6d", lineWidth: 3 });
    // draw elbow angle labels if pushup
    if (pose.keypoints[7] && pose.keypoints[9]) {
        const le = PoseUtils.getKeypointScaled(pose.keypoints[7], canvas, video);
        const lw = PoseUtils.getKeypointScaled(pose.keypoints[9], canvas, video);
        const ls = PoseUtils.getKeypointScaled(pose.keypoints[5], canvas, video);
        const angleL = PoseUtils.getAngle(ls, le, lw);
        if (angleL) {
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(le.x - 28, le.y - 30, 60, 28);
            ctx.fillStyle = "#fff";
            ctx.font = "16px Poppins";
            ctx.fillText(`${Math.round(angleL)}°`, le.x - 20, le.y - 12);
        }
    }
}


// Define calories burned per rep based on exercise
function getCaloriesPerRep(exercise) {
    switch (exercise) {
        case "squat": return 0.32; // kcal per rep
        case "pushup": return 0.29;
        case "jumping jack": return 0.25;
        case "plank": return 0.20; // per second maybe
        default: return 0;
    }
}



// core loop
async function processFrame() {
    if (!detector || !running) return;
    try {
        const poses = await detector.estimatePoses(video);
        if (poses && poses.length > 0) {
            const p = poses[0];
            // attempt to detect exercise if unknown
            if (!exercise) {
                const detected = PoseUtils.detectExercise(p.keypoints, canvas, video);
                if (detected) {
                    exercise = detected;
                    exerciseNameEl.innerText = exercise;
                    modeHint.innerText = "Voice: say 'pause' or 'end'";
                    if (useVoice) Voice.speak(`Detected ${exercise}`);
                }
            }

            // draw
            drawResults(p);

            // counting logic
            if (exercise === "pushup") {
                const leftShoulder = PoseUtils.getKeypointScaled(p.keypoints[5], canvas, video);
                const leftElbow = PoseUtils.getKeypointScaled(p.keypoints[7], canvas, video);
                const leftWrist = PoseUtils.getKeypointScaled(p.keypoints[9], canvas, video);
                const rightShoulder = PoseUtils.getKeypointScaled(p.keypoints[6], canvas, video);
                const rightElbow = PoseUtils.getKeypointScaled(p.keypoints[8], canvas, video);
                const rightWrist = PoseUtils.getKeypointScaled(p.keypoints[10], canvas, video);

                if (leftElbow.score > 0.3 && rightElbow.score > 0.3) {
                    const angleL = PoseUtils.getAngle(leftShoulder, leftElbow, leftWrist);
                    const angleR = PoseUtils.getAngle(rightShoulder, rightElbow, rightWrist);
                    const avg = (angleL + angleR) / 2;
                    // thresholding - adjust heuristics as needed
                    if (avg < 100) {
                        isDown = true;
                    }
                    if (avg > 160 && isDown) {
                        repCount++;
                        if (!caloriesBurned) caloriesBurned = 0;
                        caloriesBurned += getCaloriesPerRep(exercise);

                        isDown = false;
                        if (useVoice) Voice.speak(`${repCount}`);
                    }
                }
            } else if (exercise === "squat") {
                const leftHip = PoseUtils.getKeypointScaled(p.keypoints[11], canvas, video);
                const leftKnee = PoseUtils.getKeypointScaled(p.keypoints[13], canvas, video);
                const leftAnkle = PoseUtils.getKeypointScaled(p.keypoints[15], canvas, video);
                const rightHip = PoseUtils.getKeypointScaled(p.keypoints[12], canvas, video);
                const rightKnee = PoseUtils.getKeypointScaled(p.keypoints[14], canvas, video);
                const rightAnkle = PoseUtils.getKeypointScaled(p.keypoints[16], canvas, video);

                if (leftKnee.score > 0.3 && rightKnee.score > 0.3) {
                    const leftKneeAngle = PoseUtils.getAngle(leftHip, leftKnee, leftAnkle);
                    const rightKneeAngle = PoseUtils.getAngle(rightHip, rightKnee, rightAnkle);
                    const avgKnee = (leftKneeAngle + rightKneeAngle) / 2;
                    if (avgKnee < 100) squatDown = true;
                    if (avgKnee > 150 && squatDown) {
                        repCount++;
                        if (!caloriesBurned) caloriesBurned = 0;
                        caloriesBurned += getCaloriesPerRep(exercise);

                        squatDown = false;
                        if (useVoice) Voice.speak(`${repCount}`);
                    }
                }
            }

            // form evaluation
            const form = evaluateForm(p.keypoints);
            totalFrames++;
            if (form.ok) goodFormFrames++;
            feedbackBox.innerText = form.message;

        } // end if poses
    } catch (e) {
        console.warn("frame error", e);
    }
    updateHUD();
}

// async function startSession(){
//   if (!detector) {
//     await loadDetector();
//   }
//   repCount = 0;
//   isDown = false;
//   squatDown = false;
//   exercise = null;
//   running = true;
//   startTime = Date.now();
//   goodFormFrames = 0;
//   totalFrames = 0;
//   modeHint.innerText = "Detecting exercise...";
//   frameInterval = setInterval(processFrame, 150);
//   if (useVoice) Voice.speak("Session started. I'll track your form.");
// }

async function startSession() {
    // Prevent starting if already running
    if (running) {
        console.log("Session already running — ignored duplicate start");
        return;
    }

    if (!detector) {
        await loadDetector();
    }

    repCount = 0;
    isDown = false;
    squatDown = false;
    exercise = null;
    running = true;
    startTime = Date.now();
    goodFormFrames = 0;
    totalFrames = 0;
    caloriesBurned = 0;
    modeHint.innerText = "Detecting exercise...";

    // clear any previous intervals before starting new one
    if (frameInterval) clearInterval(frameInterval);
    frameInterval = setInterval(processFrame, 150);

    // speak only once per new session
    if (useVoice) {
        Voice.speak("Session started. I'll track your form.");
    }

    console.log("Session started");
}






function pauseSession() {
    running = false;
    if (frameInterval) clearInterval(frameInterval);
    Voice.speak("Session paused.");
}

// function endSession() {
//     running = false;
//     if (frameInterval) clearInterval(frameInterval);
//     const duration = Math.floor((Date.now() - startTime) / 1000);
//     const accuracy = totalFrames ? goodFormFrames / totalFrames : 1;
//     Storage.saveSession({ startedAt: Date.now(), exercise: exercise || "unknown", reps: repCount, duration, accuracy, calories: caloriesBurned });
//     renderLastSession();
//     // summary
//     const msg = `Session ended. You did ${repCount} ${exercise || "reps"} in ${duration} seconds. Calories burned ${caloriesBurned.toFixed(1)}. Form accuracy ${Math.round(accuracy*100)} percent.`;
//     if (useVoice) Voice.speak(msg);
//     modeHint.innerText = "Say 'start' to begin a new session";

// }


function endSession() {
    if (!running) {
        console.log("Session already stopped — ignoring duplicate end.");
        return;
    }

    running = false;

    // Stop any ongoing frame processing
    if (frameInterval) {
        clearInterval(frameInterval);
        frameInterval = null;
    }

    // Compute stats
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const accuracy = totalFrames ? goodFormFrames / totalFrames : 1;

    // Adjust multiplier as needed for realism

    // Save session to localStorage
    Storage.saveSession({
        startedAt: Date.now(),
        exercise: exercise || "unknown",
        reps: repCount,
        duration,
        accuracy,
        calories: caloriesBurned
    });

    // Update UI
    renderLastSession();

    // Stop any queued voices first
    try { window.speechSynthesis.cancel(); } catch (e) { }

    // Speak only once
    const msg = `Session ended. You did ${repCount} ${exercise || "reps"} in ${duration} seconds. 
    Calories burned ${caloriesBurned}. Form accuracy ${Math.round(accuracy * 100)} percent.`;

    if (useVoice) Voice.speak(msg);

    modeHint.innerText = "Say 'start' to begin a new session";

    console.log("Session ended cleanly");
}







startBtn.addEventListener("click", () => {
    startSession();
});
pauseBtn.addEventListener("click", () => {
    pauseSession();
});
endBtn.addEventListener("click", () => {
    endSession();
});

voiceToggle.addEventListener("click", () => {
    useVoice = !useVoice;
    Voice.setTtsEnabled(useVoice);
    voiceToggle.innerText = `Voice: ${useVoice ? "On" : "Off"}`;
});

Voice.startRecognition((transcript) => {
    // simple voice commands
    if (transcript.includes("start")) {
        startSession();
    } else if (transcript.includes("pause") || transcript.includes("stop")) {
        pauseSession();
    } else if (transcript.includes("end") || transcript.includes("finish")) {
        endSession();
    } else if (transcript.includes("how many")) {
        if (useVoice) Voice.speak(`You've done ${repCount} reps`);
    } else if (transcript.includes("i can't") || transcript.includes("can't do")) {
        if (useVoice) Voice.speak("Take a break. You're doing great!");
    }
});

// startup: setup camera and detector
(async () => {
    await setupCamera();
    await loadDetector();
    // ready state
    modeHint.innerText = "Ready — say 'start' or press Start";
    // set canvas to video resolution
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
})();





// // === Sound Effects ===
// const sounds = {
//   start: new Audio("assets/sounds/start.wav"),
//   rep: new Audio("assets/sounds/rep.wav"),
//   success: new Audio("assets/sounds/success.wav"),
//   end: new Audio("assets/sounds/end.wav"),
// };

// function playSound(name) {
//   if (sounds[name]) {
//     sounds[name].currentTime = 0;
//     sounds[name].play();
//   }
// }



async function setupCamera() {
    const constraints = {
        audio: false,
        video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
        },
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.play();

            // set canvas to match video resolution
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // visually scale (zoom out) but keep it centered
            const zoomOutScale = 1;
            video.style.transform = `scale(${zoomOutScale}) translate(-50%, -50%)`;
            video.style.transformOrigin = "top left";
            video.style.position = "absolute";
            video.style.left = "50%";
            video.style.top = "50%";

            canvas.style.transform = video.style.transform;
            canvas.style.transformOrigin = video.style.transformOrigin;
            canvas.style.left = video.style.left;
            canvas.style.top = video.style.top;
            canvas.style.position = "absolute";

            resolve();
        };
    });
}
