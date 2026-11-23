// Mounted at the root: a file, photo or text shared into the app (Messages, Files, a banking app) opens /import.
// Free users land on the Pro screen; the shared item is never read for them.
import { useIncomingShare, type ResolvedSharePayload, type SharePayload } from 'expo-sharing';
import { router, useRootNavigationState } from 'expo-router';
import { Component, useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { useRepoQuery } from '@/data/DataProvider';
import type { ImportInput } from '@/import/read';

import { setSession, UNSUPPORTED_SHARE } from './session';

/** The first usable item of a share: text becomes pasted SMS text; a file or photo becomes a file input. */
export function shareToInput(shared: SharePayload[], resolved: ResolvedSharePayload[]): ImportInput | null {
  const file = resolved.find((p) => p.contentUri && p.contentType !== 'text' && p.contentType !== 'website');
  if (file?.contentUri) {
    return { kind: 'file', uri: file.contentUri, name: file.originalName ?? file.contentUri.split('/').pop() ?? 'Shared file', mimeType: file.contentMimeType ?? file.mimeType };
  }
  const text = shared.find((p) => p.shareType === 'text' && p.value.trim());
  if (text) return { kind: 'text', text: text.value };
  return null;
}

/** The share already opened, kept outside the component so a re-lock or remount does not open it again. Forgotten once the share is cleared. */
let seen = '';

export function resetSeenShare() {
  seen = '';
}

function Receiver() {
  const { sharedPayloads, resolvedSharedPayloads, isResolving, clearSharedPayloads } = useIncomingShare();
  const nav = useRootNavigationState();
  const { data: settings } = useRepoQuery((r) => r.getSettings());

  useEffect(() => {
    if (sharedPayloads.length === 0) {
      seen = '';
      return;
    }
    // Wait for the wizard to finish: the share opens afterwards.
    if (!nav?.key || isResolving || !settings?.onboarded) return;
    const key = sharedPayloads.map((p) => `${p.shareType}|${p.value}`).join('\n');
    if (seen === key) return;
    const input = shareToInput(sharedPayloads, resolvedSharedPayloads);
    // A file is still being resolved: wait for it.
    if (!input && resolvedSharedPayloads.length === 0 && sharedPayloads.some((p) => p.shareType !== 'text')) return;
    seen = key;
    setSession(input ? { incoming: input, shareProblem: null } : { incoming: null, shareProblem: UNSUPPORTED_SHARE });
    router.navigate('/import');
    if (!input) {
      clearSharedPayloads();
      return;
    }
    // The shared copy of a file is deleted by clear: text can go now, a file is cleared by the import screen once it has been read or dropped.
    if (input?.kind === 'text') clearSharedPayloads();
  }, [nav?.key, isResolving, settings?.onboarded, sharedPayloads, resolvedSharedPayloads, clearSharedPayloads]);
  return null;
}

/** Sharing in is not available on the web or in a browser preview, and a missing native module must never crash the app. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function IncomingShareHandler() {
  if (Platform.OS === 'web') return null;
  return (
    <Quiet>
      <Receiver />
    </Quiet>
  );
}
