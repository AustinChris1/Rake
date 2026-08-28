import Nav from '../../components/Nav.jsx';
import DocsSidebar from '../../components/DocsSidebar.jsx';

export const metadata = { title: 'RAKE Docs' };

export default function DocsLayout({ children }) {
  return (
    <>
      <Nav />
      <div className="mx-auto max-w-6xl px-5 pt-24">
        <div className="flex flex-col gap-4 md:flex-row md:gap-10">
          <DocsSidebar />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </>
  );
}
