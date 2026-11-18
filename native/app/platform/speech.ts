/**
 * Voice notes, transcribed on the device as you speak: SFSpeechRecognizer fed
 * from AVAudioEngine. Preview's Android build doesn't declare RECORD_AUDIO,
 * so voice notes are iPhone only.
 */
export const voiceSupported = __APPLE__;

export class VoiceError extends Error {}

/** AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation; a one-member enum, whose member name the runtime may not shorten. */
const NOTIFY_OTHERS_ON_DEACTIVATION = 1;

function authorizeSpeech(): Promise<boolean> {
  return new Promise((resolve) => SFSpeechRecognizer.requestAuthorization((status) => resolve(status === SFSpeechRecognizerAuthorizationStatus.Authorized)));
}

function authorizeMic(): Promise<boolean> {
  return new Promise((resolve) => AVAudioSession.sharedInstance().requestRecordPermission((granted) => resolve(granted)));
}

export class VoiceRecorder {
  private engine: AVAudioEngine | null = null;
  private request: SFSpeechAudioBufferRecognitionRequest | null = null;
  private task: SFSpeechRecognitionTask | null = null;
  private text = '';
  private finished: (() => void) | null = null;

  /** Starts listening; `onText` gets the transcript so far, many times a second. */
  async start(onText: (text: string) => void): Promise<void> {
    if (!(await authorizeSpeech())) throw new VoiceError('Speech recognition is off for this app. Turn it on in Settings.');
    if (!(await authorizeMic())) throw new VoiceError('The microphone is off for this app. Turn it on in Settings.');
    const recognizer = SFSpeechRecognizer.alloc().init();
    if (!recognizer || !recognizer.available) throw new VoiceError('Speech recognition isn’t available right now.');

    const session = AVAudioSession.sharedInstance();
    session.setCategoryModeOptionsError(AVAudioSessionCategoryRecord, AVAudioSessionModeMeasurement, AVAudioSessionCategoryOptions.DuckOthers);
    session.setActiveWithOptionsError(true, NOTIFY_OTHERS_ON_DEACTIVATION);

    const request = SFSpeechAudioBufferRecognitionRequest.new();
    request.shouldReportPartialResults = true;
    if (recognizer.supportsOnDeviceRecognition) request.requiresOnDeviceRecognition = true;

    const engine = AVAudioEngine.new();
    const input = engine.inputNode;
    input.installTapOnBusBufferSizeFormatBlock(0, 1024, input.outputFormatForBus(0), (buffer) => request.appendAudioPCMBuffer(buffer));
    engine.prepare();
    engine.startAndReturnError();

    this.engine = engine;
    this.request = request;
    this.text = '';
    this.task = recognizer.recognitionTaskWithRequestResultHandler(request, (result, error) => {
      if (result) {
        this.text = result.bestTranscription.formattedString;
        onText(this.text);
      }
      if (error || result?.final) this.finished?.();
    });
  }

  /** Stops listening and resolves with the final transcript. */
  async stop(): Promise<string> {
    const { engine, request, task } = this;
    if (!engine) return this.text;
    const final = new Promise<void>((resolve) => {
      this.finished = resolve;
      setTimeout(resolve, 1500);
    });
    engine.stop();
    engine.inputNode.removeTapOnBus(0);
    request?.endAudio();
    await final;
    task?.cancel();
    this.engine = this.request = this.task = null;
    this.finished = null;
    try {
      AVAudioSession.sharedInstance().setActiveWithOptionsError(false, NOTIFY_OTHERS_ON_DEACTIVATION);
    } catch {
      // Another app may hold the session; nothing to undo.
    }
    return this.text;
  }

  cancel(): void {
    void this.stop();
  }
}
