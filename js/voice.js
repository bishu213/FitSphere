/**
 * voice.js
 * Handles TTS and simple speech recognition commands — fixed version
 */

const Voice = (() => {
  let ttsEnabled = true;
  let recognition = null;
  let onCommand = null;
  let isListening = false;

  // Speak text once, cancel old voices before speaking
  function speak(text) {
    if (!ttsEnabled) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn("TTS failed:", e);
    }
  }

  function setTtsEnabled(b) {
    ttsEnabled = !!b;
  }

  // Start listening once
  function startRecognition(commandCallback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not available");
      return;
    }

    // Prevent double-start
    if (isListening) return;
    isListening = true;

    onCommand = commandCallback;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (e) => {
      const transcript = e.results[e.results.length - 1][0].transcript.trim().toLowerCase();
      if (onCommand) onCommand(transcript);
    };

    recognition.onerror = (err) => console.warn("Speech recognition error", err);

    recognition.onend = () => {
      // Only auto-restart if still in listening mode
      if (isListening) {
        try { recognition.start(); } catch(e) { console.warn("Restart error", e); }
      }
    };

    try {
      recognition.start();
      console.log("🎤 Voice recognition started");
    } catch(e) {
      console.warn("Could not start recognition", e);
    }
  }

  // Stop completely
  function stopRecognition() {
    if (!recognition) return;
    isListening = false;
    try {
      recognition.onend = null; // prevent auto-restart
      recognition.stop();
      console.log("Voice recognition stopped");
    } catch(e) {
      console.warn("Failed to stop recognition", e);
    }

    // Stop any active speech
    window.speechSynthesis.cancel();
  }

  return {
    speak,
    startRecognition,
    stopRecognition,
    setTtsEnabled,
    get ttsEnabled() { return ttsEnabled; }
  };
})();
