import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialogs, Screen, type ImageAsset, type TextField } from '@nativescript/core';
import { isAvailable as cameraAvailable, requestCameraPermissions, takePicture } from '@nativescript/camera';
import { create as createPicker, ImagePickerMediaType } from '@nativescript/imagepicker';
import { altitude, clockTime, coordinates, heading as headingText, type Note, type NoteInput, type NotesState, type Photo } from '../shared';
import { Header } from '../components/chrome';
import { KeyboardScroll } from '../components/KeyboardScroll';
import { Chip, Icon, popIn } from '../components/ui';
import { api, friendlyError } from '../session';
import { haptic } from '../platform/haptics';
import { primeImage } from '../platform/images';
import { currentFix, LocationDenied, openAppSettings, placeName, watchHeading, type Fix } from '../platform/location';
import { preparePhoto, type PreparedPhoto } from '../platform/photo';
import { deviceName, platform } from '../platform/system';
import { recognizeText, textRecognitionSupported, titleFromText } from '../platform/textRecognition';
import { VoiceRecorder, voiceSupported } from '../platform/speech';

type Upload = { state: 'idle' } | { state: 'uploading' } | { state: 'done'; photo: Photo } | { state: 'error'; message: string };
type Locating = 'idle' | 'locating' | 'done' | 'denied' | 'failed';
type Reading = 'idle' | 'reading' | 'done';

const FIX_FRESH_MS = 2 * 60_000;

export function CaptureScreen({ active, notes, onSaved }: { active: boolean; notes: NotesState; onSaved: (note: Note) => void }) {
  const [started, setStarted] = useState(false);
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [upload, setUpload] = useState<Upload>({ state: 'idle' });
  const [fix, setFix] = useState<Fix | null>(null);
  const [fixAt, setFixAt] = useState(0);
  const [locating, setLocating] = useState<Locating>('idle');
  const [place, setPlace] = useState<string | undefined>(undefined);
  const [liveHeading, setLiveHeading] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [reading, setReading] = useState<Reading>('idle');
  const [title, setTitle] = useState('');
  const [titleEdited, setTitleEdited] = useState(false);
  const [body, setBody] = useState('');
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const draft = useRef(0);
  const uploading = useRef<Promise<Photo | null> | null>(null);
  const headingNow = useRef<number | null>(null);
  const recorder = useRef<VoiceRecorder | null>(null);

  const locate = async (): Promise<Locating> => {
    setLocating('locating');
    try {
      const f = await currentFix();
      setFix(f);
      setFixAt(Date.now());
      setLocating('done');
      setPlace(await placeName(f.lat, f.lng));
      return 'done';
    } catch (e) {
      const outcome = e instanceof LocationDenied ? 'denied' : 'failed';
      if (outcome === 'failed') console.warn('Field Notes: no location fix', e);
      setLocating(outcome);
      return outcome;
    }
  };

  // Asks again first: Android lets an app re-prompt until the person picks "Don't ask again".
  const retryLocation = async () => {
    if ((await locate()) === 'denied') openAppSettings();
  };

  useEffect(() => {
    if (!active) return;
    if (locating !== 'locating' && (!fix || Date.now() - fixAt > FIX_FRESH_MS)) void locate();
    const stop = watchHeading((deg) => {
      const rounded = Math.round(deg) % 360;
      headingNow.current = rounded;
      setLiveHeading(rounded);
    }, fix ?? undefined);
    return stop;
  }, [active, fix?.lat, fix?.lng]);

  useEffect(() => () => recorder.current?.cancel(), []);

  const suggestion = useMemo(() => titleFromText(text) || place?.split(',')[0] || (started ? `Note at ${clockTime(new Date().toISOString())}` : ''), [text, place, started]);
  useEffect(() => {
    if (!titleEdited) setTitle(suggestion);
  }, [suggestion, titleEdited]);

  const startUpload = (p: PreparedPhoto, id: number) => {
    setUpload({ state: 'uploading' });
    const run = api
      .uploadPhoto(p.jpeg, p.width, p.height)
      .then((uploaded) => {
        if (draft.current !== id) return null;
        primeImage(api.photoUrl(uploaded), p.preview);
        setUpload({ state: 'done', photo: uploaded });
        return uploaded;
      })
      .catch((e) => {
        if (draft.current === id) setUpload({ state: 'error', message: friendlyError(e) });
        return null;
      });
    uploading.current = run;
  };

  const addPhoto = async (asset: ImageAsset) => {
    const id = ++draft.current;
    setStarted(true);
    setPreparing(true);
    setHeading(headingNow.current);
    haptic('light');
    try {
      const p = await preparePhoto(asset);
      if (draft.current !== id) return;
      setPhoto(p);
      setPreparing(false);
      startUpload(p, id);
      if (textRecognitionSupported) {
        setReading('reading');
        const found = await recognizeText(p);
        if (draft.current !== id) return;
        setText(found);
        setReading('done');
        if (found) haptic('selection');
      }
    } catch (e) {
      if (draft.current !== id) return;
      setPreparing(false);
      void Dialogs.alert({ title: 'That photo didn’t work', message: friendlyError(e), okButtonText: 'OK' });
    }
  };

  const takePhoto = async () => {
    if (!cameraAvailable()) {
      await Dialogs.alert({ title: 'No camera here', message: 'This device has no camera. Choose a photo from your library instead.', okButtonText: 'OK' });
      return choosePhoto();
    }
    try {
      const permission = await requestCameraPermissions();
      if (!permission.Success) {
        const open = await Dialogs.confirm({
          title: 'Camera is off',
          message: 'Allow camera access in Settings to take photos for your notes.',
          okButtonText: 'Settings',
          cancelButtonText: 'Not now',
        });
        if (open) openAppSettings();
        return;
      }
      const asset = await takePicture({ saveToGallery: false, keepAspectRatio: true });
      if (asset) await addPhoto(asset);
    } catch (e) {
      // Closing the camera without a photo rejects too; that needs no message.
      if (!/cancel/i.test(String((e as Error)?.message ?? e))) console.warn('Field Notes: camera', e);
    }
  };

  const choosePhoto = async () => {
    try {
      const picker = createPicker({ mode: 'single', mediaType: ImagePickerMediaType.Image, android: { use_photo_picker: true } });
      const auth = await picker.authorize();
      if (!auth.authorized) {
        const open = await Dialogs.confirm({
          title: 'Photos are off',
          message: 'Allow photo access in Settings to add pictures to your notes.',
          okButtonText: 'Settings',
          cancelButtonText: 'Not now',
        });
        if (open) openAppSettings();
        return;
      }
      const [picked] = await picker.present();
      if (picked?.asset) await addPhoto(picked.asset);
    } catch (e) {
      console.warn('Field Notes: picker', e);
    }
  };

  const writeWithoutPhoto = () => {
    ++draft.current;
    setHeading(headingNow.current);
    setStarted(true);
  };

  const reset = () => {
    ++draft.current;
    recorder.current?.cancel();
    recorder.current = null;
    uploading.current = null;
    setStarted(false);
    setPhoto(null);
    setPreparing(false);
    setUpload({ state: 'idle' });
    setHeading(null);
    setText('');
    setReading('idle');
    setTitle('');
    setTitleEdited(false);
    setBody('');
    setTranscript('');
    setRecording(false);
    setVoiceError(null);
    setSaveError(null);
  };

  const discard = async () => {
    const dirty = photo || body.trim() || transcript || titleEdited;
    if (dirty && !(await Dialogs.confirm({ title: 'Discard this note?', message: 'The photo and anything you wrote will be lost.', okButtonText: 'Discard', cancelButtonText: 'Keep editing' })))
      return;
    reset();
  };

  const toggleVoice = async () => {
    setVoiceError(null);
    if (recording) {
      setRecording(false);
      const final = await recorder.current?.stop();
      recorder.current = null;
      if (final) setTranscript(final);
      haptic('light');
      return;
    }
    const r = new VoiceRecorder();
    try {
      await r.start((t) => setTranscript(t));
      recorder.current = r;
      setRecording(true);
      haptic('medium');
    } catch (e) {
      setVoiceError((e as Error).message);
      haptic('error');
    }
  };

  const save = async () => {
    if (saving) return;
    setSaveError(null);
    setSaving(true);
    try {
      if (recording) await toggleVoice();
      let uploaded: Photo | null = upload.state === 'done' ? upload.photo : null;
      if (photo && !uploaded) {
        if (upload.state === 'error' || !uploading.current) startUpload(photo, draft.current);
        uploaded = await uploading.current;
        if (!uploaded) throw new Error('The photo didn’t upload. Check your connection and try again.');
      }
      const input: NoteInput = {
        title: title.trim() || suggestion || 'Untitled note',
        body: body.trim() || undefined,
        capturedOn: platform,
        device: deviceName(),
        recognizedText: text || undefined,
        transcript: transcript.trim() || undefined,
      };
      if (fix) input.place = { ...fix, ...(heading != null ? { heading: Math.round(heading) } : {}), ...(place ? { name: place } : {}) };
      if (uploaded) input.photo = { key: uploaded.key, width: uploaded.width, height: uploaded.height };
      const note = await notes.create(input);
      haptic('success');
      reset();
      onSaved(note);
    } catch (e) {
      setSaveError(friendlyError(e));
      haptic('error');
    } finally {
      setSaving(false);
    }
  };

  const shownHeading = started ? heading : liveHeading;

  const chips = (
    <wraplayout className="chips">
      {photo ? (
        upload.state === 'uploading' ? (
          <Chip busy text="Uploading photo" tone="pending" animate />
        ) : upload.state === 'done' ? (
          <Chip name="upload" text="Photo saved" tone="accent" animate />
        ) : upload.state === 'error' ? (
          <Chip name="warning" text="Upload failed · Retry" tone="danger" animate onTap={() => startUpload(photo, draft.current)} />
        ) : null
      ) : null}
      {locating === 'locating' ? <Chip busy text="Finding you" tone="pending" animate /> : null}
      {locating === 'denied' ? <Chip name="pin" text="Location off · Turn on" tone="danger" animate onTap={() => void retryLocation()} /> : null}
      {locating === 'failed' ? <Chip name="pin" text="No location · Retry" tone="danger" animate onTap={() => void locate()} /> : null}
      {fix ? <Chip key={`place-${place ?? 'coords'}`} name="pin" text={place ?? coordinates(fix, 3)} tone="accent" animate /> : null}
      {shownHeading != null ? <Chip name="heading" rotate={shownHeading} text={headingText(shownHeading)} tone="accent" animate /> : null}
      {fix?.altitude != null ? <Chip name="mountain" text={altitude(fix.altitude)} animate /> : null}
      {fix?.accuracy != null ? <Chip name="locate" text={`±${fix.accuracy} m`} animate /> : null}
      {reading === 'reading' ? <Chip busy text="Reading text" tone="pending" animate /> : null}
      {reading === 'done' && text ? <Chip name="text" text="Text found" tone="native" animate /> : null}
      {transcript && !recording ? <Chip name="wave" text="Voice note" tone="native" animate /> : null}
    </wraplayout>
  );

  if (!started) {
    return (
      <gridlayout rows="auto, *">
        <Header title="Capture" sub="A photo, where you are, the way you face and the words in it." />
        <scrollview row={1} className="body">
          <stacklayout>
            <stacklayout className="capture-hero">
              <label text="What are you looking at?" className="capture-hero-title" textWrap />
              <label text="Point your phone at it. Field Notes tags the photo with your place, heading and altitude, and reads any text in it on the device." className="capture-hero-text" textWrap />
              <gridlayout className="shutter" onTap={() => void takePhoto()}>
                <Icon name="camera" size={40} className="shutter-icon" />
              </gridlayout>
              <gridlayout columns="*, 10, *" className="hero-actions">
                <stacklayout orientation="horizontal" className="hero-action" onTap={() => void choosePhoto()}>
                  <Icon name="photos" size={18} className="hero-action-icon" />
                  <label text="Library" className="hero-action-text" />
                </stacklayout>
                <stacklayout col={2} orientation="horizontal" className="hero-action" onTap={writeWithoutPhoto}>
                  <Icon name="edit" size={18} className="hero-action-icon" />
                  <label text="Just write" className="hero-action-text" />
                </stacklayout>
              </gridlayout>
            </stacklayout>
            <stacklayout margin="0 16">
              <label text="READY TO TAG" className="section-label" marginLeft={4} />
              {chips}
            </stacklayout>
          </stacklayout>
        </scrollview>
      </gridlayout>
    );
  }

  const width = Screen.mainScreen.widthDIPs - 32;
  const photoHeight = photo ? Math.round(Math.min((width * photo.height) / photo.width, width * 1.2)) : 0;

  return (
    <gridlayout rows="auto, *, auto">
      <Header
        title="New note"
        sub={photo ? 'Tagged as you go. Save when it reads right.' : 'Write it down; your place and heading come along.'}
        right={
          <gridlayout className="icon-button" onTap={() => void discard()}>
            <Icon name="close" size={20} className="icon-button-img" />
          </gridlayout>
        }
      />
      <gridlayout row={1} className="body">
        <KeyboardScroll>
          <stacklayout className="capture">
            {preparing ? (
              <gridlayout height={width * 0.75} className="capture-photo">
                <activityindicator busy color="#05bdba" />
              </gridlayout>
            ) : photo ? (
              <gridlayout onLoaded={popIn}>
                <image src={photo.preview} height={photoHeight} stretch="aspectFill" className="capture-photo" />
                <stacklayout className="photo-badge">
                  <label text={`${photo.width} × ${photo.height} · ${Math.round(photo.jpeg.byteLength / 1024)} KB`} className="photo-badge-text" />
                </stacklayout>
                <gridlayout className="retake" onTap={() => void takePhoto()}>
                  <Icon name="camera" size={18} className="retake-icon" />
                </gridlayout>
              </gridlayout>
            ) : null}

            {chips}

            <stacklayout className="section">
              <gridlayout columns="*, auto">
                <label text="TITLE" className="section-label" />
                {!titleEdited && title ? (
                  <stacklayout col={1} orientation="horizontal">
                    <Icon name="sparkle" size={12} style={{ tintColor: '#04918f' }} marginRight={4} verticalAlignment="middle" />
                    <label text="Suggested" className="suggested" verticalAlignment="middle" />
                  </stacklayout>
                ) : null}
              </gridlayout>
              <textfield
                className="title-field"
                text={title}
                hint="Give it a name"
                returnKeyType="next"
                autocapitalizationType="sentences"
                onTextChange={(e: { value: string }) => {
                  if (e.value !== title) {
                    setTitle(e.value);
                    setTitleEdited(true);
                  }
                }}
                onReturnPress={(e: { object: TextField }) => e.object.dismissSoftInput()}
              />
              <textview className="body-field" text={body} hint="Add a few words" autocapitalizationType="sentences" onTextChange={(e: { value: string }) => setBody(e.value)} />
            </stacklayout>

            {text ? (
              <stacklayout className="section" onLoaded={popIn}>
                <gridlayout columns="*, auto">
                  <label text="TEXT IN THE PHOTO" className="section-label" />
                  <label col={1} text="Read on this iPhone" className="suggested" />
                </gridlayout>
                <label text={text} className="found-text" textWrap maxLines={8} />
              </stacklayout>
            ) : null}

            <stacklayout className="section">
              <label text="VOICE NOTE" className="section-label" />
              {voiceSupported ? (
                <gridlayout columns="auto, *" className="voice">
                  <gridlayout className={`mic ${recording ? 'recording' : ''}`} onTap={() => void toggleVoice()}>
                    <Icon name={recording ? 'stop' : 'mic'} size={22} className="mic-icon" />
                  </gridlayout>
                  {transcript ? (
                    <label col={1} text={transcript} className="voice-text" textWrap />
                  ) : (
                    <label
                      col={1}
                      text={voiceError ?? (recording ? 'Listening… speak and watch the words appear.' : 'Tap to talk. It’s transcribed on the device as you speak.')}
                      className="voice-hint"
                      textWrap
                    />
                  )}
                </gridlayout>
              ) : (
                <gridlayout columns="auto, *" className="voice">
                  <gridlayout className="mic" opacity={0.35}>
                    <Icon name="mic" size={22} className="mic-icon" />
                  </gridlayout>
                  <label col={1} text="Voice notes are available on iPhone, transcribed on the device as you speak." className="voice-hint" textWrap />
                </gridlayout>
              )}
            </stacklayout>

            {photo && !textRecognitionSupported ? <label text="On iPhone, Field Notes also reads the text in your photo, right on the device." className="footnote" textWrap /> : null}
          </stacklayout>
        </KeyboardScroll>
      </gridlayout>
      <stacklayout row={2} className="save-bar">
        {saveError ? <label text={saveError} className="error" textWrap /> : null}
        <button text={saving ? 'Saving…' : upload.state === 'uploading' ? 'Save note · uploading' : 'Save note'} className="primary" isEnabled={!saving && !preparing} onTap={() => void save()} />
      </stacklayout>
    </gridlayout>
  );
}
