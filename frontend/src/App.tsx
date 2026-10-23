import { useCallback, useEffect, useState } from 'react';
import { errorMessage, getHealth } from './lib/api';
import type { Health } from './lib/types';
import { Sidebar, type Tab } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ToastProvider, useToast } from './components/Toast';
import { ItemDetailDrawer } from './components/ItemDetailDrawer';
import { UploadPanel } from './components/UploadPanel';
import { ChatView } from './views/ChatView';
import { InsightsView } from './views/InsightsView';
import { LibraryView } from './views/LibraryView';

const PAGE_COPY: Record<Tab, { title: string; subtitle: string }> = {
  library: {
    title: 'Library',
    subtitle: 'Everything you have saved, in one place.',
  },
  chat: {
    title: 'Chat',
    subtitle: 'Ask questions about your saved items.',
  },
  insights: {
    title: 'Insights',
    subtitle: 'A short summary of your library.',
  },
};

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('library');
  const [health, setHealth] = useState<Health | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const loadHealth = useCallback(
    async (silent: boolean) => {
      if (!silent) setHealthLoading(true);
      try {
        setHealth(await getHealth());
      } catch (error) {
        if (!silent) toast(errorMessage(error), 'error');
      } finally {
        if (!silent) setHealthLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void loadHealth(false);
  }, [loadHealth]);

  const handleMutated = useCallback(() => {
    setRefreshToken((token) => token + 1);
    void loadHealth(true);
  }, [loadHealth]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (value.trim() !== '') setTab('library');
  }, []);

  const copy = PAGE_COPY[tab];

  return (
    <div className="min-h-dvh bg-gray-50 text-gray-900">
      <Sidebar tab={tab} onTabChange={setTab} health={health} />

      <div className="md:pl-56">
        <TopBar
          health={health}
          query={query}
          onSearch={handleSearch}
          onNew={() => setUploadOpen(true)}
          showLocalBanner={health?.mode === 'local' && !bannerDismissed}
          onDismissLocalBanner={() => setBannerDismissed(true)}
        />

        <main className="mx-auto w-full max-w-7xl p-4 pb-24 md:p-6 md:pb-10">
          {tab !== 'chat' ? (
            <header className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900">{copy.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{copy.subtitle}</p>
            </header>
          ) : null}

          {tab === 'library' ? (
            <LibraryView
              health={health}
              healthLoading={healthLoading}
              query={query}
              onClearQuery={() => setQuery('')}
              refreshToken={refreshToken}
              onOpenItem={setDrawerId}
              onMutated={handleMutated}
            />
          ) : null}

          {tab === 'chat' ? <ChatView onOpenItem={setDrawerId} /> : null}

          {tab === 'insights' ? <InsightsView health={health} refreshToken={refreshToken} /> : null}
        </main>
      </div>

      {uploadOpen ? (
        <UploadPanel
          variant="modal"
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            handleMutated();
            setUploadOpen(false);
          }}
        />
      ) : null}

      {drawerId ? (
        <ItemDetailDrawer
          itemId={drawerId}
          onClose={() => setDrawerId(null)}
          onChanged={handleMutated}
        />
      ) : null}
    </div>
  );
}
