import { useEffect, useRef, useState, type RefObject } from 'react';
import { reconciler } from '@nativescript-community/react';
import { document } from 'dominative';
import { CoreTypes, Utils, type NavigatedData, type Page, type View } from '@nativescript/core';
import { useNotes, useSession, type Note, type User } from './shared';
import { auth, api, takeEndReason, WebSocketImpl } from './session';
import { TabBar, type Tab } from './components/chrome';
import { Icon } from './components/ui';
import { haptic } from './platform/haptics';
import { SignIn } from './screens/SignIn';
import { NotesScreen } from './screens/NotesScreen';
import { CaptureScreen } from './screens/CaptureScreen';
import { MapScreen } from './screens/MapScreen';
import { NoteDetail } from './screens/NoteDetail';

const notesOptions = { WebSocketImpl };

/** Hiding a tab would otherwise hand Android's focus, and its cursor, to the next text field on screen. */
function releaseFocus() {
  Utils.dismissSoftInput();
  if (__ANDROID__) Utils.android.getCurrentActivity()?.getCurrentFocus()?.clearFocus();
}
const PLATFORM_CLASS = __APPLE__ ? 'ios' : 'android';

function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.opacity = 0;
    v.translateY = 24;
    void v
      .animate({ opacity: 1, translate: { x: 0, y: 0 }, duration: 380, curve: CoreTypes.AnimationCurve.spring })
      .then(() => new Promise((r) => setTimeout(r, 2600)))
      .then(() => v.animate({ opacity: 0, translate: { x: 0, y: 16 }, duration: 240 }))
      .catch(() => {})
      .then(onDone);
  }, [text]);
  return (
    <gridlayout ref={ref} columns="auto, *" className="toast" isUserInteractionEnabled={false}>
      <Icon name="check" size={20} className="toast-icon" />
      <label col={1} text={text} className="toast-text" textWrap />
    </gridlayout>
  );
}

function Main({ user, page }: { user: User; page: RefObject<Page> }) {
  const notes = useNotes(api, auth, notesOptions);
  const [tab, setTab] = useState<Tab>('notes');
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['notes']));
  const [toast, setToast] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; page: Page } | null>(null);
  const announced = useRef(new Set<string>());

  const select = (t: Tab) => {
    if (t !== tab) haptic('selection');
    releaseFocus();
    setTab(t);
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)));
  };

  // A note arriving over the live socket from another device gets a light tap; our own saves already got a success haptic.
  useEffect(() => {
    let arrived = false;
    for (const id of notes.fresh) {
      if (!announced.current.has(id)) {
        announced.current.add(id);
        arrived = true;
      }
    }
    if (arrived) haptic('light');
  }, [notes.fresh]);

  const open = (id: string) => {
    if (detail) return;
    const next = document.createElement('page') as unknown as Page;
    next.actionBarHidden = true;
    next.statusBarStyle = 'light';
    next.androidOverflowEdge = 'top,bottom';
    next.className = PLATFORM_CLASS;
    setDetail({ id, page: next });
  };

  useEffect(() => {
    if (!detail) return;
    const frame = page.current?.frame;
    if (!frame) return setDetail(null);
    const onFrom = (args: NavigatedData) => {
      if (args.isBackNavigation) setDetail(null);
    };
    detail.page.on('navigatedFrom', onFrom);
    frame.navigate({ create: () => detail.page });
    return () => {
      detail.page.off('navigatedFrom', onFrom);
    };
  }, [detail]);

  const back = () => detail?.page.frame?.goBack();

  const saved = (note: Note) => {
    announced.current.add(note.id);
    releaseFocus();
    setTab('notes');
    setToast('Saved. It’s on the web already.');
  };

  return (
    <gridlayout rows="*, auto" className="body">
      <gridlayout row={0} visibility={tab === 'notes' ? 'visible' : 'collapse'}>
        <NotesScreen user={user} state={notes} onOpen={open} onCapture={() => select('capture')} />
      </gridlayout>
      {visited.has('capture') ? (
        <gridlayout row={0} visibility={tab === 'capture' ? 'visible' : 'collapse'}>
          <CaptureScreen active={tab === 'capture'} notes={notes} onSaved={saved} />
        </gridlayout>
      ) : null}
      {visited.has('map') ? (
        <gridlayout row={0} visibility={tab === 'map' ? 'visible' : 'collapse'}>
          <MapScreen notes={notes.notes} query={notes.query} active={tab === 'map'} onOpen={open} />
        </gridlayout>
      ) : null}
      {toast ? <Toast text={toast} onDone={() => setToast(null)} /> : null}
      <stacklayout row={1}>
        <TabBar tab={tab} onSelect={select} />
      </stacklayout>
      {detail ? reconciler.createPortal(<NoteDetail id={detail.id} listed={notes.notes.find((n) => n.id === detail.id)} notes={notes} onBack={back} />, detail.page, null, detail.id) : null}
    </gridlayout>
  );
}

export default function App() {
  const session = useSession(auth);
  const page = useRef<Page>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!session) setNotice(takeEndReason());
  }, [session]);

  return (
    <page ref={page} className={PLATFORM_CLASS} actionBarHidden statusBarStyle="light" androidOverflowEdge="top,bottom">
      {session ? <Main user={session.user} page={page} /> : <SignIn notice={notice} />}
    </page>
  );
}
