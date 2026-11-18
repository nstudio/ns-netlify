import type { PreparedPhoto } from './photo';

/** Preview's Android build ships no ML Kit, so text recognition is iPhone only. */
export const textRecognitionSupported = __APPLE__;

/** qos_class_t.QOS_CLASS_USER_INITIATED; the enum isn't in the typings. */
const QOS_CLASS_USER_INITIATED = 0x19;

/** Text Vision finds in the photo, line by line, top to bottom; '' when there is none. */
export function recognizeText(photo: PreparedPhoto): Promise<string> {
  if (!__APPLE__ || !photo.iosData) return Promise.resolve('');
  return new Promise((resolve) => {
    const request = VNRecognizeTextRequest.alloc().initWithCompletionHandler(null);
    request.recognitionLevel = VNRequestTextRecognitionLevel.Accurate;
    request.usesLanguageCorrection = true;
    const handler = VNImageRequestHandler.alloc().initWithDataOptions(photo.iosData, NSDictionary.new());
    // Called on the main thread; dispatch_get_main_queue is a C macro the runtime doesn't expose.
    const main = dispatch_get_current_queue();
    // performRequests is synchronous and takes about a second; off the main queue it doesn't freeze the UI.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), () => {
      let text = '';
      try {
        handler.performRequestsError([request]);
        const results = request.results;
        const lines: string[] = [];
        for (let i = 0; i < (results?.count ?? 0); i++) {
          const best = (results.objectAtIndex(i) as VNRecognizedTextObservation).topCandidates(1).firstObject;
          if (best && best.confidence >= 0.3 && best.string.trim()) lines.push(best.string.trim());
        }
        text = lines.join('\n');
      } catch (e) {
        console.warn('Field Notes: text recognition failed', e);
      }
      dispatch_async(main, () => resolve(text));
    });
  });
}

/** A title from recognized text: its most title-like line, or '' when nothing reads like one. */
export function titleFromText(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3 && /[A-Za-z]{3}/.test(l));
  const line = lines.find((l) => l.length <= 48) ?? lines[0] ?? '';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}
