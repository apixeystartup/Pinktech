import { useUi } from './store/ui';
import { TopBar } from './components/TopBar';
import { ExplorerView } from './components/ExplorerView';
import { RolesView } from './components/RolesView';
import { ModalRoot } from './components/modals/ModalRoot';

export function App() {
  const tab = useUi((s) => s.tab);
  return (
    <div className="flex flex-col org-embed-root">
      <TopBar />
      <main className="px-6 sm:px-8 py-6 sm:py-8 max-w-[1920px] mx-auto w-full">
        {tab === 'org-tree' ? (
          <ExplorerView variant="tree" />
        ) : tab === 'org-explorer' ? (
          <ExplorerView variant="explorer" />
        ) : (
          <RolesView />
        )}
      </main>
      <ModalRoot />
    </div>
  );
}
