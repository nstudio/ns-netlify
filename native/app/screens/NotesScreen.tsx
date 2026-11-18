import { Dialogs } from '@nativescript/core';
import type { NotesState, User } from '../shared';
import { Header, LivePill } from '../components/chrome';
import { NoteCard } from '../components/NoteCard';
import { RefreshScroll } from '../components/RefreshScroll';
import { Banner, EmptyState, Icon } from '../components/ui';
import { friendlyError, signOut } from '../session';

function initial(user: User): string {
  return (user.name?.trim() || user.email).charAt(0).toUpperCase();
}

async function account(user: User) {
  const choice = await Dialogs.action({
    title: user.name ? `${user.name}\n${user.email}` : user.email,
    cancelButtonText: 'Cancel',
    actions: ['Sign out'],
  });
  if (choice === 'Sign out') signOut();
}

export function NotesScreen({ user, state, onOpen, onCapture }: { user: User; state: NotesState; onOpen: (id: string) => void; onCapture: () => void }) {
  const { notes, loading, error, live, fresh, query, setQuery, refresh } = state;
  const count = notes.length;
  const sub = query ? `${count} ${count === 1 ? 'match' : 'matches'}` : count ? `${count} ${count === 1 ? 'note' : 'notes'}, on your phone and the web` : 'On your phone and the web';

  return (
    <gridlayout rows="auto, *">
      <Header
        title="Notes"
        sub={sub}
        right={
          <>
            <LivePill live={live} />
            <label text={initial(user)} className="avatar" onTap={() => void account(user)} />
          </>
        }
      >
        <gridlayout columns="auto, *, auto" className="search">
          <Icon name="search" size={18} className="search-icon" verticalAlignment="middle" />
          <textfield
            col={1}
            className="search-field"
            hint="Search titles, places, text in photos"
            text={query}
            returnKeyType="search"
            autocapitalizationType="none"
            autocorrect={false}
            onTextChange={(e: { value: string }) => setQuery(e.value)}
            onReturnPress={(e: { object: { dismissSoftInput(): void } }) => e.object.dismissSoftInput()}
          />
          {query ? (
            <gridlayout col={2} width={32} height={32} onTap={() => setQuery('')}>
              <Icon name="close" size={16} className="search-icon" margin={0} />
            </gridlayout>
          ) : null}
        </gridlayout>
      </Header>

      <gridlayout row={1} className="body">
        <RefreshScroll onRefresh={refresh}>
          <stacklayout>
            {error && count ? <Banner text={friendlyError(new Error(error))} onTap={() => void refresh()} /> : null}
            {count ? (
              <stacklayout className="feed">
                {notes.map((note) => (
                  <NoteCard key={note.id} note={note} fresh={fresh.has(note.id)} onOpen={onOpen} />
                ))}
              </stacklayout>
            ) : loading ? (
              <activityindicator busy color="#05bdba" marginTop={80} />
            ) : query ? (
              <EmptyState name="search" title="Nothing matches" text={`No note mentions “${query}” in its title, text, the words in its photo or its transcript.`} />
            ) : error ? (
              <EmptyState name="warning" title="Can’t load your notes" text={friendlyError(new Error(error))}>
                <button text="Try again" className="secondary" marginTop={22} width={180} onTap={() => void refresh()} />
              </EmptyState>
            ) : (
              <EmptyState
                name="camera"
                title="Your first note"
                text="Take a photo and Field Notes adds where you were, which way you faced and the words in the picture. It shows up on the web the moment you save."
              >
                <button text="Capture a note" className="primary" marginTop={22} width={220} onTap={onCapture} />
              </EmptyState>
            )}
          </stacklayout>
        </RefreshScroll>
      </gridlayout>
    </gridlayout>
  );
}
