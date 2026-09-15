export function createEffectPanels(root) {
  const panels = new Map([...root.querySelectorAll('[data-settings-panel]')]
    .map(panel => [panel.dataset.settingsPanel, panel]));
  const sidebar = root.querySelector('[data-scene-settings]');
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  function setOpen(name, open) {
    const panel = panels.get(name);
    if (!panel) return;
    panel.hidden = !open;
    root.querySelector(`[data-settings-toggle="${name}"]`).setAttribute('aria-expanded', String(open));
    sidebar.hidden = [...panels.values()].every(item => item.hidden);
    if (open) {
      panel.style.scrollMarginTop = `${root.querySelector('.scene-toolbar').getBoundingClientRect().height + 8}px`;
      panel.scrollIntoView({ block: 'nearest' });
    }
  }
  for (const button of root.querySelectorAll('[data-settings-toggle]')) {
    button.addEventListener('click', () => {
      const name = button.dataset.settingsToggle;
      setOpen(name, panels.get(name).hidden);
    }, options);
  }
  for (const button of root.querySelectorAll('[data-settings-close]')) {
    button.addEventListener('click', () => {
      const name = button.dataset.settingsClose;
      setOpen(name, false);
      root.querySelector(`[data-settings-toggle="${name}"]`).focus();
    }, options);
  }
  return { setOpen, dispose() { listeners.abort(); } };
}
