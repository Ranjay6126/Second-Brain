import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
    subtitle:
      'Everything you have saved — notes, PDFs, images, audio and video — indexed, searchable and ready to chat with.',
  },
  chat: {
    title: 'Chat',
    subtitle: 'Ask questions in plain language and get answers grounded in your own material.',
  },
  insights: {
    title: 'Insights',
    subtitle: 'How your second brain is growing: media mix, daily activity, themes and storage.',
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
    <div className="relative min-h-dvh">
      <AppBackground />

      <Sidebar tab={tab} onTabChange={setTab} health={health} />

      <div className="relative z-10 md:pl-64">
        <TopBar
          health={health}
          query={query}
          onSearch={handleSearch}
          onNew={() => setUploadOpen(true)}
          showLocalBanner={health?.mode === 'local' && !bannerDismissed}
          onDismissLocalBanner={() => setBannerDismissed(true)}
        />

        <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-6 md:px-7 md:pb-14">
          {tab !== 'chat' ? (
            <header className="mb-6">
              <h3 className="text-2xl font-semibold tracking-tight text-white">{copy.title}</h3>
              <span
                aria-hidden="true"
                className="mt-2.5 block h-[3px] w-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
              />
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">{copy.subtitle}</p>
            </header>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            >
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
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {uploadOpen ? (
          <UploadPanel
            key="upload-modal"
            variant="modal"
            onClose={() => setUploadOpen(false)}
            onUploaded={() => {
              handleMutated();
              setUploadOpen(false);
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {drawerId ? (
          <ItemDetailDrawer
            key={drawerId}
            itemId={drawerId}
            onClose={() => setDrawerId(null)}
            onChanged={handleMutated}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AppBackground() {
  return (
    <>
      <div className="app-canvas" aria-hidden="true">
        <div className="animate-blob-a absolute -left-40 -top-44 h-[38rem] w-[38rem] rounded-full bg-indigo-600/25 blur-[120px]" />
        <div className="animate-blob-b absolute -right-32 top-1/4 h-[32rem] w-[32rem] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="animate-blob-c absolute -bottom-40 left-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-500/15 blur-[130px]" />
      </div>
      <div className="noise-overlay" aria-hidden="true" />
    </>
  );
}
