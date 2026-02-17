export const Footer = () => (
  <footer className="py-0 text-xs uppercase tracking-[0.3em] text-black/60 md:border-t md:border-black/10 md:py-10">
    <div className="hidden flex-col gap-2 md:flex md:flex-row md:justify-between">
      <span>thx4cmn © {new Date().getFullYear()}</span>
      <span>art · design · sound</span>
    </div>
  </footer>
);
