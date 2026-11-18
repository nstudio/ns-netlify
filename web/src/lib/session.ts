import { Auth, createApi, type SessionStore } from '../../../shared';

const KEY = 'field-notes.session';

const store: SessionStore = {
  get: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      // Private windows can refuse storage; the session then lasts for this tab only.
    }
  },
  remove: () => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // See set().
    }
  },
};

export const auth = new Auth(location.origin, store);
export const api = createApi({ baseUrl: location.origin, token: () => auth.token() });
