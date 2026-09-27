export function audioUrlFromBase64(base64: string, mimeType: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function stopBrowserSpeech() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}

export function speakWithBrowser(
  text: string,
  locale: string,
  opts?: { rate?: number; pitch?: number }
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return resolve();
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(text.slice(0, 1200));
      utter.lang = locale;
      utter.rate = opts?.rate ?? 1;
      utter.pitch = opts?.pitch ?? 1;
      const prefix = locale.split("-")[0].toLowerCase();
      const pick = () => {
        const voices = synth.getVoices();
        const match =
          voices.find((v) => v.lang.toLowerCase().startsWith(prefix + "-")) ??
          voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
        if (match) utter.voice = match;
      };
      pick();
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      // Fallback resolve in case events never fire
      window.setTimeout(() => resolve(), Math.min(60000, 3000 + text.length * 60));
      synth.speak(utter);
    } catch {
      resolve();
    }
  });
}
