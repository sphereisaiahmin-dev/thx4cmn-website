export const Footer = () => (
  <footer className="border-t border-slate-200 py-10 text-xs uppercase tracking-[0.3em] text-slate-400">
    <div className="flex flex-col gap-2 md:flex-row md:justify-between">
      <span>thx4cmn © {new Date().getFullYear()}</span>
      <span>art · design · sound</span>
    </div>
  </footer>
);
